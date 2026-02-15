// src/app/api/agency/metrics/route.ts
// API endpoint for agency-wide summary metrics

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';

interface AgencyMetrics {
  totalClients: number;
  statusBreakdown: {
    red: number;
    amber: number;
    green: number;
    unknown: number;
  };
  totalBudgetCents: number;
  totalSpentCents: number;
  totalOverdueTasks: number;
  totalAtRiskTasks: number;
  lastUpdated: string;
}

/**
 * GET /api/agency/metrics
 * Calculate and return agency-wide summary metrics
 */
export async function GET(request: NextRequest) {
  try {
    // Auth check
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Count total clients
    const { count: totalClients, error: clientsError } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true });

    if (clientsError) {
      console.error('Error counting clients:', clientsError);
      return NextResponse.json(
        { error: 'Failed to count clients' },
        { status: 500 }
      );
    }

    // 2. Get status breakdown
    const { data: healthStatuses, error: healthError } = await supabase
      .from('client_health_status')
      .select('status');

    if (healthError) {
      console.error('Error fetching health statuses:', healthError);
      return NextResponse.json(
        { error: 'Failed to fetch health statuses' },
        { status: 500 }
      );
    }

    const statusBreakdown = {
      red: 0,
      amber: 0,
      green: 0,
      unknown: 0,
    };

    (healthStatuses || []).forEach((health) => {
      statusBreakdown[health.status]++;
    });

    // Calculate unknown (clients without health status)
    statusBreakdown.unknown =
      (totalClients || 0) - (statusBreakdown.red + statusBreakdown.amber + statusBreakdown.green);

    // 3. Sum total budgets from active media plans
    const { data: activePlans, error: plansError } = await supabase
      .from('media_plans')
      .select('total_budget')
      .eq('status', 'active');

    const totalBudgetCents = (activePlans || []).reduce(
      (sum, plan) => sum + plan.total_budget,
      0
    );

    // 4. Get all channel IDs to calculate total spent
    const { data: channels, error: channelsError } = await supabase
      .from('channels')
      .select('id, plan_id');

    let totalSpentCents = 0;
    if (channels && channels.length > 0) {
      const channelIds = channels.map((ch) => ch.id);
      
      const { data: weeklyPlans, error: weeklyError } = await supabase
        .from('weekly_plans')
        .select('budget_actual')
        .in('channel_id', channelIds);

      totalSpentCents = (weeklyPlans || []).reduce(
        (sum, wp) => sum + wp.budget_actual,
        0
      );
    }

    // 5. Count total overdue tasks
    const today = new Date().toISOString().split('T')[0];

    const { data: overdueTasks, error: overdueError } = await supabase
      .from('client_tasks')
      .select('id')
      .eq('completed', false)
      .or(`due_date.lt.${today},next_due_date.lt.${today}`);

    const totalOverdueTasks = overdueTasks?.length || 0;

    // 6. Count at-risk tasks (due within 7 days)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const sevenDaysStr = sevenDaysFromNow.toISOString().split('T')[0];

    const { data: atRiskTasks, error: atRiskError } = await supabase
      .from('client_tasks')
      .select('id')
      .eq('completed', false)
      .or(
        `and(due_date.gte.${today},due_date.lte.${sevenDaysStr}),` +
        `and(next_due_date.gte.${today},next_due_date.lte.${sevenDaysStr})`
      );

    const totalAtRiskTasks = atRiskTasks?.length || 0;

    // 7. Prepare response
    const metrics: AgencyMetrics = {
      totalClients: totalClients || 0,
      statusBreakdown,
      totalBudgetCents,
      totalSpentCents,
      totalOverdueTasks,
      totalAtRiskTasks,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(metrics);
  } catch (error: any) {
    console.error('Error in GET /api/agency/metrics:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
