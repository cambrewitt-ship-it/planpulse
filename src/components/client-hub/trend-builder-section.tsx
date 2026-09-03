'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, Bar, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { COLOR, cardStyle, sectionTitleStyle, fmtMoney, fmtCompact } from './tokens';
import { HubTooltip, HubLegend, axisTickStyle, gridProps, axisLineProps } from './chart-kit';
import { TrendBuilderEditor } from './trend-builder-editor';
import { DEFAULT_TREND_WIDGET, type TrendWidgetConfig } from '@/lib/client-hub/trend-widget';

const METRIC_LABELS: Record<string, string> = {
  spend: 'Spend', impressions: 'Impressions', clicks: 'Clicks', reach: 'Reach',
  ctr: 'CTR', cpc: 'CPC', cpm: 'CPM', frequency: 'Frequency', conversions: 'Conversions',
  sessions: 'Sessions', totalUsers: 'Users', engagementRate: 'Engagement rate',
  bounceRate: 'Bounce rate', screenPageViews: 'Pageviews',
};

const PERCENT_METRICS = new Set(['ctr', 'engagementRate', 'bounceRate']);
const CURRENCY_METRICS = new Set(['spend', 'cpc', 'cpm']);

function formatMetricValue(metric: string, v: number): string {
  if (CURRENCY_METRICS.has(metric)) return fmtMoney(v);
  if (PERCENT_METRICS.has(metric)) return `${v.toFixed(2)}%`;
  if (metric === 'frequency') return v.toFixed(2);
  return fmtCompact(v);
}

interface SeriesPoint { date: string; value: number }

function mergeSeries(seriesA: SeriesPoint[], seriesB: SeriesPoint[]): Array<{ date: string; valueA: number | null; valueB: number | null }> {
  const map = new Map<string, { valueA: number | null; valueB: number | null }>();
  for (const p of seriesA) map.set(p.date, { valueA: p.value, valueB: null });
  for (const p of seriesB) {
    const existing = map.get(p.date);
    if (existing) existing.valueB = p.value;
    else map.set(p.date, { valueA: null, valueB: p.value });
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }));
}

function tickInterval(length: number): number {
  return Math.max(0, Math.ceil(length / 10) - 1);
}

export interface TrendBuilderSectionProps {
  clientId: string;
  /** When set, this is the public token-gated view — config/series are read-only, sourced from the share link. */
  token?: string;
  editable: boolean;
}

export function TrendBuilderSection({ clientId, token, editable }: TrendBuilderSectionProps) {
  const [config, setConfig] = useState<TrendWidgetConfig>(DEFAULT_TREND_WIDGET);
  const [seriesA, setSeriesA] = useState<SeriesPoint[]>([]);
  const [seriesB, setSeriesB] = useState<SeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSeriesFor = useCallback(async (cfg: TrendWidgetConfig) => {
    const url = token
      ? `/api/hub/${token}/trend-series`
      : `/api/clients/${clientId}/hub/trend-series?${new URLSearchParams({
          metricA: cfg.metricA, platformA: cfg.platformA, eventA: cfg.eventA ?? '',
          metricB: cfg.metricB, platformB: cfg.platformB, eventB: cfg.eventB ?? '',
          period: cfg.period,
        })}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `Couldn't load performance data (${res.status}).`);
      return;
    }
    const json = await res.json();
    setSeriesA(json.seriesA ?? []);
    setSeriesB(json.seriesB ?? []);
    if (token && json.trendWidget) setConfig(json.trendWidget);
    setError(null);
  }, [clientId, token]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (token) {
        await loadSeriesFor(DEFAULT_TREND_WIDGET);
      } else {
        const res = await fetch(`/api/clients/${clientId}/hub/trend-widget`);
        if (res.ok) {
          const json = await res.json();
          setConfig(json.trendWidget);
          await loadSeriesFor(json.trendWidget);
        } else {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? `Couldn't load trend settings (${res.status}).`);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [clientId, token, loadSeriesFor]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleConfigChange = useCallback(async (patch: Partial<TrendWidgetConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    try {
      const res = await fetch(`/api/clients/${clientId}/hub/trend-widget`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const json = await res.json();
        setConfig(json.trendWidget);
        await loadSeriesFor(json.trendWidget);
      }
    } catch { /* keep optimistic local value */ }
  }, [clientId, config, loadSeriesFor]);

  const chartData = useMemo(() => mergeSeries(seriesA, seriesB), [seriesA, seriesB]);
  const labelA = METRIC_LABELS[config.metricA] ?? config.metricA;
  const labelB = METRIC_LABELS[config.metricB] ?? config.metricB;

  return (
    <div>
      <h2 style={sectionTitleStyle}>Trend builder</h2>
      {editable && <TrendBuilderEditor clientId={clientId} config={config} onChange={handleConfigChange} />}
      <div style={{ ...cardStyle, padding: '22px 24px' }}>
        <div style={{ marginBottom: 14 }}>
          <HubLegend entries={[
            { label: labelA, color: COLOR.accent, kind: config.chartType === 'line_bar' ? 'swatch' : 'line' },
            { label: labelB, color: '#5B6B4E', kind: 'line' },
          ]} />
        </div>
        {loading ? (
          <div style={{ fontSize: 13, color: COLOR.muted, padding: '60px 0', textAlign: 'center' }}>Loading trend data…</div>
        ) : error ? (
          <div style={{ fontSize: 13, color: COLOR.accent, padding: '60px 0', textAlign: 'center' }}>Couldn&rsquo;t load performance data: {error}</div>
        ) : chartData.length === 0 ? (
          <div style={{ fontSize: 13, color: COLOR.muted, padding: '60px 0', textAlign: 'center' }}>No performance data yet for this period.</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="trendGradA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLOR.accent} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={COLOR.accent} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="trendGradB" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5B6B4E" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#5B6B4E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="date" tick={axisTickStyle} axisLine={axisLineProps} tickLine={false} interval={tickInterval(chartData.length)} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis yAxisId="A" tick={axisTickStyle} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => formatMetricValue(config.metricA, v)} />
              <YAxis yAxisId="B" orientation="right" tick={axisTickStyle} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => formatMetricValue(config.metricB, v)} />
              <Tooltip
                content={
                  <HubTooltip
                    formatValue={(entry) => formatMetricValue(entry.dataKey === 'valueA' ? config.metricA : config.metricB, Number(entry.value ?? 0))}
                  />
                }
              />
              {config.chartType === 'line_bar' ? (
                <>
                  <Area yAxisId="B" dataKey="valueB" stroke="none" fill="url(#trendGradB)" connectNulls isAnimationActive={false} />
                  <Bar yAxisId="A" dataKey="valueA" name={labelA} fill={COLOR.accent} radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Line yAxisId="B" dataKey="valueB" name={labelB} stroke="#5B6B4E" strokeWidth={2.5} dot={false} connectNulls />
                </>
              ) : (
                <>
                  <Area yAxisId="A" dataKey="valueA" stroke="none" fill="url(#trendGradA)" connectNulls isAnimationActive={false} />
                  <Area yAxisId="B" dataKey="valueB" stroke="none" fill="url(#trendGradB)" connectNulls isAnimationActive={false} />
                  <Line yAxisId="A" dataKey="valueA" name={labelA} stroke={COLOR.accent} strokeWidth={1.6} dot={false} connectNulls />
                  <Line yAxisId="B" dataKey="valueB" name={labelB} stroke="#5B6B4E" strokeWidth={1.6} dot={false} connectNulls />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
