import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET - Fetch all channel benchmarks ordered by channel then label
export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('channel_benchmarks')
      .select('*')
      .order('channel_name', { ascending: true })
      .order('metric_label', { ascending: true });

    if (error) {
      console.error('Error fetching channel_benchmarks:', error);
      return NextResponse.json({ error: 'Failed to fetch benchmarks' }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('Error in GET /api/benchmarks:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Bulk upsert benchmarks (used by seed)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { benchmarks } = body;

    if (!Array.isArray(benchmarks) || benchmarks.length === 0) {
      return NextResponse.json({ error: 'benchmarks array is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('channel_benchmarks')
      .upsert(benchmarks, { onConflict: 'channel_name,metric_key' })
      .select();

    if (error) {
      console.error('Error upserting channel_benchmarks:', error);
      return NextResponse.json({ error: 'Failed to upsert benchmarks' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error in POST /api/benchmarks:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
