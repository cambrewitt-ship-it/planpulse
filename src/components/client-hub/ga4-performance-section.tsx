'use client';

import { useCallback, useEffect, useState } from 'react';
import { subDays, format } from 'date-fns';
import { COLOR, FONT_HEAD, cardStyle, sectionTitleStyle, fmtCompact, fmtPct } from './tokens';
import { HubDonut, SERIES_COLORS } from './chart-kit';
import { HideableCard } from './hideable-card';
import { GA4EngagementOverview } from './ga4-engagement-overview';
import { GA4DimensionExplorer } from './ga4-dimension-explorer';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { HubMetric } from '@/lib/client-hub/get-hub-data';
import type { DonutBucket, GA4TrendMetricSeries } from '@/lib/client-hub/get-ga4-report';

function defaultRange() {
  const end = new Date();
  const start = subDays(end, 29);
  return { startDate: format(start, 'yyyy-MM-dd'), endDate: format(end, 'yyyy-MM-dd') };
}

export interface GA4PerformanceSectionProps {
  clientId: string;
  token?: string;
  editable: boolean;
}

interface SectionData {
  period: { start: string; end: string };
  metrics: HubMetric[];
  channelDonut: DonutBucket[];
  deviceDonut: DonutBucket[];
  newVsReturningDonut: DonutBucket[];
  engagementOverview: GA4TrendMetricSeries[];
  insight: string | null;
  hiddenCards: string[];
}

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

function formatMetricValue(m: HubMetric): string {
  if (m.key === 'averageSessionDuration') return formatDuration(m.value);
  switch (m.format) {
    case 'percent': return fmtPct(m.value);
    case 'compact': return fmtCompact(m.value);
    default: return Math.round(m.value).toLocaleString('en-US');
  }
}

function InsightCallout({ text }: { text: string }) {
  return (
    <div style={{ background: COLOR.infoBg, border: `1px solid ${COLOR.info}`, borderRadius: 6, padding: '14px 18px', fontSize: 13.5, lineHeight: 1.55, color: COLOR.ink, fontStyle: 'italic' }}>
      {text}
    </div>
  );
}

