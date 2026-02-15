import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';
import { FunnelConfig } from '@/lib/types/funnel';

// GET /api/funnels/[funnelId] - Get single funnel
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ funnelId: string }> }
) {
  try {
    const { funnelId } = await params;

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

    // Fetch funnel (RLS policies handle authorization)
    const { data: funnel, error: fetchError } = await supabase
      .from('media_plan_funnels')
      .select('*')
      .eq('id', funnelId)
      .single();

    if (fetchError || !funnel) {
      return NextResponse.json(
        { success: false, error: 'Funnel not found' },
        { status: 404 }
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
    console.error('GET /api/funnels/[funnelId] error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

// PUT /api/funnels/[funnelId] - Update funnel
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ funnelId: string }> }
) {
  try {
    const { funnelId } = await params;
    const body = await request.json();
    const { name, config } = body as {
      name?: string;
      config?: FunnelConfig;
    };

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

    // Fetch funnel to verify it exists (RLS handles authorization)
    const { data: existingFunnel, error: fetchError } = await supabase
      .from('media_plan_funnels')
      .select('*')
      .eq('id', funnelId)
      .single();

    if (fetchError || !existingFunnel) {
      return NextResponse.json(
        { success: false, error: 'Funnel not found' },
        { status: 404 }
      );
    }

    // Validate config if provided
    if (config) {
      if (!config.stages || !Array.isArray(config.stages) || config.stages.length < 2) {
        return NextResponse.json(
          { success: false, error: 'Config must have at least 2 stages' },
          { status: 400 }
        );
      }
    }

    // Build update object
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (config !== undefined) updates.config = config;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No updates provided' },
        { status: 400 }
      );
    }

    // Update funnel
    const { data: updatedFunnel, error: updateError } = await supabase
      .from('media_plan_funnels')
      .update(updates)
      .eq('id', funnelId)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update funnel:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update funnel', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      funnel: {
        id: updatedFunnel.id,
        channelIds: updatedFunnel.channel_ids,
        name: updatedFunnel.name,
        config: updatedFunnel.config,
        createdAt: updatedFunnel.created_at,
        updatedAt: updatedFunnel.updated_at,
      },
    });

  } catch (error: any) {
    console.error('PUT /api/funnels/[funnelId] error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/funnels/[funnelId] - Delete funnel
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ funnelId: string }> }
) {
  try {
    const { funnelId } = await params;

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

    // Verify funnel exists (RLS handles authorization)
    const { data: funnel, error: fetchError } = await supabase
      .from('media_plan_funnels')
      .select('id')
      .eq('id', funnelId)
      .single();

    if (fetchError || !funnel) {
      return NextResponse.json(
        { success: false, error: 'Funnel not found' },
        { status: 404 }
      );
    }

    // Delete funnel
    const { error: deleteError } = await supabase
      .from('media_plan_funnels')
      .delete()
      .eq('id', funnelId);

    if (deleteError) {
      console.error('Failed to delete funnel:', deleteError);
      return NextResponse.json(
        { success: false, error: 'Failed to delete funnel', details: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Funnel deleted successfully',
    });

  } catch (error: any) {
    console.error('DELETE /api/funnels/[funnelId] error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
