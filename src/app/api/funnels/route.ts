import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { FunnelConfig } from '@/lib/types/funnel';

// GET /api/funnels?clientId={id} - List funnels for a client
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');

    if (!clientId) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: clientId' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: funnels, error } = await (supabase as any)
      .from('media_plan_funnels')
      .select('id, name, channel_ids, config, created_at, updated_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('GET /api/funnels error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch funnels', details: error.message },
        { status: 500 }
      );
    }

    const mapped = (funnels || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      channelIds: f.channel_ids,
      config: f.config,
      createdAt: f.created_at,
      updatedAt: f.updated_at,
    }));

    return NextResponse.json({ success: true, funnels: mapped });
  } catch (error: any) {
    console.error('GET /api/funnels unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/funnels - Create a new funnel
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clientId, channelIds, name, config } = body as {
      clientId: string;
      channelIds: string[];
      name: string;
      config: FunnelConfig;
    };

    if (!clientId || !name || !config) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: clientId, name, config' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: funnel, error } = await (supabase as any)
      .from('media_plan_funnels')
      .insert({
        client_id: clientId,
        channel_ids: channelIds || [],
        name,
        config,
      })
      .select('id, name, channel_ids, config, created_at, updated_at')
      .single();

    if (error) {
      console.error('POST /api/funnels error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to create funnel', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      funnel: {
        id: funnel.id,
        name: funnel.name,
        channelIds: funnel.channel_ids,
        config: funnel.config,
        createdAt: funnel.created_at,
        updatedAt: funnel.updated_at,
      },
    });
  } catch (error: any) {
    console.error('POST /api/funnels unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
