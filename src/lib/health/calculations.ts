// src/lib/health/calculations.ts
// Spend/task metric calculation logic — reads from the real data sources used by new-client-dashboard:
//   - client_media_plan_builder (JSONB) for channel list + planned budget
//   - client_action_point_completions + action_points for task completion
//   - ad_performance_metrics for actual spend
//
// Note: this used to also classify clients into a red/amber/green traffic
// light (client_health_status.status). That's been removed — it was hard to
// measure meaningfully. What's left are plain cached numbers (overdue task
// count, budget pacing %, next critical task) with no grade attached.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClientSpendCache } from '@/types/database';
import { nzToday, nzDateKeyOffset } from '@/lib/timezone';

// ============================================================================
// TYPES
// ============================================================================

export interface RefreshAllResult {
  updated: number;
  errors: Array<{ clientId: string; error: string }>;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get action point counts for a client, using per-client completions table.
 * Returns { total, completed, overdueCount } based on action_points where
 * channel_type matches the client's media plan channels.
 */
export async function getActionPointStatsForClient(
  supabase: SupabaseClient,
  clientId: string
): Promise<{ total: number; completed: number; overdueIncomplete: number }> {
  try {
    // 1. Get the client's channel types from client_media_plan_builder
    const { data: planData } = await supabase
      .from('client_media_plan_builder')
      .select('channels')
      .eq('client_id', clientId)
      .single();

    if (!planData?.channels || !Array.isArray(planData.channels) || planData.channels.length === 0) {
      return { total: 0, completed: 0, overdueIncomplete: 0 };
    }

    // Normalise channel names to "Title Case" to match action_points.channel_type
    const channelTypes = [
      ...new Set(
        (planData.channels as any[])
          .filter((ch: any) => ch.channelName)
          .map((ch: any) =>
            ch.channelName
              .toLowerCase()
              .split(' ')
              .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' ')
          )
      ),
    ];

    if (channelTypes.length === 0) {
      return { total: 0, completed: 0, overdueIncomplete: 0 };
    }

    // 2. Fetch all action points for those channel types
    const { data: actionPoints } = await supabase
      .from('action_points')
      .select('id, due_date, category')
      .in('channel_type', channelTypes);

    if (!actionPoints || actionPoints.length === 0) {
      return { total: 0, completed: 0, overdueIncomplete: 0 };
    }

    const apIds = actionPoints.map((ap: any) => ap.id);

    // 3. Fetch per-client completions
    const { data: completions } = await supabase
      .from('client_action_point_completions')
      .select('action_point_id, completed')
      .eq('client_id', clientId)
      .in('action_point_id', apIds);

    const completionMap = new Map(
      (completions || []).map((c: any) => [c.action_point_id, c.completed])
    );

    const total = actionPoints.length;
    const completed = actionPoints.filter((ap: any) =>
      completionMap.get(ap.id) === true
    ).length;

    // Count SET UP tasks that are overdue and not completed
    const today = nzToday();

    const overdueIncomplete = actionPoints.filter((ap: any) => {
      if (completionMap.get(ap.id) === true) return false;
      if (!ap.due_date) return false;
      return String(ap.due_date).slice(0, 10) < today;
    }).length;

    return { total, completed, overdueIncomplete };
  } catch (err) {
    console.error('Exception in getActionPointStatsForClient:', err);
    return { total: 0, completed: 0, overdueIncomplete: 0 };
  }
}

/**
 * Get active channel count from client_media_plan_builder JSONB.
 */
export async function getActiveChannelCount(
  supabase: SupabaseClient,
  clientId: string
): Promise<number> {
  try {
    const { data } = await supabase
      .from('client_media_plan_builder')
      .select('channels')
      .eq('client_id', clientId)
      .single();

    if (!data?.channels || !Array.isArray(data.channels)) return 0;
    return (data.channels as any[]).filter((ch: any) => ch.channelName).length;
  } catch {
    return 0;
  }
}

/**
 * Get planned budget (sum of all flight budgets) from client_media_plan_builder.
 * Returns value in the same unit stored (dollars, not cents — convert at call site if needed).
 */
