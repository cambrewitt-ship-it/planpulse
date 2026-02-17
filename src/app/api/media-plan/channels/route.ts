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
    
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    console.log('[Channels API] Request for clientId:', clientId, 'userId:', userId);

    // Verify client exists (RLS will handle authorization)
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .single();

    console.log('[Channels API] Client lookup result:', { found: !!client, clientError });

    if (clientError || !client) {
      console.error('[Channels API] Client not found:', clientError);
      return NextResponse.json(
        { success: false, error: 'Client not found', details: clientError?.message },
        { status: 404 }
      );
    }

    // Fetch media plan builder data for this client
    console.log('[Channels API] Fetching media plan builder for clientId:', clientId);
    const { data: mediaPlanBuilder, error: fetchError } = await supabase
      .from('client_media_plan_builder')
      .select('channels')
      .eq('client_id', clientId)
      .single();

    console.log('[Channels API] Media plan builder query result:', {
      found: !!mediaPlanBuilder,
      hasChannels: !!mediaPlanBuilder?.channels,
      channelsCount: mediaPlanBuilder?.channels?.length || 0,
      error: fetchError
    });

    if (fetchError) {
      // PGRST116 means no rows found - return empty array
      if (fetchError.code === 'PGRST116') {
        console.log('[Channels API] No media plan builder found - returning empty channels');
        return NextResponse.json({ success: true, channels: [] });
      }
      console.error('[Channels API] Failed to fetch media plan builder:', fetchError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch media plan builder', details: fetchError.message },
        { status: 500 }
      );
    }

    // Extract channels from JSONB and map to expected format
    const rawChannels = mediaPlanBuilder?.channels || [];
    console.log('[Channels API] Raw channels from DB:', JSON.stringify(rawChannels, null, 2));
    
    if (!Array.isArray(rawChannels) || rawChannels.length === 0) {
      console.log('[Channels API] No channels array or empty - returning empty channels');
      return NextResponse.json({ success: true, channels: [] });
    }
    
    const channels = rawChannels.map((channel: any) => ({
      id: channel.id,
      name: channel.channelName || channel.name,
      platform: channel.channelName || channel.platform || 'unknown',
    }));

    console.log('[Channels API] Mapped channels:', channels);

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
