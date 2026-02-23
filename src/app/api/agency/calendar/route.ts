// src/app/api/agency/calendar/route.ts
// Returns all calendar events for the agency month view:
// - Action point due dates (per client, with channel info)
// - Channel flight start dates
// - Channel flight end dates

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export type CalendarEventType =
  | 'action-point'
  | 'channel-start'
  | 'channel-end';

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  date: string; // ISO date string YYYY-MM-DD
  clientId: string;
  clientName: string;
  channelName: string;
  label: string;
  category?: 'SET UP' | 'HEALTH CHECK'; // for action-point events
}

/**
 * GET /api/agency/calendar?year=YYYY&month=MM
 * Returns calendar events for the given month (month is 1-indexed).
 * Defaults to current year/month if not provided.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const year = parseInt(searchParams.get('year') || String(now.getFullYear()), 10);
    const month = parseInt(searchParams.get('month') || String(now.getMonth() + 1), 10); // 1-indexed

    // Month window: first day to last day (inclusive)
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0); // last day of month
    const monthStartStr = toDateStr(monthStart);
    const monthEndStr = toDateStr(monthEnd);

    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // --- 1. Fetch clients ---
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, name')
      .order('name', { ascending: true });

    if (clientsError || !clients) {
      return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
    }

    const clientMap = new Map(clients.map((c) => [c.id, c.name]));

    // --- 2. Action point due dates in this month ---
    const { data: actionPoints } = await supabase
      .from('action_points')
      .select('id, text, channel_type, category, due_date')
      .gte('due_date', monthStartStr)
      .lte('due_date', monthEndStr);

    // Fetch completions for these APs so we can exclude fully-completed ones
    const apIds = (actionPoints || []).map((ap) => ap.id);
    let completedApIds = new Set<string>();
    if (apIds.length > 0) {
      const { data: completions } = await supabase
        .from('client_action_point_completions')
        .select('action_point_id, client_id, completed')
        .in('action_point_id', apIds)
        .eq('completed', true);

      // Build a set of (clientId|apId) pairs that are completed
      const completedPairs = new Set(
        (completions || []).map((c) => `${c.client_id}|${c.action_point_id}`)
      );
      completedApIds = new Set((completions || []).map((c) => c.action_point_id));

      // We'll use completedPairs below when we map to clients
      // Store on the map keyed differently
      (actionPoints || []).forEach((ap) => {
        (ap as any)._completedPairs = completedPairs;
      });
    }

    // --- 3. Fetch media plan builder data for all clients (channel flights) ---
    const { data: allMediaPlans } = await supabase
      .from('client_media_plan_builder')
      .select('client_id, channels');

    const events: CalendarEvent[] = [];

    // --- Build flight start/end events ---
    for (const plan of allMediaPlans || []) {
      const clientName = clientMap.get(plan.client_id) ?? 'Unknown Client';
      const channels = plan.channels as any[];
      if (!channels || !Array.isArray(channels)) continue;

      for (const channel of channels) {
        const channelName: string = channel.channelName || 'Unknown Channel';
        const flights: any[] = channel.flights || [];

        for (const flight of flights) {
          // startWeek and endWeek are ISO strings (may include time)
          const startDate = flight.startWeek ? toDateStr(new Date(flight.startWeek)) : null;
          const endDate = flight.endWeek ? toDateStr(new Date(flight.endWeek)) : null;

          if (startDate && startDate >= monthStartStr && startDate <= monthEndStr) {
            events.push({
              id: `flight-start-${plan.client_id}-${channel.id || channelName}-${flight.id || startDate}`,
              type: 'channel-start',
              date: startDate,
              clientId: plan.client_id,
              clientName,
              channelName,
              label: `${channelName} starts`,
            });
          }

          if (endDate && endDate >= monthStartStr && endDate <= monthEndStr) {
            events.push({
              id: `flight-end-${plan.client_id}-${channel.id || channelName}-${flight.id || endDate}`,
              type: 'channel-end',
              date: endDate,
              clientId: plan.client_id,
              clientName,
              channelName,
              label: `${channelName} ends`,
            });
          }
        }
      }
    }

    // --- Build action point due date events ---
    // For each outstanding AP with a due date, associate it with all clients that have
    // that channel and haven't completed it
    const clientChannelMap = new Map<string, Set<string>>();
    for (const plan of allMediaPlans || []) {
      const channels = plan.channels as any[];
      if (!channels) continue;
      const set = new Set<string>();
      for (const ch of channels) {
        if (ch.channelName) set.add(normalizeChannelName(ch.channelName));
      }
      if (set.size > 0) clientChannelMap.set(plan.client_id, set);
    }

    for (const ap of actionPoints || []) {
      if (!ap.due_date) continue;
      const apChannelNorm = normalizeChannelName(ap.channel_type);
      const completedPairs: Set<string> = (ap as any)._completedPairs || new Set();

      for (const client of clients) {
        const clientChannels = clientChannelMap.get(client.id);
        if (!clientChannels || !clientChannels.has(apChannelNorm)) continue;

        // Skip if this client has completed this AP
        if (completedPairs.has(`${client.id}|${ap.id}`)) continue;

        events.push({
          id: `ap-${ap.id}-${client.id}`,
          type: 'action-point',
          date: ap.due_date,
          clientId: client.id,
          clientName: client.name,
          channelName: ap.channel_type,
          label: ap.text,
          category: ap.category,
        });
      }
    }

    // Sort events by date then by type order
    const typeOrder: Record<CalendarEventType, number> = {
      'channel-start': 0,
      'channel-end': 1,
      'action-point': 2,
    };
    events.sort((a, b) => {
      const dateDiff = a.date.localeCompare(b.date);
      if (dateDiff !== 0) return dateDiff;
      return typeOrder[a.type] - typeOrder[b.type];
    });

    return NextResponse.json({ events, year, month });
  } catch (error: any) {
    console.error('Error in GET /api/agency/calendar:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeChannelName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('meta') || lower.includes('facebook')) return 'Meta Ads';
  if (lower.includes('google')) return 'Google Ads';
  if (lower.includes('linkedin')) return 'LinkedIn Ads';
  if (lower.includes('tiktok')) return 'TikTok Ads';
  return name;
}
