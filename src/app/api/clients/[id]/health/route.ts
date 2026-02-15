// src/app/api/clients/[id]/health/route.ts
// API endpoint for client health details and manual refresh

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';
import { calculateClientHealth, calculateChannelHealth } from '@/lib/health/calculations';

interface ClientHealthDetail {
  client: {
    id: string;
    name: string;
  };
  health: any;
  channels: Array<{
    id: string;
    channel: string;
    detail: string;
    status: 'red' | 'amber' | 'green';
    reasons: string[];
    metrics: {
      overdueTasks: number;
      upcomingTasks: number;
      budgetVariance: number;
    };
  }>;
  tasks: Array<{
    id: string;
    title: string;
    taskType: 'setup' | 'health_check';
    dueDate: string | null;
    nextDueDate: string | null;
    completed: boolean;
    isOverdue: boolean;
    isAtRisk: boolean;
  }>;
}

/**
 * GET /api/clients/[id]/health
 * Fetch detailed health breakdown for a specific client
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params;

    // Auth check
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Fetch client
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      );
    }

    // 2. Fetch client health status
    const { data: health, error: healthError } = await supabase
      .from('client_health_status')
      .select('*')
      .eq('client_id', clientId)
      .single();

    // If no health status, calculate it
    let healthStatus = health;
    if (!healthStatus) {
      healthStatus = await calculateClientHealth(clientId);
    }

    // 3. Fetch all channels for this client with detailed health
    const { data: channels, error: channelsError } = await supabase
      .from('channels')
      .select('id, channel, detail')
      .eq('client_id', clientId);

    const channelHealthDetails = await Promise.all(
      (channels || []).map(async (channel) => {
        const channelHealth = await calculateChannelHealth(channel.id);
        return {
          id: channel.id,
          channel: channel.channel,
          detail: channel.detail,
          status: channelHealth.status,
          reasons: channelHealth.reasons,
          metrics: {
            overdueTasks: channelHealth.metrics.overdueTasks,
            upcomingTasks: channelHealth.metrics.upcomingTasks,
            budgetVariance: channelHealth.metrics.budgetVariance,
          },
        };
      })
    );

    // 4. Fetch all tasks for this client
    const { data: clientTasks, error: tasksError } = await supabase
      .from('client_tasks')
      .select('*')
      .eq('client_id', clientId)
      .order('due_date', { ascending: true, nullsFirst: false });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(today.getDate() + 7);

    const tasks = (clientTasks || []).map((task) => {
      const dueDate = task.due_date || task.next_due_date;
      const dueDateObj = dueDate ? new Date(dueDate) : null;

      const isOverdue = dueDateObj ? dueDateObj < today : false;
      const isAtRisk =
        dueDateObj && !isOverdue
          ? dueDateObj >= today && dueDateObj <= sevenDaysFromNow
          : false;

      return {
        id: task.id,
        title: task.title,
        taskType: task.task_type,
        dueDate: task.due_date,
        nextDueDate: task.next_due_date,
        completed: task.completed,
        isOverdue: !task.completed && isOverdue,
        isAtRisk: !task.completed && isAtRisk,
      };
    });

    // 5. Prepare response
    const response: ClientHealthDetail = {
      client: {
        id: client.id,
        name: client.name,
      },
      health: healthStatus,
      channels: channelHealthDetails,
      tasks,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error in GET /api/clients/[id]/health:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/clients/[id]/health
 * Manually refresh health status for a specific client
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params;

    // Auth check
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Verify client exists
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      );
    }

    // 2. Calculate and update health status
    console.log(`Refreshing health for client ${clientId}...`);
    const health = await calculateClientHealth(clientId);

    if (!health) {
      return NextResponse.json(
        { error: 'Failed to calculate health status' },
        { status: 500 }
      );
    }

    console.log(`✓ Health refreshed for client ${clientId}: ${health.status}`);

    return NextResponse.json({
      success: true,
      health,
    });
  } catch (error: any) {
    console.error('Error in POST /api/clients/[id]/health:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
