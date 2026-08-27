'use client';

/**
 * Shared recharts styling primitives for the Client Hub — keeps every chart
 * (existing sections, trend builder, demographics) looking like one system
 * instead of recharts' generic default look, matching the warm-neutral
 * palette in tokens.ts.
 */

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, AreaChart, Area,
} from 'recharts';
import { COLOR, FONT_HEAD, FONT_BODY, fmtDate } from './tokens';

export const axisTickStyle = { fontFamily: FONT_BODY, fontSize: 11.5, fill: COLOR.muted };
export const gridProps = { stroke: COLOR.divider, vertical: false };
export const axisLineProps = { stroke: COLOR.cardBorder };

export interface HubTooltipPayloadEntry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

export interface HubTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: HubTooltipPayloadEntry[];
  /** Formats a series value for display; defaults to raw string. */
  formatValue?: (entry: HubTooltipPayloadEntry) => string;
  /** Formats the label (usually a date); defaults to fmtDate when label looks like an ISO date. */
  formatLabel?: (label: string | number) => string;
}

export function HubTooltip({ active, label, payload, formatValue, formatLabel }: HubTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const labelText = label == null ? '' : (formatLabel ? formatLabel(label) : defaultLabel(label));
  // A single series can be drawn as a paired fill-only Area + stroke-only Line (same
  // dataKey) so the area sits behind bars while the line stays on top; Recharts reports
  // both as separate tooltip entries, so collapse duplicates down to the named one.
  const deduped = Array.from(
    payload.reduce((byKey, entry) => {
      const key = String(entry.dataKey ?? entry.name);
      const existing = byKey.get(key);
      if (!existing || (!existing.name && entry.name)) byKey.set(key, entry);
      return byKey;
    }, new Map<string, HubTooltipPayloadEntry>()).values()
  );
  return (
    <div
      style={{
        background: COLOR.card,
        border: `1px solid ${COLOR.cardBorder}`,
        borderRadius: 6,
        padding: '10px 12px',
        fontFamily: FONT_BODY,
        fontSize: 12.5,
        boxShadow: '0 4px 16px rgba(28,25,23,0.08)',
      }}
    >
      {labelText && <div style={{ color: COLOR.muted, marginBottom: 6, fontSize: 11.5 }}>{labelText}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {deduped.map((entry, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: entry.color, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: COLOR.mutedSecondary }}>{entry.name}</span>
            <span style={{ fontWeight: 600, marginLeft: 'auto' }}>{formatValue ? formatValue(entry) : String(entry.value ?? '')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function defaultLabel(label: string | number): string {
  const str = String(label);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return fmtDate(str);
  return str;
}

export interface HubLegendEntry {
  label: string;
  color: string;
  /** 'line' draws a short segment swatch, 'swatch' draws a small square (default). */
  kind?: 'line' | 'swatch';
}

export function HubLegend({ entries }: { entries: HubLegendEntry[] }) {
  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
      {entries.map((e, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: COLOR.mutedSecondary }}>
          {e.kind === 'line' ? (
            <span style={{ width: 14, height: 2, background: e.color, display: 'inline-block' }} />
          ) : (
            <span style={{ width: 10, height: 10, background: e.color, display: 'inline-block', borderRadius: 2 }} />
          )}
          {e.label}
        </div>
      ))}
    </div>
  );
}

/** Palette for series that don't already have a semantic color (e.g. channelColor). */
export const SERIES_COLORS = [COLOR.accent, '#5B6B4E', '#6B645C', COLOR.goodBright, COLOR.caution] as const;

// ── Horizontal bar chart ─────────────────────────────────────────────────────

export interface HorizontalBarChartProps<T> {
  data: T[];
  labelKey: keyof T;
  valueKey: keyof T;
  height: number;
  /** Formats the value for the bar label and tooltip; defaults to a plain number. */
  formatValue?: (v: number) => string;
  labelWidth?: number;
  colors?: readonly string[];
  emptyMessage?: string;
}

/** Generic horizontal bar chart — one bar per row, labeled on the right. Used by demographics and any ranked breakdown (region, device, etc). */
export function HorizontalBarChart<T>({
  data, labelKey, valueKey, height, formatValue = (v) => String(v), labelWidth = 70, colors = SERIES_COLORS, emptyMessage = 'No data yet.',
}: HorizontalBarChartProps<T>) {
  if (data.length === 0) return <div style={{ fontSize: 13, color: COLOR.muted, padding: '20px 0', textAlign: 'center' }}>{emptyMessage}</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      {/* recharts' data prop is loosely typed; the public API above stays type-safe via keyof T */}
      <BarChart data={data as unknown as Record<string, unknown>[]} layout="vertical" margin={{ top: 0, right: 44, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridProps} horizontal={false} />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey={labelKey as string} tick={axisTickStyle} axisLine={false} tickLine={false} width={labelWidth} />
        <Tooltip content={<HubTooltip formatValue={(entry) => formatValue(Number(entry.value ?? 0))} />} cursor={{ fill: COLOR.divider }} />
        <Bar dataKey={valueKey as string} name="Value" radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: 'right', formatter: (v: number) => formatValue(v), fill: COLOR.ink, fontFamily: FONT_HEAD, fontSize: 12 }}>
          {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Donut chart ──────────────────────────────────────────────────────────────

export interface HubDonutDatum {
  name: string;
  value: number;
}

export interface HubDonutProps {
  data: HubDonutDatum[];
  /** Assigns a color per slice by index; defaults to cycling SERIES_COLORS. */
  colorFn?: (d: HubDonutDatum, i: number) => string;
  size?: number;
  formatValue?: (v: number) => string;
  /** Optional content rendered in the donut's center (e.g. a total). */
  centerLabel?: string;
  centerValue?: string;
}

/** Generic donut chart with an optional center label — used for spend-by-channel, top-ads-by-engagement, device/day-of-week breakdowns, etc. */
export function HubDonut({ data, colorFn, size = 150, formatValue = (v) => String(v), centerLabel, centerValue }: HubDonutProps) {
  const resolveColor = colorFn ?? ((_: HubDonutDatum, i: number) => SERIES_COLORS[i % SERIES_COLORS.length]);
  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data as unknown as Record<string, unknown>[]} dataKey="value" nameKey="name" innerRadius={size * 0.327} outerRadius={size * 0.5} startAngle={90} endAngle={-270} stroke="none">
            {data.map((d, i) => <Cell key={i} fill={resolveColor(d, i)} />)}
          </Pie>
          <Tooltip content={<HubTooltip formatValue={(entry) => formatValue(Number(entry.value ?? 0))} />} />
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel || centerValue) && (
        <div style={{ position: 'absolute', inset: size * 0.173, borderRadius: '50%', pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {centerValue && <div style={{ fontFamily: FONT_HEAD, fontSize: 19 }}>{centerValue}</div>}
          {centerLabel && <div style={{ fontSize: 10.5, color: COLOR.muted }}>{centerLabel}</div>}
        </div>
      )}
    </div>
  );
}

// ── Sparkline ────────────────────────────────────────────────────────────────

export interface SparklineProps<T> {
  data: T[];
  dataKey: keyof T;
  color?: string;
  height?: number;
}

/** Minimal inline trend chart with no axes/grid/tooltip chrome — used in compact KPI tiles. */
export function Sparkline<T>({ data, dataKey, color = COLOR.accent, height = 32 }: SparklineProps<T>) {
  if (data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data as unknown as Record<string, unknown>[]} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Area
          type="monotone"
          dataKey={dataKey as string}
          stroke={color}
          strokeWidth={1.5}
          fill={color}
          fillOpacity={0.12}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
