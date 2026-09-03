'use client';

import { useCallback, useEffect, useState } from 'react';
import { COLOR, cardStyle, sectionTitleStyle } from './tokens';
import { HorizontalBarChart } from './chart-kit';
import { HideableCard } from './hideable-card';
import type { GA4LandingPageRow, DonutBucket, GA4EventRow } from '@/lib/client-hub/get-ga4-report';

export interface GA4InsightsSectionProps {
  clientId: string;
  token?: string;
  editable: boolean;
}

interface SectionData {
  period: { start: string; end: string };
  landingPages: GA4LandingPageRow[];
  countries: DonutBucket[];
  events: GA4EventRow[];
  insight: string | null;
  hiddenCards: string[];
}

function InsightCallout({ text }: { text: string }) {
  return (
    <div style={{ background: COLOR.infoBg, border: `1px solid ${COLOR.info}`, borderRadius: 6, padding: '14px 18px', fontSize: 13.5, lineHeight: 1.55, color: COLOR.ink, fontStyle: 'italic' }}>
      {text}
    </div>
  );
}

export function GA4InsightsSection({ clientId, token, editable }: GA4InsightsSectionProps) {
  const [data, setData] = useState<SectionData | null>(null);
  const [hiddenCards, setHiddenCards] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(token ? `/api/hub/${token}/ga4-insights` : `/api/clients/${clientId}/hub/ga4-insights`);
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
        body: JSON.stringify({ section: 'ga4Insights', card, hidden }),
      });
      if (!res.ok) throw new Error();
      const { hiddenCards: updated } = await res.json();
      setHiddenCards(updated.ga4Insights ?? []);
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

  const hasAnyData = !!data && (data.landingPages.length > 0 || data.countries.length > 0 || data.events.length > 0);
  if (!editable && !loading && !hasAnyData) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Google Analytics — Behaviour</h2>
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
      ) : !hasAnyData ? (
        <div style={{ ...cardStyle, padding: '20px 24px', fontSize: 13.5, color: COLOR.muted }}>
          No behaviour data yet{editable ? ' — click "Sync breakdown data" to pull landing pages, countries, and events for this period.' : '.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <HideableCard editable={editable} hidden={hiddenCards.includes('landingPages')} onToggle={() => toggleCard('landingPages')} style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px 4px', fontSize: 13.5, fontWeight: 600 }}>Top landing pages</div>
            <div style={{ padding: '0 20px 8px', fontSize: 11, color: COLOR.muted }}>As of last sync — not filtered by the date picker above.</div>
            {data.landingPages.length === 0 ? (
              <div style={{ padding: '12px 20px 20px', fontSize: 13, color: COLOR.muted }}>No landing page data yet.</div>
            ) : (
              <div style={{ marginTop: 4 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2.4fr 1fr 1fr', padding: '10px 20px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLOR.muted, borderBottom: `1px solid ${COLOR.cardBorder}` }}>
                  <div>Page</div><div>Sessions</div><div>Users</div>
                </div>
                {data.landingPages.map((r, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '2.4fr 1fr 1fr', padding: '10px 20px', borderBottom: `1px solid ${COLOR.divider}`, fontSize: 13 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.page}</div>
                    <div>{r.sessions.toLocaleString('en-US')}</div>
                    <div>{r.users.toLocaleString('en-US')}</div>
                  </div>
                ))}
              </div>
            )}
          </HideableCard>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <HideableCard editable={editable} hidden={hiddenCards.includes('countries')} onToggle={() => toggleCard('countries')}>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Top countries by sessions</div>
              <div style={{ fontSize: 11, color: COLOR.muted, marginBottom: 10 }}>As of last sync.</div>
              <HorizontalBarChart
                data={data.countries}
                labelKey="name"
                valueKey="value"
                height={Math.max(140, Math.min(10, data.countries.length) * 34)}
                formatValue={(v) => v.toLocaleString('en-US')}
                labelWidth={90}
              />
            </HideableCard>

            <HideableCard editable={editable} hidden={hiddenCards.includes('events')} onToggle={() => toggleCard('events')}>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Top events</div>
              <div style={{ fontSize: 11, color: COLOR.muted, marginBottom: 10 }}>As of last sync.</div>
              <HorizontalBarChart
                data={data.events}
                labelKey="eventName"
                valueKey="eventCount"
                height={Math.max(140, Math.min(10, data.events.length) * 34)}
                formatValue={(v) => v.toLocaleString('en-US')}
                labelWidth={100}
              />
            </HideableCard>
          </div>

          {data.insight && (
            <HideableCard editable={editable} hidden={hiddenCards.includes('insight')} onToggle={() => toggleCard('insight')}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLOR.muted, marginBottom: 10 }}>Insight</div>
              <InsightCallout text={data.insight} />
            </HideableCard>
          )}
        </div>
      )}
    </div>
  );
}
