'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { COLOR, FONT_HEAD, FONT_BODY, cardStyle, sectionTitleStyle, fmtMoney, fmtCompact, fmtPct } from './tokens';
import { HubTooltip, HubLegend, HubDonut, axisTickStyle, gridProps, axisLineProps } from './chart-kit';
import { HideableCard } from './hideable-card';
import type { HubMetric } from '@/lib/client-hub/get-hub-data';
import type { MonthlyCommentsReactions, DailyValuePoint, MonthlyLikesEngagements, TopAdRow } from '@/lib/client-hub/get-meta-paid-report';
import { DEFAULT_META_PAID_CHART_CONFIG, type MetaPaidChartConfig } from '@/lib/client-hub/meta-paid-chart-config';

export interface MetaPaidAdsSectionProps {
  clientId: string;
  token?: string;
  editable: boolean;
}

interface MetricConfig {
  actionType: string | null;
  label: string;
}

interface SectionData {
  period: { start: string; end: string };
  metrics: HubMetric[];
  commentsVsReactions: MonthlyCommentsReactions[];
  costPerEngagement: DailyValuePoint[];
  pageLikesVsEngagements: MonthlyLikesEngagements[];
  topAds: TopAdRow[];
  hiddenCards: string[];
  metricConfig: MetricConfig;
  chartConfig: MetaPaidChartConfig;
}

interface ConversionEvent { name: string; count: number }

function formatMetricValue(m: HubMetric): string {
  switch (m.format) {
    case 'currency': return fmtMoney(m.value);
    case 'percent': return fmtPct(m.value);
    case 'compact': return fmtCompact(m.value);
    default: return Math.round(m.value).toLocaleString('en-US');
  }
}

function tickInterval(length: number): number {
  return Math.max(0, Math.ceil(length / 10) - 1);
}

function prettifyActionType(type: string): string {
  return type.replace(/^offsite_conversion\.fb_pixel_/, '').replace(/[._]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

const selectStyle: React.CSSProperties = {
  fontFamily: FONT_BODY, fontSize: 12.5, color: COLOR.ink, background: COLOR.card,
  border: `1px solid ${COLOR.cardBorder}`, borderRadius: 5, padding: '6px 9px', cursor: 'pointer',
};

/** Fetches this client's known Meta action types once, shared by every metric picker in the section so each doesn't re-fetch on its own. */
function useMetaConversionEvents(clientId: string, enabled: boolean): ConversionEvent[] {
  const [events, setEvents] = useState<ConversionEvent[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch('/api/ads/meta/list-conversion-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    })
      .then(res => res.ok ? res.json() : { events: [] })
      .then(json => { if (!cancelled) setEvents(json.events ?? []); })
      .catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, [clientId, enabled]);

  return events;
}

interface MetricSelectorProps {
  events: ConversionEvent[];
  config: MetricConfig;
  onChange: (actionType: string | null, label: string) => void;
}

/** Lets the agency pick which Meta action_type powers this section's primary metric — mirrors ConversionSelector's UX for the Overview "Leads" card, but scoped to this section only. */
function MetaMetricSelector({ events, config, onChange }: MetricSelectorProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11.5, color: COLOR.muted }}>Metric</span>
      <select
        value={config.actionType ?? ''}
        onChange={e => {
          const value = e.target.value || null;
          onChange(value, value ? prettifyActionType(value) : 'Engagements');
        }}
        style={selectStyle}
      >
        <option value="">Engagements (default)</option>
        {events.filter(ev => ev.name !== 'post_engagement').map(ev => (
          <option key={ev.name} value={ev.name}>{prettifyActionType(ev.name)}</option>
        ))}
      </select>
      <input
        key={config.label}
        type="text"
        defaultValue={config.label}
        onBlur={e => {
          const trimmed = e.target.value.trim();
          if (trimmed && trimmed !== config.label) onChange(config.actionType, trimmed);
        }}
        placeholder="Label"
        style={{ ...selectStyle, cursor: 'text', width: 100 }}
      />
    </div>
  );
}

interface SeriesPickerProps {
  events: ConversionEvent[];
  event: string;
  label: string;
  onChange: (event: string, label: string) => void;
}

