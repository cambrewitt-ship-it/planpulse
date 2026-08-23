import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/ads/google-ads/list-conversion-events
// Returns unique Google Ads conversion action names aggregated from stored
// google_conversion_actions data. Mirrors /api/ads/meta/list-conversion-events.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clientId } = body;

    const supabase = await createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    let query = supabase
      .from('ad_performance_metrics')
      .select('google_conversion_actions')
      .eq('user_id', userId)
      .eq('platform', 'google-ads')
      .not('google_conversion_actions', 'is', null);

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    // Limit to most recent 500 rows — enough to discover all conversion actions without a full scan
    query = query.order('date', { ascending: false }).limit(500);

    const { data, error } = await query;

    if (error) {
      // Column likely doesn't exist yet (migration not applied) — return empty gracefully
      console.warn('[list-conversion-events] Query error (column may not exist yet):', error.message);
      return NextResponse.json({ success: true, events: [] });
    }

    // Aggregate conversion action names across all rows
    const eventMap = new Map<string, number>();
    for (const row of data || []) {
      const actions = row.google_conversion_actions as Array<{ action_type: string; value: string }> | null;
      if (!actions) continue;
      for (const action of actions) {
        const current = eventMap.get(action.action_type) || 0;
        eventMap.set(action.action_type, current + (parseInt(action.value, 10) || 0));
      }
    }

    const events = Array.from(eventMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ success: true, events });
  } catch (error: any) {
    console.error('[list-conversion-events] Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
