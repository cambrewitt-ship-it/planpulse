// src/app/api/agency/channel-health/route.ts
// Bulk-computes, for every client, the health-check checklist status of
// every digital ad channel they have — separate from /api/agency/action-points
// (which now only carries ad-hoc TODO items). Feeds the agency "Health" view,
// inline drill-down checklists, and the agency Timeline's SET UP/HEALTH CHECK
// due-date markers.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { nzToday } from '@/lib/timezone';
import {
  DIGITAL_AD_CHANNEL_TYPES,
  normalizeChannelName,
  calculateSetUpDueDate,
  computeHealthCheckNextOccurrence,
  computeHealthCheckStaleness,
  computeChannelStatus,
  type HealthCheckFrequency,
  type ChannelChecklistStatus,
} from '@/lib/health/channel-checklist';

export interface ChannelHealthItem {
  id: string;
  text: string;
  description: string | null;
  category: 'SET UP' | 'HEALTH CHECK';
  completed: boolean;
  completedAt: string | null;
  dueDate: string | null; // SET UP due date, or next HEALTH CHECK occurrence
  frequency: string | null;
  stale: boolean;
  assignedTo: string | null;
  sortOrder: number;
}

export interface ChannelHealthGroup {
  channelType: string;
  status: ChannelChecklistStatus;
  setUpDone: number;
  setUpTotal: number;
  healthCheckDone: number;
  healthCheckTotal: number;
  healthCheckStaleCount: number;
  items: ChannelHealthItem[];
}

export interface ClientChannelHealth {
  clientId: string;
  clientName: string;
  channels: ChannelHealthGroup[];
}

const DIGITAL_SET: Set<string> = new Set(DIGITAL_AD_CHANNEL_TYPES);

