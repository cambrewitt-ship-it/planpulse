'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { COLOR, FONT_BODY, fmtCompact } from './tokens';
import { HubTooltip, HorizontalBarChart, SERIES_COLORS, axisTickStyle, gridProps, axisLineProps } from './chart-kit';
import { GA4_DIMENSIONS, DEFAULT_DIMENSION } from '@/lib/client-hub/ga4-constants';
import type { GA4DimensionDailyRow } from '@/lib/client-hub/get-ga4-report';

export interface GA4DimensionExplorerProps {
  clientId: string;
  token?: string;
  period: { start: string; end: string };
}

interface DimensionTotals {
  dimensionValue: string;
  sessions: number;
  engagedSessions: number;
  engagementRate: number;
  avgEngagementTime: number;
  eventsPerSession: number;
  eventCount: number;
  conversions: number;
}

type SortKey = keyof DimensionTotals;
type NumericSortKey = Exclude<SortKey, 'dimensionValue'>;

const COLUMNS: { key: NumericSortKey; label: string; format: (v: number) => string }[] = [
  { key: 'sessions', label: 'Sessions', format: (v) => fmtCompact(v) },
  { key: 'engagedSessions', label: 'Engaged sessions', format: (v) => fmtCompact(v) },
  { key: 'engagementRate', label: 'Engagement rate', format: (v) => `${(v * 100).toFixed(1)}%` },
  { key: 'avgEngagementTime', label: 'Avg. engagement time', format: formatDuration },
  { key: 'eventsPerSession', label: 'Events per session', format: (v) => v.toFixed(2) },
  { key: 'eventCount', label: 'Event count', format: (v) => fmtCompact(v) },
  { key: 'conversions', label: 'Key events', format: (v) => fmtCompact(v) },
];

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

function aggregateByDimensionValue(rows: GA4DimensionDailyRow[]): DimensionTotals[] {
  const byValue = new Map<string, { sessions: number; engagedSessions: number; eventCount: number; conversions: number; engagementDuration: number }>();
  for (const r of rows) {
    const cur = byValue.get(r.dimensionValue) ?? { sessions: 0, engagedSessions: 0, eventCount: 0, conversions: 0, engagementDuration: 0 };
    cur.sessions += r.sessions;
    cur.engagedSessions += r.engagedSessions;
    cur.eventCount += r.eventCount;
    cur.conversions += r.conversions;
    cur.engagementDuration += r.engagementDuration;
    byValue.set(r.dimensionValue, cur);
  }
  return [...byValue.entries()].map(([dimensionValue, v]) => ({
    dimensionValue,
    sessions: v.sessions,
    engagedSessions: v.engagedSessions,
    engagementRate: v.sessions > 0 ? v.engagedSessions / v.sessions : 0,
    avgEngagementTime: v.sessions > 0 ? v.engagementDuration / v.sessions : 0,
    eventsPerSession: v.sessions > 0 ? v.eventCount / v.sessions : 0,
    eventCount: v.eventCount,
    conversions: v.conversions,
  }));
}

const selectStyle: React.CSSProperties = {
  fontFamily: FONT_BODY, fontSize: 12.5, color: COLOR.ink, background: COLOR.card,
  border: `1px solid ${COLOR.cardBorder}`, borderRadius: 5, padding: '6px 8px', cursor: 'pointer',
};

const filterInputStyle: React.CSSProperties = {
  fontFamily: FONT_BODY, fontSize: 12.5, color: COLOR.ink, background: COLOR.card,
  border: `1px solid ${COLOR.cardBorder}`, borderRadius: 5, padding: '6px 10px', width: 180,
};

