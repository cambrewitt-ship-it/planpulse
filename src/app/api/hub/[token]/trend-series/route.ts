import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { computePerfSeries } from '@/lib/client-hub/perf-series';
import { DEFAULT_TREND_WIDGET, PERIOD_DAYS, platformsFor } from '@/lib/client-hub/trend-widget';
import { rateLimit } from '@/lib/rate-limit';

type Params = { params: Promise<{ token: string }> | { token: string } };

async function resolveToken(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).token;
}

/**
 * Public, token-gated trend-series read. Metric/platform/chart-type choice
 * is agency-configured and sourced server-side from client_hub_config —
 * never accepted as caller query params, matching the trust model of
 * api/hub/[token]/route.ts (token possession is the only access check;
 * client_id is always resolved server-side from the share-link row).
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
    .select('sections, trend_widget')
    .eq('client_id', link.client_id)
    .maybeSingle();

  const sections = (config?.sections ?? {}) as Record<string, boolean>;
  if (sections.trends === false) {
    return NextResponse.json({ error: 'Section not visible' }, { status: 403 });
  }

  const trendWidget = { ...DEFAULT_TREND_WIDGET, ...(config?.trend_widget ?? {}) };
  const windowDays = PERIOD_DAYS[trendWidget.period] ?? 30;

  const [seriesA, seriesB] = await Promise.all([
    computePerfSeries(admin, link.client_id, {
      metric: trendWidget.metricA, platforms: platformsFor(trendWidget.platformA), windowDays,
      metaActionType: trendWidget.platformA === 'meta-ads' ? trendWidget.eventA : null,
      googleConversionAction: trendWidget.platformA === 'google-ads' ? trendWidget.eventA : null,
    }),
    computePerfSeries(admin, link.client_id, {
      metric: trendWidget.metricB, platforms: platformsFor(trendWidget.platformB), windowDays,
      metaActionType: trendWidget.platformB === 'meta-ads' ? trendWidget.eventB : null,
      googleConversionAction: trendWidget.platformB === 'google-ads' ? trendWidget.eventB : null,
    }),
  ]);

  return NextResponse.json({ seriesA: seriesA.series, seriesB: seriesB.series, trendWidget });
}
