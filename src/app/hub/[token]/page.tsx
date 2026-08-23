'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { ClientHubData } from '@/lib/client-hub/get-hub-data';
import { ClientHubView } from '@/components/client-hub/client-hub-view';
import type { DateRange } from '@/components/client-hub/client-hub-controls';
import { COLOR, FONT_BODY, FONT_HEAD } from '@/components/client-hub/tokens';

interface PublicHubResponse extends ClientHubData {
  sections: Record<string, boolean>;
  sectionOrder: string[];
}

export default function ClientHubPublicPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<PublicHubResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = range ? `?start=${range.start}&end=${range.end}` : '';
        const res = await fetch(`/api/hub/${token}${qs}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? 'This link is not available.');
        }
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'This link is not available.');
      }
    })();
    return () => { cancelled = true; };
  }, [token, range]);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: FONT_BODY, color: COLOR.ink, background: COLOR.bg }}>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 22 }}>This link is no longer active</div>
        <div style={{ fontSize: 14, color: COLOR.muted }}>Ask your account manager for a new share link.</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_BODY, color: COLOR.muted, background: COLOR.bg }}>
        Loading…
      </div>
    );
  }

  return <ClientHubView data={data} sections={data.sections} sectionOrder={data.sectionOrder} editable={false} onPeriodChange={setRange} publicToken={token} />;
}
