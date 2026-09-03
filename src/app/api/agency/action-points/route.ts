// src/app/api/agency/action-points/route.ts
// Aggregates outstanding ad-hoc TODO tasks across all clients, grouped by
// client, plus a special "Agency Tasks" group for agency-wide TODOs.
//
// SET UP / HEALTH CHECK items are NOT included here — they live in the
// per-channel health-check checklist system instead (see
// /api/agency/channel-health and the channel-card checklist modal on the
// client dashboard), so they no longer flood this To Do feed.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export interface AgencyActionPoint {
  id: string;
  text: string;
  category: 'SET UP' | 'HEALTH CHECK' | 'ONGOING' | 'TODO';
  channel_type: string;
  due_date: string | null; // Calculated based on channel start date
  frequency?: string | null;
  days_before_live_due?: number | null;
  assigned_to: string | null; // Account manager assigned to this task
}

export interface AgencyChannelGroup {
  channelType: string;
  actionPoints: AgencyActionPoint[];
}

export interface AgencyClientActionPoints {
  clientId: string;
  clientName: string;
  channels: AgencyChannelGroup[];
  totalOutstanding: number;
}

/**
 * GET /api/agency/action-points
 * Returns all outstanding (incomplete) ad-hoc TODO tasks for all clients,
 * grouped by client, plus a special "Agency Tasks" group for agency-wide
 * (no client_id) TODOs.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Fetch clients (scoped to current user)
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, name')
      .eq('user_id', session.user.id)
      .order('name', { ascending: true });

    if (clientsError || !clients) {
      return NextResponse.json(
        { error: 'Failed to fetch clients' },
        { status: 500 }
      );
    }

    // 2. Fetch only ad-hoc TODO items (SET UP/HEALTH CHECK templates are
    //    handled entirely by /api/agency/channel-health now)
    const { data: allTodos, error: apError } = await supabase
      .from('action_points')
      .select('*')
      .eq('category', 'TODO')
      .order('due_date', { ascending: true, nullsFirst: false });

    if (apError) {
      return NextResponse.json(
        { error: 'Failed to fetch action points' },
        { status: 500 }
      );
    }

    if (!allTodos || allTodos.length === 0) {
      return NextResponse.json({ clients: [] });
    }

    // 3. Fetch per-client completions for these TODOs (used for assigned_to
    //    on client-scoped TODOs — completion itself is read from
    //    action_points.completed directly, see below)
    const todoIds = allTodos.map((ap: any) => ap.id);
    const { data: allCompletions } = await supabase
      .from('client_action_point_completions')
      .select('client_id, action_point_id, assigned_to')
      .in('action_point_id', todoIds);

    const assignedToLookup = new Map<string, Map<string, string | null>>();
    for (const comp of allCompletions || []) {
      if (!assignedToLookup.has(comp.client_id)) assignedToLookup.set(comp.client_id, new Map());
      assignedToLookup.get(comp.client_id)!.set(comp.action_point_id, (comp as any).assigned_to || null);
    }

    // 4. Group outstanding TODOs by client (or "Agency Tasks" if no client_id)
    const result: AgencyClientActionPoints[] = [];
    const agencyTodos: AgencyActionPoint[] = [];

    for (const ap of allTodos) {
      if (ap.completed) continue;

      const todoAssignedTo = ap.client_id
        ? assignedToLookup.get(ap.client_id)?.get(ap.id) ?? null
        : null;

      const apEntry: AgencyActionPoint = {
        id: ap.id,
        text: ap.text,
        category: ap.category,
        channel_type: 'General',
        due_date: ap.due_date || null,
        frequency: null,
        days_before_live_due: null,
        assigned_to: todoAssignedTo,
      };

      if (ap.client_id) {
        let clientEntry = result.find(r => r.clientId === ap.client_id);
        if (!clientEntry) {
          const clientData = clients.find(c => c.id === ap.client_id);
          if (clientData) {
            clientEntry = { clientId: clientData.id, clientName: clientData.name, channels: [], totalOutstanding: 0 };
            result.push(clientEntry);
          }
        }
        if (clientEntry) {
          let generalGroup = clientEntry.channels.find(ch => ch.channelType === 'General');
          if (!generalGroup) {
            generalGroup = { channelType: 'General', actionPoints: [] };
            clientEntry.channels.push(generalGroup);
          }
          generalGroup.actionPoints.push(apEntry);
          clientEntry.totalOutstanding++;
        }
      } else {
        agencyTodos.push(apEntry);
      }
    }

    if (agencyTodos.length > 0) {
      result.unshift({
        clientId: '__agency__',
        clientName: 'Agency Tasks',
        channels: [{ channelType: 'General', actionPoints: agencyTodos }],
        totalOutstanding: agencyTodos.length,
      });
    }

    // Sort clients by most outstanding TODOs first (keep Agency Tasks at top)
    const agencyEntry = result.find(r => r.clientId === '__agency__');
    const otherEntries = result.filter(r => r.clientId !== '__agency__');
    otherEntries.sort((a, b) => b.totalOutstanding - a.totalOutstanding);
    const sortedResult = agencyEntry ? [agencyEntry, ...otherEntries] : otherEntries;

    return NextResponse.json({ clients: sortedResult });
  } catch (error: any) {
    console.error('Error in GET /api/agency/action-points:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
