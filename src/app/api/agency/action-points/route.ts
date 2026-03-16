// src/app/api/agency/action-points/route.ts
// Aggregates all outstanding (incomplete) action points across all clients,
// grouped by client and media channel, ordered by due date.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export interface AgencyActionPoint {
  id: string;
  text: string;
  category: 'SET UP' | 'HEALTH CHECK' | 'ONGOING';
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
 * Returns all outstanding (incomplete) action points for all clients,
 * grouped by client then by media channel, ordered by due date.
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

    // 1. Fetch all clients
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, name')
      .order('name', { ascending: true });

    if (clientsError || !clients) {
      return NextResponse.json(
        { error: 'Failed to fetch clients' },
        { status: 500 }
      );
    }

    // 2. Fetch all action points (templates)
    const { data: allActionPoints, error: apError } = await supabase
      .from('action_points')
      .select('*')
      .order('due_date', { ascending: true, nullsFirst: false });

    if (apError) {
      return NextResponse.json(
        { error: 'Failed to fetch action points' },
        { status: 500 }
      );
    }

    if (!allActionPoints || allActionPoints.length === 0) {
      return NextResponse.json({ clients: [] });
    }

    const actionPointIds = allActionPoints.map((ap) => ap.id);

    // 3. Fetch all per-client completions in one query (including completed_at for period reset)
    const { data: allCompletions } = await supabase
      .from('client_action_point_completions')
      .select('client_id, action_point_id, completed, completed_at, assigned_to')
      .in('action_point_id', actionPointIds);

    // Build a lookup: { client_id -> { action_point_id -> { completed, completedAt, assignedTo } } }
    const completionLookup = new Map<string, Map<string, { completed: boolean; completedAt: string | null; assignedTo: string | null }>>();
    for (const comp of allCompletions || []) {
      if (!completionLookup.has(comp.client_id)) {
        completionLookup.set(comp.client_id, new Map());
      }
      completionLookup.get(comp.client_id)!.set(comp.action_point_id, {
        completed: comp.completed,
        completedAt: comp.completed_at || null,
        assignedTo: (comp as any).assigned_to || null,
      });
    }

    // 4. Fetch all media plan builder data (channels per client)
    const { data: allMediaPlans } = await supabase
      .from('client_media_plan_builder')
      .select('client_id, channels');

    // Helper to convert date string to YYYY-MM-DD
    function toDateStr(date: Date | string): string {
      if (typeof date === 'string') {
        return date.length > 10 ? date.split('T')[0] : date;
      }
      return date.toISOString().split('T')[0];
    }

    // Helper to determine channel status
    function channelStatus(startDate: string | null, endDate: string | null): 'live' | 'upcoming' | 'ended' {
      const today = toDateStr(new Date());
      if (!startDate) return 'upcoming';
      if (endDate && endDate < today) return 'ended';
      if (startDate <= today) return 'live';
      return 'upcoming';
    }

    // Build a lookup: client_id -> Set<channelType>
    const clientChannels = new Map<string, Set<string>>();
    // Build lookups: client_id -> channelName -> start/end date
    const channelStartDates = new Map<string, Map<string, string | null>>();
    const channelEndDates = new Map<string, Map<string, string | null>>();

    const today = toDateStr(new Date());

    for (const plan of allMediaPlans || []) {
      const channels = new Set<string>();
      const startDates = new Map<string, string | null>();
      const endDates = new Map<string, string | null>();

      if (plan.channels && Array.isArray(plan.channels)) {
        for (const ch of plan.channels as any[]) {
          if (ch.channelName) {
            const normalizedName = normalizeChannelName(ch.channelName);

            // Find earliest flight start date and latest end date for this channel
            let earliestStart: string | null = null;
            let latestEnd: string | null = null;
            const flights: any[] = ch.flights || [];

            for (const flight of flights) {
              if (flight.startWeek) {
                const startDate = toDateStr(flight.startWeek);
                if (!earliestStart || startDate < earliestStart) {
                  earliestStart = startDate;
                }
              }
              if (flight.endWeek) {
                const endDate = toDateStr(flight.endWeek);
                if (!latestEnd || endDate > latestEnd) {
                  latestEnd = endDate;
                }
              }
            }

            // Only include channels that are live or upcoming (not ended)
            const status = channelStatus(earliestStart, latestEnd);
            if (status !== 'ended') {
              channels.add(normalizedName);
              const existingStart = startDates.get(normalizedName);
              if (!existingStart) {
                startDates.set(normalizedName, earliestStart);
                endDates.set(normalizedName, latestEnd);
              } else if (earliestStart && earliestStart > existingStart) {
                startDates.set(normalizedName, earliestStart);
                endDates.set(normalizedName, latestEnd);
              }
            }
          }
        }
      }

      if (channels.size > 0) {
        clientChannels.set(plan.client_id, channels);
        channelStartDates.set(plan.client_id, startDates);
        channelEndDates.set(plan.client_id, endDates);
      }
    }

    // Helper: convert YYYY-MM-DD string to UTC ms
    function dateStrToMs(dateStr: string): number {
      const [y, m, d] = dateStr.split('-').map(Number);
      return Date.UTC(y, m - 1, d);
    }

    // Helper: convert UTC ms to YYYY-MM-DD string
    function msToDateStr(ms: number): string {
      const d = new Date(ms);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }

    /**
     * For HEALTH CHECK action points:
     * - Generates repeating occurrences from channelStart to channelEnd
     * - Returns nextDueDate: the upcoming due date to display
     * - Returns isCompletedForCurrentPeriod: true if the last completion covers the current period
     *
     * "Current period" = the most recent occurrence that has already passed (or is today).
     * If completedAt >= currentPeriodStart, the AP is done for this period.
     * On the next occurrence, it resets automatically.
     */
    function getHealthCheckStatus(
      channelStartDate: string,
      channelEndDate: string | null,
      frequency: string,
      todayStr: string,
      completedAt: string | null
    ): { nextDueDate: string | null; isCompletedForCurrentPeriod: boolean } {
      let intervalDays = 0;
      if (frequency === 'weekly') intervalDays = 7;
      else if (frequency === 'fortnightly') intervalDays = 14;
      else if (frequency === 'monthly') intervalDays = 30;
      else return { nextDueDate: null, isCompletedForCurrentPeriod: false };

      const startMs = dateStrToMs(channelStartDate);
      const todayMs = dateStrToMs(todayStr);
      const endMs = channelEndDate ? dateStrToMs(channelEndDate) : null;
      const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
      // Cap at 5 years to prevent infinite loop
      const capMs = todayMs + 5 * 365 * 24 * 60 * 60 * 1000;

      let lastPastOccurrence: string | null = null;
      let nextFutureOccurrence: string | null = null;

      for (let n = 1; ; n++) {
        const occMs = startMs + n * intervalMs;
        if (occMs > capMs) break;
        if (endMs !== null && occMs > endMs) break;

        if (occMs <= todayMs) {
          lastPastOccurrence = msToDateStr(occMs);
        } else {
          nextFutureOccurrence = msToDateStr(occMs);
          break; // Only need the first future occurrence
        }
      }

      // Determine if the current period is completed
      let isCompletedForCurrentPeriod = false;
      if (lastPastOccurrence && completedAt) {
        // completedAt is an ISO timestamp; slice to date for comparison
        isCompletedForCurrentPeriod = completedAt.slice(0, 10) >= lastPastOccurrence;
      }

      // What date to display:
      // - If overdue (past occurrence not yet completed): show the overdue occurrence date
      // - Otherwise: show the next upcoming occurrence
      let nextDueDate: string | null;
      if (!isCompletedForCurrentPeriod && lastPastOccurrence) {
        nextDueDate = lastPastOccurrence; // overdue
      } else {
        nextDueDate = nextFutureOccurrence;
      }

      return { nextDueDate, isCompletedForCurrentPeriod };
    }

    // Helper function to calculate due date for SET UP action points
    function calculateSetUpDueDate(
      ap: any,
      channelStartDate: string | null
    ): string | null {
      if (!channelStartDate) return null;
      const daysBefore = ap.days_before_live_due;
      if (daysBefore === null || daysBefore === undefined) return null;

      const startDate = new Date(channelStartDate);
      startDate.setDate(startDate.getDate() - daysBefore);
      return startDate.toISOString().split('T')[0];
    }

    // 5. For each client, determine outstanding action points per channel
    const result: AgencyClientActionPoints[] = [];

    for (const client of clients) {
      const channels = clientChannels.get(client.id);
      if (!channels || channels.size === 0) continue;

      const clientCompletion = completionLookup.get(client.id) || new Map<string, { completed: boolean; completedAt: string | null; assignedTo: string | null }>();
      const clientStartDates = channelStartDates.get(client.id) || new Map<string, string | null>();
      const clientEndDates = channelEndDates.get(client.id) || new Map<string, string | null>();

      // Group outstanding action points by channel
      const channelMap = new Map<string, AgencyActionPoint[]>();

      for (const ap of allActionPoints) {
        const apChannelNorm = normalizeChannelName(ap.channel_type);

        // Only include action points relevant to this client's channels
        if (!channels.has(apChannelNorm)) continue;

        const channelStartDate = clientStartDates.get(apChannelNorm) || null;
        const channelEndDate = clientEndDates.get(apChannelNorm) || null;
        const completionData = clientCompletion.get(ap.id) || null;
        const isCompleted = completionData ? completionData.completed : false;
        const completedAt = completionData ? completionData.completedAt : null;
        const assignedTo = completionData ? completionData.assignedTo : null;

        let calculatedDueDate: string | null = null;

        if (ap.category === 'SET UP') {
          if (isCompleted) continue;
          calculatedDueDate = calculateSetUpDueDate(ap, channelStartDate);
        } else if (ap.category === 'HEALTH CHECK') {
          if (!channelStartDate || !ap.frequency) continue;

          const { nextDueDate, isCompletedForCurrentPeriod } = getHealthCheckStatus(
            channelStartDate,
            channelEndDate,
            ap.frequency,
            today,
            completedAt
          );

          if (isCompletedForCurrentPeriod) continue;
          calculatedDueDate = nextDueDate;
        } else {
          if (isCompleted) continue;
        }

        // Use original channel_type as the key to preserve the original name
        if (!channelMap.has(ap.channel_type)) {
          channelMap.set(ap.channel_type, []);
        }
        channelMap.get(ap.channel_type)!.push({
          id: ap.id,
          text: ap.text,
          category: ap.category,
          channel_type: ap.channel_type,
          due_date: calculatedDueDate,
          frequency: ap.frequency || null,
          days_before_live_due: ap.days_before_live_due ?? null,
          assigned_to: assignedTo,
        });
      }

      if (channelMap.size === 0) continue;

      // Sort action points within each channel by calculated due_date (nulls last)
      const channelGroups: AgencyChannelGroup[] = [];
      for (const [channelType, aps] of channelMap.entries()) {
        const sorted = aps.sort((a, b) => {
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        });
        channelGroups.push({ channelType, actionPoints: sorted });
      }

      // Sort channels alphabetically
      channelGroups.sort((a, b) => a.channelType.localeCompare(b.channelType));

      const totalOutstanding = channelGroups.reduce(
        (sum, cg) => sum + cg.actionPoints.length,
        0
      );

      result.push({
        clientId: client.id,
        clientName: client.name,
        channels: channelGroups,
        totalOutstanding,
      });
    }

    // Sort clients by most outstanding action points first
    result.sort((a, b) => b.totalOutstanding - a.totalOutstanding);

    return NextResponse.json({ clients: result });
  } catch (error: any) {
    console.error('Error in GET /api/agency/action-points:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function normalizeChannelName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('meta') || lower.includes('facebook')) return 'Meta Ads';
  if (lower.includes('google')) return 'Google Ads';
  if (lower.includes('linkedin')) return 'LinkedIn Ads';
  if (lower.includes('tiktok')) return 'TikTok Ads';
  return name;
}
