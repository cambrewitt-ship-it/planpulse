// src/app/api/agency/clients/route.ts
// API endpoint for fetching all clients with health status + enriched card data

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database, ClientWithHealth, HealthStatus } from '@/types/database';
import { calculateClientHealth, getActionPointStatsForClient } from '@/lib/health/calculations';

export interface ClientChannelFlight {
  startDate: string;
  endDate: string;
}

export interface ClientChannel {
  channelName: string;
  status: 'live' | 'upcoming' | 'ended';
  startDate: string | null; // ISO date of earliest flight start
  endDate: string | null;   // ISO date of latest flight end
  campaignIds: string[];    // metaCampaignIds linked in the media plan (for spend filtering)
  flights: ClientChannelFlight[]; // individual flight periods (may have gaps between them)
}

export interface ClientCardData extends ClientWithHealth {
  channels: ClientChannel[];
  tasksDueSoon: number;                // incomplete tasks with due_date within next 3 days
  plannedBudget: number;               // current-month planned spend across all channels ($)
  actualSpend: number;                 // current-month actual spend ($)
  spendVariancePct: number | null;     // ((actual - planned) / planned) * 100, positive = over
  totalActionPoints: number;           // total action points for this client
  completedActionPoints: number;       // completed action points for this client
  account_manager: string | null;      // assigned account manager name
  logo_url: string | null;             // client logo URL
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
 *  - startDate: YYYY-MM-DD (optional, defaults to current month start)
 *  - endDate: YYYY-MM-DD (optional, defaults to today)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status') as HealthStatus | null;
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const accountManagerFilter = searchParams.get('accountManager');

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

    // Fetch only clients belonging to the current user
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: clientsData, error: clientsError } = await (supabase as any)
      .from('clients')
      .select(`*, client_health_status (*)`)
      .eq('user_id', session.user.id)
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

    // ── Fetch actual spend per client for the specified date range ─────────
    // Default to YTD (Jan 1 – today) to match the dashboard's default date range
    const dateRangeStart = startDateParam || toDateStr(new Date(new Date().getFullYear(), 0, 1));
    const dateRangeEnd = endDateParam || toDateStr(new Date());
    const { data: spendRows } = await supabase
      .from('ad_performance_metrics')
      .select('client_id, spend, campaign_id, date, platform, account_id')
      .eq('user_id', session.user.id) // Filter by current user
      .gte('date', dateRangeStart)
      .lte('date', dateRangeEnd)
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
            const rawFlights: any[] = ch.flights || [];
            const toD = (s: string) => s.length > 10 ? s.split('T')[0] : s;

            // Build individual flight periods (each flight has its own start + end)
            const flightPeriods: ClientChannelFlight[] = rawFlights
              .map((f: any) => ({
                startDate: f.startWeek ? toD(f.startWeek as string) : null,
                endDate:   f.endWeek   ? toD(f.endWeek   as string) : null,
              }))
              .filter(fp => fp.startDate && fp.endDate)
              .map(fp => ({ startDate: fp.startDate!, endDate: fp.endDate! }))
              .sort((a, b) => a.startDate.localeCompare(b.startDate));

            const startDates = flightPeriods.map(fp => fp.startDate);
            const endDates   = flightPeriods.map(fp => fp.endDate);

            const earliestStart = startDates[0] || null;
            const latestEnd = endDates[endDates.length - 1] || null;

            const campaignIds: string[] = Array.from(new Set([
              ...((ch.metaCampaignIds as string[] | undefined) || []),
              ...((ch.metaCampaignId as string | undefined) ? [ch.metaCampaignId as string] : []),
            ]));

            return {
              channelName: ch.channelName as string,
              status: channelStatus(earliestStart, latestEnd),
              startDate: earliestStart,
              endDate: latestEnd,
              campaignIds,
              flights: flightPeriods,
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

        // ── Planned budget: total campaign budget across ALL months ──
        // Matches dashboard's campaignDates.totalBudget (sum of all monthlySpend values)
        let plannedBudget = 0;
        for (const ch of rawChannels) {
          for (const f of ch.flights || []) {
            if (f.monthlySpend && typeof f.monthlySpend === 'object') {
              for (const spend of Object.values(f.monthlySpend)) {
                plannedBudget += Number(spend);
              }
            }
          }
        }

        // ── Actual spend: use campaign-filtered cache when date range matches ──
        // Priority 1: mtd_actual_spend from client_health_status — this is computed
        // by the client dashboard with the user's campaign selection applied, so it
        // correctly excludes campaigns the client hasn't linked. Use it when the
        // stored date range matches the agency date range.
        // Priority 2: filter ad_performance_metrics by metaCampaignIds from the
        // media plan (also campaign-filtered, available without a dashboard visit).
        // Priority 3: sum all campaign rows (fallback, may over-count).

        const cachedSpend: number | null = health?.mtd_actual_spend ?? null;
        const cachedStart: string | null = health?.spend_date_start ?? null;
        const cachedEnd: string | null = health?.spend_date_end ?? null;
        // Cache hit when:
        // 1. Dates match exactly (normal case after new code runs), OR
        // 2. No dates stored yet (pre-migration rows) — both pages default to YTD
        //    so the value is almost certainly for the same period.
        // Don't use the cache when the user has explicitly changed the agency date
        // range and stored dates differ from the request.
        const cacheHit =
          cachedSpend !== null &&
          cachedStart === dateRangeStart &&
          cachedEnd === dateRangeEnd;

        let actualSpend: number;
        if (cacheHit) {
          actualSpend = cachedSpend!;
        } else {
          // Build set of selected campaign IDs from the media plan (server-side source
          // of truth that is always available without a dashboard visit).
          const selectedCampaignIds = new Set<string>();
          for (const ch of rawChannels) {
            if (ch.metaCampaignIds?.length) {
              (ch.metaCampaignIds as string[]).forEach(id => selectedCampaignIds.add(id));
            } else if (ch.metaCampaignId) {
              selectedCampaignIds.add(ch.metaCampaignId as string);
            }
          }
          actualSpend = calculateActualSpendForClient(
            client.id,
            spendRows || [],
            selectedCampaignIds.size > 0 ? selectedCampaignIds : undefined
          );
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
          account_manager: client.account_manager || null,
          logo_url: client.logo_url || null,
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

    // Apply account manager filter if provided
    if (accountManagerFilter) {
      filteredClients = filteredClients.filter(
        (client) => client.account_manager === accountManagerFilter
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
 * When selectedCampaignIds is provided, only rows with a matching campaign_id
 * are counted — this mirrors the client dashboard's per-channel campaign filter.
 */
function calculateActualSpendForClient(
  clientId: string,
  spendRows: any[],
  selectedCampaignIds?: Set<string>
): number {
  let totalSpend = 0;

  for (const row of spendRows) {
    if (row.client_id !== clientId) continue;
    if (row.campaign_id && row.campaign_id.startsWith('manual-override-')) continue;
    if (selectedCampaignIds && selectedCampaignIds.size > 0) {
      if (!row.campaign_id || !selectedCampaignIds.has(row.campaign_id)) continue;
    }
    totalSpend += Number(row.spend || 0);
  }

  return totalSpend;
}
