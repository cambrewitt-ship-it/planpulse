// src/lib/health/calculations.ts
// Health calculation logic — reads from the real data sources used by new-client-dashboard:
//   - client_media_plan_builder (JSONB) for channel list + planned budget
//   - client_action_point_completions + action_points for task completion
//   - ad_performance_metrics for actual spend

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClientHealthStatus, HealthStatus } from '@/types/database';

// ============================================================================
// TYPES
// ============================================================================

export interface ChannelHealthMetrics {
  overdueTasks: number;
  upcomingTasks: number;
  budgetVariance: number;
  setupComplete: boolean;
  daysToStart: number | null;
}

export interface ChannelHealth {
  channelId: string;
  status: HealthStatus;
  reasons: string[];
  metrics: ChannelHealthMetrics;
}

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdueIncomplete = actionPoints.filter((ap: any) => {
      if (completionMap.get(ap.id) === true) return false;
      if (!ap.due_date) return false;
      const due = new Date(ap.due_date);
      due.setHours(0, 0, 0, 0);
      return due < today;
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
    const end = endDate || new Date().toISOString().split('T')[0];
    const start =
      startDate ||
      (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
      })();

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
// MAIN CALCULATION
// ============================================================================

/**
 * Calculate health status for a client using real data sources.
 *
 * Traffic light rules:
 *   RED:   2+ overdue action points  OR  spend > 120% of plan  OR  spend < 60% of plan (with data)
 *   AMBER: 1 overdue action point    OR  spend 110-120%        OR  spend 60-80%
 *   GREEN: everything else
 */
export async function calculateClientHealth(
  supabase: SupabaseClient,
  clientId: string
): Promise<ClientHealthStatus | null> {
  try {
    const reasons: string[] = [];
    let clientStatus: HealthStatus = 'green';

    // 1. Action point stats
    const { total, completed, overdueIncomplete } =
      await getActionPointStatsForClient(supabase, clientId);

    // 2. Channel count
    const activeChannelCount = await getActiveChannelCount(supabase, clientId);

    // 3. Budget
    const plannedBudget = await getPlannedBudgetForClient(supabase, clientId);
    const actualSpend = await getActualSpendForClient(supabase, clientId);

    // Budget variance as percentage (actual / planned * 100)
    const budgetVariance =
      plannedBudget > 0 ? (actualSpend / plannedBudget) * 100 : null;

    // --- Apply traffic light rules ---

    // Task rules
    if (overdueIncomplete >= 2) {
      clientStatus = 'red';
      reasons.push(`${overdueIncomplete} overdue action points`);
    } else if (overdueIncomplete === 1) {
      if (clientStatus !== 'red') clientStatus = 'amber';
      reasons.push('1 overdue action point');
    }

    // Spend rules (only when we have planned budget data)
    if (budgetVariance !== null) {
      if (budgetVariance > 120) {
        clientStatus = 'red';
        reasons.push(`Overspend: ${budgetVariance.toFixed(0)}% of plan`);
      } else if (budgetVariance < 60 && actualSpend > 0) {
        clientStatus = 'red';
        reasons.push(`Underspend: ${budgetVariance.toFixed(0)}% of plan`);
      } else if (budgetVariance >= 110 && budgetVariance <= 120) {
        if (clientStatus !== 'red') clientStatus = 'amber';
        reasons.push(`Slightly over budget: ${budgetVariance.toFixed(0)}%`);
      } else if (budgetVariance >= 60 && budgetVariance < 80 && actualSpend > 0) {
        if (clientStatus !== 'red') clientStatus = 'amber';
        reasons.push(`Slightly under budget: ${budgetVariance.toFixed(0)}%`);
      }
    }

    if (clientStatus === 'green' && reasons.length === 0) {
      reasons.push('All metrics healthy');
    }

    // 4. Find next due incomplete action point
    let nextCriticalDate: string | null = null;
    let nextCriticalTask: string | null = null;

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

    // 5. Upsert to client_health_status
    const healthStatus: Omit<ClientHealthStatus, 'id' | 'created_at' | 'updated_at'> = {
      client_id: clientId,
      status: clientStatus,
      active_channel_count: activeChannelCount,
      total_overdue_tasks: overdueIncomplete,
      at_risk_tasks: total - completed,        // total incomplete
      total_budget_cents: Math.round(plannedBudget * 100),
      total_spent_cents: Math.round(actualSpend * 100),
      budget_health_percentage: budgetVariance,
      next_critical_date: nextCriticalDate,
      next_critical_task: nextCriticalTask,
      last_calculated_at: new Date().toISOString(),
    };

    const { data: upserted, error: upsertError } = await supabase
      .from('client_health_status')
      .upsert(healthStatus, { onConflict: 'client_id' })
      .select()
      .single();

    if (upsertError) {
      console.error('Error upserting client health status:', upsertError);
      return null;
    }

    return upserted;
  } catch (err) {
    console.error('Exception in calculateClientHealth:', err);
    return null;
  }
}

/**
 * Refresh health status for all clients.
 */
export async function refreshAllClientHealth(
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
        const health = await calculateClientHealth(supabase, client.id);
        if (health) {
          result.updated++;
        } else {
          result.errors.push({ clientId: client.id, error: 'Failed to calculate health' });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        result.errors.push({ clientId: client.id, error: msg });
      }
    }
  } catch (err) {
    console.error('Exception in refreshAllClientHealth:', err);
  }

  return result;
}
