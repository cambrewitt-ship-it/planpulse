import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { subDays, format, startOfMonth, eachDayOfInterval, parseISO } from 'date-fns';

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
  const mk = metric.toLowerCase();
  const isCumulative = /cpa|cpl/.test(mk);
  const windowStart = isCumulative
    ? format(startOfMonth(today), 'yyyy-MM-dd')
    : format(subDays(today, 29), 'yyyy-MM-dd');
  const activePlatforms = filterPlatforms.length > 0 ? filterPlatforms : ['meta-ads', 'google-ads'];

  // Stable snapshot keys — sort so order doesn't matter
  const platformsKey    = [...activePlatforms].sort().join(',');
  const campaignIdsKey  = [...filterCampaignIds].sort().join(',');
  const actionTypeKey   = metaActionType ?? '';

  // ── Step 1: Load existing snapshots for all completed days in the window ──
  const { data: existingSnapshots } = await supabase
    .from('client_perf_snapshots')
    .select('date, value')
    .eq('client_id', clientId)
    .eq('metric', metric)
    .eq('platforms_key', platformsKey)
    .eq('campaign_ids_key', campaignIdsKey)
    .eq('meta_action_type', actionTypeKey)
    .gte('date', windowStart)
    .lte('date', yesterdayStr)
    .order('date', { ascending: true });

  const snapshotMap = new Map<string, number>(
    (existingSnapshots ?? []).map(s => [s.date as string, Number(s.value)]),
  );

  // Past dates in the window (window start → yesterday, inclusive)
  const windowStartDate = parseISO(windowStart);
  const pastDates: string[] = windowStart < todayStr
    ? eachDayOfInterval({ start: windowStartDate, end: parseISO(yesterdayStr) })
        .map(d => format(d, 'yyyy-MM-dd'))
    : [];

  const missingDates = pastDates.filter(d => !snapshotMap.has(d));

  // ── Step 2: Fetch raw DB rows for the full window ──────────────────────────
  // Always needed for today's live value; also required to backfill missing snapshots.
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

  // Auto-detect the best Meta conversion action type when none is explicitly configured.
  // Meta rarely populates the top-level `conversions` column — all event data is in
  // `meta_actions`. Without this, CPA for Meta always shows no data.
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

  // Group raw rows by date
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

  // ── Step 3: Calculate metric values for all raw dates ─────────────────────
  let cumSpend = 0, cumImpressions = 0, cumClicks = 0, cumConversions = 0;
  const calculatedMap = new Map<string, number>();

  for (const date of [...byDate.keys()].sort()) {
    const d = byDate.get(date)!;
    if (isCumulative) {
      cumSpend       += d.spend;
      cumImpressions += d.impressions;
      cumClicks      += d.clicks;
      cumConversions += d.conversions;
      const val = computeMetric(cumSpend, cumImpressions, cumClicks, cumConversions, metric);
      if (val !== null) calculatedMap.set(date, val);
    } else {
      const val = computeMetric(d.spend, d.impressions, d.clicks, d.conversions, metric);
      if (val !== null) calculatedMap.set(date, val);
    }
  }

  // ── Step 4: Persist snapshots for missing past dates (write-once) ─────────
  // ignoreDuplicates: true ensures we never overwrite a previously written snapshot.
  if (missingDates.length > 0) {
    const toSave = missingDates
      .filter(date => calculatedMap.has(date))
      .map(date => ({
        client_id:        clientId,
        date,
        metric,
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

  // ── Step 5: Build the final series ────────────────────────────────────────
  // Past days  → snapshot value (immutable, like a stock close price)
  // Today      → live calculated value (changes throughout the day)
  const allDates = new Set([...snapshotMap.keys(), ...calculatedMap.keys()]);
  const series: Array<{ date: string; value: number }> = [];

  for (const date of [...allDates].sort()) {
    let value: number | undefined;
    if (date < todayStr) {
      // Prefer stored snapshot; fall back to freshly calculated (= will be stored next call)
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
