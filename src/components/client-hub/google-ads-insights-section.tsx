'use client';

import { useCallback, useEffect, useState } from 'react';
import { COLOR, cardStyle, sectionTitleStyle, fmtMoney } from './tokens';
import { HorizontalBarChart, HubDonut, SERIES_COLORS } from './chart-kit';
import { HideableCard } from './hideable-card';
import type { GoogleAdsSearchTermRow, GoogleAdsGeoRow, DonutBucket } from '@/lib/client-hub/get-google-ads-report';

export interface GoogleAdsInsightsSectionProps {
  clientId: string;
  token?: string;
  editable: boolean;
}

interface SectionData {
  period: { start: string; end: string };
  searchTerms: GoogleAdsSearchTermRow[];
  geoBreakdown: GoogleAdsGeoRow[];
  deviceDonut: DonutBucket[];
  dayOfWeekDonut: DonutBucket[];
  ageDonut: DonutBucket[];
  genderDonut: DonutBucket[];
  hiddenCards: string[];
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

export function GoogleAdsInsightsSection({ clientId, token, editable }: GoogleAdsInsightsSectionProps) {
  const [data, setData] = useState<SectionData | null>(null);
  const [hiddenCards, setHiddenCards] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(token ? `/api/hub/${token}/google-ads-insights` : `/api/clients/${clientId}/hub/google-ads-insights`);
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
        body: JSON.stringify({ section: 'googleAdsInsights', card, hidden }),
      });
      if (!res.ok) throw new Error();
      const { hiddenCards: updated } = await res.json();
      setHiddenCards(updated.googleAdsInsights ?? []);
    } catch {
      setHiddenCards(prev => hidden ? prev.filter(c => c !== card) : [...prev, card]);
    }
  }, [clientId, hiddenCards]);

  const handleSync = useCallback(async () => {
    if (!data) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch('/api/ads/google-ads/fetch-insights-report', {
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

  const hasAnyData = !!data && (data.searchTerms.length > 0 || data.geoBreakdown.length > 0 || data.deviceDonut.length > 0 || data.dayOfWeekDonut.length > 0 || data.ageDonut.length > 0 || data.genderDonut.length > 0);
  if (!editable && !loading && !hasAnyData) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Google Ads — Insights</h2>
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
            {syncing ? 'Syncing…' : 'Sync insights data'}
          </button>
        )}
      </div>
      {syncError && <div style={{ fontSize: 12.5, color: COLOR.accent, marginBottom: 12 }}>{syncError}</div>}

      {loading ? (
        <div style={{ fontSize: 13, color: COLOR.muted, padding: '20px 0' }}>Loading…</div>
      ) : !data ? (
        <div style={{ ...cardStyle, padding: '20px 24px', fontSize: 13.5, color: COLOR.muted }}>Couldn&rsquo;t load Google Ads insights data.</div>
      ) : !hasAnyData ? (
        <div style={{ ...cardStyle, padding: '20px 24px', fontSize: 13.5, color: COLOR.muted }}>
          No insights data yet{editable ? ' — click "Sync insights data" to pull search terms, region, and device data for this period.' : '.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <HideableCard editable={editable} hidden={hiddenCards.includes('searchTerms')} onToggle={() => toggleCard('searchTerms')} style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px 0', fontSize: 13.5, fontWeight: 600 }}>What are people searching and clicking?</div>
            {data.searchTerms.length === 0 ? (
              <div style={{ padding: '12px 20px 20px', fontSize: 13, color: COLOR.muted }}>No search term data yet.</div>
            ) : (
              <div style={{ marginTop: 12, maxHeight: 420, overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 0.8fr 0.8fr 0.8fr', padding: '10px 20px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLOR.muted, borderBottom: `1px solid ${COLOR.cardBorder}`, position: 'sticky', top: 0, background: COLOR.card }}>
                  <div>Search term</div><div>Campaign</div><div>Impressions</div><div>Clicks</div><div>CTR</div>
                </div>
                {data.searchTerms.map((r, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 0.8fr 0.8fr 0.8fr', padding: '10px 20px', borderBottom: `1px solid ${COLOR.divider}`, fontSize: 13 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.searchTerm}</div>
                    <div style={{ color: COLOR.mutedSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.campaignName}</div>
                    <div>{r.impressions.toLocaleString('en-US')}</div>
                    <div>{r.clicks.toLocaleString('en-US')}</div>
                    <div>{r.ctr.toFixed(2)}%</div>
                  </div>
                ))}
              </div>
            )}
          </HideableCard>

          <HideableCard editable={editable} hidden={hiddenCards.includes('region')} onToggle={() => toggleCard('region')} style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px 0', fontSize: 13.5, fontWeight: 600 }}>Region breakdown</div>
            {data.geoBreakdown.length === 0 ? (
              <div style={{ padding: '12px 20px 20px', fontSize: 13, color: COLOR.muted }}>No region data yet.</div>
            ) : (
              <>
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 0.8fr 0.8fr 0.8fr 0.8fr', padding: '10px 20px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLOR.muted, borderBottom: `1px solid ${COLOR.cardBorder}` }}>
                    <div>Region</div><div>Campaign</div><div>Impressions</div><div>Clicks</div><div>CTR</div><div>Avg. CPC</div>
                  </div>
                  {data.geoBreakdown.slice(0, 15).map((r, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 0.8fr 0.8fr 0.8fr 0.8fr', padding: '10px 20px', borderBottom: `1px solid ${COLOR.divider}`, fontSize: 13 }}>
                      <div style={{ fontWeight: 600 }}>{r.regionName}</div>
                      <div style={{ color: COLOR.mutedSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.campaignName}</div>
                      <div>{r.impressions.toLocaleString('en-US')}</div>
                      <div>{r.clicks.toLocaleString('en-US')}</div>
                      <div>{r.ctr.toFixed(2)}%</div>
                      <div>{fmtMoney(r.averageCpc)}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '16px 20px 20px' }}>
                  <HorizontalBarChart
                    data={data.geoBreakdown.slice(0, 10)}
                    labelKey="regionName"
                    valueKey="impressions"
                    height={Math.max(140, Math.min(10, data.geoBreakdown.length) * 34)}
                    formatValue={(v) => v.toLocaleString('en-US')}
                    labelWidth={100}
                  />
                </div>
              </>
            )}
          </HideableCard>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <HideableCard editable={editable} hidden={hiddenCards.includes('deviceDonut')} onToggle={() => toggleCard('deviceDonut')}>
              <DonutCard title="Device by impressions" data={data.deviceDonut} />
            </HideableCard>
            <HideableCard editable={editable} hidden={hiddenCards.includes('dayOfWeekDonut')} onToggle={() => toggleCard('dayOfWeekDonut')}>
              <DonutCard title="Day of week by impressions" data={data.dayOfWeekDonut} />
            </HideableCard>
            <HideableCard editable={editable} hidden={hiddenCards.includes('ageDonut')} onToggle={() => toggleCard('ageDonut')}>
              <DonutCard title="Age by impressions" data={data.ageDonut} />
            </HideableCard>
            <HideableCard editable={editable} hidden={hiddenCards.includes('genderDonut')} onToggle={() => toggleCard('genderDonut')}>
              <DonutCard title="Gender by impressions" data={data.genderDonut} />
            </HideableCard>
          </div>
        </div>
      )}
    </div>
  );
}
