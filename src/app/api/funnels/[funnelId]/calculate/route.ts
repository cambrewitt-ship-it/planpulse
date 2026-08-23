import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeFunnelStages } from '@/lib/client-hub/get-funnel-data';
import type { FunnelConfig } from '@/lib/types/funnel';

// GET /api/funnels/[funnelId]/calculate?startDate=&endDate=
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ funnelId: string }> }
) {
  try {
    const { funnelId } = await params;
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: startDate, endDate' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Load funnel config
    const { data: funnelRow, error: funnelError } = await (supabase as any)
      .from('media_plan_funnels')
      .select('id, name, channel_ids, config, client_id')
      .eq('id', funnelId)
      .single();

    if (funnelError || !funnelRow) {
      return NextResponse.json(
        { success: false, error: 'Funnel not found', details: funnelError?.message },
        { status: 404 }
      );
    }

    const config = funnelRow.config as FunnelConfig;
    const clientId = funnelRow.client_id as string | null;

    const { stages, totalSpend } = await computeFunnelStages(supabase, {
      userId, clientId, config, startDate, endDate,
    });

    return NextResponse.json({ success: true, stages, totalSpend });
  } catch (error: any) {
    console.error('GET /api/funnels/[funnelId]/calculate unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
