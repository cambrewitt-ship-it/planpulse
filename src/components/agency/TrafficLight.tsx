// src/components/agency/TrafficLight.tsx
// Reusable traffic light component for health status display

import * as React from 'react';
import { cn } from '@/lib/utils';

export type TrafficLightStatus = 'red' | 'amber' | 'green';
export type TrafficLightSize = 'small' | 'medium' | 'large';

interface TrafficLightProps {
  status: TrafficLightStatus | null | undefined;
  size?: TrafficLightSize;
  showLabel?: boolean;
  className?: string;
}

const sizeClasses: Record<TrafficLightSize, string> = {
  small: 'h-3 w-3',
  medium: 'h-4 w-4',
  large: 'h-6 w-6',
};

const colorClasses: Record<TrafficLightStatus, string> = {
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  green: 'bg-green-500',
};

const statusLabels: Record<TrafficLightStatus, string> = {
  red: 'Critical',
  amber: 'Warning',
  green: 'Healthy',
};

export function TrafficLight({
  status,
  size = 'medium',
  showLabel = false,
  className,
}: TrafficLightProps) {
  // Handle null/undefined status - show gray
  const displayStatus = status || null;
  const colorClass = displayStatus ? colorClasses[displayStatus] : 'bg-gray-400';
  const sizeClass = sizeClasses[size];
  const label = displayStatus ? statusLabels[displayStatus] : 'Unknown';

  return (
    <div
      className={cn('flex items-center gap-2', className)}
      title={label}
    >
      <div
        className={cn('rounded-full', sizeClass, colorClass)}
        aria-label={`Status: ${label}`}
      />
      {showLabel && (
        <span className="text-sm capitalize">
          {displayStatus || 'unknown'}
        </span>
      )}
    </div>
  );
}
