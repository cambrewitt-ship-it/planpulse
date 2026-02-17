// src/app/api/agency/clients/route.ts
// API endpoint for fetching all clients with health status

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database, ClientWithHealth, HealthStatus } from '@/types/database';
import { calculateClientHealth } from '@/lib/health/calculations';

/**
 * GET /api/agency/clients
 * Fetch all clients with their health status
 * Query params:
 *  - status: 'red' | 'amber' | 'green' (optional filter)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status') as HealthStatus | null;

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

    // Fetch all clients with left join to health status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: clientsData, error: clientsError } = await (supabase as any)
      .from('clients')
      .select(`
        *,
        client_health_status (*)
      `)
      .order('name', { ascending: true });

    if (clientsError) {
      console.error('Error fetching clients:', clientsError);
      return NextResponse.json(
        { error: 'Failed to fetch clients' },
        { status: 500 }
      );
    }

    // Transform data and calculate health for clients without it
    const clientsWithHealth: ClientWithHealth[] = await Promise.all(
      (clientsData || []).map(async (client) => {
        // Check if client_health_status exists (it's an array from the join)
        const healthArray = client.client_health_status as any[];
        let health = healthArray && healthArray.length > 0 ? healthArray[0] : null;

        // If no health status exists, calculate it on the fly
        if (!health) {
          console.log(`No health status for client ${client.id}, calculating...`);
          health = await calculateClientHealth(supabase, client.id);
        }

        return {
          id: client.id,
          name: client.name,
          created_at: client.created_at,
          updated_at: client.updated_at,
          health,
        };
      })
    );

    // Apply status filter if provided
    let filteredClients = clientsWithHealth;
    if (statusFilter) {
      filteredClients = clientsWithHealth.filter(
        (client) => client.health?.status === statusFilter
      );
    }

    // Sort by status (red first, then amber, then green), then by name
    const statusOrder = { red: 0, amber: 1, green: 2 };
    filteredClients.sort((a, b) => {
      const aStatus = a.health?.status || 'green';
      const bStatus = b.health?.status || 'green';
      const statusDiff = statusOrder[aStatus] - statusOrder[bStatus];
      
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
