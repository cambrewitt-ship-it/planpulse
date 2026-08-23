/**
 * Shared daily rolling-metric series engine, extracted from
 * api/clients/[id]/perf-series/route.ts so it can be called from both the
 * authenticated route and the public hub trend-series route without
 * duplicating the snapshot-lock-in logic.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { subDays, format, eachDayOfInterval, parseISO } from 'date-fns';

type MetaAction = { action_type: string; value: string };

function metaActionsOf(value: unknown): MetaAction[] {
  return Array.isArray(value) ? (value as MetaAction[]) : [];
}

export interface PerfSeriesOptions {
  metric: string;
  platforms?: string[];
  campaignIds?: string[];
  metaActionType?: string | null;
  /** Filters conversions down to one named Google Ads conversion action (e.g. "Purchase"). */
  googleConversionAction?: string | null;
  /** Client's local "today" (avoids UTC vs local timezone mismatch); defaults to server now. */
  today?: Date;
  /** Number of chart points (days) to return, ending today. Defaults to 30. */
  windowDays?: number;
}

export interface PerfSeriesPoint {
  date: string;
  value: number;
}

function computeMetric(
  spend: number, impressions: number, clicks: number, conversions: number, reach: number,
  metric: string,
): number | null {
  const mk = metric.toLowerCase();
  if (/cpa|cpl/.test(mk)) return conversions > 0 ? spend / conversions : null;
  if (/cpc/.test(mk)) return clicks > 0 ? spend / clicks : null;
  if (/cpm/.test(mk)) return impressions > 0 ? (spend / impressions) * 1000 : null;
  if (/ctr/.test(mk)) return impressions > 0 ? (clicks / impressions) * 100 : null;
  // Frequency is Meta's own impressions/reach ratio — must be derived at the
  // rolled-up level, not averaged from stored per-row frequency values.
  if (/frequency/.test(mk)) return reach > 0 ? impressions / reach : null;
  if (/^reach$/.test(mk)) return reach;
  if (/conversion/.test(mk)) return conversions;
  if (/click/.test(mk)) return clicks;
  if (/impression/.test(mk)) return impressions;
  if (/spend/.test(mk)) return spend;
  return null;
}

/**
 * Computes a 30-point, 7-day-rolling-aggregate series for one metric, using
 * write-once snapshots (client_perf_snapshots) so past days don't drift as
 * Meta retroactively re-attributes conversions. Mirrors the algorithm that
 * previously lived directly in the perf-series route.
 */
export async function computePerfSeries(
  supabase: SupabaseClient,
  clientId: string,
  options: PerfSeriesOptions,
): Promise<{ series: PerfSeriesPoint[] }> {
  const { metric, metaActionType = null, googleConversionAction = null } = options;
  const filterCampaignIds = options.campaignIds ?? [];
  const filterPlatforms = options.platforms ?? [];
  const today = options.today ?? new Date();
  const windowDays = options.windowDays ?? 30;

  const todayStr = format(today, 'yyyy-MM-dd');
  const yesterdayStr = format(subDays(today, 1), 'yyyy-MM-dd');
  const activePlatforms = filterPlatforms.length > 0 ? filterPlatforms : ['meta-ads', 'google-ads'];

  // Each chart point is a 7-day rolling aggregate, so the raw fetch window
  // needs 6 extra days behind the oldest chart point.
  const chartWindowStart = format(subDays(today, windowDays - 1), 'yyyy-MM-dd');
  const rawWindowStart = format(subDays(today, windowDays - 1 + 6), 'yyyy-MM-dd');

  const platformsKey = [...activePlatforms].sort().join(',');
  const campaignIdsKey = [...filterCampaignIds].sort().join(',');
  // Meta action type and Google conversion action share one cache-key slot —
  // platforms_key already disambiguates which platform a given call targets,
  // so a given call only ever populates one of the two.
  const actionTypeKey = metaActionType ?? googleConversionAction ?? '';

  const snapshotMetric = metric + '_r7';

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

  const chartDates = eachDayOfInterval({ start: parseISO(chartWindowStart), end: parseISO(todayStr) })
    .map(d => format(d, 'yyyy-MM-dd'));
  const pastChartDates = chartDates.filter(d => d < todayStr);
  const missingDates = pastChartDates.filter(d => !snapshotMap.has(d));

  let query = supabase
    .from('ad_performance_metrics')
    .select('date, spend, impressions, clicks, conversions, reach, meta_actions, google_conversion_actions')
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

  let effectiveMetaActionType = metaActionType;
  if (!effectiveMetaActionType && activePlatforms.includes('meta-ads')) {
    const evtTotals = new Map<string, number>();
    for (const row of rows ?? []) {
      for (const act of metaActionsOf(row.meta_actions)) {
        evtTotals.set(act.action_type, (evtTotals.get(act.action_type) ?? 0) + (parseInt(act.value, 10) || 0));
      }
    }
    let bestCount = 0;
    for (const [type, count] of evtTotals) {
      if (/^offsite_conversion|^mobile_app_install/.test(type) && count > bestCount) {
        bestCount = count; effectiveMetaActionType = type;
      }
    }
    if (!effectiveMetaActionType) {
      const vanity = /^video_view$|^page_engagement$|^post_engagement$|^photo_view$|^comment$|^like$/;
      for (const [type, count] of evtTotals) {
        if (!vanity.test(type) && count > bestCount) {
          bestCount = count; effectiveMetaActionType = type;
        }
      }
    }
  }

  const byDate = new Map<string, { spend: number; impressions: number; clicks: number; conversions: number; reach: number }>();
  for (const row of rows ?? []) {
    const cur = byDate.get(row.date) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0, reach: 0 };
    cur.spend += Number(row.spend || 0);
    cur.impressions += Number(row.impressions || 0);
    cur.clicks += Number(row.clicks || 0);
    cur.reach += Number(row.reach || 0);
    if (effectiveMetaActionType && row.meta_actions) {
      for (const act of metaActionsOf(row.meta_actions)) {
        if (act.action_type === effectiveMetaActionType) cur.conversions += parseInt(act.value, 10) || 0;
      }
    } else if (googleConversionAction && row.google_conversion_actions) {
      for (const act of metaActionsOf(row.google_conversion_actions)) {
        if (act.action_type === googleConversionAction) cur.conversions += parseInt(act.value, 10) || 0;
      }
    } else {
      cur.conversions += Number(row.conversions || 0);
    }
    byDate.set(row.date, cur);
  }

  const calculatedMap = new Map<string, number>();
  for (const chartDate of chartDates) {
    const base = parseISO(chartDate);
    let rollSpend = 0, rollImp = 0, rollClicks = 0, rollConv = 0, rollReach = 0;
    for (let d = 0; d < 7; d++) {
      const row = byDate.get(format(subDays(base, d), 'yyyy-MM-dd'));
      if (row) {
        rollSpend += row.spend;
        rollImp += row.impressions;
        rollClicks += row.clicks;
        rollConv += row.conversions;
        rollReach += row.reach;
      }
    }
    const val = computeMetric(rollSpend, rollImp, rollClicks, rollConv, rollReach, metric);
    if (val !== null) calculatedMap.set(chartDate, val);
  }

  if (missingDates.length > 0) {
    const toSave = missingDates
      .filter(date => calculatedMap.has(date))
      .map(date => ({
        client_id: clientId,
        date,
        metric: snapshotMetric,
        value: calculatedMap.get(date)!,
        platforms_key: platformsKey,
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

  const series: PerfSeriesPoint[] = [];
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

  return { series };
}
