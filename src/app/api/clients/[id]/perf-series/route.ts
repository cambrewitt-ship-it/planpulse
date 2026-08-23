import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseISO } from 'date-fns';
import { computePerfSeries } from '@/lib/client-hub/perf-series';

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

export async function GET(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const metric = url.searchParams.get('metric') ?? 'CPA';
  const campaignIds = (url.searchParams.get('campaignIds') ?? '').split(',').filter(Boolean);
  const platforms = (url.searchParams.get('platforms') ?? '').split(',').filter(Boolean);
  const metaActionType = url.searchParams.get('metaActionType') ?? null;

  const clientDateParam = url.searchParams.get('clientDate');
  const today = (clientDateParam && /^\d{4}-\d{2}-\d{2}$/.test(clientDateParam))
    ? parseISO(clientDateParam)
    : new Date();

  const { series } = await computePerfSeries(supabase, clientId, {
    metric, campaignIds, platforms, metaActionType, today,
  });

  return NextResponse.json({ series, metric });
}
