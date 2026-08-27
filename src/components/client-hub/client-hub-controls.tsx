'use client';

import { useEffect, useState } from 'react';
import { COLOR, FONT_BODY } from './tokens';
import type { ConversionPlatform } from '@/lib/client-hub/get-hub-data';
import { nzToday, nzDateKeyOffset, nzStartOfMonth, nzStartOfQuarter } from '@/lib/timezone';

export type DateRange = { start: string; end: string };

const PRESETS: Array<{ key: string; label: string; range: () => DateRange | null }> = [
  { key: 'campaign', label: 'Campaign to date', range: () => null },
  { key: '7d', label: 'Last 7 days', range: () => ({ start: nzDateKeyOffset(-6), end: nzToday() }) },
  { key: '30d', label: 'Last 30 days', range: () => ({ start: nzDateKeyOffset(-29), end: nzToday() }) },
  { key: '90d', label: 'Last 90 days', range: () => ({ start: nzDateKeyOffset(-89), end: nzToday() }) },
  {
    key: 'mtd', label: 'Month to date',
    range: () => ({ start: nzStartOfMonth(), end: nzToday() }),
  },
  {
    key: 'qtd', label: 'Quarter to date',
    range: () => ({ start: nzStartOfQuarter(), end: nzToday() }),
  },
  { key: 'custom', label: 'Custom range', range: () => null },
];

const selectStyle: React.CSSProperties = {
  fontFamily: FONT_BODY, fontSize: 13, color: COLOR.ink, background: COLOR.card,
  border: `1px solid ${COLOR.cardBorder}`, borderRadius: 5, padding: '7px 10px', cursor: 'pointer',
};

const dateInputStyle: React.CSSProperties = {
  fontFamily: FONT_BODY, fontSize: 12.5, color: COLOR.ink, background: COLOR.card,
  border: `1px solid ${COLOR.cardBorder}`, borderRadius: 5, padding: '6px 8px',
};

export function TimeframeSelector({ onChange }: { onChange: (range: DateRange | null) => void }) {
  const [selected, setSelected] = useState('campaign');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const handlePresetChange = (key: string) => {
    setSelected(key);
    if (key === 'custom') return;
    const preset = PRESETS.find(p => p.key === key);
    onChange(preset ? preset.range() : null);
  };

  const handleCustomChange = (start: string, end: string) => {
    setCustomStart(start);
    setCustomEnd(end);
    if (start && end) onChange({ start, end });
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <select value={selected} onChange={e => handlePresetChange(e.target.value)} style={selectStyle}>
        {PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
      {selected === 'custom' && (
        <>
          <input type="date" value={customStart} max={customEnd || undefined} onChange={e => handleCustomChange(e.target.value, customEnd)} style={dateInputStyle} />
          <span style={{ fontSize: 12, color: COLOR.muted }}>to</span>
          <input type="date" value={customEnd} min={customStart || undefined} onChange={e => handleCustomChange(customStart, e.target.value)} style={dateInputStyle} />
        </>
      )}
    </div>
  );
}

export function RefreshDataButton({ isRefreshing, onClick }: { isRefreshing: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isRefreshing}
      title="Refresh ad spend + analytics data now (normally refreshes automatically every 6 hours)"
      style={{
        fontFamily: FONT_BODY, fontSize: 12.5, color: COLOR.muted, background: 'transparent',
        border: 'none', padding: 0, cursor: isRefreshing ? 'default' : 'pointer',
        textDecoration: 'underline', textUnderlineOffset: 2,
        opacity: isRefreshing ? 0.6 : 1,
      }}
    >
      {isRefreshing ? 'Refreshing…' : 'Refresh data'}
    </button>
  );
}

function prettifyActionType(type: string): string {
  return type.replace(/^offsite_conversion\.fb_pixel_/, '').replace(/[._]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

const CONVERSION_PLATFORMS: Array<{ key: ConversionPlatform; label: string }> = [
  { key: 'meta-ads', label: 'Meta Ads' },
  { key: 'google-ads', label: 'Google Ads' },
  { key: 'ga4', label: 'GA4' },
];

const LIST_EVENTS_ENDPOINT: Record<ConversionPlatform, string> = {
  'meta-ads': '/api/ads/meta/list-conversion-events',
  'google-ads': '/api/ads/google-ads/list-conversion-events',
  'ga4': '/api/ads/google-analytics/list-events',
};

const AUTO_OPTION_LABEL: Record<ConversionPlatform, string> = {
  'meta-ads': 'Auto-detect',
  'google-ads': 'All conversions',
  'ga4': 'Conversions (default)',
};

interface ConversionEvent { name: string; count: number }

function useConversionEvents(clientId: string, platform: ConversionPlatform): ConversionEvent[] {
  const [events, setEvents] = useState<ConversionEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(LIST_EVENTS_ENDPOINT[platform], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    })
      .then(res => res.ok ? res.json() : { events: [] })
      .then(json => { if (!cancelled) setEvents(json.events ?? []); })
      .catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, [clientId, platform]);

  return events;
}

export interface ConversionSelectorProps {
  clientId: string;
  platform: ConversionPlatform;
  actionType: string | null;
  label: string;
  onChange: (platform: ConversionPlatform, actionType: string | null, label: string) => void;
}

export function ConversionSelector({ clientId, platform, actionType, label, onChange }: ConversionSelectorProps) {
  const [labelDraft, setLabelDraft] = useState(label);
  const events = useConversionEvents(clientId, platform);

  const commitLabel = () => {
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== label) onChange(platform, actionType, trimmed);
    else setLabelDraft(label);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11.5, color: COLOR.muted }}>Conversion metric from</span>
      <select
        value={platform}
        onChange={e => onChange(e.target.value as ConversionPlatform, null, label)}
        style={selectStyle}
      >
        {CONVERSION_PLATFORMS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
      <select
        value={actionType ?? ''}
        onChange={e => onChange(platform, e.target.value || null, label)}
        style={selectStyle}
      >
        <option value="">{AUTO_OPTION_LABEL[platform]}</option>
        {events.map(ev => (
          <option key={ev.name} value={ev.name}>
            {platform === 'meta-ads' ? prettifyActionType(ev.name) : ev.name}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={labelDraft}
        onChange={e => setLabelDraft(e.target.value)}
        onBlur={commitLabel}
        placeholder="Label"
        style={{ ...dateInputStyle, width: 100 }}
      />
    </div>
  );
}
