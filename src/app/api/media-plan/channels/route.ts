import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

// GET /api/media-plan/channels?clientId={id} - List all channels for a client
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

    // Get authenticated user
    const supabase = await createClient();
    
    const { data: { user }, error: sessionError } = await supabase.auth.getUser();

    if (sessionError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify client exists (RLS will handle authorization)
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return NextResponse.json(
        { success: false, error: 'Client not found', details: clientError?.message },
        { status: 404 }
      );
    }

    // Fetch media plan builder data for this client
    const { data: mediaPlanBuilder, error: fetchError } = await supabase
      .from('client_media_plan_builder')
      .select('channels')
      .eq('client_id', clientId)
      .single();

    if (fetchError) {
      // PGRST116 means no rows found - return empty array
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json({ success: true, channels: [] });
      }
      return NextResponse.json(
        { success: false, error: 'Failed to fetch media plan builder', details: fetchError.message },
        { status: 500 }
      );
    }

    // Extract channels from JSONB and map to expected format
    const rawChannels = mediaPlanBuilder?.channels || [];

    if (!Array.isArray(rawChannels) || rawChannels.length === 0) {
      return NextResponse.json({ success: true, channels: [] });
    }

    const channels = rawChannels.map((channel: any) => ({
      id: channel.id,
      name: channel.channelName || channel.name,
      platform: channel.channelName || channel.platform || 'unknown',
    }));

    return NextResponse.json({
      success: true,
      channels,
    });

  } catch (error: any) {
    console.error('GET /api/media-plan/channels error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
