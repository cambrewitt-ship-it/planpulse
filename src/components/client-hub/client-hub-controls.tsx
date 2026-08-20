'use client';

import { useState } from 'react';
import { COLOR, FONT_BODY } from './tokens';

export type DateRange = { start: string; end: string };

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

const PRESETS: Array<{ key: string; label: string; range: () => DateRange | null }> = [
  { key: 'campaign', label: 'Campaign to date', range: () => null },
  { key: '7d', label: 'Last 7 days', range: () => ({ start: isoDate(new Date(Date.now() - 6 * 86400000)), end: isoDate(new Date()) }) },
  { key: '30d', label: 'Last 30 days', range: () => ({ start: isoDate(new Date(Date.now() - 29 * 86400000)), end: isoDate(new Date()) }) },
  { key: '90d', label: 'Last 90 days', range: () => ({ start: isoDate(new Date(Date.now() - 89 * 86400000)), end: isoDate(new Date()) }) },
  {
    key: 'mtd', label: 'Month to date',
    range: () => { const n = new Date(); return { start: isoDate(new Date(n.getFullYear(), n.getMonth(), 1)), end: isoDate(n) }; },
  },
  {
    key: 'qtd', label: 'Quarter to date',
    range: () => { const n = new Date(); const q = Math.floor(n.getMonth() / 3); return { start: isoDate(new Date(n.getFullYear(), q * 3, 1)), end: isoDate(n) }; },
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

function prettifyActionType(type: string): string {
  return type.replace(/^offsite_conversion\.fb_pixel_/, '').replace(/[._]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export interface ConversionSelectorProps {
  actionType: string | null;
  label: string;
  available: string[];
  onChange: (actionType: string | null, label: string) => void;
}

export function ConversionSelector({ actionType, label, available, onChange }: ConversionSelectorProps) {
  const [labelDraft, setLabelDraft] = useState(label);

  const commitLabel = () => {
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== label) onChange(actionType, trimmed);
    else setLabelDraft(label);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11.5, color: COLOR.muted }}>Conversion event</span>
      <select
        value={actionType ?? ''}
        onChange={e => onChange(e.target.value || null, label)}
        style={selectStyle}
      >
        <option value="">Auto-detect</option>
        {available.map(type => <option key={type} value={type}>{prettifyActionType(type)}</option>)}
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