export function GA4DimensionExplorer({ clientId, token, period }: GA4DimensionExplorerProps) {
  const [dimension, setDimension] = useState(DEFAULT_DIMENSION);
  const [rows, setRows] = useState<GA4DimensionDailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('sessions');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ dimension, start: period.start, end: period.end });
    const url = token ? `/api/hub/${token}/ga4-dimension-breakdown?${qs}` : `/api/clients/${clientId}/hub/ga4-dimension-breakdown?${qs}`;
    fetch(url)
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((json) => {
        if (cancelled) return;
        setRows(json.rows ?? []);
        setChecked(new Set());
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientId, token, dimension, period.start, period.end]);

  const totals = useMemo(() => aggregateByDimensionValue(rows), [rows]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...totals].sort((a, b) => {
      if (sortKey === 'dimensionValue') return a.dimensionValue.localeCompare(b.dimensionValue) * dir;
      return ((a[sortKey] as number) - (b[sortKey] as number)) * dir;
    });
  }, [totals, sortKey, sortDir]);

  const filtered = useMemo(
    () => filterText.trim() ? sorted.filter((r) => r.dimensionValue.toLowerCase().includes(filterText.trim().toLowerCase())) : sorted,
    [sorted, filterText],
  );

  // Default to the top rows by sessions until the viewer checks something themselves.
  const plottedValues = useMemo(
    () => (checked.size > 0 ? [...checked] : sorted.slice(0, 5).map((r) => r.dimensionValue)),
    [checked, sorted],
  );

  const chartData = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    for (const r of rows) {
      if (!plottedValues.includes(r.dimensionValue)) continue;
      const point = byDate.get(r.date) ?? { date: r.date };
      point[r.dimensionValue] = r.sessions;
      byDate.set(r.date, point);
    }
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [rows, plottedValues]);

  const colorFor = useCallback((value: string) => {
    const idx = sorted.findIndex((r) => r.dimensionValue === value);
    return SERIES_COLORS[Math.max(0, idx) % SERIES_COLORS.length];
  }, [sorted]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const toggleChecked = (value: string) => {
    setChecked((prev) => {
      const next = new Set(prev.size > 0 ? prev : sorted.slice(0, 5).map((r) => r.dimensionValue));
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>Sessions by {GA4_DIMENSIONS.find((d) => d.key === dimension)?.label ?? dimension}</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={dimension} onChange={(e) => setDimension(e.target.value)} style={selectStyle}>
            {GA4_DIMENSIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
          <input
            type="text" placeholder="Search…" value={filterText} onChange={(e) => setFilterText(e.target.value)}
            style={filterInputStyle}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: COLOR.muted, padding: '20px 0' }}>Loading…</div>
      ) : totals.length === 0 ? (
        <div style={{ fontSize: 13, color: COLOR.muted, padding: '20px 0', textAlign: 'center' }}>
          No data yet for this dimension — click &ldquo;Sync breakdown data&rdquo; above, or check back after the next sync.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 18 }}>
            <div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 8 }}>
                {plottedValues.map((v) => (
                  <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: COLOR.mutedSecondary }}>
                    <span style={{ width: 10, height: 10, background: colorFor(v), display: 'inline-block', borderRadius: 2 }} />
                    {v}
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="date" tick={axisTickStyle} axisLine={axisLineProps} tickLine={false} tickFormatter={(d: string) => d.slice(5)} />
                  <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} width={44} tickFormatter={fmtCompact} />
                  <Tooltip content={<HubTooltip formatValue={(entry) => Number(entry.value ?? 0).toLocaleString('en-US')} />} />
                  {plottedValues.map((v) => (
                    <Line key={v} dataKey={v} name={v} stroke={colorFor(v)} strokeWidth={1.6} dot={false} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div style={{ fontSize: 11.5, color: COLOR.muted, marginBottom: 8 }}>Ranked by sessions</div>
              <HorizontalBarChart
                data={sorted.slice(0, 8)}
                labelKey="dimensionValue"
                valueKey="sessions"
                height={Math.max(140, Math.min(8, sorted.length) * 26)}
                formatValue={(v) => v.toLocaleString('en-US')}
                labelWidth={110}
              />
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `28px 1.8fr repeat(${COLUMNS.length}, 1fr)`, minWidth: 900, padding: '8px 4px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: COLOR.muted, borderBottom: `1px solid ${COLOR.cardBorder}` }}>
              <div />
              <button onClick={() => toggleSort('dimensionValue')} style={headerButtonStyle}>
                {GA4_DIMENSIONS.find((d) => d.key === dimension)?.label ?? dimension}{sortKey === 'dimensionValue' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </button>
              {COLUMNS.map((c) => (
                <button key={c.key} onClick={() => toggleSort(c.key)} style={headerButtonStyle}>
                  {c.label}{sortKey === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </button>
              ))}
            </div>
            {filtered.map((r) => (
              <div key={r.dimensionValue} style={{ display: 'grid', gridTemplateColumns: `28px 1.8fr repeat(${COLUMNS.length}, 1fr)`, minWidth: 900, padding: '9px 4px', borderBottom: `1px solid ${COLOR.divider}`, fontSize: 12.5, alignItems: 'center' }}>
                <input type="checkbox" checked={plottedValues.includes(r.dimensionValue)} onChange={() => toggleChecked(r.dimensionValue)} />
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.dimensionValue}</div>
                {COLUMNS.map((c) => <div key={c.key}>{c.format(r[c.key])}</div>)}
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '16px 4px', fontSize: 13, color: COLOR.muted }}>No rows match &ldquo;{filterText}&rdquo;.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const headerButtonStyle: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, margin: 0, font: 'inherit', color: 'inherit',
  textTransform: 'inherit', letterSpacing: 'inherit', cursor: 'pointer', textAlign: 'left',
};
