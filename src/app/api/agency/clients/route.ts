// src/app/api/agency/clients/route.ts
// API endpoint for fetching all clients with health status + enriched card data

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database, ClientWithHealth, HealthStatus } from '@/types/database';
import { calculateClientHealth, getActionPointStatsForClient } from '@/lib/health/calculations';

export interface ClientChannel {
  channelName: string;
  status: 'live' | 'upcoming' | 'ended';
  startDate: string | null; // ISO date of earliest flight start
  endDate: string | null;   // ISO date of latest flight end
}

export interface ClientCardData extends ClientWithHealth {
  channels: ClientChannel[];
  tasksDueSoon: number;                // incomplete tasks with due_date within next 3 days
  plannedBudget: number;               // current-month planned spend across all channels ($)
  actualSpend: number;                 // current-month actual spend ($)
  spendVariancePct: number | null;     // ((actual - planned) / planned) * 100, positive = over
  totalActionPoints: number;           // total action points for this client
  completedActionPoints: number;       // completed action points for this client
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function toDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
}

/** Determine channel status relative to today */
function channelStatus(startDate: string | null, endDate: string | null): 'live' | 'upcoming' | 'ended' {
  const today = toDateStr(new Date());
  if (!startDate) return 'upcoming';
  if (endDate && endDate < today) return 'ended';
  if (startDate <= today) return 'live';
  return 'upcoming';
}

