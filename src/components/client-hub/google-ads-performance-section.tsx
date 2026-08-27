'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { COLOR, FONT_HEAD, cardStyle, sectionTitleStyle, fmtMoney, fmtCompact, fmtPct } from './tokens';
import { HubTooltip, HubLegend, axisTickStyle, gridProps, axisLineProps } from './chart-kit';
import { HideableCard } from './hideable-card';
import type { HubMetric } from '@/lib/client-hub/get-hub-data';
import type { GoogleAdsDailyPoint, GoogleAdsAdGroupRow, GoogleAdsBudgetRow } from '@/lib/client-hub/get-google-ads-report';

export interface GoogleAdsPerformanceSectionProps {
  clientId: string;
  token?: string;
  editable: boolean;
}

interface SectionData {
  period: { start: string; end: string };
  metrics: HubMetric[];
  dailySeries: GoogleAdsDailyPoint[];
  adGroups: GoogleAdsAdGroupRow[];
  budgetSplit: GoogleAdsBudgetRow[];
  insight: string | null;
  hiddenCards: string[];
}

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

function InsightCallout({ text }: { text: string }) {
  return (
    <div style={{ background: COLOR.infoBg, border: `1px solid ${COLOR.info}`, borderRadius: 6, padding: '14px 18px', fontSize: 13.5, lineHeight: 1.55, color: COLOR.ink, fontStyle: 'italic' }}>
      {text}
    </div>
  );
}

