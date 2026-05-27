import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { subDays, format, eachDayOfInterval, parseISO } from 'date-fns';

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
  const yesterdayStr = format(subDays(today, 1), 'yyyy-MM-dd');
  const activePlatforms = filterPlatforms.length > 0 ? filterPlatforms : ['meta-ads', 'google-ads'];

  // Chart shows 30 days. Each point is a 7-day rolling aggregate, so we need
  // 6 extra days of raw data behind the oldest chart point (35 days total).
  const chartWindowStart = format(subDays(today, 29), 'yyyy-MM-dd');
  const rawWindowStart   = format(subDays(today, 35), 'yyyy-MM-dd');

  // Stable snapshot keys
  const platformsKey   = [...activePlatforms].sort().join(',');
  const campaignIdsKey = [...filterCampaignIds].sort().join(',');
  const actionTypeKey  = metaActionType ?? '';

  // '_r7' distinguishes 7-day rolling snapshots from old cumulative/daily ones
  const snapshotMetric = metric + '_r7';

  // ── Step 1: Load existing rolling snapshots for past chart days ───────────
  const { data: existingSnapshots } = await supabase
    .from('client_perf_snapshots')
    .select('date, value')
    .eq('client_id', clientId)
    .eq('metric', snapshotMetric)
    .eq('platforms_key', platformsKey)
    .eq('campaign_ids_key', campaignIdsKey)
    .eq('meta_action_type', actionTypeKey)
    .gte('date', chartWindowStart)
    .lte('date', yesterdayStr)
    .order('date', { ascending: true });

  const snapshotMap = new Map<string, number>(
    (existingSnapshots ?? []).map(s => [s.date as string, Number(s.value)]),
  );

  // Past chart dates that have no snapshot yet
  const chartDates = eachDayOfInterval({ start: parseISO(chartWindowStart), end: parseISO(todayStr) })
    .map(d => format(d, 'yyyy-MM-dd'));
  const pastChartDates = chartDates.filter(d => d < todayStr);
  const missingDates = pastChartDates.filter(d => !snapshotMap.has(d));

  // ── Step 2: Fetch raw data for the full 36-day window ─────────────────────
  let query = supabase
    .from('ad_performance_metrics')
    .select('date, spend, impressions, clicks, conversions, meta_actions')
    .eq('client_id', clientId)
    .in('platform', activePlatforms as ('google-ads' | 'meta-ads')[])
    .gte('date', rawWindowStart)
    .lte('date', todayStr)
    .not('campaign_id', 'like', 'manual-override-%')
    .order('date', { ascending: true });

  if (filterCampaignIds.length > 0) {
    query = query.in('campaign_id', filterCampaignIds);
  }

  const { data: rows } = await query;

  // Auto-detect best Meta conversion action type when none is configured
  let effectiveMetaActionType = metaActionType;
  if (!effectiveMetaActionType && activePlatforms.includes('meta-ads')) {
    const evtTotals = new Map<string, number>();
    for (const row of rows ?? []) {
      for (const act of ((row.meta_actions as any[]) ?? [])) {
        if (/^offsite_conversion|^mobile_app_install/.test(act.action_type)) {
          evtTotals.set(act.action_type, (evtTotals.get(act.action_type) ?? 0) + (parseInt(act.value, 10) || 0));
        }
      }
    }
    let bestCount = 0;
    for (const [type, count] of evtTotals) {
      if (count > bestCount) { bestCount = count; effectiveMetaActionType = type; }
    }
  }

  // Group raw rows by date across the full 36-day window
  const byDate = new Map<string, { spend: number; impressions: number; clicks: number; conversions: number }>();
  for (const row of rows ?? []) {
    const cur = byDate.get(row.date) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
    cur.spend       += Number(row.spend       || 0);
    cur.impressions += Number(row.impressions || 0);
    cur.clicks      += Number(row.clicks      || 0);
    if (effectiveMetaActionType && row.meta_actions) {
      for (const act of (row.meta_actions as any[]) ?? []) {
        if (act.action_type === effectiveMetaActionType) cur.conversions += parseInt(act.value, 10) || 0;
      }
    } else {
      cur.conversions += Number(row.conversions || 0);
    }
    byDate.set(row.date, cur);
  }

  // ── Step 3: Compute 7-day rolling metric for each chart day ───────────────
  // For each chart date D, aggregate raw spend/impressions/clicks/conversions
  // across D and the 6 preceding days, then derive the metric from the totals.
  // This smooths noise while still showing real directional trends.
  const calculatedMap = new Map<string, number>();

  for (const chartDate of chartDates) {
    const base = parseISO(chartDate);
    let rollSpend = 0, rollImp = 0, rollClicks = 0, rollConv = 0;
    for (let d = 0; d < 7; d++) {
      const row = byDate.get(format(subDays(base, d), 'yyyy-MM-dd'));
      if (row) {
        rollSpend  += row.spend;
        rollImp    += row.impressions;
        rollClicks += row.clicks;
        rollConv   += row.conversions;
      }
    }
    const val = computeMetric(rollSpend, rollImp, rollClicks, rollConv, metric);
    if (val !== null) calculatedMap.set(chartDate, val);
  }

  // ── Step 4: Lock in snapshots for past chart days (write-once) ────────────
  if (missingDates.length > 0) {
    const toSave = missingDates
      .filter(date => calculatedMap.has(date))
      .map(date => ({
        client_id:        clientId,
        date,
        metric:           snapshotMetric,
        value:            calculatedMap.get(date)!,
        platforms_key:    platformsKey,
        campaign_ids_key: campaignIdsKey,
        meta_action_type: actionTypeKey,
      }));

    if (toSave.length > 0) {
      await supabase
        .from('client_perf_snapshots')
        .upsert(toSave, {
          onConflict: 'client_id,date,metric,platforms_key,campaign_ids_key,meta_action_type',
          ignoreDuplicates: true,
        });
    }
  }

  // ── Step 5: Build the final 30-point series ───────────────────────────────
  // Past days → locked snapshot (immutable once all 7 source days have closed)
  // Today     → live rolling value (updates during the day)
  const series: Array<{ date: string; value: number }> = [];

  for (const date of chartDates) {
    let value: number | undefined;
    if (date < todayStr) {
      value = snapshotMap.get(date) ?? calculatedMap.get(date);
    } else {
      value = calculatedMap.get(date);
    }
    if (value != null && isFinite(value)) {
      series.push({ date, value });
    }
  }

  return NextResponse.json({ series, metric });
}
