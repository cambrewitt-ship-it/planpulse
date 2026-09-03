/**
 * GA4 daily-metric series engine for the Client Hub Trend Builder — a
 * parallel to perf-series.ts's computePerfSeries, not a branch inside it.
 * GA4 metrics (sessions, totalUsers, engagementRate, bounceRate…) are direct
 * daily values already computed by GA4, not spend/click-derived ratios like
 * ctr/cpc/cpm, so computePerfSeries's computeMetric() switch doesn't apply.
 * GA4 also doesn't need the retroactive-drift snapshot-lock-in that
 * client_perf_snapshots protects Meta's attribution against, so this reads
 * google_analytics_metrics directly on every call — still applying the same
 * 7-day rolling window as computePerfSeries for visual consistency with the
 * chart's other line.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { subDays, format, eachDayOfInterval, parseISO } from 'date-fns';
import { nzToday } from '@/lib/timezone';
import type { PerfSeriesPoint } from './perf-series';

export interface GA4PerfSeriesOptions {
  metric: string;
  /** Client's local "today"; defaults to server now. */
  today?: Date;
  /** Number of chart points (days) to return, ending today. Defaults to 30. */
  windowDays?: number;
}

// Percentages already computed daily by GA4 — a 7-day rolling *average* of
// these (not a sum) mirrors what the KPI tiles show; everything else
// (sessions, totalUsers, conversions, screenPageViews) is a count and rolls
// up as a 7-day sum, matching computePerfSeries's rolling-sum treatment.
const RATE_METRICS = new Set(['engagementRate', 'bounceRate']);

export async function computeGA4PerfSeries(
  supabase: SupabaseClient,
  clientId: string,
  options: GA4PerfSeriesOptions,
): Promise<{ series: PerfSeriesPoint[] }> {
  const { metric } = options;
  const today = options.today ?? parseISO(nzToday());
  const windowDays = options.windowDays ?? 30;

  const todayStr = format(today, 'yyyy-MM-dd');
  const chartWindowStart = format(subDays(today, windowDays - 1), 'yyyy-MM-dd');
  const rawWindowStart = format(subDays(today, windowDays - 1 + 6), 'yyyy-MM-dd');

  const { data: rows } = await supabase
    .from('google_analytics_metrics')
    .select('date, metric_value')
    .eq('client_id', clientId)
    .eq('metric_name', metric)
    .gte('date', rawWindowStart)
    .lte('date', todayStr)
    .order('date', { ascending: true });

  const byDate = new Map<string, number>();
  for (const r of rows ?? []) byDate.set(r.date as string, Number(r.metric_value || 0));

  const chartDates = eachDayOfInterval({ start: parseISO(chartWindowStart), end: parseISO(todayStr) })
    .map(d => format(d, 'yyyy-MM-dd'));

  const isRate = RATE_METRICS.has(metric);
  const series: PerfSeriesPoint[] = [];
  for (const chartDate of chartDates) {
    const base = parseISO(chartDate);
    let sum = 0;
    let daysWithData = 0;
    for (let d = 0; d < 7; d++) {
      const value = byDate.get(format(subDays(base, d), 'yyyy-MM-dd'));
      if (value != null) { sum += value; daysWithData++; }
    }
    if (daysWithData === 0) continue;
    const value = isRate ? (sum / daysWithData) * 100 : sum;
    if (isFinite(value)) series.push({ date: chartDate, value });
  }

  return { series };
}