function DonutCard({ title, data }: { title: string; data: DonutBucket[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 14 }}>{title}</div>
      {data.length === 0 ? (
        <div style={{ fontSize: 13, color: COLOR.muted, padding: '20px 0', textAlign: 'center' }}>No data yet.</div>
      ) : (
        <>
          <HubDonut data={data} size={130} formatValue={(v) => v.toLocaleString('en-US')} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 14 }}>
            {data.map((d, i) => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: SERIES_COLORS[i % SERIES_COLORS.length], display: 'inline-block' }} />
                  {d.name}
                </div>
                <span style={{ color: COLOR.mutedSecondary }}>{total > 0 ? Math.round((d.value / total) * 100) : 0}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function GA4PerformanceSection({ clientId, token, editable }: GA4PerformanceSectionProps) {
  const [dateRange, setDateRange] = useState(defaultRange);
  const [data, setData] = useState<SectionData | null>(null);
  const [hiddenCards, setHiddenCards] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = `?start=${dateRange.startDate}&end=${dateRange.endDate}`;
      const res = await fetch(token ? `/api/hub/${token}/ga4-performance${qs}` : `/api/clients/${clientId}/hub/ga4-performance${qs}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setHiddenCards(json.hiddenCards ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [clientId, token, dateRange]);

  useEffect(() => { load(); }, [load]);

  const toggleCard = useCallback(async (card: string) => {
    const hidden = !hiddenCards.includes(card);
    setHiddenCards(prev => hidden ? [...prev, card] : prev.filter(c => c !== card));
    try {
      const res = await fetch(`/api/clients/${clientId}/hub/hidden-cards`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'ga4Performance', card, hidden }),
      });
      if (!res.ok) throw new Error();
      const { hiddenCards: updated } = await res.json();
      setHiddenCards(updated.ga4Performance ?? []);
    } catch {
      setHiddenCards(prev => hidden ? prev.filter(c => c !== card) : [...prev, card]);
    }
  }, [clientId, hiddenCards]);

  const handleSync = useCallback(async () => {
    if (!data) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch('/api/ads/google-analytics/fetch-breakdowns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, startDate: data.period.start, endDate: data.period.end }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Sync failed');
      if (Array.isArray(body.errors) && body.errors.length > 0) {
        setSyncError(`Synced with some errors: ${body.errors.map((e: { error: string }) => e.error).join('; ')}`);
      }
      await load();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [clientId, data, load]);

  const hasAnyData = !!data && data.engagementOverview.some((s) => s.currentTotal > 0 || s.current.length > 0);
  if (!editable && !loading && !hasAnyData) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Google Analytics — Traffic</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <DateRangePicker value={dateRange} onChange={setDateRange} disabled={loading} />
          {editable && (
            <button
              onClick={handleSync}
              disabled={syncing || !data}
              style={{
                background: COLOR.accent, color: COLOR.bg, border: 'none', borderRadius: 4,
                padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: syncing ? 'default' : 'pointer',
                opacity: syncing ? 0.7 : 1,
              }}
            >
              {syncing ? 'Syncing…' : 'Sync breakdown data'}
            </button>
          )}
        </div>
      </div>
      {syncError && <div style={{ fontSize: 12.5, color: COLOR.accent, marginBottom: 12 }}>{syncError}</div>}

      {loading ? (
        <div style={{ fontSize: 13, color: COLOR.muted, padding: '20px 0' }}>Loading…</div>
      ) : !data ? (
        <div style={{ ...cardStyle, padding: '20px 24px', fontSize: 13.5, color: COLOR.muted }}>Couldn&rsquo;t load Google Analytics data.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.metrics.length}, 1fr)`, gap: 14 }}>
            {data.metrics.map(m => (
              <div key={m.key} style={{ ...cardStyle, padding: '16px 16px 14px' }}>
                <div style={{ fontSize: 12, color: COLOR.muted, marginBottom: 8 }}>{m.label}</div>
                <div style={{ fontFamily: FONT_HEAD, fontSize: 24, lineHeight: 1 }}>{formatMetricValue(m)}</div>
              </div>
            ))}
          </div>

          <HideableCard editable={editable} hidden={hiddenCards.includes('engagementOverview')} onToggle={() => toggleCard('engagementOverview')}>
            <GA4EngagementOverview clientId={clientId} token={token} editable={editable} overview={data.engagementOverview} period={data.period} />
          </HideableCard>

          {data.insight && (
            <HideableCard editable={editable} hidden={hiddenCards.includes('insight')} onToggle={() => toggleCard('insight')}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLOR.muted, marginBottom: 10 }}>Insight</div>
              <InsightCallout text={data.insight} />
            </HideableCard>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <HideableCard editable={editable} hidden={hiddenCards.includes('channelDonut')} onToggle={() => toggleCard('channelDonut')}>
              <DonutCard title="Traffic by channel" data={data.channelDonut} />
            </HideableCard>
            <HideableCard editable={editable} hidden={hiddenCards.includes('deviceDonut')} onToggle={() => toggleCard('deviceDonut')}>
              <DonutCard title="Sessions by device" data={data.deviceDonut} />
            </HideableCard>
            <HideableCard editable={editable} hidden={hiddenCards.includes('newVsReturningDonut')} onToggle={() => toggleCard('newVsReturningDonut')}>
              <DonutCard title="New vs. returning" data={data.newVsReturningDonut} />
            </HideableCard>
          </div>

          <HideableCard editable={editable} hidden={hiddenCards.includes('dimensionExplorer')} onToggle={() => toggleCard('dimensionExplorer')}>
            <GA4DimensionExplorer clientId={clientId} token={token} period={data.period} />
          </HideableCard>
        </div>
      )}
    </div>
  );
}
