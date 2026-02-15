// src/lib/health/calculations.ts
// Health calculation logic for Master Agency Dashboard

import { supabase } from '@/lib/supabase/client';
import type { ClientHealthStatus, ClientTask, HealthStatus } from '@/types/database';

// ============================================================================
// TYPE DEFINITIONS
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
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get count of overdue tasks for a client
 */
export async function getOverdueTasksForClient(clientId: string): Promise<number> {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    const { data, error } = await supabase
      .from('client_tasks')
      .select('id')
      .eq('client_id', clientId)
      .eq('completed', false)
      .or(`due_date.lt.${today},next_due_date.lt.${today}`);

    if (error) {
      console.error('Error fetching overdue tasks:', error);
      return 0;
    }

    return data?.length || 0;
  } catch (err) {
    console.error('Exception in getOverdueTasksForClient:', err);
    return 0;
  }
}

/**
 * Get count of upcoming tasks within specified days for a client
 */
export async function getUpcomingTasksForClient(
  clientId: string,
  days: number
): Promise<number> {
  try {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + days);

    const todayStr = today.toISOString().split('T')[0];
    const futureStr = futureDate.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('client_tasks')
      .select('id')
      .eq('client_id', clientId)
      .eq('completed', false)
      .or(
        `and(due_date.gte.${todayStr},due_date.lte.${futureStr}),` +
        `and(next_due_date.gte.${todayStr},next_due_date.lte.${futureStr})`
      );

    if (error) {
      console.error('Error fetching upcoming tasks:', error);
      return 0;
    }

    return data?.length || 0;
  } catch (err) {
    console.error('Exception in getUpcomingTasksForClient:', err);
    return 0;
  }
}

/**
 * Calculate budget variance for a channel (returns percentage)
 * Returns actual/planned * 100
 * Returns 100 if no budget data available
 */
export async function getBudgetVarianceForChannel(channelId: string): Promise<number> {
  try {
    const { data: weeklyPlans, error } = await supabase
      .from('weekly_plans')
      .select('budget_planned, budget_actual')
      .eq('channel_id', channelId);

    if (error) {
      console.error('Error fetching weekly plans:', error);
      return 100; // Neutral variance if error
    }

    if (!weeklyPlans || weeklyPlans.length === 0) {
      return 100; // Neutral variance if no data
    }

    const totalPlanned = weeklyPlans.reduce((sum, wp) => sum + wp.budget_planned, 0);
    const totalActual = weeklyPlans.reduce((sum, wp) => sum + wp.budget_actual, 0);

    if (totalPlanned === 0) {
      return 100; // Neutral if no budget planned
    }

    return (totalActual / totalPlanned) * 100;
  } catch (err) {
    console.error('Exception in getBudgetVarianceForChannel:', err);
    return 100;
  }
}

/**
 * Check if all setup tasks are completed for a channel
 */
export async function isChannelSetupComplete(channelId: string): Promise<boolean> {
  try {
    const { data: setupTasks, error } = await supabase
      .from('client_tasks')
      .select('id, completed')
      .eq('channel_id', channelId)
      .eq('task_type', 'setup');

    if (error) {
      console.error('Error checking setup tasks:', error);
      return true; // Assume complete if error (don't penalize)
    }

    if (!setupTasks || setupTasks.length === 0) {
      return true; // No setup tasks = setup complete
    }

    return setupTasks.every(task => task.completed);
  } catch (err) {
    console.error('Exception in isChannelSetupComplete:', err);
    return true;
  }
}

/**
 * Calculate days until a given date
 * Returns null if date is in the past or null
 */
function daysUntilDate(targetDate: string | null): number | null {
  if (!targetDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);

  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return diffDays >= 0 ? diffDays : null;
}

// ============================================================================
// MAIN CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate health status for a single channel
 */
