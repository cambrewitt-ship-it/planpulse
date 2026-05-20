import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getClientMediaPlanBuilder, saveClientMediaPlanBuilder } from '@/lib/db/plans';

function normalizeChannelName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('meta') || lower.includes('facebook')) return 'Meta Ads';
  if (lower.includes('google')) return 'Google Ads';
  if (lower.includes('linkedin')) return 'LinkedIn Ads';
  if (lower.includes('tiktok')) return 'TikTok Ads';
  return name;
}

/**
 * POST /api/clients/[id]/media-plan-builder/delay-channel
 * Shifts all upcoming flights for the specified channel to start on newStartDate.
 * Body: { channelName: string; newStartDate: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const clientId = resolvedParams.id;

    if (!clientId) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { channelName?: string; newStartDate?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { channelName, newStartDate } = body;
    if (!channelName || !newStartDate) {
      return NextResponse.json({ error: 'channelName and newStartDate are required' }, { status: 400 });
    }

    const newStart = new Date(newStartDate);
    if (isNaN(newStart.getTime())) {
      return NextResponse.json({ error: 'Invalid newStartDate' }, { status: 400 });
    }

    const normalizedTarget = normalizeChannelName(channelName);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Load current media plan
    const planData = await getClientMediaPlanBuilder(clientId, supabase);
    if (!planData || !planData.channels) {
      return NextResponse.json({ error: 'No media plan found for this client' }, { status: 404 });
    }

    let channelFound = false;

    const updatedChannels = planData.channels.map((ch: any) => {
      if (normalizeChannelName(ch.channelName) !== normalizedTarget) return ch;

      // Find the earliest upcoming flight start date for this channel
      const upcomingFlights = (ch.flights || []).filter((f: any) => {
        const start = f.startWeek instanceof Date ? f.startWeek : new Date(f.startWeek);
        return start >= today;
      });

      if (upcomingFlights.length === 0) return ch;

      const earliestUpcoming = upcomingFlights.reduce((min: Date, f: any) => {
        const s = f.startWeek instanceof Date ? f.startWeek : new Date(f.startWeek);
        return s < min ? s : min;
      }, upcomingFlights[0].startWeek instanceof Date ? upcomingFlights[0].startWeek : new Date(upcomingFlights[0].startWeek));

      const deltaMs = newStart.getTime() - earliestUpcoming.getTime();

      channelFound = true;

      // Shift only upcoming flights by the delta
      const updatedFlights = (ch.flights || []).map((f: any) => {
        const fStart = f.startWeek instanceof Date ? f.startWeek : new Date(f.startWeek);
        if (fStart < today) return f; // leave past flights untouched
        const fEnd = f.endWeek instanceof Date ? f.endWeek : new Date(f.endWeek);
        return {
          ...f,
          startWeek: new Date(fStart.getTime() + deltaMs),
          endWeek: new Date(fEnd.getTime() + deltaMs),
        };
      });

      return { ...ch, flights: updatedFlights };
    });

    if (!channelFound) {
      return NextResponse.json({ error: `No upcoming flights found for channel "${channelName}"` }, { status: 404 });
    }

    await saveClientMediaPlanBuilder(clientId, { channels: updatedChannels, commission: planData.commission }, supabase);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in POST /api/clients/[id]/media-plan-builder/delay-channel:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
