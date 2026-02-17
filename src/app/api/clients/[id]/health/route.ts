// src/app/api/clients/[id]/health/route.ts
// API endpoint for client health details and manual refresh

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  calculateClientHealth,
  getActionPointStatsForClient,
  getActualSpendForClient,
  getPlannedBudgetForClient,
} from '@/lib/health/calculations';

interface ClientHealthDetail {
  client: { id: string; name: string };
  health: any;
  channels: Array<{
    name: string;
  }>;
  actionPoints: {
    total: number;
    completed: number;
    overdueIncomplete: number;
  };
  spend: {
    plannedBudget: number;
    actualSpend: number;
    budgetVariance: number | null;
  };
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

    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Fetch client
    const { data: client, error: clientError } = await (supabase as any)
      .from('clients')
      .select('id, name')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // 2. Fetch or calculate health status
    const { data: health } = await supabase
      .from('client_health_status')
      .select('*')
      .eq('client_id', clientId)
      .single();

    const healthStatus = health || (await calculateClientHealth(supabase, clientId));

    // 3. Channels from media plan builder
    const { data: planData } = await supabase
      .from('client_media_plan_builder')
      .select('channels')
      .eq('client_id', clientId)
      .single();

    const channels = ((planData?.channels as any[]) || [])
      .filter((ch: any) => ch.channelName)
      .map((ch: any) => ({ name: ch.channelName }));

    // 4. Action point stats
    const actionPoints = await getActionPointStatsForClient(supabase, clientId);

    // 5. Spend
    const plannedBudget = await getPlannedBudgetForClient(supabase, clientId);
    const actualSpend = await getActualSpendForClient(supabase, clientId);
    const budgetVariance =
      plannedBudget > 0 ? (actualSpend / plannedBudget) * 100 : null;

    const response: ClientHealthDetail = {
      client: { id: client.id, name: client.name },
      health: healthStatus,
      channels,
      actionPoints,
      spend: { plannedBudget, actualSpend, budgetVariance },
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error in GET /api/clients/[id]/health:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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

    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const health = await calculateClientHealth(supabase, clientId);

    if (!health) {
      return NextResponse.json(
        { error: 'Failed to calculate health status' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, health });
  } catch (error: any) {
    console.error('Error in POST /api/clients/[id]/health:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
