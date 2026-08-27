import { NextRequest, NextResponse } from 'next/server';
import { subDays, format } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { isClientOwnedByUser } from '@/lib/client-hub/assert-ownership';
import {
  getMetaPaidKpis, getMetaCommentsVsReactionsByMonth, getMetaCostPerEngagementSeries,
  getMetaPageLikesVsEngagementsByMonth, getMetaTopAdsByEngagement,
  DEFAULT_META_PAID_ACTION_TYPE, DEFAULT_META_PAID_METRIC_LABEL,
} from '@/lib/client-hub/get-meta-paid-report';
import { sanitizeHiddenCards } from '@/lib/client-hub/hidden-cards';
import { DEFAULT_META_PAID_CHART_CONFIG } from '@/lib/client-hub/meta-paid-chart-config';

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

  const today = new Date();
  const start = req.nextUrl.searchParams.get('start') ?? format(subDays(today, 29), 'yyyy-MM-dd');
  const end = req.nextUrl.searchParams.get('end') ?? format(today, 'yyyy-MM-dd');
  const range = { start, end };

  const { data: config } = await supabase
    .from('client_hub_config')
    .select('hidden_cards, meta_paid_action_type, meta_paid_metric_label, meta_paid_chart_config')
    .eq('client_id', clientId)
    .maybeSingle();
  const hiddenCards = sanitizeHiddenCards(config?.hidden_cards).metaPaidAds ?? [];
  const actionType = config?.meta_paid_action_type || DEFAULT_META_PAID_ACTION_TYPE;
  const metricLabel = config?.meta_paid_metric_label || DEFAULT_META_PAID_METRIC_LABEL;
  const chartConfig = { ...DEFAULT_META_PAID_CHART_CONFIG, ...(config?.meta_paid_chart_config ?? {}) };

  const [metrics, commentsVsReactions, costPerEngagement, pageLikesVsEngagements, topAds] = await Promise.all([
    getMetaPaidKpis(supabase, clientId, range, actionType, metricLabel),
    getMetaCommentsVsReactionsByMonth(supabase, clientId, range, chartConfig.commentsEvent, chartConfig.reactionsEvent),
    getMetaCostPerEngagementSeries(supabase, clientId, range, actionType),
    getMetaPageLikesVsEngagementsByMonth(supabase, clientId, range, actionType, chartConfig.pageLikesEvent),
    getMetaTopAdsByEngagement(supabase, clientId, actionType),
  ]);

  return NextResponse.json({
    period: { start, end }, metrics, commentsVsReactions, costPerEngagement, pageLikesVsEngagements, topAds, hiddenCards,
    metricConfig: { actionType: config?.meta_paid_action_type ?? null, label: metricLabel },
    chartConfig,
  });
}
