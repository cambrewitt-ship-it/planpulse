import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computePerfSeries } from '@/lib/client-hub/perf-series';
import { computeGA4PerfSeries } from '@/lib/client-hub/ga4-perf-series';
import { PERIOD_DAYS, platformsFor } from '@/lib/client-hub/trend-widget';
import { isClientOwnedByUser } from '@/lib/client-hub/assert-ownership';
import type { SupabaseClient } from '@supabase/supabase-js';

function seriesFor(supabase: SupabaseClient, clientId: string, platform: string, metric: string, event: string | null, windowDays: number) {
  if (platform === 'google-analytics') {
    return computeGA4PerfSeries(supabase, clientId, { metric, windowDays });
  }
  return computePerfSeries(supabase, clientId, {
    metric, platforms: platformsFor(platform), windowDays,
    metaActionType: platform === 'meta-ads' ? event : null,
    googleConversionAction: platform === 'google-ads' ? event : null,
  });
}

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

export async function GET(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isClientOwnedByUser(supabase, clientId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const url = new URL(req.url);
  const metricA = url.searchParams.get('metricA') ?? 'spend';
  const platformA = url.searchParams.get('platformA') ?? 'all';
  const eventA = url.searchParams.get('eventA') || null;
  const metricB = url.searchParams.get('metricB') ?? 'clicks';
  const platformB = url.searchParams.get('platformB') ?? 'all';
  const eventB = url.searchParams.get('eventB') || null;
  const period = url.searchParams.get('period') ?? '30d';
  const windowDays = PERIOD_DAYS[period] ?? 30;

  const [seriesA, seriesB] = await Promise.all([
    seriesFor(supabase, clientId, platformA, metricA, eventA, windowDays),
    seriesFor(supabase, clientId, platformB, metricB, eventB, windowDays),
  ]);

  return NextResponse.json({ seriesA: seriesA.series, seriesB: seriesB.series });
}
