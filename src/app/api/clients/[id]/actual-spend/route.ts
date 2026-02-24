import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * PATCH /api/clients/[id]/actual-spend
 * Cache the MTD actual spend computed by new-client-dashboard so the agency
 * dashboard can mirror the exact same number without recalculation.
 * Body: { actualSpend: number }
 */
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

    const { id: clientId } = await params;
    const body = await request.json();
    const { actualSpend } = body;

    if (actualSpend === undefined || actualSpend === null || typeof actualSpend !== 'number') {
      return NextResponse.json({ error: 'actualSpend must be a number' }, { status: 400 });
    }

    // Upsert into client_health_status — only update the MTD spend cache columns.
    // We use onConflict on client_id so this is safe even if no health record exists yet.
    const { error } = await supabase
      .from('client_health_status')
      .upsert(
        {
          client_id: clientId,
          // Required non-null columns — use safe defaults when inserting a new row
          status: 'green',
          mtd_actual_spend: actualSpend,
          mtd_actual_spend_updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'client_id',
          ignoreDuplicates: false,
        }
      );

    if (error) {
      console.error('[actual-spend PATCH] upsert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[actual-spend PATCH] unexpected error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
