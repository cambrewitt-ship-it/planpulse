import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET - Fetch all metric presets
export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('metric_presets')
      .select('*')
      .order('channel_name')
      .order('name');

    if (error) {
      console.error('Error fetching presets:', error);
      return NextResponse.json({ error: 'Failed to fetch presets' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error in GET /api/benchmarks/presets:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