export async function getPlannedBudgetForClient(
  supabase: SupabaseClient,
  clientId: string
): Promise<number> {
  try {
    const { data } = await supabase
      .from('client_media_plan_builder')
      .select('channels')
      .eq('client_id', clientId)
      .single();

    if (!data?.channels || !Array.isArray(data.channels)) return 0;

    let total = 0;
    for (const channel of data.channels as any[]) {
      for (const flight of channel.flights || []) {
        total += Number(flight.budget) || 0;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

/**
 * Get total actual spend for a client from ad_performance_metrics.
 * Uses the last 30 days if no date range specified.
 */
export async function getActualSpendForClient(
  supabase: SupabaseClient,
  clientId: string,
  startDate?: string,
  endDate?: string
): Promise<number> {
  try {
    const end = endDate || nzToday();
    const start = startDate || nzDateKeyOffset(-30);

    const { data } = await supabase
      .from('ad_performance_metrics')
      .select('spend')
      .eq('client_id', clientId)
      .gte('date', start)
      .lte('date', end);

    return (data || []).reduce((sum: number, row: any) => sum + Number(row.spend || 0), 0);
  } catch {
    return 0;
  }
}

// ============================================================================
// BULK COMPUTATION HELPERS
// ============================================================================
// Pure (no DB access) equivalents of the per-client query logic above, for
// callers that already have the relevant data fetched in bulk (e.g. the
// agency clients list, which fetches media plans / action points / completions
// once for all clients instead of re-querying per client).

function titleCaseChannelTypes(rawChannels: any[]): string[] {
  return [
    ...new Set(
      (rawChannels || [])
        .filter((ch: any) => ch.channelName)
        .map((ch: any) =>
          ch.channelName
            .toLowerCase()
            .split(' ')
            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ')
        )
    ),
  ];
}

/** Bulk equivalent of {@link getActionPointStatsForClient}. */
export function computeActionPointStatsFromBulk(
  rawChannels: any[],
  allActionPoints: Array<{ id: string; channel_type: string; due_date: string | null }>,
  completionsForClient: Map<string, boolean>,
  today: string
): { total: number; completed: number; overdueIncomplete: number } {
  const channelTypes = new Set(titleCaseChannelTypes(rawChannels));
  if (channelTypes.size === 0) return { total: 0, completed: 0, overdueIncomplete: 0 };

  const actionPoints = allActionPoints.filter(ap => channelTypes.has(ap.channel_type));
  if (actionPoints.length === 0) return { total: 0, completed: 0, overdueIncomplete: 0 };

  const total = actionPoints.length;
  const completed = actionPoints.filter(ap => completionsForClient.get(ap.id) === true).length;
  const overdueIncomplete = actionPoints.filter(ap => {
    if (completionsForClient.get(ap.id) === true) return false;
    if (!ap.due_date) return false;
    return String(ap.due_date).slice(0, 10) < today;
  }).length;

  return { total, completed, overdueIncomplete };
}

/** Bulk equivalent of the "next critical task" lookup inside {@link refreshClientSpendCache}. */
export function computeNextCriticalFromBulk(
  rawChannels: any[],
  allActionPoints: Array<{ id: string; channel_type: string; due_date: string | null; text: string }>,
  completionsForClient: Map<string, boolean>
): { date: string | null; task: string | null } {
  const channelTypes = new Set(titleCaseChannelTypes(rawChannels));
  if (channelTypes.size === 0) return { date: null, task: null };

  const apWithDates = allActionPoints
    .filter(ap => channelTypes.has(ap.channel_type) && ap.due_date != null)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
    .slice(0, 10);

  if (apWithDates.length === 0) return { date: null, task: null };

  const nextIncomplete = apWithDates.find(ap => completionsForClient.get(ap.id) !== true);
  if (!nextIncomplete) return { date: null, task: null };

  return { date: nextIncomplete.due_date, task: nextIncomplete.text };
}

// ============================================================================
// MAIN CALCULATION
// ============================================================================

/**
 * Refresh the cached spend/task metrics for a client using real data sources.
 * No grading — just plain numbers (overdue task count, budget pacing %,
 * next critical task) cached in client_spend_cache for reuse across the
 * agency list, reports, Teams bot, and crons.
 *
 * When `precomputed` is supplied (the agency clients list already has all of
 * this in bulk), it's used directly and no per-client queries are made. When
 * omitted, falls back to the original per-client query path below.
 */
export async function refreshClientSpendCache(
  supabase: SupabaseClient,
  clientId: string,
  precomputed?: {
    activeChannelCount: number;
    plannedBudget: number;
    actualSpend30d: number;
    apStats: { total: number; completed: number; overdueIncomplete: number };
    nextCritical: { date: string | null; task: string | null };
  }
): Promise<ClientSpendCache | null> {
  try {
    let total: number;
    let completed: number;
    let overdueIncomplete: number;
    let activeChannelCount: number;
    let plannedBudget: number;
    let actualSpend: number;
    let nextCriticalDate: string | null = null;
    let nextCriticalTask: string | null = null;

    if (precomputed) {
      ({ total, completed, overdueIncomplete } = precomputed.apStats);
      activeChannelCount = precomputed.activeChannelCount;
      plannedBudget = precomputed.plannedBudget;
      actualSpend = precomputed.actualSpend30d;
      nextCriticalDate = precomputed.nextCritical.date;
      nextCriticalTask = precomputed.nextCritical.task;
    } else {
      // 1. Action point stats
      ({ total, completed, overdueIncomplete } =
        await getActionPointStatsForClient(supabase, clientId));

      // 2. Channel count
      activeChannelCount = await getActiveChannelCount(supabase, clientId);

      // 3. Budget
      plannedBudget = await getPlannedBudgetForClient(supabase, clientId);
      actualSpend = await getActualSpendForClient(supabase, clientId);

      // 4. Find next due incomplete action point
      try {
        const { data: planData } = await supabase
          .from('client_media_plan_builder')
          .select('channels')
          .eq('client_id', clientId)
          .single();

        if (planData?.channels && Array.isArray(planData.channels)) {
          const channelTypes = [
            ...new Set(
              (planData.channels as any[])
                .filter((ch: any) => ch.channelName)
                .map((ch: any) =>
                  ch.channelName
                    .toLowerCase()
                    .split(' ')
                    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ')
                )
            ),
          ];

          if (channelTypes.length > 0) {
            const { data: apWithDates } = await supabase
              .from('action_points')
              .select('id, text, due_date')
              .in('channel_type', channelTypes)
              .not('due_date', 'is', null)
              .order('due_date', { ascending: true })
              .limit(10);

            if (apWithDates && apWithDates.length > 0) {
              const { data: clientCompletions } = await supabase
                .from('client_action_point_completions')
                .select('action_point_id, completed')
                .eq('client_id', clientId)
                .in('action_point_id', apWithDates.map((ap: any) => ap.id));

              const doneSet = new Set(
                (clientCompletions || [])
                  .filter((c: any) => c.completed)
                  .map((c: any) => c.action_point_id)
              );

              const nextIncomplete = apWithDates.find(
                (ap: any) => !doneSet.has(ap.id)
              );
              if (nextIncomplete) {
                nextCriticalDate = nextIncomplete.due_date;
                nextCriticalTask = nextIncomplete.text;
              }
            }
          }
        }
      } catch {
        // non-fatal
      }
    }

    // Budget pacing as percentage (actual / planned * 100)
    const budgetPacing =
      plannedBudget > 0 ? (actualSpend / plannedBudget) * 100 : null;

    // 5. Upsert to client_spend_cache
    // mtd_actual_spend, mtd_actual_spend_updated_at, spend_date_start, and
    // spend_date_end are intentionally excluded — they are managed by the
    // dashboard's PATCH /api/clients/[id]/actual-spend endpoint and must not
    // be overwritten here.
    const spendCache: Omit<ClientSpendCache, 'id' | 'created_at' | 'updated_at' | 'mtd_actual_spend' | 'mtd_actual_spend_updated_at' | 'spend_date_start' | 'spend_date_end'> = {
      client_id: clientId,
      active_channel_count: activeChannelCount,
      total_overdue_tasks: overdueIncomplete,
      at_risk_tasks: total - completed,        // total incomplete
      total_budget_cents: Math.round(plannedBudget * 100),
      total_spent_cents: Math.round(actualSpend * 100),
      budget_pacing_percentage: budgetPacing,
      next_critical_date: nextCriticalDate,
      next_critical_task: nextCriticalTask,
      last_calculated_at: new Date().toISOString(),
    };

    const { data: upserted, error: upsertError } = await supabase
      .from('client_spend_cache')
      .upsert(spendCache, { onConflict: 'client_id' })
      .select()
      .single();

    if (upsertError) {
      console.error('Error upserting client spend cache:', upsertError);
      return null;
    }

    return upserted;
  } catch (err) {
    console.error('Exception in refreshClientSpendCache:', err);
    return null;
  }
}

/**
 * Refresh spend cache for all clients.
 */
export async function refreshAllClientSpendCaches(
  supabase: SupabaseClient
): Promise<RefreshAllResult> {
  const result: RefreshAllResult = { updated: 0, errors: [] };

  try {
    const { data: clients, error } = await supabase
      .from('clients')
      .select('id');

    if (error || !clients) {
      console.error('Error fetching clients:', error);
      return result;
    }

    for (const client of clients) {
      try {
        const cache = await refreshClientSpendCache(supabase, client.id);
        if (cache) {
          result.updated++;
        } else {
          result.errors.push({ clientId: client.id, error: 'Failed to refresh spend cache' });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        result.errors.push({ clientId: client.id, error: msg });
      }
    }
  } catch (err) {
    console.error('Exception in refreshAllClientSpendCaches:', err);
  }

  return result;
}
