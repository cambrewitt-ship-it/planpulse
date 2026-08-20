'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { ClientHubData } from '@/lib/client-hub/get-hub-data';
import { ClientHubView, type ClientHubShareLink } from '@/components/client-hub/client-hub-view';
import type { DateRange } from '@/components/client-hub/client-hub-controls';
import { COLOR, FONT_BODY } from '@/components/client-hub/tokens';

interface HubApiResponse extends ClientHubData {
  sections: Record<string, boolean>;
  shareLink: ClientHubShareLink | null;
}

export default function ClientHubAgencyPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [response, setResponse] = useState<HubApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = range ? `?start=${range.start}&end=${range.end}` : '';
      const res = await fetch(`/api/clients/${clientId}/hub${qs}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to load Client Hub');
      }
      setResponse(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Client Hub');
    }
  }, [clientId, range]);

  useEffect(() => { load(); }, [load]);

  const handleConversionChange = useCallback(async (actionType: string | null, label: string) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/hub/conversion`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType, label }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch { /* leave prior selection on failure */ }
  }, [clientId, load]);

  const handleToggleSection = useCallback(async (key: string, visible: boolean) => {
    setResponse(prev => prev ? { ...prev, sections: { ...prev.sections, [key]: visible } } : prev);
    try {
      const res = await fetch(`/api/clients/${clientId}/hub/sections`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, visible }),
      });
      if (!res.ok) throw new Error();
      const { sections } = await res.json();
      setResponse(prev => prev ? { ...prev, sections } : prev);
    } catch {
      // revert on failure
      setResponse(prev => prev ? { ...prev, sections: { ...prev.sections, [key]: !visible } } : prev);
    }
  }, [clientId]);

  const handleEnsureShareLink = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/hub/share-link`);
      if (!res.ok) return;
      const { shareLink } = await res.json();
      setResponse(prev => prev ? { ...prev, shareLink } : prev);
    } catch { /* leave shareLink null, modal shows "Generating link…" */ }
  }, [clientId]);

  const handleToggleShareEnabled = useCallback(async (enabled: boolean) => {
    setResponse(prev => prev ? { ...prev, shareLink: prev.shareLink ? { ...prev.shareLink, is_enabled: enabled } : prev.shareLink } : prev);
    try {
      const res = await fetch(`/api/clients/${clientId}/hub/share-link`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: enabled }),
      });
      if (!res.ok) throw new Error();
      const { shareLink } = await res.json();
      setResponse(prev => prev ? { ...prev, shareLink } : prev);
    } catch {
      setResponse(prev => prev ? { ...prev, shareLink: prev.shareLink ? { ...prev.shareLink, is_enabled: !enabled } : prev.shareLink } : prev);
    }
  }, [clientId]);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_BODY, color: COLOR.ink, background: COLOR.bg }}>
        {error}
      </div>
    );
  }

  if (!response) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_BODY, color: COLOR.muted, background: COLOR.bg }}>
        Loading Client Hub…
      </div>
    );
  }

  return (
    <ClientHubView
      data={response}
      sections={response.sections}
      editable
      onToggleSection={handleToggleSection}
      shareLink={response.shareLink}
      onEnsureShareLink={handleEnsureShareLink}
      onToggleShareEnabled={handleToggleShareEnabled}
      shareOrigin={typeof window !== 'undefined' ? window.location.origin : ''}
      onPeriodChange={setRange}
      onConversionChange={handleConversionChange}
    />
  );
}
