import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// client_channel_conversion_config isn't in the generated database.ts types
// yet — cast to `any` for these queries, same workaround used elsewhere for
// tables added ahead of a `supabase gen types` regen (e.g. platform_campaigns
// in src/app/api/setup-auditor/campaigns/route.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

// GET - Fetch all persisted conversion-event selections for a client's channels
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const db = supabase as AnySupabase;

    const { data, error } = await db
      .from('client_channel_conversion_config')
      .select('*')
      .eq('client_id', id);

    if (error) {
      console.error('Error fetching client channel conversion config:', error);
      return NextResponse.json({ error: 'Failed to fetch conversion config' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error in GET /api/clients/[id]/conversion-config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Upsert the selected conversion event for one channel
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { channel_key, conversion_action_type, conversion_label } = body;

    if (!channel_key || !conversion_action_type || !conversion_label) {
      return NextResponse.json({ error: 'channel_key, conversion_action_type, and conversion_label are required' }, { status: 400 });
    }

    const db = supabase as AnySupabase;
    const { data, error } = await db
      .from('client_channel_conversion_config')
      .upsert(
        {
          client_id: id,
          channel_key,
          conversion_action_type,
          conversion_label,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'client_id,channel_key' }
      )
      .select()
      .single();

    if (error) {
      console.error('Error upserting client channel conversion config:', error);
      return NextResponse.json({ error: 'Failed to save conversion config' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error in POST /api/clients/[id]/conversion-config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