function toDateStr(date: Date | string): string {
  if (typeof date === 'string') {
    return date.length > 10 ? date.split('T')[0] : date;
  }
  return date.toISOString().split('T')[0];
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Clients scoped to the current user
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, name')
      .eq('user_id', session.user.id)
      .order('name', { ascending: true });

    if (clientsError || !clients) {
      return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
    }

    // 2. SET UP + HEALTH CHECK templates for digital ad channels
    // `description`/`sort_order` are new columns not yet in the generated
    // Supabase types — cast to any[] until types are regenerated.
    const { data: allActionPointsRaw, error: apError } = await supabase
      .from('action_points')
      .select('*')
      .in('category', ['SET UP', 'HEALTH CHECK'])
      .in('channel_type', DIGITAL_AD_CHANNEL_TYPES)
      .order('sort_order', { ascending: true });
    const allActionPoints = allActionPointsRaw as any[] | null;

    if (apError) {
      return NextResponse.json({ error: 'Failed to fetch action points' }, { status: 500 });
    }

    if (!clients.length || !allActionPoints || allActionPoints.length === 0) {
      return NextResponse.json({ clients: [] });
    }

    const actionPointIds = allActionPoints.map((ap: any) => ap.id);

    // 3. Per-client completions for those templates
    const { data: allCompletions } = await supabase
      .from('client_action_point_completions')
      .select('client_id, action_point_id, completed, completed_at, assigned_to')
      .in('action_point_id', actionPointIds);

    const completionLookup = new Map<
      string,
      Map<string, { completed: boolean; completedAt: string | null; assignedTo: string | null }>
    >();
    for (const comp of allCompletions || []) {
      if (!completionLookup.has(comp.client_id)) completionLookup.set(comp.client_id, new Map());
      completionLookup.get(comp.client_id)!.set(comp.action_point_id, {
        completed: comp.completed,
        completedAt: comp.completed_at || null,
        assignedTo: (comp as any).assigned_to || null,
      });
    }

    // 4. Channels per client (from media plan builder)
    const { data: allMediaPlans } = await supabase
      .from('client_media_plan_builder')
      .select('client_id, channels');

    const today = nzToday();

    // client_id -> channelType -> { earliestStart, nextUpcomingStart }
    const clientChannelDates = new Map<
      string,
      Map<string, { earliestStart: string | null; nextUpcomingStart: string | null }>
    >();

    for (const plan of allMediaPlans || []) {
      const perChannel = new Map<string, { earliestStart: string | null; nextUpcomingStart: string | null }>();

      if (plan.channels && Array.isArray(plan.channels)) {
        for (const ch of plan.channels as any[]) {
          if (!ch.channelName) continue;
          const normalizedName = normalizeChannelName(ch.channelName);
          if (!DIGITAL_SET.has(normalizedName)) continue;

          let earliestStart: string | null = null;
          let latestEnd: string | null = null;
          let nextUpcomingStart: string | null = null;
          const flights: any[] = ch.flights || [];

          for (const flight of flights) {
            if (flight.startWeek) {
              const startDate = toDateStr(flight.startWeek);
              if (!earliestStart || startDate < earliestStart) earliestStart = startDate;
              if (startDate >= today && (!nextUpcomingStart || startDate < nextUpcomingStart)) {
                nextUpcomingStart = startDate;
              }
            }
            if (flight.endWeek) {
              const endDate = toDateStr(flight.endWeek);
              if (!latestEnd || endDate > latestEnd) latestEnd = endDate;
            }
          }

          // Skip channels that have already fully ended (no live/upcoming presence)
          if (latestEnd && latestEnd < today) continue;

          const existing = perChannel.get(normalizedName);
          if (!existing || (earliestStart && (!existing.earliestStart || earliestStart > existing.earliestStart))) {
            perChannel.set(normalizedName, { earliestStart, nextUpcomingStart });
          }
        }
      }

      if (perChannel.size > 0) clientChannelDates.set(plan.client_id, perChannel);
    }

    // 5. Build per-client, per-channel checklist groups
    const result: ClientChannelHealth[] = [];

    for (const client of clients) {
      const channelDates = clientChannelDates.get(client.id);
      if (!channelDates || channelDates.size === 0) continue;

      const clientCompletion = completionLookup.get(client.id) || new Map();
      const channelGroups: ChannelHealthGroup[] = [];

      for (const [channelType, dates] of channelDates.entries()) {
        const channelAPs = allActionPoints.filter((ap: any) => normalizeChannelName(ap.channel_type) === channelType);
        if (channelAPs.length === 0) continue;

        const items: ChannelHealthItem[] = [];

        for (const ap of channelAPs) {
          const completionData = clientCompletion.get(ap.id) || null;
          const completed = completionData ? completionData.completed : false;
          const completedAt = completionData ? completionData.completedAt : null;
          const assignedTo = completionData ? completionData.assignedTo : null;

          if (ap.category === 'SET UP') {
            // Only show SET UP for channels with an upcoming (future) flight —
            // otherwise assume set-up was done when the plan was configured.
            if (!dates.nextUpcomingStart) continue;
            items.push({
              id: ap.id,
              text: ap.text,
              description: ap.description ?? null,
              category: 'SET UP',
              completed,
              completedAt,
              dueDate: calculateSetUpDueDate(ap.days_before_live_due, dates.nextUpcomingStart),
              frequency: null,
              stale: false,
              assignedTo,
              sortOrder: ap.sort_order ?? 0,
            });
          } else {
            // HEALTH CHECK — always shown, never launch-gated. Non-reverting
            // completion; staleness is a derived display flag only.
            const frequency = (ap.frequency as HealthCheckFrequency) || 'weekly';
            const { stale } = computeHealthCheckStaleness(frequency, completedAt);
            items.push({
              id: ap.id,
              text: ap.text,
              description: ap.description ?? null,
              category: 'HEALTH CHECK',
              completed,
              completedAt,
              dueDate: computeHealthCheckNextOccurrence(frequency, today, dates.earliestStart),
              frequency,
              stale,
              assignedTo,
              sortOrder: ap.sort_order ?? 0,
            });
          }
        }

        if (items.length === 0) continue;

        items.sort((a, b) => a.sortOrder - b.sortOrder);

        const setUpItems = items.filter(i => i.category === 'SET UP');
        const healthCheckItems = items.filter(i => i.category === 'HEALTH CHECK');

        const status = computeChannelStatus(
          setUpItems.map(i => ({ completed: i.completed })),
          healthCheckItems.map(i => ({ frequency: i.frequency as HealthCheckFrequency | null, completedAt: i.completedAt }))
        );

        channelGroups.push({
          channelType,
          status,
          setUpDone: setUpItems.filter(i => i.completed).length,
          setUpTotal: setUpItems.length,
          healthCheckDone: healthCheckItems.filter(i => i.completed).length,
          healthCheckTotal: healthCheckItems.length,
          healthCheckStaleCount: healthCheckItems.filter(i => i.stale).length,
          items,
        });
      }

      if (channelGroups.length === 0) continue;

      channelGroups.sort((a, b) => a.channelType.localeCompare(b.channelType));

      result.push({ clientId: client.id, clientName: client.name, channels: channelGroups });
    }

    return NextResponse.json({ clients: result });
  } catch (error: any) {
    console.error('Error in GET /api/agency/channel-health:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
