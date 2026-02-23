// src/app/api/agency/action-points/route.ts
// Aggregates all outstanding (incomplete) action points across all clients,
// grouped by client and media channel, ordered by due date.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export interface AgencyActionPoint {
  id: string;
  text: string;
  category: 'SET UP' | 'HEALTH CHECK';
  channel_type: string;
  due_date: string | null;
  frequency?: string | null;
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

    // 3. Fetch all per-client completions in one query
    const { data: allCompletions } = await supabase
      .from('client_action_point_completions')
      .select('client_id, action_point_id, completed')
      .in('action_point_id', actionPointIds);

    // Build a lookup: { client_id -> { action_point_id -> completed } }
    const completionLookup = new Map<string, Map<string, boolean>>();
    for (const comp of allCompletions || []) {
      if (!completionLookup.has(comp.client_id)) {
        completionLookup.set(comp.client_id, new Map());
      }
      completionLookup.get(comp.client_id)!.set(comp.action_point_id, comp.completed);
    }

    // 4. Fetch all media plan builder data (channels per client)
    const { data: allMediaPlans } = await supabase
      .from('client_media_plan_builder')
      .select('client_id, channels');

    // Build a lookup: client_id -> Set<channelType>
    const clientChannels = new Map<string, Set<string>>();
    for (const plan of allMediaPlans || []) {
      const channels = new Set<string>();
      if (plan.channels && Array.isArray(plan.channels)) {
        for (const ch of plan.channels as any[]) {
          if (ch.channelName) {
            channels.add(normalizeChannelName(ch.channelName));
          }
        }
      }
      if (channels.size > 0) {
        clientChannels.set(plan.client_id, channels);
      }
    }

    // 5. For each client, determine outstanding action points per channel
    const result: AgencyClientActionPoints[] = [];

    for (const client of clients) {
      const channels = clientChannels.get(client.id);
      if (!channels || channels.size === 0) continue;

      const clientCompletion = completionLookup.get(client.id) || new Map<string, boolean>();

      // Group outstanding action points by channel
      const channelMap = new Map<string, AgencyActionPoint[]>();

      for (const ap of allActionPoints) {
        const apChannelNorm = normalizeChannelName(ap.channel_type);

        // Only include action points relevant to this client's channels
        if (!channels.has(apChannelNorm)) continue;

        // Check if completed for this client (default: not completed)
        const isCompleted = clientCompletion.has(ap.id)
          ? clientCompletion.get(ap.id)!
          : false;

        if (isCompleted) continue;

        if (!channelMap.has(ap.channel_type)) {
          channelMap.set(ap.channel_type, []);
        }
        channelMap.get(ap.channel_type)!.push({
          id: ap.id,
          text: ap.text,
          category: ap.category,
          channel_type: ap.channel_type,
          due_date: ap.due_date || null,
          frequency: ap.frequency || null,
        });
      }

      if (channelMap.size === 0) continue;

      // Sort action points within each channel by due_date (nulls last)
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
