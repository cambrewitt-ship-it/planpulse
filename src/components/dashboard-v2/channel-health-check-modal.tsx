'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import InlineActionPoints from './inline-action-points';

interface ChannelHealthCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelType: string;
  clientId: string;
  channelStartDate?: Date | null;
  channelFlights?: { startWeek: Date | string; endWeek: Date | string }[];
  onChecklistChange?: () => void;
}

export function ChannelHealthCheckModal({
  isOpen,
  onClose,
  channelType,
  clientId,
  channelStartDate,
  channelFlights,
  onChecklistChange,
}: ChannelHealthCheckModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{channelType} — Health Check</DialogTitle>
          <DialogDescription>
            Tick off each point as you check it. Checked items stay green — if one goes stale it'll show an amber recheck reminder, but it won't silently uncheck itself.
          </DialogDescription>
        </DialogHeader>
        <InlineActionPoints
          channelType={channelType}
          clientId={clientId}
          channelStartDate={channelStartDate}
          channelFlights={channelFlights}
          showBorder={false}
          showTitle={false}
          sideBySide
          onToggleComplete={onChecklistChange}
        />
      </DialogContent>
    </Dialog>
  );
}
