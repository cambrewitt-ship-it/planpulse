import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BENCHMARK_SEEDS } from '@/lib/seeds/benchmark-seed';

// POST - Reset all benchmarks to seed defaults
export async function POST() {
  try {
    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('channel_benchmarks')
      .upsert(BENCHMARK_SEEDS, { onConflict: 'channel_name,metric_key' })
      .select();

    if (error) {
      console.error('Error resetting benchmarks:', error);
      return NextResponse.json({ error: 'Failed to reset benchmarks' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error in POST /api/benchmarks/reset:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
