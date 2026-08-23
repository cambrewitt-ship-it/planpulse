import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computePerfSeries } from '@/lib/client-hub/perf-series';
import { PERIOD_DAYS, platformsFor } from '@/lib/client-hub/trend-widget';
import { isClientOwnedByUser } from '@/lib/client-hub/assert-ownership';

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
    computePerfSeries(supabase, clientId, {
      metric: metricA, platforms: platformsFor(platformA), windowDays,
      metaActionType: platformA === 'meta-ads' ? eventA : null,
      googleConversionAction: platformA === 'google-ads' ? eventA : null,
    }),
    computePerfSeries(supabase, clientId, {
      metric: metricB, platforms: platformsFor(platformB), windowDays,
      metaActionType: platformB === 'meta-ads' ? eventB : null,
      googleConversionAction: platformB === 'google-ads' ? eventB : null,
    }),
  ]);

  return NextResponse.json({ seriesA: seriesA.series, seriesB: seriesB.series });
}