/**
 * GET /api/agency/clients
 * Fetch all clients with their health status
 * Query params:
 *  - status: 'red' | 'amber' | 'green' (optional filter)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status') as HealthStatus | null;

    // Validate status filter if provided
    if (statusFilter && !['red', 'amber', 'green'].includes(statusFilter)) {
      return NextResponse.json(
        { error: 'Invalid status filter. Must be red, amber, or green' },
        { status: 400 }
      );
    }

    // Auth check
    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all clients with left join to health status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: clientsData, error: clientsError } = await (supabase as any)
      .from('clients')
      .select(`*, client_health_status (*)`)
      .order('name', { ascending: true });

    if (clientsError) {
      console.error('Error fetching clients:', clientsError);
      return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
    }

    // ── Fetch all media plans (channels + flights) in one query ───────────────
    const { data: allMediaPlans } = await supabase
      .from('client_media_plan_builder')
      .select('client_id, channels');

    const mediaPlanMap = new Map<string, any[]>();
    for (const plan of allMediaPlans || []) {
      if (plan.channels && Array.isArray(plan.channels)) {
        mediaPlanMap.set(plan.client_id, plan.channels as any[]);
      }
    }

    // ── Fetch all action points with due dates ────────────────────────────────
    const today = toDateStr(new Date());
    const in3Days = toDateStr(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));

    const { data: allActionPoints } = await supabase
      .from('action_points')
      .select('id, channel_type, due_date')
      .not('due_date', 'is', null)
      .lte('due_date', in3Days); // only fetch those due within the next 3 days (+ overdue)

    // ── Fetch all per-client completions for those APs ────────────────────────
    const apIds = (allActionPoints || []).map((ap: any) => ap.id);
    let completionsByClient = new Map<string, Map<string, boolean>>();
    if (apIds.length > 0) {
      const { data: completions } = await supabase
        .from('client_action_point_completions')
        .select('client_id, action_point_id, completed')
        .in('action_point_id', apIds);

      for (const c of completions || []) {
        if (!completionsByClient.has(c.client_id)) {
          completionsByClient.set(c.client_id, new Map());
        }
        completionsByClient.get(c.client_id)!.set(c.action_point_id, c.completed);
      }
    }

    // ── Fetch actual spend per client for the current calendar month ─────────
    // Match new-client-dashboard: get spend data up to today for current month
    // This should match what MediaChannelCard calculates from liveSpendData
    const currentMonthStart = toDateStr(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const todayStr = toDateStr(new Date()); // Get today's date, not month start
    const { data: spendRows } = await supabase
      .from('ad_performance_metrics')
      .select('client_id, spend, campaign_id, date, platform, account_id')
      .eq('user_id', session.user.id) // Filter by current user
      .gte('date', currentMonthStart)
      .lte('date', todayStr)
      .not('client_id', 'is', null); // Only include rows with client_id (matching new-client-dashboard which filters by client)

    // Sum actual API spend per client — exclude manual-override rows to match
    // new-client-dashboard behaviour (which uses live API data only, not stored overrides)
    const spendByClient = new Map<string, number>();
    for (const row of spendRows || []) {
      if (!row.client_id) continue;
      // Skip manual override rows — they are not part of the live API data
      if (row.campaign_id && row.campaign_id.startsWith('manual-override-')) continue;
      spendByClient.set(row.client_id, (spendByClient.get(row.client_id) || 0) + Number(row.spend || 0));
    }

    // Current month keys — check both padded and unpadded formats (matching new-client-dashboard logic)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthNum = now.getMonth() + 1;
    const unpaddedMonthKey = `${currentYear}-${currentMonthNum}`;
    const paddedMonthKey = `${currentYear}-${String(currentMonthNum).padStart(2, '0')}`;

    // ── Build enriched client list ────────────────────────────────────────────
    const enrichedClients: ClientCardData[] = await Promise.all(
      (clientsData || []).map(async (client: any) => {
        const healthArray = client.client_health_status as any[];
        let health = healthArray && healthArray.length > 0 ? healthArray[0] : null;

        if (!health) {
          health = await calculateClientHealth(supabase, client.id);
        }

        // ── Channels with live/upcoming status ──
        const rawChannels: any[] = mediaPlanMap.get(client.id) || [];
        const channels: ClientChannel[] = rawChannels
          .filter((ch: any) => ch.channelName)
          .map((ch: any) => {
            const flights: any[] = ch.flights || [];
            const starts = flights.map((f: any) => f.startWeek as string).filter(Boolean);
            const ends = flights.map((f: any) => f.endWeek as string).filter(Boolean);

            // Normalise to YYYY-MM-DD
            const toD = (s: string) => s.length > 10 ? s.split('T')[0] : s;
            const startDates = starts.map(toD).sort();
            const endDates = ends.map(toD).sort();

            const earliestStart = startDates[0] || null;
            const latestEnd = endDates[endDates.length - 1] || null;

            return {
              channelName: ch.channelName as string,
              status: channelStatus(earliestStart, latestEnd),
              startDate: earliestStart,
              endDate: latestEnd,
            };
          })
          // Only show live + upcoming (not ended)
          .filter((ch: ClientChannel) => ch.status !== 'ended')
          // Sort: live first, then upcoming
          .sort((a: ClientChannel, b: ClientChannel) => {
            if (a.status === 'live' && b.status !== 'live') return -1;
            if (b.status === 'live' && a.status !== 'live') return 1;
            return (a.startDate || '').localeCompare(b.startDate || '');
          });

        // ── Tasks due soon (within 3 days, not completed) ──
        const clientCompletions = completionsByClient.get(client.id) || new Map<string, boolean>();
        const clientChannelNames = new Set(
          rawChannels.filter((ch: any) => ch.channelName).map((ch: any) => normalizeChannel(ch.channelName))
        );

        const tasksDueSoon = (allActionPoints || []).filter((ap: any) => {
          if (!ap.due_date) return false;
          if (ap.due_date < today) return false; // exclude already overdue
          if (ap.due_date > in3Days) return false;
          // Check this AP's channel belongs to the client
          if (!clientChannelNames.has(normalizeChannel(ap.channel_type))) return false;
          // Check not completed
          return clientCompletions.get(ap.id) !== true;
        }).length;

        // ── Planned budget for the current month (from monthlySpend breakdown) ──
        // Match new-client-dashboard logic: check both padded and unpadded month keys
        let plannedBudget = 0;
        for (const ch of rawChannels) {
          for (const f of ch.flights || []) {
            if (f.monthlySpend && typeof f.monthlySpend === 'object') {
              // Try both padded and unpadded formats (matching new-client-dashboard)
              const spend = f.monthlySpend[paddedMonthKey] || f.monthlySpend[unpaddedMonthKey] || 0;
              plannedBudget += Number(spend);
            }
          }
        }

        // ── Actual spend ──
        // Sum all spend from ad_performance_metrics for this client
        // The table should have the same data that new-client-dashboard uses
        const actualSpend = calculateActualSpendForClient(
          client.id,
          spendRows || []
        );
        
        // Debug logging for Content Manager client
        if (client.name === 'Content Manager') {
          const clientSpendRows = (spendRows || []).filter(row => row.client_id === client.id);
          console.log(`[Agency Dashboard] Content Manager actual spend calculation:`, {
            clientId: client.id,
            totalSpendRows: spendRows?.length || 0,
            clientSpendRows: clientSpendRows.length,
            calculatedActualSpend: actualSpend,
            spendRowsSample: clientSpendRows.slice(0, 5).map(r => ({
              date: r.date,
              spend: r.spend,
              campaign_id: r.campaign_id,
              account_id: r.account_id
            }))
          });
        }

        // ── Spend variance % — positive means overspending ──
        const spendVariancePct = plannedBudget > 0
          ? ((actualSpend - plannedBudget) / plannedBudget) * 100
          : null;

        // ── Action point completion stats ──
        const apStats = await getActionPointStatsForClient(supabase, client.id);

        return {
          id: client.id,
          name: client.name,
          created_at: client.created_at,
          updated_at: client.updated_at,
          health,
          channels,
          tasksDueSoon,
          plannedBudget,
          actualSpend,
          spendVariancePct,
          totalActionPoints: apStats.total,
          completedActionPoints: apStats.completed,
        };
      })
    );

    // Apply status filter if provided
    let filteredClients = enrichedClients;
    if (statusFilter) {
      filteredClients = enrichedClients.filter(
        (client) => client.health?.status === statusFilter
      );
    }

    // Sort by status (red first, then amber, then green), then by name
    const statusOrder = { red: 0, amber: 1, green: 2 };
    filteredClients.sort((a, b) => {
      const aStatus = a.health?.status || 'green';
      const bStatus = b.health?.status || 'green';
      const statusDiff = statusOrder[aStatus as keyof typeof statusOrder] - statusOrder[bStatus as keyof typeof statusOrder];
      if (statusDiff !== 0) return statusDiff;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ clients: filteredClients });
  } catch (error: any) {
    console.error('Error in GET /api/agency/clients:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function normalizeChannel(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('meta') || lower.includes('facebook')) return 'Meta Ads';
  if (lower.includes('google')) return 'Google Ads';
  if (lower.includes('linkedin')) return 'LinkedIn Ads';
  if (lower.includes('tiktok')) return 'TikTok Ads';
  return name;
}

/**
 * Calculate actual spend for a client by summing live API rows only.
 * Matches new-client-dashboard behaviour: uses only real API data stored in
 * ad_performance_metrics, excluding manual-override sentinel rows.
 */
function calculateActualSpendForClient(
  clientId: string,
  spendRows: any[]
): number {
  let totalSpend = 0;

  for (const row of spendRows) {
    if (row.client_id !== clientId) continue;
    // Exclude manual override sentinel rows — match new-client-dashboard (live API only)
    if (row.campaign_id && row.campaign_id.startsWith('manual-override-')) continue;
    totalSpend += Number(row.spend || 0);
  }

  return totalSpend;
}