export function GoogleAdsPerformanceSection({ clientId, token, editable }: GoogleAdsPerformanceSectionProps) {
  const [data, setData] = useState<SectionData | null>(null);
  const [hiddenCards, setHiddenCards] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(token ? `/api/hub/${token}/google-ads-performance` : `/api/clients/${clientId}/hub/google-ads-performance`);
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
        body: JSON.stringify({ section: 'googleAdsPerformance', card, hidden }),
      });
      if (!res.ok) throw new Error();
      const { hiddenCards: updated } = await res.json();
      setHiddenCards(updated.googleAdsPerformance ?? []);
    } catch {
      setHiddenCards(prev => hidden ? prev.filter(c => c !== card) : [...prev, card]);
    }
  }, [clientId, hiddenCards]);

  const handleSync = useCallback(async () => {
    if (!data) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch('/api/ads/google-ads/fetch-performance-extras', {
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

  if (!editable && !loading && (!data || data.adGroups.length === 0)) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Google Ads — Performance</h2>
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
            {syncing ? 'Syncing…' : 'Sync performance data'}
          </button>
        )}
      </div>
      {syncError && <div style={{ fontSize: 12.5, color: COLOR.accent, marginBottom: 12 }}>{syncError}</div>}

      {loading ? (
        <div style={{ fontSize: 13, color: COLOR.muted, padding: '20px 0' }}>Loading…</div>
      ) : !data ? (
        <div style={{ ...cardStyle, padding: '20px 24px', fontSize: 13.5, color: COLOR.muted }}>Couldn&rsquo;t load Google Ads performance data.</div>
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
              No daily performance data yet for this period.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ ...cardStyle, padding: '20px 22px' }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>Impressions &amp; clicks over time</div>
                <div style={{ marginBottom: 10 }}>
                  <HubLegend entries={[{ label: 'Impressions', color: COLOR.accent, kind: 'line' }, { label: 'Clicks', color: '#5B6B4E', kind: 'line' }]} />
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={data.dailySeries} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="date" tick={axisTickStyle} axisLine={axisLineProps} tickLine={false} interval={tickInterval(data.dailySeries.length)} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis yAxisId="impressions" tick={axisTickStyle} axisLine={false} tickLine={false} width={44} tickFormatter={fmtCompact} />
                    <YAxis yAxisId="clicks" orientation="right" tick={axisTickStyle} axisLine={false} tickLine={false} width={40} />
                    <Tooltip content={<HubTooltip formatValue={(entry) => Number(entry.value ?? 0).toLocaleString('en-US')} />} />
                    <Line yAxisId="impressions" dataKey="impressions" name="Impressions" stroke={COLOR.accent} strokeWidth={1.6} dot={false} />
                    <Line yAxisId="clicks" dataKey="clicks" name="Clicks" stroke="#5B6B4E" strokeWidth={1.6} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div style={{ ...cardStyle, padding: '20px 22px' }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>CTR &amp; avg. CPC over time</div>
                <div style={{ marginBottom: 10 }}>
                  <HubLegend entries={[{ label: 'CTR', color: COLOR.goodBright, kind: 'line' }, { label: 'Avg. CPC', color: COLOR.caution, kind: 'line' }]} />
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={data.dailySeries} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gaqPerfCtrGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLOR.goodBright} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={COLOR.goodBright} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="date" tick={axisTickStyle} axisLine={axisLineProps} tickLine={false} interval={tickInterval(data.dailySeries.length)} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis yAxisId="ctr" tick={axisTickStyle} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
                    <YAxis yAxisId="cpc" orientation="right" tick={axisTickStyle} axisLine={false} tickLine={false} width={44} tickFormatter={fmtMoney} />
                    <Tooltip
                      content={
                        <HubTooltip formatValue={(entry) => entry.dataKey === 'ctr' ? `${Number(entry.value ?? 0).toFixed(2)}%` : fmtMoney(Number(entry.value ?? 0))} />
                      }
                    />
                    <Area yAxisId="ctr" dataKey="ctr" stroke="none" fill="url(#gaqPerfCtrGrad)" isAnimationActive={false} />
                    <Line yAxisId="ctr" dataKey="ctr" name="CTR" stroke={COLOR.goodBright} strokeWidth={1.6} dot={false} />
                    <Line yAxisId="cpc" dataKey="avgCpc" name="Avg. CPC" stroke={COLOR.caution} strokeWidth={1.6} dot={false} />
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

          <HideableCard editable={editable} hidden={hiddenCards.includes('adGroups')} onToggle={() => toggleCard('adGroups')} style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px 0', fontSize: 13.5, fontWeight: 600 }}>Ad group breakdown</div>
            {data.adGroups.length === 0 ? (
              <div style={{ padding: '12px 20px 20px', fontSize: 13, color: COLOR.muted }}>No ad group data yet for this period.</div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 0.8fr 0.8fr 0.8fr 0.8fr', padding: '10px 20px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLOR.muted, borderBottom: `1px solid ${COLOR.cardBorder}` }}>
                  <div>Ad group</div><div>Campaign</div><div>Impressions</div><div>Clicks</div><div>CTR</div><div>Avg. CPC</div>
                </div>
                {data.adGroups.slice(0, 25).map((r, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 0.8fr 0.8fr 0.8fr 0.8fr', padding: '10px 20px', borderBottom: `1px solid ${COLOR.divider}`, fontSize: 13 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.adGroupName}</div>
                    <div style={{ color: COLOR.mutedSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.campaignName}</div>
                    <div>{r.impressions.toLocaleString('en-US')}</div>
                    <div>{r.clicks.toLocaleString('en-US')}</div>
                    <div>{r.ctr.toFixed(2)}%</div>
                    <div>{fmtMoney(r.avgCpc)}</div>
                  </div>
                ))}
              </div>
            )}
          </HideableCard>

          <HideableCard editable={editable} hidden={hiddenCards.includes('budgetSplit')} onToggle={() => toggleCard('budgetSplit')} style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px 0', fontSize: 13.5, fontWeight: 600 }}>Current daily budget split</div>
            {data.budgetSplit.length === 0 ? (
              <div style={{ padding: '12px 20px 20px', fontSize: 13, color: COLOR.muted }}>No budget data synced yet.</div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '10px 20px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLOR.muted, borderBottom: `1px solid ${COLOR.cardBorder}` }}>
                  <div>Campaign</div><div>Daily budget</div><div>Share</div>
                </div>
                {data.budgetSplit.map((r, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '10px 20px', borderBottom: `1px solid ${COLOR.divider}`, fontSize: 13, alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.campaignName}{r.explicitlyShared && <span style={{ fontSize: 10.5, color: COLOR.muted, marginLeft: 6 }}>(shared budget)</span>}
                    </div>
                    <div>{fmtMoney(r.dailyBudget)}</div>
                    <div style={{ color: COLOR.mutedSecondary }}>{r.sharePct.toFixed(0)}%</div>
                  </div>
                ))}
                {data.budgetSplit.some(r => r.explicitlyShared) && (
                  <div style={{ padding: '10px 20px', fontSize: 11, color: COLOR.muted }}>
                    Some campaigns share a budget with others — their amounts may sum to more than the account&rsquo;s real spend cap.
                  </div>
                )}
              </div>
            )}
          </HideableCard>
        </div>
      )}
    </div>
  );
}