export async function calculateChannelHealth(channelId: string): Promise<ChannelHealth> {
  const reasons: string[] = [];
  let status: HealthStatus = 'green';

  try {
    // 1. Fetch channel details
    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .select(`
        id,
        client_id,
        channel,
        detail,
        created_at
      `)
      .eq('id', channelId)
      .single();

    if (channelError || !channel) {
      console.error('Error fetching channel:', channelError);
      return {
        channelId,
        status: 'green',
        reasons: ['Channel not found'],
        metrics: {
          overdueTasks: 0,
          upcomingTasks: 0,
          budgetVariance: 100,
          setupComplete: true,
          daysToStart: null,
        },
      };
    }

    // 2. Get channel start date from associated media plan
    const { data: plan, error: planError } = await supabase
      .from('media_plans')
      .select('start_date')
      .eq('id', channel.id) // This might need adjustment based on your schema
      .single();

    const startDate = plan?.start_date || null;
    const daysToStart = daysUntilDate(startDate);

    // 3. Count overdue tasks for this channel
    const { data: overdueTasks, error: overdueError } = await supabase
      .from('client_tasks')
      .select('id')
      .eq('channel_id', channelId)
      .eq('completed', false)
      .or(`due_date.lt.${new Date().toISOString().split('T')[0]},next_due_date.lt.${new Date().toISOString().split('T')[0]}`);

    const overdueCount = overdueTasks?.length || 0;

    // 4. Count upcoming tasks (next 3 days)
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const threeDaysStr = threeDaysFromNow.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];

    const { data: upcomingTasks, error: upcomingError } = await supabase
      .from('client_tasks')
      .select('id')
      .eq('channel_id', channelId)
      .eq('completed', false)
      .or(
        `and(due_date.gte.${todayStr},due_date.lte.${threeDaysStr}),` +
        `and(next_due_date.gte.${todayStr},next_due_date.lte.${threeDaysStr})`
      );

    const upcomingCount = upcomingTasks?.length || 0;

    // 5. Calculate budget variance
    const budgetVariance = await getBudgetVarianceForChannel(channelId);

    // 6. Check setup completion
    const setupComplete = await isChannelSetupComplete(channelId);

    // 7. Apply traffic light rules
    
    // RED CONDITIONS
    if (overdueCount >= 2) {
      status = 'red';
      reasons.push(`${overdueCount} overdue tasks`);
    }

    if (!setupComplete && daysToStart !== null && daysToStart < 3) {
      status = 'red';
      reasons.push(`Setup incomplete with ${daysToStart} days until launch`);
    }

    if (budgetVariance > 120) {
      status = 'red';
      reasons.push(`Budget overspend: ${budgetVariance.toFixed(1)}%`);
    }

    if (budgetVariance < 80 && budgetVariance > 0) {
      status = 'red';
      reasons.push(`Budget underspend: ${budgetVariance.toFixed(1)}%`);
    }

    // AMBER CONDITIONS (only if not already red)
    if (status !== 'red') {
      if (overdueCount === 1) {
        status = 'amber';
        reasons.push('1 overdue task');
      }

      if (upcomingCount >= 2 && daysToStart !== null && daysToStart < 3) {
        status = 'amber';
        reasons.push(`${upcomingCount} tasks due within 3 days of launch`);
      }

      if (!setupComplete && daysToStart !== null && daysToStart >= 3 && daysToStart < 7) {
        status = 'amber';
        reasons.push(`Setup incomplete with ${daysToStart} days until launch`);
      }

      if (budgetVariance >= 110 && budgetVariance <= 120) {
        status = 'amber';
        reasons.push(`Budget slightly over: ${budgetVariance.toFixed(1)}%`);
      }

      if (budgetVariance >= 80 && budgetVariance < 90) {
        status = 'amber';
        reasons.push(`Budget slightly under: ${budgetVariance.toFixed(1)}%`);
      }
    }

    // GREEN (default)
    if (status === 'green' && reasons.length === 0) {
      reasons.push('All metrics healthy');
    }

    return {
      channelId,
      status,
      reasons,
      metrics: {
        overdueTasks: overdueCount,
        upcomingTasks: upcomingCount,
        budgetVariance,
        setupComplete,
        daysToStart,
      },
    };
  } catch (err) {
    console.error('Exception in calculateChannelHealth:', err);
    return {
      channelId,
      status: 'green',
      reasons: ['Error calculating health'],
      metrics: {
        overdueTasks: 0,
        upcomingTasks: 0,
        budgetVariance: 100,
        setupComplete: true,
        daysToStart: null,
      },
    };
  }
}

/**
 * Calculate health status for a client (aggregates all channels)
 */
