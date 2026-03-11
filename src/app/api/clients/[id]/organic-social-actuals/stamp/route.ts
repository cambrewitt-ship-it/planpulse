import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST - Manually "stamp" organic social posts as published
 *
 * This endpoint updates the manual_stamp_count on organic_social_actuals
 * for a given client, channel, and week_commencing.
 *
 * Body:
 * - channel_name: string (required)
 * - week_commencing: string (YYYY-MM-DD, required)
 * - delta: number (optional, default 1) – how much to increment/decrement by
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const clientId = resolvedParams.id;

    if (!clientId) {
      return NextResponse.json(
        { error: 'client_id is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { channel_name, week_commencing, delta } = body;

    if (!channel_name || !week_commencing) {
      return NextResponse.json(
        { error: 'channel_name and week_commencing are required' },
        { status: 400 }
      );
    }

    const increment = typeof delta === 'number' && !Number.isNaN(delta) ? delta : 1;

    // Fetch existing record, if any
    const { data: existing, error: fetchError } = await supabase
      .from('organic_social_actuals')
      .select('*')
      .eq('client_id', clientId)
      .eq('channel_name', channel_name)
      .eq('week_commencing', week_commencing)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching organic_social_actuals for stamp:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch existing organic social actuals', details: fetchError.message },
        { status: 500 }
      );
    }

    let nextManualStampCount: number;

    if (existing) {
      const current = (existing as any).manual_stamp_count ?? 0;
      nextManualStampCount = current + increment;
    } else {
      nextManualStampCount = increment;
    }

    // Prevent negative counts
    if (nextManualStampCount < 0) {
      nextManualStampCount = 0;
    }

    const upsertPayload: any = {
      client_id: clientId,
      channel_name,
      week_commencing,
      manual_stamp_count: nextManualStampCount,
    };

    // Preserve existing values where possible
    if (existing) {
      upsertPayload.id = (existing as any).id;
      upsertPayload.posts_published = (existing as any).posts_published ?? 0;
      upsertPayload.posts_automatic = (existing as any).posts_automatic ?? 0;
      upsertPayload.notes = (existing as any).notes ?? null;
    } else {
      upsertPayload.posts_published = 0;
      upsertPayload.posts_automatic = 0;
      upsertPayload.notes = null;
    }

    const { data, error: upsertError } = await supabase
      .from('organic_social_actuals')
      .upsert(upsertPayload, {
        onConflict: 'client_id,channel_name,week_commencing',
      })
      .select()
      .single();

    if (upsertError) {
      console.error('Error upserting manual_stamp_count:', upsertError);
      return NextResponse.json(
        { error: 'Failed to update stamp count', details: upsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error(
      'Error in POST /api/clients/[id]/organic-social-actuals/stamp:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

