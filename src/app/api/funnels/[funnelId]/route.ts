import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { FunnelConfig } from '@/lib/types/funnel';

// PUT /api/funnels/[funnelId] - Update a funnel
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ funnelId: string }> }
) {
  try {
    const { funnelId } = await params;
    const body = await request.json();
    const { name, channelIds, config } = body as {
      name?: string;
      channelIds?: string[];
      config?: FunnelConfig;
    };

    const supabase = await createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (channelIds !== undefined) updates.channel_ids = channelIds;
    if (config !== undefined) updates.config = config;

    const { data: funnel, error } = await (supabase as any)
      .from('media_plan_funnels')
      .update(updates)
      .eq('id', funnelId)
      .select('id, name, channel_ids, config, created_at, updated_at')
      .single();

    if (error) {
      console.error('PUT /api/funnels/[funnelId] error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to update funnel', details: error.message },
        { status: 500 }
      );
    }

    if (!funnel) {
      return NextResponse.json({ success: false, error: 'Funnel not found' }, { status: 404 });
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
    console.error('PUT /api/funnels/[funnelId] unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/funnels/[funnelId] - Delete a funnel
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ funnelId: string }> }
) {
  try {
    const { funnelId } = await params;

    const supabase = await createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await (supabase as any)
      .from('media_plan_funnels')
      .delete()
      .eq('id', funnelId);

    if (error) {
      console.error('DELETE /api/funnels/[funnelId] error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to delete funnel', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: 'Funnel deleted' });
  } catch (error: any) {
    console.error('DELETE /api/funnels/[funnelId] unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
