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
  | 'channel-end'
  | 'health-check';

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  date: string; // ISO date string YYYY-MM-DD
  clientId: string;
  clientName: string;
  channelName: string;
  label: string;
  category?: 'SET UP' | 'HEALTH CHECK' | 'ONGOING'; // for action-point events
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

    // --- 2. Action point templates (all — due dates are calculated per-client from channel start dates) ---
    const { data: actionPoints } = await supabase
      .from('action_points')
      .select('id, text, channel_type, category, frequency, days_before_live_due');

    // Fetch all completions so we can skip completed APs per client
    const apIds = (actionPoints || []).map((ap) => ap.id);
    let completedPairsGlobal = new Set<string>(); // "clientId|apId"
    if (apIds.length > 0) {
      const { data: completions } = await supabase
        .from('client_action_point_completions')
        .select('action_point_id, client_id, completed')
        .in('action_point_id', apIds)
        .eq('completed', true);
      completedPairsGlobal = new Set(
        (completions || []).map((c) => `${c.client_id}|${c.action_point_id}`)
      );
    }

    // --- 3. Fetch media plan builder data for all clients (channel flights) ---
    const { data: allMediaPlans } = await supabase
      .from('client_media_plan_builder')
      .select('client_id, channels');

    const events: CalendarEvent[] = [];

    // Helper: calculate AP due date from channel start date (mirrors action-points/route.ts)
    function calculateDueDate(ap: any, channelStartDate: string | null): string | null {
      if (!channelStartDate) return null;
      if (ap.category === 'SET UP') {
        const daysBefore = ap.days_before_live_due;
        if (daysBefore === null || daysBefore === undefined) return null;
        const d = new Date(channelStartDate);
        d.setDate(d.getDate() - daysBefore);
        return toDateStr(d);
      }
      if (ap.category === 'HEALTH CHECK') {
        const freq = ap.frequency;
        let offset = 0;
        if (freq === 'weekly') offset = 7;
        else if (freq === 'fortnightly') offset = 14;
        else if (freq === 'monthly') offset = 30;
        else return null;
        const d = new Date(channelStartDate);
        d.setDate(d.getDate() + offset);
        return toDateStr(d);
      }
      return null;
    }

    // Build per-client channel start dates (normalised name → earliest start, for non-ended channels)
    const clientChannelStartDates = new Map<string, Map<string, string | null>>();
    const todayStr2 = toDateStr(new Date());
    for (const plan of allMediaPlans || []) {
      const channels = plan.channels as any[];
      if (!channels || !Array.isArray(channels)) continue;
      const startMap = new Map<string, string | null>();
      for (const ch of channels) {
        if (!ch.channelName) continue;
        const normName = normalizeChannelName(ch.channelName);
        const flights: any[] = ch.flights || [];
        let earliestStart: string | null = null;
        let latestEnd: string | null = null;
        for (const f of flights) {
          if (f.startWeek) {
            const sd = toDateStr(new Date(f.startWeek));
            if (!earliestStart || sd < earliestStart) earliestStart = sd;
          }
          if (f.endWeek) {
            const ed = toDateStr(new Date(f.endWeek));
            if (!latestEnd || ed > latestEnd) latestEnd = ed;
          }
        }
        // Skip ended channels
        if (latestEnd && latestEnd < todayStr2) continue;
        if (!startMap.has(normName)) startMap.set(normName, earliestStart);
      }
      if (startMap.size > 0) clientChannelStartDates.set(plan.client_id, startMap);
    }

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

    // --- Build health check events (derived from channel start dates + 14 days) ---
    // TODO: wire to real health check due dates once the field exists in DB
    for (const plan of allMediaPlans || []) {
      const clientName = clientMap.get(plan.client_id) ?? 'Unknown Client';
      const channels = plan.channels as any[];
      if (!channels || !Array.isArray(channels)) continue;

      for (const channel of channels) {
        const channelName: string = channel.channelName || 'Unknown Channel';
        const flights: any[] = channel.flights || [];

        for (const flight of flights) {
          if (flight.startWeek) {
            const startDate = toDateStr(new Date(flight.startWeek));
            // Calculate health check due date: start_date + 14 days
            const startMs = new Date(startDate).getTime();
            const healthCheckDate = new Date(startMs + 14 * 24 * 60 * 60 * 1000);
            const healthCheckDateStr = toDateStr(healthCheckDate);

            if (healthCheckDateStr >= monthStartStr && healthCheckDateStr <= monthEndStr) {
              events.push({
                id: `health-check-${plan.client_id}-${channel.id || channelName}-${flight.id || startDate}`,
                type: 'health-check',
                date: healthCheckDateStr,
                clientId: plan.client_id,
                clientName,
                channelName,
                label: `${channelName} health check due`,
              });
            }
          }
        }
      }
    }

    // --- Build action point due date events (due dates calculated from channel start dates) ---
    for (const client of clients) {
      const startMap = clientChannelStartDates.get(client.id);
      if (!startMap) continue;

      for (const ap of actionPoints || []) {
        const apChannelNorm = normalizeChannelName(ap.channel_type);
        if (!startMap.has(apChannelNorm)) continue;

        // Skip completed
        if (completedPairsGlobal.has(`${client.id}|${ap.id}`)) continue;

        const channelStartDate = startMap.get(apChannelNorm) || null;
        const calculatedDate = calculateDueDate(ap, channelStartDate);
        if (!calculatedDate) continue;
        if (calculatedDate < monthStartStr || calculatedDate > monthEndStr) continue;

        events.push({
          id: `ap-${ap.id}-${client.id}`,
          type: 'action-point',
          date: calculatedDate,
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
      'health-check': 2,
      'action-point': 3,
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
