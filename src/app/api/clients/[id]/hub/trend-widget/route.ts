import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  DEFAULT_TREND_WIDGET, VALID_PLATFORMS, VALID_CHART_TYPES, VALID_PERIODS, isValidMetricForPlatform,
  type TrendWidgetConfig,
} from '@/lib/client-hub/trend-widget';

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

async function ownedClientCheck(supabase: SupabaseClient, clientId: string, userId: string): Promise<boolean> {
  const { data } = await supabase.from('clients').select('id').eq('id', clientId).eq('user_id', userId).maybeSingle();
  return !!data;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('client_hub_config')
    .select('trend_widget')
    .eq('client_id', clientId)
    .maybeSingle();

  return NextResponse.json({ trendWidget: { ...DEFAULT_TREND_WIDGET, ...(data?.trend_widget ?? {}) } });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!(await ownedClientCheck(supabase, clientId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json();
  const patch: Partial<TrendWidgetConfig> = {};
  if (body.metricA != null) {
    if (typeof body.metricA !== 'string') return NextResponse.json({ error: 'Invalid metricA' }, { status: 400 });
    patch.metricA = body.metricA;
  }
  if (body.metricB != null) {
    if (typeof body.metricB !== 'string') return NextResponse.json({ error: 'Invalid metricB' }, { status: 400 });
    patch.metricB = body.metricB;
  }
  if (body.platformA != null) {
    if (!VALID_PLATFORMS.includes(body.platformA)) return NextResponse.json({ error: 'Invalid platformA' }, { status: 400 });
    patch.platformA = body.platformA;
  }
  if (body.platformB != null) {
    if (!VALID_PLATFORMS.includes(body.platformB)) return NextResponse.json({ error: 'Invalid platformB' }, { status: 400 });
    patch.platformB = body.platformB;
  }
  if ('eventA' in body) {
    if (body.eventA !== null && typeof body.eventA !== 'string') return NextResponse.json({ error: 'eventA must be a string or null' }, { status: 400 });
    patch.eventA = body.eventA;
  }
  if ('eventB' in body) {
    if (body.eventB !== null && typeof body.eventB !== 'string') return NextResponse.json({ error: 'eventB must be a string or null' }, { status: 400 });
    patch.eventB = body.eventB;
  }
  if (body.chartType != null) {
    if (!VALID_CHART_TYPES.includes(body.chartType)) return NextResponse.json({ error: 'Invalid chartType' }, { status: 400 });
    patch.chartType = body.chartType;
  }
  if (body.period != null) {
    if (!VALID_PERIODS.includes(body.period)) return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
    patch.period = body.period;
  }

  const { data: existing } = await supabase
    .from('client_hub_config')
    .select('trend_widget')
    .eq('client_id', clientId)
    .maybeSingle();

  const trendWidget = { ...DEFAULT_TREND_WIDGET, ...(existing?.trend_widget ?? {}), ...patch };

  // Validated against the effective (merged) platform, not the raw patch — a
  // caller may patch metric and platform in separate requests (see
  // trend-builder-section.tsx's onMetricChange/onPlatformChange handlers).
  if (!isValidMetricForPlatform(trendWidget.metricA, trendWidget.platformA)) {
    return NextResponse.json({ error: 'Invalid metricA for platformA' }, { status: 400 });
  }
  if (!isValidMetricForPlatform(trendWidget.metricB, trendWidget.platformB)) {
    return NextResponse.json({ error: 'Invalid metricB for platformB' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('client_hub_config')
    .upsert({ client_id: clientId, trend_widget: trendWidget, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
    .select('trend_widget')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ trendWidget: data.trend_widget });
}