/** One series of a comparison chart — pick the Meta action_type and its display label. Used for both sides of "Post comments vs reactions" and the pageLikes side of "Page likes vs {metric}". */
function ChartSeriesPicker({ events, event, label, onChange }: SeriesPickerProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <select
        value={event}
        onChange={e => onChange(e.target.value, prettifyActionType(e.target.value))}
        style={{ ...selectStyle, padding: '5px 7px', fontSize: 12 }}
      >
        {!events.some(ev => ev.name === event) && <option value={event}>{prettifyActionType(event)}</option>}
        {events.map(ev => <option key={ev.name} value={ev.name}>{prettifyActionType(ev.name)}</option>)}
      </select>
      <input
        key={label}
        type="text"
        defaultValue={label}
        onBlur={e => {
          const trimmed = e.target.value.trim();
          if (trimmed && trimmed !== label) onChange(event, trimmed);
        }}
        placeholder="Label"
        style={{ ...selectStyle, padding: '5px 7px', fontSize: 12, cursor: 'text', width: 84 }}
      />
    </div>
  );
}

export function MetaPaidAdsSection({ clientId, token, editable }: MetaPaidAdsSectionProps) {
  const [data, setData] = useState<SectionData | null>(null);
  const [hiddenCards, setHiddenCards] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const events = useMetaConversionEvents(clientId, editable);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(token ? `/api/hub/${token}/meta-paid-ads` : `/api/clients/${clientId}/hub/meta-paid-ads`);
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
        body: JSON.stringify({ section: 'metaPaidAds', card, hidden }),
      });
      if (!res.ok) throw new Error();
      const { hiddenCards: updated } = await res.json();
      setHiddenCards(updated.metaPaidAds ?? []);
    } catch {
      setHiddenCards(prev => hidden ? prev.filter(c => c !== card) : [...prev, card]);
    }
  }, [clientId, hiddenCards]);

  const handleMetricChange = useCallback(async (actionType: string | null, label: string) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/hub/meta-paid-ads/metric`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType, label }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch { /* leave prior selection on failure */ }
  }, [clientId, load]);

  const handleChartConfigChange = useCallback(async (patch: Partial<MetaPaidChartConfig>) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/hub/meta-paid-ads/chart-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch { /* leave prior selection on failure */ }
  }, [clientId, load]);

  const handleSync = useCallback(async () => {
    if (!data) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch('/api/ads/meta/fetch-ad-level', {
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

  const hasAnyData = !!data && data.metrics.some(m => m.value > 0);
  if (!editable && !loading && !hasAnyData) return null;

  const metricLabel = data?.metricConfig.label ?? 'Engagements';
  const chartConfig = data?.chartConfig ?? DEFAULT_META_PAID_CHART_CONFIG;
  const topAdsDonutData = data?.topAds.map(a => ({ name: a.adName, value: a.value })) ?? [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Meta Ads — Paid</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {editable && data && <MetaMetricSelector events={events} config={data.metricConfig} onChange={handleMetricChange} />}
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
              {syncing ? 'Syncing…' : 'Sync paid ads data'}
            </button>
          )}
        </div>
      </div>
      {syncError && <div style={{ fontSize: 12.5, color: COLOR.accent, marginBottom: 12 }}>{syncError}</div>}

      {loading ? (
        <div style={{ fontSize: 13, color: COLOR.muted, padding: '20px 0' }}>Loading…</div>
      ) : !data ? (
        <div style={{ ...cardStyle, padding: '20px 24px', fontSize: 13.5, color: COLOR.muted }}>Couldn&rsquo;t load Meta Ads paid data.</div>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
            <HideableCard editable={editable} hidden={hiddenCards.includes('commentsVsReactions')} onToggle={() => toggleCard('commentsVsReactions')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10, paddingRight: editable ? 26 : 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Post {chartConfig.commentsLabel.toLowerCase()} vs {chartConfig.reactionsLabel.toLowerCase()}</div>
                {editable && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <ChartSeriesPicker
                      events={events} event={chartConfig.commentsEvent} label={chartConfig.commentsLabel}
                      onChange={(commentsEvent, commentsLabel) => handleChartConfigChange({ commentsEvent, commentsLabel })}
                    />
                    <ChartSeriesPicker
                      events={events} event={chartConfig.reactionsEvent} label={chartConfig.reactionsLabel}
                      onChange={(reactionsEvent, reactionsLabel) => handleChartConfigChange({ reactionsEvent, reactionsLabel })}
                    />
                  </div>
                )}
              </div>
              {data.commentsVsReactions.length === 0 ? (
                <div style={{ fontSize: 13, color: COLOR.muted, padding: '40px 0', textAlign: 'center' }}>No data yet for this period.</div>
              ) : (
                <>
                  <div style={{ marginBottom: 10 }}>
                    <HubLegend entries={[{ label: chartConfig.commentsLabel, color: COLOR.accent }, { label: chartConfig.reactionsLabel, color: COLOR.goodBright }]} />
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.commentsVsReactions} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="month" tick={axisTickStyle} axisLine={axisLineProps} tickLine={false} />
                      <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} width={44} tickFormatter={fmtCompact} />
                      <Tooltip content={<HubTooltip formatValue={(entry) => Number(entry.value ?? 0).toLocaleString('en-US')} />} cursor={{ fill: COLOR.divider }} />
                      <Bar dataKey="comments" name={chartConfig.commentsLabel} fill={COLOR.accent} radius={[3, 3, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="reactions" name={chartConfig.reactionsLabel} fill={COLOR.goodBright} radius={[3, 3, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </>
              )}
            </HideableCard>

            <HideableCard editable={editable} hidden={hiddenCards.includes('topAds')} onToggle={() => toggleCard('topAds')}>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 14 }}>Top performing paid ads by {metricLabel.toLowerCase()}</div>
              {topAdsDonutData.length === 0 ? (
                <div style={{ fontSize: 13, color: COLOR.muted, padding: '20px 0', textAlign: 'center' }}>
                  No ad-level data yet{editable ? ' — click "Sync paid ads data" to pull the top ads for this period.' : '.'}
                </div>
              ) : (
                <>
                  <HubDonut
                    data={topAdsDonutData}
                    size={140}
                    formatValue={(v) => v.toLocaleString('en-US')}
                    centerLabel={metricLabel}
                    centerValue={topAdsDonutData.reduce((s, d) => s + d.value, 0).toLocaleString('en-US')}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 14, maxHeight: 160, overflowY: 'auto' }}>
                    {data.topAds.map((a, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, gap: 8 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.adName}</span>
                        <span style={{ color: COLOR.mutedSecondary, flexShrink: 0 }}>{a.value.toLocaleString('en-US')}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </HideableCard>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
            <HideableCard editable={editable} hidden={hiddenCards.includes('costPerEngagement')} onToggle={() => toggleCard('costPerEngagement')}>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>Cost per {metricLabel.toLowerCase()}</div>
              {data.costPerEngagement.length === 0 ? (
                <div style={{ fontSize: 13, color: COLOR.muted, padding: '40px 0', textAlign: 'center' }}>No data yet for this period.</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.costPerEngagement} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="date" tick={axisTickStyle} axisLine={axisLineProps} tickLine={false} interval={tickInterval(data.costPerEngagement.length)} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis tick={axisTickStyle} axisLine={false} tickLine={false} width={48} tickFormatter={fmtMoney} />
                    <Tooltip content={<HubTooltip formatValue={(entry) => fmtMoney(Number(entry.value ?? 0))} />} />
                    <Line dataKey="value" name={`Cost per ${metricLabel.toLowerCase()}`} stroke={COLOR.caution} strokeWidth={1.8} dot={{ r: 3, fill: COLOR.caution, strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </HideableCard>

            <HideableCard editable={editable} hidden={hiddenCards.includes('pageLikesVsEngagements')} onToggle={() => toggleCard('pageLikesVsEngagements')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10, paddingRight: editable ? 26 : 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{chartConfig.pageLikesLabel} vs {metricLabel.toLowerCase()}</div>
                {editable && (
                  <ChartSeriesPicker
                    events={events} event={chartConfig.pageLikesEvent} label={chartConfig.pageLikesLabel}
                    onChange={(pageLikesEvent, pageLikesLabel) => handleChartConfigChange({ pageLikesEvent, pageLikesLabel })}
                  />
                )}
              </div>
              {data.pageLikesVsEngagements.length === 0 ? (
                <div style={{ fontSize: 13, color: COLOR.muted, padding: '40px 0', textAlign: 'center' }}>No data yet for this period.</div>
              ) : (
                <>
                  <div style={{ marginBottom: 10 }}>
                    <HubLegend entries={[{ label: chartConfig.pageLikesLabel, color: COLOR.accent }, { label: metricLabel, color: COLOR.goodBright }]} />
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.pageLikesVsEngagements} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="month" tick={axisTickStyle} axisLine={axisLineProps} tickLine={false} />
                      <YAxis yAxisId="likes" tick={axisTickStyle} axisLine={false} tickLine={false} width={40} />
                      <YAxis yAxisId="metric" orientation="right" tick={axisTickStyle} axisLine={false} tickLine={false} width={48} tickFormatter={fmtCompact} />
                      <Tooltip content={<HubTooltip formatValue={(entry) => Number(entry.value ?? 0).toLocaleString('en-US')} />} cursor={{ fill: COLOR.divider }} />
                      <Bar yAxisId="likes" dataKey="pageLikes" name={chartConfig.pageLikesLabel} fill={COLOR.accent} radius={[3, 3, 0, 0]} maxBarSize={22} />
                      <Bar yAxisId="metric" dataKey="metric" name={metricLabel} fill={COLOR.goodBright} radius={[3, 3, 0, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </>
              )}
            </HideableCard>
          </div>
        </div>
      )}
    </div>
  );
}
