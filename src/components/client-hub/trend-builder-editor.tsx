'use client';

import { useEffect, useState } from 'react';
import { COLOR, FONT_BODY } from './tokens';
import { metricsForPlatform, VALID_PLATFORMS, type TrendWidgetConfig } from '@/lib/client-hub/trend-widget';

const METRIC_LABELS: Record<string, string> = {
  spend: 'Spend', impressions: 'Impressions', clicks: 'Clicks', reach: 'Reach',
  ctr: 'CTR', cpc: 'CPC', cpm: 'CPM', frequency: 'Frequency', conversions: 'Conversions',
  sessions: 'Sessions', totalUsers: 'Users', engagementRate: 'Engagement rate',
  bounceRate: 'Bounce rate', screenPageViews: 'Pageviews',
};

const PLATFORM_LABELS: Record<string, string> = {
  all: 'All platforms', 'meta-ads': 'Meta Ads', 'google-ads': 'Google Ads', 'google-analytics': 'Google Analytics',
};

const LIST_EVENTS_ENDPOINT: Record<string, string> = {
  'meta-ads': '/api/ads/meta/list-conversion-events',
  'google-ads': '/api/ads/google-ads/list-conversion-events',
};

const selectStyle: React.CSSProperties = {
  fontFamily: FONT_BODY, fontSize: 12.5, color: COLOR.ink, background: COLOR.card,
  border: `1px solid ${COLOR.cardBorder}`, borderRadius: 5, padding: '6px 8px', cursor: 'pointer',
};

const labelStyle: React.CSSProperties = { fontSize: 11, color: COLOR.muted, marginBottom: 4 };

export interface TrendBuilderEditorProps {
  clientId: string;
  config: TrendWidgetConfig;
  onChange: (patch: Partial<TrendWidgetConfig>) => void;
}

interface ConversionEvent { name: string; count: number }

function useConversionEvents(clientId: string, platform: string, enabled: boolean): ConversionEvent[] {
  const [events, setEvents] = useState<ConversionEvent[]>([]);

  useEffect(() => {
    if (!enabled) { setEvents([]); return; }
    const endpoint = LIST_EVENTS_ENDPOINT[platform];
    if (!endpoint) { setEvents([]); return; }
    let cancelled = false;
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    })
      .then(res => res.ok ? res.json() : { events: [] })
      .then(json => { if (!cancelled) setEvents(json.events ?? []); })
      .catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, [clientId, platform, enabled]);

  return events;
}

function MetricPicker({ id, clientId, metric, platform, event, onMetricChange, onPlatformChange, onEventChange }: {
  id: string; clientId: string; metric: string; platform: string; event: string | null;
  onMetricChange: (v: string) => void; onPlatformChange: (v: string) => void; onEventChange: (v: string | null) => void;
}) {
  const showEventPicker = metric === 'conversions' && platform !== 'all' && platform !== 'google-analytics';
  const events = useConversionEvents(clientId, platform, showEventPicker);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={labelStyle}>{id}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <select value={metric} onChange={e => onMetricChange(e.target.value)} style={selectStyle}>
          {metricsForPlatform(platform).map(m => <option key={m} value={m}>{METRIC_LABELS[m] ?? m}</option>)}
        </select>
        <select value={platform} onChange={e => onPlatformChange(e.target.value)} style={selectStyle}>
          {VALID_PLATFORMS.map(p => <option key={p} value={p}>{PLATFORM_LABELS[p] ?? p}</option>)}
        </select>
      </div>
      {showEventPicker && (
        <select
          value={event ?? ''}
          onChange={e => onEventChange(e.target.value || null)}
          style={{ ...selectStyle, width: '100%' }}
        >
          <option value="">All conversions</option>
          {events.map(ev => <option key={ev.name} value={ev.name}>{ev.name}</option>)}
        </select>
      )}
    </div>
  );
}

/** Picks a metric to carry over when switching platforms — keeps the current metric if still valid (e.g. 'conversions' is shared between ad and GA4 metric lists), otherwise falls back to the new platform's first metric. */
function metricForPlatformSwitch(currentMetric: string, newPlatform: string): string {
  const options = metricsForPlatform(newPlatform);
  return options.includes(currentMetric) ? currentMetric : options[0];
}

export function TrendBuilderEditor({ clientId, config, onChange }: TrendBuilderEditorProps) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-end',
      background: COLOR.divider, border: `1px solid ${COLOR.cardBorder}`, borderRadius: 6,
      padding: '14px 16px', marginBottom: 16,
    }}>
      <MetricPicker
        id="Metric A"
        clientId={clientId}
        metric={config.metricA} platform={config.platformA} event={config.eventA}
        onMetricChange={v => onChange({ metricA: v, eventA: v === 'conversions' ? config.eventA : null })}
        onPlatformChange={v => onChange({ platformA: v, metricA: metricForPlatformSwitch(config.metricA, v), eventA: null })}
        onEventChange={v => onChange({ eventA: v })}
      />
      <MetricPicker
        id="Metric B"
        clientId={clientId}
        metric={config.metricB} platform={config.platformB} event={config.eventB}
        onMetricChange={v => onChange({ metricB: v, eventB: v === 'conversions' ? config.eventB : null })}
        onPlatformChange={v => onChange({ platformB: v, metricB: metricForPlatformSwitch(config.metricB, v), eventB: null })}
        onEventChange={v => onChange({ eventB: v })}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={labelStyle}>Chart type</div>
        <select value={config.chartType} onChange={e => onChange({ chartType: e.target.value as TrendWidgetConfig['chartType'] })} style={selectStyle}>
          <option value="dual_line">Line + line</option>
          <option value="line_bar">Bar + line</option>
        </select>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={labelStyle}>Period</div>
        <select value={config.period} onChange={e => onChange({ period: e.target.value as TrendWidgetConfig['period'] })} style={selectStyle}>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="6m">Last 6 months</option>
        </select>
      </div>
    </div>
  );
}
