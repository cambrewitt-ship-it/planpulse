import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { OrganicSocialActualInsert } from '@/types/database';

// GET - Fetch all organic social actuals for a client
export async function GET(
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

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('organic_social_actuals')
      .select('*')
      .eq('client_id', clientId)
      .order('week_commencing', { ascending: false });

    if (error) {
      console.error('Error fetching organic social actuals:', error);
      return NextResponse.json(
        { error: 'Failed to fetch organic social actuals', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('Error in GET /api/clients/[id]/organic-social-actuals:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

// POST - Upsert a week's post count for organic social
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

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      channel_name,
      week_commencing,
      posts_published,
      posts_automatic,
      manual_stamp_count,
      notes,
    } = body;

    if (!channel_name || !week_commencing) {
      return NextResponse.json(
        { error: 'channel_name and week_commencing are required' },
        { status: 400 }
      );
    }

    if (posts_published !== undefined && typeof posts_published !== 'number') {
      return NextResponse.json(
        { error: 'posts_published must be a number' },
        { status: 400 }
      );
    }

    if (posts_automatic !== undefined && typeof posts_automatic !== 'number') {
      return NextResponse.json(
        { error: 'posts_automatic must be a number' },
        { status: 400 }
      );
    }

    if (manual_stamp_count !== undefined && typeof manual_stamp_count !== 'number') {
      return NextResponse.json(
        { error: 'manual_stamp_count must be a number' },
        { status: 400 }
      );
    }

    // Upsert the record
    const upsertData = {
      client_id: clientId,
      channel_name,
      week_commencing,
      posts_published: posts_published ?? 0,
      posts_automatic: posts_automatic ?? 0,
      manual_stamp_count: manual_stamp_count ?? 0,
      notes: notes || null,
    };
    
    const { data, error } = await supabase
      .from('organic_social_actuals')
      .upsert(upsertData as any, {
        onConflict: 'client_id,channel_name,week_commencing',
      })
      .select()
      .single();

    if (error) {
      console.error('Error upserting organic social actuals:', error);
      return NextResponse.json(
        { error: 'Failed to save organic social actuals', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('Error in POST /api/clients/[id]/organic-social-actuals:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
