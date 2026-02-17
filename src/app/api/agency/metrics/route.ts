// src/app/api/agency/metrics/route.ts
// Agency-wide summary metrics — reads from the same data sources as new-client-dashboard

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Count total clients
    const { count: totalClients, error: clientsError } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true });

    if (clientsError) {
      return NextResponse.json({ error: 'Failed to count clients' }, { status: 500 });
    }

    // 2. Status breakdown from client_health_status
    const { data: healthStatuses } = await supabase
      .from('client_health_status')
      .select('status');

    const statusBreakdown = { red: 0, amber: 0, green: 0, unknown: 0 };
    (healthStatuses || []).forEach((h: any) => {
      statusBreakdown[h.status as keyof typeof statusBreakdown]++;
    });
    statusBreakdown.unknown =
      (totalClients || 0) -
      (statusBreakdown.red + statusBreakdown.amber + statusBreakdown.green);

    // 3. Total planned budget from client_media_plan_builder (sum all flight budgets)
    const { data: allPlans } = await supabase
      .from('client_media_plan_builder')
      .select('channels');

    let totalBudgetCents = 0;
    for (const plan of allPlans || []) {
      if (!plan.channels || !Array.isArray(plan.channels)) continue;
      for (const channel of plan.channels as any[]) {
        for (const flight of channel.flights || []) {
          totalBudgetCents += Math.round((Number(flight.budget) || 0) * 100);
        }
      }
    }

    // 4. Total actual spend from ad_performance_metrics (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startDate = thirtyDaysAgo.toISOString().split('T')[0];
    const endDate = new Date().toISOString().split('T')[0];

    const { data: spendRows } = await supabase
      .from('ad_performance_metrics')
      .select('spend')
      .gte('date', startDate)
      .lte('date', endDate);

    const totalSpentCents = Math.round(
      (spendRows || []).reduce((sum: number, row: any) => sum + Number(row.spend || 0), 0) * 100
    );

    // 5. Action point counts — overdue (incomplete with past due_date) and at-risk (total incomplete)
    //    We aggregate across all clients via client_action_point_completions + action_points

    // Get all action points that have a due_date
    const today = new Date().toISOString().split('T')[0];

    const { data: allActionPoints } = await supabase
      .from('action_points')
      .select('id, due_date');

    const apIds = (allActionPoints || []).map((ap: any) => ap.id);

    // All per-client completions
    const { data: allCompletions } = await supabase
      .from('client_action_point_completions')
      .select('action_point_id, completed');

    // Build a set of globally-completed action_point_ids (marked done by at least one client)
    // For agency totals we count each (client, action_point) pair separately
    // But since we don't have a full matrix here, we use the simpler aggregate:
    // overdueCount = action_points with due_date < today that have NO completion record marked true
    const completedApIds = new Set(
      (allCompletions || [])
        .filter((c: any) => c.completed)
        .map((c: any) => c.action_point_id)
    );

    const overdueAps = (allActionPoints || []).filter((ap: any) => {
      if (!ap.due_date) return false;
      if (completedApIds.has(ap.id)) return false;
      return ap.due_date < today;
    });
    const totalOverdueTasks = overdueAps.length;

    // At-risk = all incomplete action points (total - completed)
    const totalAtRiskTasks = apIds.length - completedApIds.size;

    const metrics: AgencyMetrics = {
      totalClients: totalClients || 0,
      statusBreakdown,
      totalBudgetCents,
      totalSpentCents,
      totalOverdueTasks,
      totalAtRiskTasks: Math.max(0, totalAtRiskTasks),
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(metrics);
  } catch (error: any) {
    console.error('Error in GET /api/agency/metrics:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
