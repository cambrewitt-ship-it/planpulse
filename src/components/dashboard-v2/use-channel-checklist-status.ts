'use client';

import { useEffect, useState } from 'react';
import {
  computeChannelStatus,
  type ChannelChecklistStatus,
  type HealthCheckFrequency,
} from '@/lib/health/channel-checklist';

export interface ChannelChecklistStatusResult {
  status: ChannelChecklistStatus;
  doneCount: number;
  totalCount: number;
  loading: boolean;
}

/**
 * Lightweight per-card status summary for the channel health-check badge —
 * fetches the same /api/action-points data InlineActionPoints uses inside
 * the modal, so the badge and the modal never disagree.
 */
export function useChannelChecklistStatus(
  channelType: string,
  clientId: string,
  refetchTrigger?: number
): ChannelChecklistStatusResult {
  const [result, setResult] = useState<ChannelChecklistStatusResult>({
    status: 'green',
    doneCount: 0,
    totalCount: 0,
    loading: true,
  });

  useEffect(() => {
    if (!channelType || !clientId) return;
    let cancelled = false;

    (async () => {
      try {
        const params = new URLSearchParams({ channel_type: channelType, client_id: clientId });
        const res = await fetch(`/api/action-points?${params.toString()}`);
        if (!res.ok || cancelled) return;
        const { data } = await res.json();
        if (!Array.isArray(data) || cancelled) return;

        const setUp = data.filter((ap: any) => ap.category === 'SET UP');
        const healthCheck = data.filter((ap: any) => ap.category === 'HEALTH CHECK' || ap.category === 'ONGOING');

        const status = computeChannelStatus(
          setUp.map((ap: any) => ({ completed: !!ap.completed })),
          healthCheck.map((ap: any) => ({
            frequency: (ap.frequency ?? null) as HealthCheckFrequency | null,
            completedAt: ap.completed_at ?? null,
          }))
        );

        setResult({
          status,
          doneCount: data.filter((ap: any) => ap.completed).length,
          totalCount: data.length,
          loading: false,
        });
      } catch {
        if (!cancelled) setResult(prev => ({ ...prev, loading: false }));
      }
    })();

    return () => { cancelled = true; };
  }, [channelType, clientId, refetchTrigger]);

  return result;
}
