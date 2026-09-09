'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Filter } from 'lucide-react';
import { subDays, format, parseISO } from 'date-fns';
import { COLOR, FONT_HEAD, FONT_BODY, fmtCompact, fmtPct } from './tokens';
import { HubTooltip, axisTickStyle, gridProps, axisLineProps } from './chart-kit';
import { GA4_TREND_METRICS, type GA4MetricOption } from '@/lib/client-hub/ga4-constants';
import type { GA4TrendMetricSeries, GA4TrendPoint } from '@/lib/client-hub/get-ga4-report';
import { getChannelDisplayNameFromPlatform } from '@/lib/utils/channel-pacing';
import { getChannelLogo } from '@/lib/utils/channel-icons';
import { calculateCostPerMetric, type SpendDataPoint, type GA4DataPoint } from '@/lib/api/analytics-data-integration';

// A 7-day rolling cost-per-X value needs 6 days of trailing spend/GA4 data
// behind the first visible chart point, or the line has no value (and so
// doesn't render) until day 7 of the visible window.
const ROLLING_LOOKBACK_DAYS = 6;

export interface GA4EngagementOverviewProps {
  clientId: string;
  token?: string;
  editable: boolean;
  overview: GA4TrendMetricSeries[];
  period: { start: string; end: string };
}

/** Tabs where a "7-day rolling cost per X" line can be overlaid — every GA4 trend metric maps onto ad spend (cost per X / CPA). */
const COST_PER_ELIGIBLE_METRICS = new Set(GA4_TREND_METRICS.map((m) => m.key));

interface EnhancedSpendPoint extends SpendDataPoint {
  channelId: string;
  channelName: string;
}

function fmtCurrency(v: number): string {
  return v >= 100 ? `$${Math.round(v).toLocaleString('en-US')}` : `$${v.toFixed(2)}`;
}

/**
 * Loads ad spend and GA4 daily metrics for the period, extended 6 days into
 * the past (same cache-backed endpoints as the Cost per metric section), and
 * when `metricKey` is eligible, runs it through the same calculateCostPerMetric
 * used there to produce a 7-day rolling cost-per-X value for each date. The
 * lookback extension means the first visible chart point already has a full
 * trailing 7-day window, so the line starts at the left edge of the chart
 * instead of 6 days in.
 */
