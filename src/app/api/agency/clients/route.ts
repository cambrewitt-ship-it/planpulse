// src/app/api/agency/clients/route.ts
// API endpoint for fetching all clients with cached spend metrics + enriched card data

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database, ClientWithSpendCache } from '@/types/database';
import {
  refreshClientSpendCache,
  computeActionPointStatsFromBulk,
  computeNextCriticalFromBulk,
} from '@/lib/health/calculations';
import { nzToday, nzDateKeyOffset, nzStartOfYear } from '@/lib/timezone';
import { ensureDemoDataSeeded } from '@/lib/demo-seed/seed-demo-data';

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

export interface ClientCardData extends ClientWithSpendCache {
  channels: ClientChannel[];
  tasksDueSoon: number;                // incomplete tasks with due_date within next 3 days
  plannedBudget: number;               // total campaign budget across all channels/months ($)
  actualSpend: number;                 // actual spend from plan start to today ($)
  spendVariancePct: number | null;     // ((actual - planned) / planned) * 100, positive = over
  totalActionPoints: number;           // total action points for this client
  completedActionPoints: number;       // completed action points for this client
  account_manager: string | null;      // assigned account manager name
  logo_url: string | null;             // client logo URL
  is_demo: boolean;                    // true for the auto-seeded Demo Client
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
 * Fetch all clients with their cached spend/task metrics
 * Query params:
 *  - accountManager: account manager name (optional filter)
 *
 * actualSpend is always computed on a plan-to-date basis per client (from
 * that client's own media plan start date through today), not a shared
 * date range — there is no date-range override.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountManagerFilter = searchParams.get('accountManager');

    // Auth check
    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Lazily seed a Demo Client the first time a brand-new (empty) account
    // loads the dashboard. Idempotent and best-effort — never blocks a real
    // dashboard load if seeding fails.
    try {
      await ensureDemoDataSeeded(supabase, session.user.id);
    } catch (seedError) {
      console.error('Error ensuring demo data seeded:', seedError);
    }

    // Fetch clients (filtered by account manager at the source when provided,
    // rather than after fully enriching every client) plus the two other
    // agency-wide bulk lookups in parallel — none of these three depend on
    // each other.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let clientsQuery = (supabase as any)
      .from('clients')
      .select(`*, client_spend_cache (*)`)
      .eq('user_id', session.user.id)
      .order('name', { ascending: true });
    if (accountManagerFilter) {
      clientsQuery = clientsQuery.eq('account_manager', accountManagerFilter);
    }

    const today = nzToday();
    const in3Days = nzDateKeyOffset(3);

    const [
      { data: clientsData, error: clientsError },
      { data: allMediaPlans },
      { data: allActionPoints },
    ] = await Promise.all([
      clientsQuery,
      supabase.from('client_media_plan_builder').select('client_id, channels'),
      // Unfiltered: used both for tasksDueSoon (filtered client-side to the
      // 3-day window below) and for the bulk action-point stats / next-critical-task
      // computations, which need the full set (including undated/later APs).
      supabase.from('action_points').select('id, channel_type, due_date, text'),
    ]);

    if (clientsError) {
      console.error('Error fetching clients:', clientsError);
      return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
    }

    const mediaPlanMap = new Map<string, any[]>();
    for (const plan of allMediaPlans || []) {
      if (plan.channels && Array.isArray(plan.channels)) {
        mediaPlanMap.set(plan.client_id, plan.channels as any[]);
      }
    }

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
    // never a shared/selectable date range. Also widened to cover the last 30
    // days so the same fetch can supply the cache's 30-day actualSpend30d figure
    // (see refreshClientSpendCache's precomputed path below) without a second query.
    const thirtyDaysAgo = nzDateKeyOffset(-30);
    const allPlanStarts = Array.from(planBoundsByClient.values())
      .map(b => b.start)
      .filter(Boolean) as string[];
    const earliestPlanStart = allPlanStarts.length ? [...allPlanStarts].sort()[0] : nzStartOfYear();
    const spendQueryStart = earliestPlanStart < thirtyDaysAgo ? earliestPlanStart : thirtyDaysAgo;
    const { data: spendRows } = await supabase
      .from('ad_performance_metrics')
      .select('client_id, spend, campaign_id, date, platform, account_id')
      .eq('user_id', session.user.id) // Filter by current user
      .gte('date', spendQueryStart)
      .lte('date', today)
      .not('client_id', 'is', null); // Only include rows with client_id (matching new-client-dashboard which filters by client)

    // Group once instead of each client scanning the full array.
    const spendRowsByClient = new Map<string, any[]>();
    for (const row of spendRows || []) {
      if (!spendRowsByClient.has(row.client_id)) spendRowsByClient.set(row.client_id, []);
      spendRowsByClient.get(row.client_id)!.push(row);
    }

    // ── Build enriched client list ────────────────────────────────────────────
    const enrichedClients: ClientCardData[] = await Promise.all(
      (clientsData || []).map(async (client: any) => {
        const spendCacheArray = client.client_spend_cache as any[];
        let spendCache = spendCacheArray && spendCacheArray.length > 0 ? spendCacheArray[0] : null;

        const rawChannels: any[] = mediaPlanMap.get(client.id) || [];
        const channels = channelsByClient.get(client.id) || [];
        const { start: planStart, end: planEnd } = planBoundsByClient.get(client.id) || { start: null, end: today };
        const clientCompletions = completionsByClient.get(client.id) || new Map<string, boolean>();
        const clientSpendRows = spendRowsByClient.get(client.id) || [];

        // ── Action point completion stats (from already-fetched bulk data) ──
        const apStats = computeActionPointStatsFromBulk(rawChannels, allActionPoints || [], clientCompletions, today);

        // ── Tasks due soon (within 3 days, not completed) ──
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

        if (!spendCache) {
          const activeChannelCount = rawChannels.filter((ch: any) => ch.channelName).length;
          const nextCritical = computeNextCriticalFromBulk(rawChannels, allActionPoints || [], clientCompletions);
          // Matches getActualSpendForClient's default (last 30 days, unfiltered by
          // campaign selection) — intentionally distinct from the plan-to-date,
          // campaign-filtered `actualSpend` computed below.
          const actualSpend30d = clientSpendRows.reduce((sum: number, row: any) => {
            if (!row.date || row.date < thirtyDaysAgo || row.date > today) return sum;
            return sum + Number(row.spend || 0);
          }, 0);

          spendCache = await refreshClientSpendCache(supabase, client.id, {
            activeChannelCount,
            plannedBudget,
            actualSpend30d,
            apStats,
            nextCritical,
          });
        }

        // ── Actual spend: plan-to-date (this client's own plan start → today) ──
        // Priority 1: mtd_actual_spend from client_spend_cache — this is computed
        // by the client dashboard with the user's campaign selection applied, so it
        // correctly excludes campaigns the client hasn't linked. Use it when the
        // stored range matches this client's plan-to-date window.
        // Priority 2: filter ad_performance_metrics by metaCampaignIds from the
        // media plan (also campaign-filtered, available without a dashboard visit),
        // bounded to the plan-to-date window.
        // Priority 3: sum all campaign rows in the window (fallback, may over-count).

        const cachedSpend: number | null = spendCache?.mtd_actual_spend ?? null;
        const cachedStart: string | null = spendCache?.spend_date_start ?? null;
        const cachedEnd: string | null = spendCache?.spend_date_end ?? null;
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
            clientSpendRows,
            planStart,
            planEnd,
            selectedCampaignIds.size > 0 ? selectedCampaignIds : undefined
          );
        }

        // ── Spend variance % — positive means overspending ──
        const spendVariancePct = plannedBudget > 0
          ? ((actualSpend - plannedBudget) / plannedBudget) * 100
          : null;

        return {
          id: client.id,
          name: client.name,
          created_at: client.created_at,
          updated_at: client.updated_at,
          spendCache,
          channels,
          tasksDueSoon,
          plannedBudget,
          actualSpend,
          spendVariancePct,
          totalActionPoints: apStats.total,
          completedActionPoints: apStats.completed,
          account_manager: client.account_manager || null,
          logo_url: client.logo_url || null,
          is_demo: client.is_demo || false,
        };
      })
    );

    // Sort by name (account manager filtering is already applied at the
    // clients query above, so no post-hoc filtering needed here)
    enrichedClients.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ clients: enrichedClients });
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
 * to [dateStart, dateEnd] (the client's own plan-to-date window). `spendRows`
 * must already be pre-filtered to this client (see spendRowsByClient above).
 * When selectedCampaignIds is provided, only rows with a matching campaign_id
 * are counted — this mirrors the client dashboard's per-channel campaign filter.
 */
function calculateActualSpendForClient(
  spendRows: any[],
  dateStart: string,
  dateEnd: string,
  selectedCampaignIds?: Set<string>
): number {
  let totalSpend = 0;

  for (const row of spendRows) {
    if (!row.date || row.date < dateStart || row.date > dateEnd) continue;
    if (row.campaign_id && row.campaign_id.startsWith('manual-override-')) continue;
    if (selectedCampaignIds && selectedCampaignIds.size > 0) {
      if (!row.campaign_id || !selectedCampaignIds.has(row.campaign_id)) continue;
    }
    totalSpend += Number(row.spend || 0);
  }

  return totalSpend;
}
