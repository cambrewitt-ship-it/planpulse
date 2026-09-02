// src/app/api/agency/clients/route.ts
// API endpoint for fetching all clients with health status + enriched card data

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database, ClientWithHealth, HealthStatus } from '@/types/database';
import { calculateClientHealth, getActionPointStatsForClient } from '@/lib/health/calculations';
import { nzToday, nzDateKeyOffset, nzStartOfYear } from '@/lib/timezone';

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
  plannedBudget: number;               // total campaign budget across all channels/months ($)
  actualSpend: number;                 // actual spend from plan start to today ($)
  spendVariancePct: number | null;     // ((actual - planned) / planned) * 100, positive = over
  totalActionPoints: number;           // total action points for this client
  completedActionPoints: number;       // completed action points for this client
  account_manager: string | null;      // assigned account manager name
  logo_url: string | null;             // client logo URL
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Determine channel status relative to today (NZ time) */
function channelStatus(startDate: string | null, endDate: string | null): 'live' | 'upcoming' | 'ended' {
  const today = nzToday();
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
 *  - accountManager: account manager name (optional filter)
 *
 * actualSpend is always computed on a plan-to-date basis per client (from
 * that client's own media plan start date through today), not a shared
 * date range — there is no date-range override.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status') as HealthStatus | null;
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
    const today = nzToday();
    const in3Days = nzDateKeyOffset(3);

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

    // ── Build channels + plan-to-date bounds per client (sync, no DB calls) ──
    const toDateStr = (s: string) => (s.length > 10 ? s.split('T')[0] : s);

    const channelsByClient = new Map<string, ClientChannel[]>();
    const planBoundsByClient = new Map<string, { start: string | null; end: string }>();

    for (const client of clientsData || []) {
      const rawChannels: any[] = mediaPlanMap.get(client.id) || [];
      const channels: ClientChannel[] = rawChannels
        .filter((ch: any) => ch.channelName)
        .map((ch: any) => {
          const rawFlights: any[] = ch.flights || [];

          // Build individual flight periods (each flight has its own start + end)
          const flightPeriods: ClientChannelFlight[] = rawFlights
            .map((f: any) => ({
              startDate: f.startWeek ? toDateStr(f.startWeek as string) : null,
              endDate:   f.endWeek   ? toDateStr(f.endWeek   as string) : null,
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

      channelsByClient.set(client.id, channels);

      // Plan-to-date bounds: earliest start / latest end across this client's
      // current (non-ended) channels, clipped to today if still ongoing.
      const starts = channels.map(ch => ch.startDate).filter(Boolean) as string[];
      const ends   = channels.map(ch => ch.endDate).filter(Boolean) as string[];
      const planStart = starts.length ? [...starts].sort()[0] : null;
      const planEndRaw = ends.length ? [...ends].sort().reverse()[0] : null;
      const planEnd = planEndRaw && planEndRaw < today ? planEndRaw : today;
      planBoundsByClient.set(client.id, { start: planStart, end: planEnd });
    }

    // ── Fetch actual spend across the widest window any client's plan needs ──
    // actualSpend is always plan-to-date per client (see planBoundsByClient),
    // never a shared/selectable date range.
    const allPlanStarts = Array.from(planBoundsByClient.values())
      .map(b => b.start)
      .filter(Boolean) as string[];
    const spendQueryStart = allPlanStarts.length ? [...allPlanStarts].sort()[0] : nzStartOfYear();
    const { data: spendRows } = await supabase
      .from('ad_performance_metrics')
      .select('client_id, spend, campaign_id, date, platform, account_id')
      .eq('user_id', session.user.id) // Filter by current user
      .gte('date', spendQueryStart)
      .lte('date', today)
      .not('client_id', 'is', null); // Only include rows with client_id (matching new-client-dashboard which filters by client)

    // ── Build enriched client list ────────────────────────────────────────────
    const enrichedClients: ClientCardData[] = await Promise.all(
      (clientsData || []).map(async (client: any) => {
        const healthArray = client.client_health_status as any[];
        let health = healthArray && healthArray.length > 0 ? healthArray[0] : null;

        if (!health) {
          health = await calculateClientHealth(supabase, client.id);
        }

        const rawChannels: any[] = mediaPlanMap.get(client.id) || [];
        const channels = channelsByClient.get(client.id) || [];
        const { start: planStart, end: planEnd } = planBoundsByClient.get(client.id) || { start: null, end: today };

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

        // ── Actual spend: plan-to-date (this client's own plan start → today) ──
        // Priority 1: mtd_actual_spend from client_health_status — this is computed
        // by the client dashboard with the user's campaign selection applied, so it
        // correctly excludes campaigns the client hasn't linked. Use it when the
        // stored range matches this client's plan-to-date window.
        // Priority 2: filter ad_performance_metrics by metaCampaignIds from the
        // media plan (also campaign-filtered, available without a dashboard visit),
        // bounded to the plan-to-date window.
        // Priority 3: sum all campaign rows in the window (fallback, may over-count).

        const cachedSpend: number | null = health?.mtd_actual_spend ?? null;
        const cachedStart: string | null = health?.spend_date_start ?? null;
        const cachedEnd: string | null = health?.spend_date_end ?? null;
        // Only trust the cache when its stored range exactly matches this
        // client's own plan-to-date window (not a shared/selectable range).
        const cacheHit =
          cachedSpend !== null &&
          planStart !== null &&
          cachedStart === planStart &&
          cachedEnd === planEnd;

        let actualSpend: number;
        if (cacheHit) {
          actualSpend = cachedSpend!;
        } else if (planStart === null) {
          // No dated flights yet — nothing to sum plan-to-date.
          actualSpend = 0;
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
            planStart,
            planEnd,
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
 * Calculate actual spend for a client by summing live API rows only, bounded
 * to [dateStart, dateEnd] (the client's own plan-to-date window). When
 * selectedCampaignIds is provided, only rows with a matching campaign_id are
 * counted — this mirrors the client dashboard's per-channel campaign filter.
 */
function calculateActualSpendForClient(
  clientId: string,
  spendRows: any[],
  dateStart: string,
  dateEnd: string,
  selectedCampaignIds?: Set<string>
): number {
  let totalSpend = 0;

  for (const row of spendRows) {
    if (row.client_id !== clientId) continue;
    if (!row.date || row.date < dateStart || row.date > dateEnd) continue;
    if (row.campaign_id && row.campaign_id.startsWith('manual-override-')) continue;
    if (selectedCampaignIds && selectedCampaignIds.size > 0) {
      if (!row.campaign_id || !selectedCampaignIds.has(row.campaign_id)) continue;
    }
    totalSpend += Number(row.spend || 0);
  }

  return totalSpend;
}
