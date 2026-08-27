import { NextRequest, NextResponse } from 'next/server';
import { subDays, format } from 'date-fns';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/rate-limit';
import {
  getMetaPaidKpis, getMetaCommentsVsReactionsByMonth, getMetaCostPerEngagementSeries,
  getMetaPageLikesVsEngagementsByMonth, getMetaTopAdsByEngagement,
  DEFAULT_META_PAID_ACTION_TYPE, DEFAULT_META_PAID_METRIC_LABEL,
} from '@/lib/client-hub/get-meta-paid-report';
import { sanitizeHiddenCards } from '@/lib/client-hub/hidden-cards';
import { DEFAULT_META_PAID_CHART_CONFIG } from '@/lib/client-hub/meta-paid-chart-config';

type Params = { params: Promise<{ token: string }> | { token: string } };

async function resolveToken(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).token;
}

/** Public, token-gated Meta Paid Ads read — same trust model as api/hub/[token]/route.ts. */
export async function GET(req: NextRequest, { params }: Params) {
  const limited = await rateLimit(req, 'hub-public', 60, 60);
  if (limited) return limited;

  const token = await resolveToken(params);

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!serviceRoleKey) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
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
    .select('sections, hidden_cards, meta_paid_action_type, meta_paid_metric_label, meta_paid_chart_config')
    .eq('client_id', link.client_id)
    .maybeSingle();

  const sections = (config?.sections ?? {}) as Record<string, boolean>;
  if (sections.metaPaidAds === false) {
    return NextResponse.json({ error: 'Section not visible' }, { status: 403 });
  }
  const hiddenCards = sanitizeHiddenCards(config?.hidden_cards).metaPaidAds ?? [];
  const actionType = config?.meta_paid_action_type || DEFAULT_META_PAID_ACTION_TYPE;
  const metricLabel = config?.meta_paid_metric_label || DEFAULT_META_PAID_METRIC_LABEL;
  const chartConfig = { ...DEFAULT_META_PAID_CHART_CONFIG, ...(config?.meta_paid_chart_config ?? {}) };

  const today = new Date();
  const start = req.nextUrl.searchParams.get('start') ?? format(subDays(today, 29), 'yyyy-MM-dd');
  const end = req.nextUrl.searchParams.get('end') ?? format(today, 'yyyy-MM-dd');
  const range = { start, end };

  const [metrics, commentsVsReactions, costPerEngagement, pageLikesVsEngagements, topAds] = await Promise.all([
    getMetaPaidKpis(admin, link.client_id, range, actionType, metricLabel),
    getMetaCommentsVsReactionsByMonth(admin, link.client_id, range, chartConfig.commentsEvent, chartConfig.reactionsEvent),
    getMetaCostPerEngagementSeries(admin, link.client_id, range, actionType),
    getMetaPageLikesVsEngagementsByMonth(admin, link.client_id, range, actionType, chartConfig.pageLikesEvent),
    getMetaTopAdsByEngagement(admin, link.client_id, actionType),
  ]);

  // Strip data for hidden cards server-side — this is an unauthenticated
  // endpoint, so redaction can't rely on the client choosing not to render it.
  return NextResponse.json({
    period: { start, end },
    metrics,
    commentsVsReactions: hiddenCards.includes('commentsVsReactions') ? [] : commentsVsReactions,
    costPerEngagement: hiddenCards.includes('costPerEngagement') ? [] : costPerEngagement,
    pageLikesVsEngagements: hiddenCards.includes('pageLikesVsEngagements') ? [] : pageLikesVsEngagements,
    topAds: hiddenCards.includes('topAds') ? [] : topAds,
    hiddenCards,
    metricConfig: { actionType: config?.meta_paid_action_type ?? null, label: metricLabel },
    chartConfig,
  });
}
