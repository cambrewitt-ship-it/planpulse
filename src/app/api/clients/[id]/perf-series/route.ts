import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { subDays, format, startOfMonth } from 'date-fns';

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

function computeMetric(
  spend: number, impressions: number, clicks: number, conversions: number,
  metric: string,
): number | null {
  const mk = metric.toLowerCase();
  if (/cpa|cpl/.test(mk)) return conversions > 0 ? spend / conversions : null;
  if (/cpc/.test(mk)) return clicks > 0 ? spend / clicks : null;
  if (/cpm/.test(mk)) return impressions > 0 ? (spend / impressions) * 1000 : null;
  if (/ctr/.test(mk)) return impressions > 0 ? (clicks / impressions) * 100 : null;
  if (/conversion/.test(mk)) return conversions;
  if (/click/.test(mk)) return clicks;
  if (/impression/.test(mk)) return impressions;
  if (/spend/.test(mk)) return spend;
  return null;
}

export async function GET(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const metric = url.searchParams.get('metric') ?? 'CPA';
  const filterCampaignIds = (url.searchParams.get('campaignIds') ?? '').split(',').filter(Boolean);
  const filterPlatforms = (url.searchParams.get('platforms') ?? '').split(',').filter(Boolean);
  const metaActionType = url.searchParams.get('metaActionType') ?? null;

  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const mk = metric.toLowerCase();
  const isCumulative = /cpa|cpl/.test(mk);
  // Cumulative metrics (CPA/CPL) use month-to-date so the series end matches the headline number.
  // Other metrics use a 30-day rolling window.
  const windowStart = isCumulative
    ? format(startOfMonth(today), 'yyyy-MM-dd')
    : format(subDays(today, 29), 'yyyy-MM-dd');
  const activePlatforms = filterPlatforms.length > 0 ? filterPlatforms : ['meta-ads', 'google-ads'];

  let query = supabase
    .from('ad_performance_metrics')
    .select('date, spend, impressions, clicks, conversions, meta_actions')
    .eq('client_id', clientId)
    .in('platform', activePlatforms as ('google-ads' | 'meta-ads')[])
    .gte('date', windowStart)
    .lte('date', todayStr)
    .not('campaign_id', 'like', 'manual-override-%')
    .order('date', { ascending: true });

  if (filterCampaignIds.length > 0) {
    query = query.in('campaign_id', filterCampaignIds);
  }

  const { data: rows } = await query;

  // Group rows by date, applying metaActionType override for conversions
  const byDate = new Map<string, { spend: number; impressions: number; clicks: number; conversions: number }>();
  for (const row of rows ?? []) {
    const cur = byDate.get(row.date) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
    cur.spend += Number(row.spend || 0);
    cur.impressions += Number(row.impressions || 0);
    cur.clicks += Number(row.clicks || 0);
    if (metaActionType && row.meta_actions) {
      for (const act of (row.meta_actions as any[]) ?? []) {
        if (act.action_type === metaActionType) cur.conversions += parseInt(act.value, 10) || 0;
      }
    } else {
      cur.conversions += Number(row.conversions || 0);
    }
    byDate.set(row.date, cur);
  }

  // Build running cumulative per day for CPA/CPL (so values match the widget).
  // For other metrics (CTR, CPC, CPM, etc.), use per-day values.

  let cumSpend = 0, cumImpressions = 0, cumClicks = 0, cumConversions = 0;
  const seriesMap = new Map<string, number>();

  for (const date of [...byDate.keys()].sort()) {
    const d = byDate.get(date)!;
    if (isCumulative) {
      cumSpend += d.spend;
      cumImpressions += d.impressions;
      cumClicks += d.clicks;
      cumConversions += d.conversions;
      const val = computeMetric(cumSpend, cumImpressions, cumClicks, cumConversions, metric);
      if (val !== null) seriesMap.set(date, val);
    } else {
      const val = computeMetric(d.spend, d.impressions, d.clicks, d.conversions, metric);
      if (val !== null) seriesMap.set(date, val);
    }
  }

  // Emit all days in the window that have a computed value
  const series: Array<{ date: string; value: number }> = [];
  for (const date of [...seriesMap.keys()].sort()) {
    series.push({ date, value: seriesMap.get(date)! });
  }

  return NextResponse.json({ series, metric });
}
