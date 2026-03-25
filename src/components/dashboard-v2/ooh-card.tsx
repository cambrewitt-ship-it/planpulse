'use client';

import { MapPin } from 'lucide-react';
import { MediaPlanChannel } from '@/components/media-plan-builder/media-plan-grid';
import { format } from 'date-fns';
import InlineActionPoints from './inline-action-points';

interface OOHCardProps {
  channel: MediaPlanChannel;
  clientId: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function OOHCard({ channel, clientId }: OOHCardProps) {
  const totalSpend = channel.totalUpfrontSpend || 0;
  const isConfirmed = channel.oohConfirmed || false;
  
  // Get flight dates
  const flights = channel.flights || [];
  let startDate: Date | null = null;
  let endDate: Date | null = null;
  
  if (flights.length > 0) {
    const firstFlight = flights[0];
    startDate = firstFlight.startWeek instanceof Date 
      ? firstFlight.startWeek 
      : new Date(firstFlight.startWeek);
    endDate = firstFlight.endWeek instanceof Date 
      ? firstFlight.endWeek 
      : new Date(firstFlight.endWeek);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200">
      <div style={{ display: 'flex' }}>
        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-orange-100 text-orange-600">
                <MapPin className="w-5 h-5" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">Out of Home</h3>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    isConfirmed
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {isConfirmed ? '🟢 Booking Confirmed' : '🔴 Not Yet Confirmed'}
                  </span>
                </div>
              </div>
            </div>

            {/* Flight dates */}
            {startDate && endDate && (
              <div className="mt-3 space-y-1">
                <label className="text-xs text-gray-600 font-medium">Flight Dates</label>
                <p className="text-xs text-gray-700">
                  {format(startDate, 'MMM d, yyyy')} → {format(endDate, 'MMM d, yyyy')}
                </p>
              </div>
            )}

            {/* Total spend */}
            <div className="mt-3 space-y-1">
              <label className="text-xs text-gray-600 font-medium">Total Spend</label>
              <p className="text-sm font-semibold text-gray-900">{formatCurrency(totalSpend)}</p>
            </div>

            {/* Info note */}
            <div className="mt-3 p-2 bg-gray-50 rounded border border-gray-200">
              <p className="text-xs text-gray-500 italic">
                Live tracking not available for OOH
              </p>
            </div>
          </div>
        </div>

        {/* Action Points — right side column (half width) */}
        <div style={{ flex: 1, minWidth: 0, borderLeft: '1px solid #F3F4F6', background: '#FAFAFA', padding: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: '#1C1917', marginBottom: 10, fontFamily: "'Inter', system-ui, sans-serif" }}>Action Points</h3>
          <InlineActionPoints
            channelType="OOH"
            clientId={clientId}
            maxVisible={5}
            showBorder={false}
            showTitle={false}
            sideBySide={true}
          />
        </div>
      </div>
    </div>
  );
}
