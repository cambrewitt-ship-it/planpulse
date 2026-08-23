'use client';

/**
 * Shared recharts styling primitives for the Client Hub — keeps every chart
 * (existing sections, trend builder, demographics) looking like one system
 * instead of recharts' generic default look, matching the warm-neutral
 * palette in tokens.ts.
 */

import { COLOR, FONT_BODY, fmtDate } from './tokens';

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
