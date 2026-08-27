'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { COLOR, cardStyle, sectionTitleStyle } from './tokens';
import { HorizontalBarChart } from './chart-kit';
import { HideableCard } from './hideable-card';
import type { ClientDemographics, DemographicBucket } from '@/lib/client-hub/get-demographics';

function AudienceInfoTooltip() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="What is this based on?"
        style={{
          background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', color: COLOR.muted,
        }}
      >
        <Info size={14} strokeWidth={2} />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', top: '150%', left: 0, zIndex: 10, width: 280,
            background: COLOR.card, border: `1px solid ${COLOR.cardBorder}`, borderRadius: 6,
            padding: '12px 14px', boxShadow: '0 4px 16px rgba(28,25,23,0.12)',
            fontSize: 12, lineHeight: 1.5, color: COLOR.mutedSecondary, fontWeight: 400,
          }}
        >
          Shows who your ads were <em>shown to</em> (age, gender, country), not who clicked or
          converted. Pulled from Meta Ads and Google Ads platform reporting and split by ad spend
          for the period (or by impressions if spend isn&apos;t available). Google Ads doesn&apos;t
          expose a country breakdown, so that chart is Meta-only.
        </div>
      )}
    </div>
  );
}

export interface DemographicsSectionProps {
  clientId: string;
  token?: string;
  editable: boolean;
}

function BucketBarChart({ data, height }: { data: DemographicBucket[]; height: number }) {
  return (
    <HorizontalBarChart
      data={data}
      labelKey="label"
      valueKey="pct"
      height={height}
      formatValue={(v) => `${v.toFixed(1)}%`}
    />
  );
}

export function DemographicsSection({ clientId, token, editable }: DemographicsSectionProps) {
  const [demographics, setDemographics] = useState<ClientDemographics | null>(null);
  const [hiddenCards, setHiddenCards] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncNeedsConnection, setSyncNeedsConnection] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(token ? `/api/hub/${token}/demographics` : `/api/clients/${clientId}/hub/demographics`);
      if (res.ok) {
        const json = await res.json();
        setDemographics(json.demographics);
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
        body: JSON.stringify({ section: 'demographics', card, hidden }),
      });
      if (!res.ok) throw new Error();
      const { hiddenCards: updated } = await res.json();
      setHiddenCards(updated.demographics ?? []);
    } catch {
      setHiddenCards(prev => hidden ? prev.filter(c => c !== card) : [...prev, card]);
    }
  }, [clientId, hiddenCards]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncNeedsConnection(false);
    try {
      // Only sync platforms actually connected for this client — the fetch-demographics
      // endpoints 404 on an unconnected platform, and calling both unconditionally meant
      // clients with only one platform connected always threw a spurious 404 for the other.
      const statusRes = await fetch(`/api/connections/status?clientId=${clientId}`);
      const statusJson = statusRes.ok ? await statusRes.json() : { connections: [] };
      const connected = new Set<string>(
        (statusJson.connections ?? [])
          .filter((c: { platform: string; status: string }) => c.status === 'active')
          .map((c: { platform: string }) => c.platform),
      );
      const hasMeta = connected.has('meta-ads');
      const hasGoogle = connected.has('google-ads');

      if (!hasMeta && !hasGoogle) {
        setSyncNeedsConnection(true);
        throw new Error('No ad platform is connected for this client yet.');
      }

      const end = new Date();
      const start = new Date(end.getTime() - 89 * 86400000);
      const body = JSON.stringify({
        clientId,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      });

      const [metaRes, googleRes] = await Promise.all([
        hasMeta ? fetch('/api/ads/meta/fetch-demographics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }) : null,
        hasGoogle ? fetch('/api/ads/google-ads/fetch-demographics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }) : null,
      ]);

      const attempted = [metaRes, googleRes].filter((r): r is Response => r !== null);
      const failed = attempted.filter(r => !r.ok);
      if (failed.length === attempted.length) {
        const messages = await Promise.all(failed.map(async r => (await r.json().catch(() => ({}))).error));
        throw new Error(messages.filter(Boolean).join(' ') || 'Sync failed');
      }

      await load();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [clientId, load]);

  if (!editable && !loading && !demographics?.hasData) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Audience</h2>
          <AudienceInfoTooltip />
        </div>
        {editable && (
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              background: COLOR.accent, color: COLOR.bg, border: 'none', borderRadius: 4,
              padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: syncing ? 'default' : 'pointer',
              opacity: syncing ? 0.7 : 1,
            }}
          >
            {syncing ? 'Syncing…' : 'Sync audience data'}
          </button>
        )}
      </div>
      {syncError && (
        <div style={{ fontSize: 12.5, color: COLOR.accent, marginBottom: 12 }}>
          {syncError}
          {syncNeedsConnection && (
            <>
              {' '}
              <a href={`/clients/${clientId}/dashboard#platform-connections-section`} style={{ color: COLOR.accent, textDecoration: 'underline' }}>
                Connect Meta Ads or Google Ads
              </a>
              {' to sync audience data.'}
            </>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: COLOR.muted, padding: '20px 0' }}>Loading…</div>
      ) : !demographics?.hasData ? (
        <div style={{ ...cardStyle, padding: '20px 24px', fontSize: 13.5, color: COLOR.muted }}>
          No audience data yet{editable ? ' — click "Sync audience data" to pull the last 90 days from your connected ad accounts.' : '.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <HideableCard editable={editable} hidden={hiddenCards.includes('age')} onToggle={() => toggleCard('age')}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 14 }}>Age</div>
            <BucketBarChart data={demographics.age} height={Math.max(140, demographics.age.length * 34)} />
          </HideableCard>
          <HideableCard editable={editable} hidden={hiddenCards.includes('gender')} onToggle={() => toggleCard('gender')}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 14 }}>Gender</div>
            <BucketBarChart data={demographics.gender} height={Math.max(100, demographics.gender.length * 40)} />
          </HideableCard>
          {demographics.country.length > 0 && (
            <HideableCard editable={editable} hidden={hiddenCards.includes('country')} onToggle={() => toggleCard('country')} style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Top countries</div>
              <div style={{ fontSize: 11, color: COLOR.muted, marginBottom: 10 }}>Meta Ads only — Google Ads country breakdown isn&apos;t wired up yet</div>
              <BucketBarChart data={demographics.country} height={Math.max(140, demographics.country.length * 34)} />
            </HideableCard>
          )}
        </div>
      )}
    </div>
  );
}
