import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET - Fetch all channel presets for a client
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

    const { data, error } = await supabase
      .from('client_channel_presets')
      .select('*')
      .eq('client_id', id);

    if (error) {
      console.error('Error fetching client channel presets:', error);
      return NextResponse.json({ error: 'Failed to fetch presets' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error in GET /api/clients/[id]/channel-presets:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Upsert a channel preset for a client
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
    const { channel_name, preset_name, custom_metrics } = body;

    if (!channel_name || !preset_name) {
      return NextResponse.json({ error: 'channel_name and preset_name are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('client_channel_presets')
      .upsert(
        {
          client_id: id,
          channel_name,
          preset_name,
          custom_metrics: custom_metrics ?? [],
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'client_id,channel_name' }
      )
      .select()
      .single();

    if (error) {
      console.error('Error upserting client channel preset:', error);
      return NextResponse.json({ error: 'Failed to save preset' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error in POST /api/clients/[id]/channel-presets:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
