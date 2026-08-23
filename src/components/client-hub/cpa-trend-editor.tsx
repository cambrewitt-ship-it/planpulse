'use client';

import { useEffect, useState } from 'react';
import { COLOR, FONT_HEAD, FONT_BODY } from './tokens';
import { VALID_CPA_PLATFORMS, type CpaTrendConfig } from '@/lib/client-hub/cpa-trend-widget';

const PLATFORM_LABELS: Record<string, string> = {
  all: 'All platforms', 'meta-ads': 'Meta Ads', 'google-ads': 'Google Ads',
};

const LIST_EVENTS_ENDPOINT: Record<string, string> = {
  'meta-ads': '/api/ads/meta/list-conversion-events',
  'google-ads': '/api/ads/google-ads/list-conversion-events',
};

const selectStyle: React.CSSProperties = {
  fontFamily: FONT_BODY, fontSize: 13, color: COLOR.ink, background: COLOR.card,
  border: `1px solid ${COLOR.cardBorder}`, borderRadius: 5, padding: '8px 10px', width: '100%', cursor: 'pointer',
};

const labelStyle: React.CSSProperties = { fontSize: 11.5, color: COLOR.muted, marginBottom: 6 };

function GearIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function CpaTrendGearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="CPA trend settings"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30, borderRadius: '50%', border: `1px solid ${COLOR.cardBorder}`,
        background: COLOR.card, color: COLOR.muted, cursor: 'pointer', flexShrink: 0,
      }}
    >
      <GearIcon size={15} />
    </button>
  );
}

interface ConversionEvent { name: string; count: number }

function useConversionEvents(clientId: string, platform: string, enabled: boolean): ConversionEvent[] {
  const [events, setEvents] = useState<ConversionEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    const endpoint = LIST_EVENTS_ENDPOINT[platform];
    (async () => {
      if (!enabled || !endpoint) {
        if (!cancelled) setEvents([]);
        return;
      }
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId }),
        });
        const json = res.ok ? await res.json() : { events: [] };
        if (!cancelled) setEvents(json.events ?? []);
      } catch {
        if (!cancelled) setEvents([]);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId, platform, enabled]);

  return events;
}

export interface CpaTrendModalProps {
  clientId: string;
  config: CpaTrendConfig;
  onSave: (patch: Partial<CpaTrendConfig>) => void;
  onClose: () => void;
}

export function CpaTrendModal({ clientId, config, onSave, onClose }: CpaTrendModalProps) {
  const [platform, setPlatform] = useState(config.platform);
  const [event, setEvent] = useState<string | null>(config.event);
  const events = useConversionEvents(clientId, platform, platform !== 'all');

  const handleSave = () => {
    onSave({ platform, event: platform === 'all' ? null : event });
    onClose();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(28,25,23,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, fontFamily: FONT_BODY }}
      onClick={onClose}
    >
      <div style={{ background: COLOR.bg, borderRadius: 8, padding: 32, width: 380, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 22, marginBottom: 6 }}>CPA trend settings</div>
        <div style={{ fontSize: 13.5, color: COLOR.mutedSecondary, marginBottom: 22, lineHeight: 1.5 }}>
          Choose which conversions feed the CPA calculation for this chart.
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={labelStyle}>Platform</div>
          <select
            value={platform}
            onChange={e => { setPlatform(e.target.value as CpaTrendConfig['platform']); setEvent(null); }}
            style={selectStyle}
          >
            {VALID_CPA_PLATFORMS.map(p => <option key={p} value={p}>{PLATFORM_LABELS[p] ?? p}</option>)}
          </select>
        </div>

        {platform !== 'all' && (
          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>Conversion event</div>
            <select value={event ?? ''} onChange={e => setEvent(e.target.value || null)} style={selectStyle}>
              <option value="">All conversions</option>
              {events.map(ev => <option key={ev.name} value={ev.name}>{ev.name}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{ flex: 1, background: 'none', border: `1px solid #D9D2C4`, borderRadius: 6, padding: 11, fontSize: 13.5, cursor: 'pointer', color: COLOR.ink }}>
            Cancel
          </button>
          <button onClick={handleSave} style={{ flex: 1, background: COLOR.ink, color: COLOR.bg, border: 'none', borderRadius: 6, padding: 11, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
