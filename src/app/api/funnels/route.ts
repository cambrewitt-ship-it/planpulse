import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';
import { FunnelConfig } from '@/lib/types/funnel';

// Helper function to validate channel exists
// Note: RLS policies handle authorization, this just checks existence
async function validateChannelOwnership(
  supabase: any,
  channelId: string,
  userId: string
): Promise<{ valid: boolean; error?: any }> {
  // Find which client this channel belongs to
  const { data: mediaPlanBuilders, error: builderError } = await supabase
    .from('client_media_plan_builder')
    .select('client_id, channels');

  if (builderError) {
    return { valid: false, error: { status: 500, message: 'Failed to fetch media plan builders' } };
  }

  // Find the builder that contains this channel
  let clientId: string | null = null;
  for (const builder of mediaPlanBuilders || []) {
    const channels = builder.channels || [];
    if (channels.find((ch: any) => ch.id === channelId)) {
      clientId = builder.client_id;
      break;
    }
  }

  if (!clientId) {
    return { valid: false, error: { status: 404, message: 'Channel not found' } };
  }

  // Verify client exists (RLS handles authorization)
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .single();

  if (clientError || !client) {
    return { valid: false, error: { status: 404, message: 'Client not found' } };
  }

  return { valid: true };
}

// POST /api/funnels - Create new funnel
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { channelIds, name, config } = body as {
      channelIds: string[];
      name: string;
      config: FunnelConfig;
    };

    // Validate required fields
    if (!channelIds || !Array.isArray(channelIds) || channelIds.length === 0 || !name || !config) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: channelIds (array), name, config' },
        { status: 400 }
      );
    }

    // Get authenticated user
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });
    
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Verify user owns all selected channels
    for (const channelId of channelIds) {
      const validation = await validateChannelOwnership(supabase, channelId, userId);
      if (!validation.valid) {
        return NextResponse.json(
          { success: false, error: `${validation.error?.message} (channel: ${channelId})` },
          { status: validation.error?.status || 500 }
        );
      }
    }

    // Validate config structure
    if (!config.stages || !Array.isArray(config.stages) || config.stages.length < 2) {
      return NextResponse.json(
        { success: false, error: 'Config must have at least 2 stages' },
        { status: 400 }
      );
    }

    // Insert funnel into database
    const { data: funnel, error: insertError } = await supabase
      .from('media_plan_funnels')
      .insert({
        channel_ids: channelIds,
        name,
        config: config as any, // JSONB type
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to insert funnel:', insertError);
      return NextResponse.json(
        { success: false, error: 'Failed to create funnel', details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      funnel: {
        id: funnel.id,
        channelIds: funnel.channel_ids,
        name: funnel.name,
        config: funnel.config,
        createdAt: funnel.created_at,
        updatedAt: funnel.updated_at,
      },
    });

  } catch (error: any) {
    console.error('POST /api/funnels error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

// GET /api/funnels?clientId={id} - List funnels for a client (all channels)
// GET /api/funnels?channelId={id} - List funnels containing a specific channel
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const channelId = searchParams.get('channelId');

    if (!clientId && !channelId) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: clientId or channelId' },
        { status: 400 }
      );
    }

    // Get authenticated user
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });
    
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    let funnels;
    
    if (clientId) {
      // Fetch all funnels for all channels of this client
      // First verify user owns the client (RLS will handle this)
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .single();

      if (clientError || !client) {
        return NextResponse.json(
          { success: false, error: 'Client not found' },
          { status: 404 }
        );
      }

      // Fetch all funnels (no channel filter)
      const { data: allFunnels, error: fetchError } = await supabase
        .from('media_plan_funnels')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Failed to fetch funnels:', fetchError);
        return NextResponse.json(
          { success: false, error: 'Failed to fetch funnels', details: fetchError.message },
          { status: 500 }
        );
      }

      funnels = allFunnels;
    } else {
      // Fetch funnels containing a specific channel
      // Verify user owns the channel
      const validation = await validateChannelOwnership(supabase, channelId!, userId);
      if (!validation.valid) {
        return NextResponse.json(
          { success: false, error: validation.error?.message },
          { status: validation.error?.status || 500 }
        );
      }

      // Fetch funnels that contain this channel ID in the array
      const { data: channelFunnels, error: fetchError } = await supabase
        .from('media_plan_funnels')
        .select('*')
        .contains('channel_ids', [channelId])
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Failed to fetch funnels:', fetchError);
        return NextResponse.json(
          { success: false, error: 'Failed to fetch funnels', details: fetchError.message },
          { status: 500 }
        );
      }

      funnels = channelFunnels;
    }

    return NextResponse.json({
      success: true,
      funnels: funnels.map(f => ({
        id: f.id,
        channelIds: f.channel_ids,
        name: f.name,
        config: f.config,
        createdAt: f.created_at,
        updatedAt: f.updated_at,
      })),
    });

  } catch (error: any) {
    console.error('GET /api/funnels error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
