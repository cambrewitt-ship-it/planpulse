import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { computePerfSeries } from '@/lib/client-hub/perf-series';
import { rateLimit } from '@/lib/rate-limit';
import { DEFAULT_CPA_TREND_WIDGET } from '@/lib/client-hub/cpa-trend-widget';

type Params = { params: Promise<{ token: string }> | { token: string } };

async function resolveToken(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).token;
}

/**
 * Public, token-gated read of the 30-day rolling CPA series shown on the
 * dashboard's hero card, plus the client's primary CPA/CPL target so the
 * portal can draw the same pacing gauge. Metric is fixed (not caller-
 * supplied) to match the trust model of the other public hub routes.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const limited = await rateLimit(req, 'hub-public', 60, 60);
  if (limited) return limited;

  const token = await resolveToken(params);

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }
  const admin = createSupabaseAdmin(supabaseUrl, serviceRoleKey);

  const { data: link } = await admin
    .from('client_hub_share_links')
    .select('client_id, is_enabled')
    .eq('token', token)
    .maybeSingle();

  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  if (!link.is_enabled) return NextResponse.json({ error: 'This link is no longer active' }, { status: 403 });

  const { data: config } = await admin
    .from('client_hub_config')
    .select('sections, cpa_trend_widget')
    .eq('client_id', link.client_id)
    .maybeSingle();

  const sections = (config?.sections ?? {}) as Record<string, boolean>;
  if (sections.cpaTrend === false) {
    return NextResponse.json({ error: 'Section not visible' }, { status: 403 });
  }

  const widget = { ...DEFAULT_CPA_TREND_WIDGET, ...(config?.cpa_trend_widget ?? {}) };
  const platforms = widget.platform === 'all' ? [] : [widget.platform];

  const [{ series }, { data: goalRows }] = await Promise.all([
    computePerfSeries(admin, link.client_id, {
      metric: 'cpa', windowDays: 30, platforms,
      metaActionType: widget.platform === 'meta-ads' ? widget.event : null,
      googleConversionAction: widget.platform === 'google-ads' ? widget.event : null,
    }),
    admin
      .from('client_campaign_goals')
      .select('target_value')
      .eq('client_id', link.client_id)
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
