import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// PATCH - Update a single benchmark's value
export async function PATCH(
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
    const { benchmark_value } = body;

    if (benchmark_value === undefined || benchmark_value === null || isNaN(Number(benchmark_value))) {
      return NextResponse.json({ error: 'benchmark_value is required and must be a number' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('channel_benchmarks')
      .update({ benchmark_value: Number(benchmark_value), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating benchmark:', error);
      return NextResponse.json({ error: 'Failed to update benchmark' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error in PATCH /api/benchmarks/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
