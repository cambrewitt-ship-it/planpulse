'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { COLOR, FONT_HEAD, cardStyle, sectionTitleStyle, fmtCompact, fmtPct } from './tokens';
import { HubTooltip, HubLegend, HubDonut, SERIES_COLORS, axisTickStyle, gridProps, axisLineProps } from './chart-kit';
import { HideableCard } from './hideable-card';
import type { HubMetric } from '@/lib/client-hub/get-hub-data';
import type { GA4DailyPoint, DonutBucket } from '@/lib/client-hub/get-ga4-report';

export interface GA4PerformanceSectionProps {
  clientId: string;
  token?: string;
  editable: boolean;
}

interface SectionData {
  period: { start: string; end: string };
  metrics: HubMetric[];
  dailySeries: GA4DailyPoint[];
  channelDonut: DonutBucket[];
  deviceDonut: DonutBucket[];
  newVsReturningDonut: DonutBucket[];
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

function tickInterval(length: number): number {
  return Math.max(0, Math.ceil(length / 10) - 1);
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
  const [data, setData] = useState<SectionData | null>(null);
  const [hiddenCards, setHiddenCards] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(token ? `/api/hub/${token}/ga4-performance` : `/api/clients/${clientId}/hub/ga4-performance`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setHiddenCards(json.hiddenCards ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [clientId, token]);

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
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Sync failed');
      }
      await load();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [clientId, data, load]);

  if (!editable && !loading && (!data || data.dailySeries.length === 0)) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Google Analytics — Traffic</h2>
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

          {data.dailySeries.length === 0 ? (
            <div style={{ ...cardStyle, padding: '20px 24px', fontSize: 13.5, color: COLOR.muted }}>
              No GA4 data yet for this period.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ ...cardStyle, padding: '20px 22px' }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>Users &amp; sessions over time</div>
                <div style={{ marginBottom: 10 }}>
                  <HubLegend entries={[{ label: 'Users', color: COLOR.accent, kind: 'line' }, { label: 'Sessions', color: '#5B6B4E', kind: 'line' }]} />
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={data.dailySeries} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="date" tick={axisTickStyle} axisLine={axisLineProps} tickLine={false} interval={tickInterval(data.dailySeries.length)} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} width={44} tickFormatter={fmtCompact} />
                    <Tooltip content={<HubTooltip formatValue={(entry) => Number(entry.value ?? 0).toLocaleString('en-US')} />} />
                    <Line dataKey="totalUsers" name="Users" stroke={COLOR.accent} strokeWidth={1.6} dot={false} />
                    <Line dataKey="sessions" name="Sessions" stroke="#5B6B4E" strokeWidth={1.6} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div style={{ ...cardStyle, padding: '20px 22px' }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>Engagement rate &amp; conversions over time</div>
                <div style={{ marginBottom: 10 }}>
                  <HubLegend entries={[{ label: 'Engagement rate', color: COLOR.goodBright, kind: 'line' }, { label: 'Conversions', color: COLOR.caution, kind: 'line' }]} />
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={data.dailySeries} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ga4PerfEngGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLOR.goodBright} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={COLOR.goodBright} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="date" tick={axisTickStyle} axisLine={axisLineProps} tickLine={false} interval={tickInterval(data.dailySeries.length)} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis yAxisId="engagement" tick={axisTickStyle} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
                    <YAxis yAxisId="conversions" orientation="right" tick={axisTickStyle} axisLine={false} tickLine={false} width={40} />
                    <Tooltip
                      content={
                        <HubTooltip formatValue={(entry) => entry.dataKey === 'engagementRate' ? `${Number(entry.value ?? 0).toFixed(2)}%` : Number(entry.value ?? 0).toLocaleString('en-US')} />
                      }
                    />
                    <Area yAxisId="engagement" dataKey="engagementRate" stroke="none" fill="url(#ga4PerfEngGrad)" isAnimationActive={false} />
                    <Line yAxisId="engagement" dataKey="engagementRate" name="Engagement rate" stroke={COLOR.goodBright} strokeWidth={1.6} dot={false} />
                    <Line yAxisId="conversions" dataKey="conversions" name="Conversions" stroke={COLOR.caution} strokeWidth={1.6} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

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
        </div>
      )}
    </div>
  );
}