export async function calculateClientHealth(
  clientId: string
): Promise<ClientHealthStatus | null> {
  try {
    // 1. Fetch all active channels for this client
    const { data: channels, error: channelsError } = await supabase
      .from('channels')
      .select('id, plan_id')
      .eq('client_id', clientId);

    if (channelsError) {
      console.error('Error fetching channels:', channelsError);
      return null;
    }

    // 2. Calculate health for each channel
    const channelHealthPromises = (channels || []).map(ch =>
      calculateChannelHealth(ch.id)
    );
    const channelHealthResults = await Promise.all(channelHealthPromises);

    // 3. Determine worst status (red > amber > green)
    let clientStatus: HealthStatus = 'green';
    if (channelHealthResults.some(ch => ch.status === 'red')) {
      clientStatus = 'red';
    } else if (channelHealthResults.some(ch => ch.status === 'amber')) {
      clientStatus = 'amber';
    }

    // 4. Count overdue and at-risk tasks
    const totalOverdueTasks = await getOverdueTasksForClient(clientId);
    const atRiskTasks = await getUpcomingTasksForClient(clientId, 7);

    // 5. Calculate total budget and spend
    const { data: mediaPlans, error: plansError } = await supabase
      .from('media_plans')
      .select('id, total_budget, status')
      .eq('client_id', clientId)
      .eq('status', 'active');

    const totalBudgetCents = (mediaPlans || []).reduce(
      (sum, plan) => sum + plan.total_budget,
      0
    );

    // Get total spent from weekly_plans for active channels
    const channelIds = (channels || []).map(ch => ch.id);
    let totalSpentCents = 0;

    if (channelIds.length > 0) {
      const { data: weeklyPlans, error: weeklyError } = await supabase
        .from('weekly_plans')
        .select('budget_actual')
        .in('channel_id', channelIds);

      totalSpentCents = (weeklyPlans || []).reduce(
        (sum, wp) => sum + wp.budget_actual,
        0
      );
    }

    // 6. Calculate budget health percentage
    const budgetHealthPercentage =
      totalBudgetCents > 0 ? (totalSpentCents / totalBudgetCents) * 100 : null;

    // 7. Find next critical date
    const { data: upcomingTasks, error: tasksError } = await supabase
      .from('client_tasks')
      .select('title, due_date, next_due_date')
      .eq('client_id', clientId)
      .eq('completed', false)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(1);

    let nextCriticalDate: string | null = null;
    let nextCriticalTask: string | null = null;

    if (upcomingTasks && upcomingTasks.length > 0) {
      const task = upcomingTasks[0];
      nextCriticalDate = task.due_date || task.next_due_date || null;
      nextCriticalTask = task.title;
    }

    // 8. Upsert to client_health_status table
    const healthStatus: Omit<ClientHealthStatus, 'id' | 'created_at' | 'updated_at'> = {
      client_id: clientId,
      status: clientStatus,
      active_channel_count: channels?.length || 0,
      total_overdue_tasks: totalOverdueTasks,
      at_risk_tasks: atRiskTasks,
      total_budget_cents: totalBudgetCents,
      total_spent_cents: totalSpentCents,
      budget_health_percentage: budgetHealthPercentage,
      next_critical_date: nextCriticalDate,
      next_critical_task: nextCriticalTask,
      last_calculated_at: new Date().toISOString(),
    };

    const { data: upsertedHealth, error: upsertError } = await supabase
      .from('client_health_status')
      .upsert(healthStatus, { onConflict: 'client_id' })
      .select()
      .single();

    if (upsertError) {
      console.error('Error upserting client health status:', upsertError);
      return null;
    }

    return upsertedHealth;
  } catch (err) {
    console.error('Exception in calculateClientHealth:', err);
    return null;
  }
}

/**
 * Refresh health status for all clients
 */
export async function refreshAllClientHealth(): Promise<RefreshAllResult> {
  const result: RefreshAllResult = {
    updated: 0,
    errors: [],
  };

  try {
    // 1. Fetch all client IDs
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id');

    if (clientsError) {
      console.error('Error fetching clients:', clientsError);
      return result;
    }

    if (!clients || clients.length === 0) {
      console.log('No clients found to refresh');
      return result;
    }

    console.log(`Refreshing health for ${clients.length} clients...`);

    // 2. Calculate health for each client
    for (const client of clients) {
      try {
        const health = await calculateClientHealth(client.id);
        if (health) {
          result.updated++;
          console.log(`✓ Updated health for client ${client.id}: ${health.status}`);
        } else {
          result.errors.push({
            clientId: client.id,
            error: 'Failed to calculate health',
          });
          console.error(`✗ Failed to update health for client ${client.id}`);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        result.errors.push({
          clientId: client.id,
          error: errorMsg,
        });
        console.error(`✗ Exception for client ${client.id}:`, err);
      }
    }

    console.log(
      `Refresh complete: ${result.updated} updated, ${result.errors.length} errors`
    );
  } catch (err) {
    console.error('Exception in refreshAllClientHealth:', err);
  }

  return result;
}
