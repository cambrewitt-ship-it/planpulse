'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useChannelChecklistStatus } from './use-channel-checklist-status';

const ChannelHealthCheckModal = dynamic(
  () => import('./channel-health-check-modal').then(m => m.ChannelHealthCheckModal),
  { ssr: false }
);

const STATUS_COLORS: Record<'red' | 'amber' | 'green', string> = {
  red: '#A0442A',
  amber: '#B07030',
  green: '#4A7C59',
};

interface ChannelHealthBadgeProps {
  channelType: string;
  clientId: string;
  channelStartDate?: Date | null;
  channelFlights?: { startWeek: Date | string; endWeek: Date | string }[];
  /** Set false when the badge sits under a heading the card already renders. */
  showTopBorder?: boolean;
}

/**
 * Compact clickable status badge shown on channel cards — replaces the old
 * always-expanded inline action-point list. Opens the full checklist in a
 * modal on click.
 */
export default function ChannelHealthBadge({
  channelType,
  clientId,
  channelStartDate,
  channelFlights,
  showTopBorder = true,
}: ChannelHealthBadgeProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  const { status, doneCount, totalCount, loading } = useChannelChecklistStatus(channelType, clientId, refetchTrigger);

  return (
    <div className={showTopBorder ? 'mt-3 pt-3 border-t border-gray-100' : ''}>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 transition-colors text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              flexShrink: 0,
              background: loading ? '#C7C2B7' : STATUS_COLORS[status],
            }}
          />
          <span className="text-xs font-medium text-gray-700 truncate">Health Check</span>
        </span>
        <span className="text-xs text-gray-500 flex-shrink-0">
          {loading ? '…' : totalCount === 0 ? 'No checklist' : `${doneCount}/${totalCount} checked`}
        </span>
      </button>
      {modalOpen && (
        <ChannelHealthCheckModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          channelType={channelType}
          clientId={clientId}
          channelStartDate={channelStartDate}
          channelFlights={channelFlights}
          onChecklistChange={() => setRefetchTrigger(k => k + 1)}
        />
      )}
    </div>
  );
}
