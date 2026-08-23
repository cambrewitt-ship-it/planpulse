import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isClientOwnedByUser } from '@/lib/client-hub/assert-ownership';
import { computePerfSeries } from '@/lib/client-hub/perf-series';
import { DEFAULT_CPA_TREND_WIDGET } from '@/lib/client-hub/cpa-trend-widget';

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

// GET — 30-day rolling CPA series + primary CPA/CPL target, for the agency edit view.
// Mirrors api/hub/[token]/cpa-trend so the two surfaces never drift.
export async function GET(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isClientOwnedByUser(supabase, clientId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: config } = await supabase
    .from('client_hub_config')
    .select('cpa_trend_widget')
    .eq('client_id', clientId)
    .maybeSingle();

  const widget = { ...DEFAULT_CPA_TREND_WIDGET, ...(config?.cpa_trend_widget ?? {}) };
  const platforms = widget.platform === 'all' ? [] : [widget.platform];

  const [{ series }, { data: goalRows }] = await Promise.all([
    computePerfSeries(supabase, clientId, {
      metric: 'cpa', windowDays: 30, platforms,
      metaActionType: widget.platform === 'meta-ads' ? widget.event : null,
      googleConversionAction: widget.platform === 'google-ads' ? widget.event : null,
    }),
    supabase
      .from('client_campaign_goals')
      .select('target_value')
      .eq('client_id', clientId)
      .in('metric', ['CPA', 'CPL'])
      .order('is_primary', { ascending: false })
      .order('set_at', { ascending: false })
      .limit(1),
  ]);

  return NextResponse.json({
    series,
    target: goalRows?.[0]?.target_value ?? null,
  });
}