function useCostPerRolling(
  clientId: string,
  token: string | undefined,
  period: { start: string; end: string },
  metricKey: string | null,
) {
  const [spendData, setSpendData] = useState<EnhancedSpendPoint[]>([]);
  const [ga4Data, setGa4Data] = useState<GA4DataPoint[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const lookbackStart = format(subDays(parseISO(period.start), ROLLING_LOOKBACK_DAYS), 'yyyy-MM-dd');
    const url = token
      ? `/api/hub/${token}/cost-per-metric?start=${lookbackStart}&end=${period.end}`
      : `/api/clients/${clientId}/analytics-data?startDate=${lookbackStart}&endDate=${period.end}`;
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json?.success) { if (!cancelled) { setSpendData([]); setGa4Data([]); } return; }
        const enhanced: EnhancedSpendPoint[] = (json.spendData ?? []).map((p: SpendDataPoint) => ({
          ...p,
          channelId: p.platform && p.accountName ? `${p.platform}_${p.accountName}` : p.platform || 'unknown',
          channelName: getChannelDisplayNameFromPlatform(p.platform),
        }));
        setSpendData(enhanced);
        setGa4Data(json.ga4Data ?? []);
        setSelectedChannels((prev) => {
          if (prev.size > 0) return prev;
          const ids = new Set(enhanced.map((p) => p.channelId));
          return ids.size > 0 ? ids : prev;
        });
      })
      .catch(() => { if (!cancelled) { setSpendData([]); setGa4Data([]); } });
    return () => { cancelled = true; };
  }, [clientId, token, period.start, period.end]);

  const availableChannels = useMemo(() => {
    const map = new Map<string, string>();
    spendData.forEach((p) => { if (p.channelId && p.channelName) map.set(p.channelId, p.channelName); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [spendData]);

  const costByDate = useMemo(() => {
    const map = new Map<string, number | null>();
    if (!metricKey) return map;
    const filtered = spendData.filter((p) => {
      if (selectedChannels.size > 0 && p.channelId && !selectedChannels.has(p.channelId)) return false;
      return true;
    });
    const result = calculateCostPerMetric(filtered, ga4Data, metricKey);
    if (!result.error) result.data.forEach((d) => map.set(d.date, d.cost_7d));
    return map;
  }, [spendData, selectedChannels, ga4Data, metricKey]);

  return { availableChannels, selectedChannels, setSelectedChannels, costByDate };
}

function ChannelFilterDropdown({
  channels, selected, onChange,
}: {
  channels: Array<{ id: string; name: string }>;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ ...selectStyle, display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <Filter size={12} strokeWidth={2} />
        Channels
        {selected.size > 0 && selected.size < channels.length && (
          <span style={{ background: COLOR.accent, color: COLOR.card, borderRadius: 8, padding: '0 5px', fontSize: 10.5, fontWeight: 600 }}>
            {selected.size}
          </span>
        )}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 10, minWidth: 190,
            background: COLOR.card, border: `1px solid ${COLOR.cardBorder}`, borderRadius: 6,
            padding: '8px 10px', boxShadow: '0 4px 16px rgba(28,25,23,0.12)',
          }}
        >
          <div style={{ display: 'flex', gap: 12, marginBottom: 6, paddingBottom: 6, borderBottom: `1px solid ${COLOR.divider}` }}>
            <button type="button" onClick={() => onChange(new Set(channels.map((c) => c.id)))} style={{ background: 'none', border: 'none', padding: 0, fontSize: 11.5, color: COLOR.accent, cursor: 'pointer', fontFamily: FONT_BODY }}>
              Select all
            </button>
            <button type="button" onClick={() => onChange(new Set())} style={{ background: 'none', border: 'none', padding: 0, fontSize: 11.5, color: COLOR.accent, cursor: 'pointer', fontFamily: FONT_BODY }}>
              Deselect all
            </button>
          </div>
          {channels.map((c) => (
            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, padding: '4px 0', cursor: 'pointer', color: COLOR.ink }}>
              <input type="checkbox" checked={selected.has(c.id)} onChange={() => {
                const next = new Set(selected);
                if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                onChange(next);
              }} style={{ margin: 0 }} />
              {getChannelLogo(c.name, 'w-3.5 h-3.5')}
              {c.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

interface DiscoveredEvent { name: string; count: number }

/** Every event name GA4 recorded in the last 30 days for this client's properties — standard/automatically-collected and custom (e.g. GTM-configured) alike; GA4's Data API doesn't distinguish the two. */
function useDiscoveredEvents(clientId: string, enabled: boolean): DiscoveredEvent[] {
  const [events, setEvents] = useState<DiscoveredEvent[]>([]);
  useEffect(() => {
    if (!enabled) { setEvents([]); return; }
    let cancelled = false;
    fetch('/api/ads/google-analytics/list-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    })
      .then((res) => (res.ok ? res.json() : { events: [] }))
      .then((json) => { if (!cancelled) setEvents(json.events ?? []); })
      .catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, [clientId, enabled]);
  return [...events].sort((a, b) => a.name.localeCompare(b.name));
}

interface EventSeries { current: GA4TrendPoint[]; previous: GA4TrendPoint[]; currentTotal: number; previousTotal: number; deltaPct: number | null }

function useEventSeries(clientId: string, eventName: string | null, period: { start: string; end: string }): EventSeries | null {
  const [series, setSeries] = useState<EventSeries | null>(null);
  useEffect(() => {
    if (!eventName) { setSeries(null); return; }
    let cancelled = false;
    setSeries(null);
    const qs = new URLSearchParams({ eventName, start: period.start, end: period.end });
    fetch(`/api/clients/${clientId}/hub/ga4-event-series?${qs}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        const sum = (pts: GA4TrendPoint[]) => pts.reduce((s: number, p: GA4TrendPoint) => s + p.value, 0);
        const currentTotal = sum(json.current ?? []);
        const previousTotal = sum(json.previous ?? []);
        setSeries({
          current: json.current ?? [], previous: json.previous ?? [], currentTotal, previousTotal,
          deltaPct: previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : null,
        });
      })
      .catch(() => { if (!cancelled) setSeries(null); });
    return () => { cancelled = true; };
  }, [clientId, eventName, period.start, period.end]);
  return series;
}

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

function formatByFormat(value: number, format: GA4MetricOption['format']): string {
  switch (format) {
    case 'percent': return fmtPct(value);
    case 'duration': return formatDuration(value);
    case 'compact': return fmtCompact(value);
    default: return Math.round(value).toLocaleString('en-US');
  }
}

function DeltaBadge({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct == null) return <span style={{ fontSize: 12.5, color: COLOR.muted }}>–</span>;
  const positive = deltaPct >= 0;
  return (
    <span style={{ fontSize: 12.5, fontWeight: 600, color: positive ? COLOR.good : COLOR.accent }}>
      {positive ? '▲' : '▼'} {Math.abs(deltaPct).toFixed(1)}%
    </span>
  );
}

const selectStyle: React.CSSProperties = {
  fontFamily: FONT_BODY, fontSize: 12, color: COLOR.ink, background: COLOR.card,
  border: `1px solid ${COLOR.cardBorder}`, borderRadius: 5, padding: '5px 8px', cursor: 'pointer',
};

export function GA4EngagementOverview({ clientId, token, editable, overview, period }: GA4EngagementOverviewProps) {
  const [activeMetric, setActiveMetric] = useState(GA4_TREND_METRICS[0].key);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);

  const activeOption = GA4_TREND_METRICS.find((m) => m.key === activeMetric) ?? GA4_TREND_METRICS[0];
  // Only "Event count" and "Key events" are fundamentally event-based, so only those tabs can be narrowed to one named event — standard or custom (e.g. GTM-configured).
  const showEventPicker = editable && (activeMetric === 'conversions' || activeMetric === 'eventCount');
  const events = useDiscoveredEvents(clientId, showEventPicker);
  const eventSeries = useEventSeries(clientId, showEventPicker ? selectedEvent : null, period);

  const cached = overview.find((o) => o.metric === activeMetric);
  const active = selectedEvent && eventSeries ? eventSeries : cached;

  const showCostLine = COST_PER_ELIGIBLE_METRICS.has(activeMetric);
  const { availableChannels, selectedChannels, setSelectedChannels, costByDate } = useCostPerRolling(
    clientId, token, period, showCostLine ? activeMetric : null,
  );
  const costLineLabel = activeMetric === 'conversions'
    ? 'CPA (7d rolling)'
    : `Cost / ${activeOption.label.toLowerCase()} (7d rolling)`;

  if (!active) return null;

  const chartData = active.current.map((point, i) => ({
    index: i,
    date: point.date,
    current: point.value,
    previous: active.previous[i]?.value ?? null,
    costPer7d: showCostLine ? costByDate.get(point.date) ?? null : null,
  }));
  const hasCostData = showCostLine && chartData.some((d) => d.costPer7d != null);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {GA4_TREND_METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => { setActiveMetric(m.key); setSelectedEvent(null); }}
              style={{
                background: 'none', border: 'none', borderBottom: `2px solid ${m.key === activeMetric ? COLOR.accent : 'transparent'}`,
                color: m.key === activeMetric ? COLOR.ink : COLOR.muted, fontSize: 12.5, fontWeight: m.key === activeMetric ? 600 : 500,
                padding: '4px 8px 8px', cursor: 'pointer', fontFamily: FONT_BODY,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {showEventPicker && (
            <select value={selectedEvent ?? ''} onChange={(e) => setSelectedEvent(e.target.value || null)} style={selectStyle}>
              <option value="">{activeMetric === 'conversions' ? 'All key events' : 'All events'}</option>
              {events.map((ev) => <option key={ev.name} value={ev.name}>{ev.name}</option>)}
            </select>
          )}
          {showCostLine && availableChannels.length > 0 && (
            <ChannelFilterDropdown channels={availableChannels} selected={selectedChannels} onChange={setSelectedChannels} />
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 30, lineHeight: 1 }}>{formatByFormat(active.currentTotal, activeOption.format)}</div>
        <DeltaBadge deltaPct={active.deltaPct} />
        <div style={{ fontSize: 11.5, color: COLOR.muted }}>vs. prior period</div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 18, fontSize: 12, color: COLOR.mutedSecondary }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 2, background: COLOR.accent, display: 'inline-block' }} />
            Current period
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 0, borderTop: `2px dashed ${COLOR.muted}`, display: 'inline-block' }} />
            Previous period
          </div>
          {hasCostData && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 2, background: COLOR.good, display: 'inline-block' }} />
              {costLineLabel}
            </div>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="ga4CurrentGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLOR.accent} stopOpacity={0.28} />
              <stop offset="100%" stopColor={COLOR.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="date" tick={axisTickStyle} axisLine={axisLineProps} tickLine={false}
            tickFormatter={(d: string) => d.slice(5)}
          />
          <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => formatByFormat(v, activeOption.format)} />
          {hasCostData && (
            <YAxis yAxisId="cost" orientation="right" tick={axisTickStyle} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => fmtCurrency(v)} />
          )}
          <Tooltip content={<HubTooltip formatValue={(entry) => entry.dataKey === 'costPer7d' ? fmtCurrency(Number(entry.value ?? 0)) : formatByFormat(Number(entry.value ?? 0), activeOption.format)} />} />
          <Area dataKey="current" stroke="none" fill="url(#ga4CurrentGradient)" isAnimationActive={false} />
          <Line dataKey="current" name="Current period" stroke={COLOR.accent} strokeWidth={1.8} dot={false} />
          <Line dataKey="previous" name="Previous period" stroke={COLOR.muted} strokeWidth={1.4} strokeDasharray="4 3" dot={false} />
          {hasCostData && (
            <Line yAxisId="cost" dataKey="costPer7d" name={costLineLabel} stroke={COLOR.good} strokeWidth={1.6} dot={false} connectNulls />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
