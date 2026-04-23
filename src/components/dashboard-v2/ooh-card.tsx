'use client';

import { useState } from 'react';
import { MapPin, ChevronDown, ChevronUp, StickyNote } from 'lucide-react';
import { MediaPlanChannel } from '@/components/media-plan-builder/media-plan-grid';
import { format } from 'date-fns';
import InlineActionPoints from './inline-action-points';

interface OOHCardProps {
  channel: MediaPlanChannel;
  clientId: string;
  onUpdateChannel?: (channelId: string, updates: Partial<MediaPlanChannel>) => void;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const OOH_MILESTONES: { key: string; label: string }[] = [
  { key: 'creative_approved',   label: 'Creative approved' },
  { key: 'artwork_submitted',   label: 'Artwork submitted to supplier' },
  { key: 'site_confirmation',   label: 'Site confirmation received' },
  { key: 'installation_confirmed', label: 'Installation confirmed' },
  { key: 'photo_proof',         label: 'Photo proof received' },
];

export default function OOHCard({ channel, clientId, onUpdateChannel }: OOHCardProps) {
  const totalSpend = channel.totalUpfrontSpend || 0;
  const [isConfirmed, setIsConfirmed] = useState(channel.oohConfirmed || false);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(channel.checklistItems || {});
  const [notes, setNotes] = useState(channel.campaignNotes || '');
  const [showNotes, setShowNotes] = useState(!!(channel.campaignNotes));
  const [isSavingNotes, setIsSavingNotes] = useState(false);

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

  const completedCount = OOH_MILESTONES.filter(m => checklist[m.key]).length;
  const totalCount = OOH_MILESTONES.length;

  const handleToggleConfirmed = () => {
    const next = !isConfirmed;
    setIsConfirmed(next);
    onUpdateChannel?.(channel.id, { oohConfirmed: next });
  };

  const handleToggleChecklist = (key: string) => {
    const next = { ...checklist, [key]: !checklist[key] };
    setChecklist(next);
    onUpdateChannel?.(channel.id, { checklistItems: next });
  };

  const handleSaveNotes = () => {
    setIsSavingNotes(true);
    onUpdateChannel?.(channel.id, { campaignNotes: notes });
    setTimeout(() => setIsSavingNotes(false), 600);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200">
      <div style={{ display: 'flex' }}>
        {/* ── Main content ─────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="px-4 pt-4 pb-3 space-y-3">

            {/* Header row */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-orange-100 text-orange-600">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">Out of Home</h3>
                  {/* Clickable booking confirmation toggle */}
                  <button
                    onClick={handleToggleConfirmed}
                    title="Click to toggle booking confirmation"
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-all border ${
                      isConfirmed
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200'
                        : 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isConfirmed ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    {isConfirmed ? 'Booking Confirmed' : 'Not Yet Confirmed'}
                  </button>
                </div>
              </div>
            </div>

            {/* Flight dates */}
            {startDate && endDate && (
              <div>
                <p className="text-xs text-gray-500 font-medium mb-0.5">Flight Dates</p>
                <p className="text-xs text-gray-700">
                  {format(startDate, 'MMM d, yyyy')} → {format(endDate, 'MMM d, yyyy')}
                </p>
              </div>
            )}

            {/* Total spend */}
            <div>
              <p className="text-xs text-gray-500 font-medium mb-0.5">Total Spend</p>
              <p className="text-sm font-semibold text-gray-900">{formatCurrency(totalSpend)}</p>
            </div>

            {/* ── Milestones checklist ───────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-gray-500 font-medium">Milestones</p>
                <span className="text-xs text-gray-400">{completedCount}/{totalCount}</span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-gray-100 rounded-full mb-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300 bg-orange-400"
                  style={{ width: totalCount > 0 ? `${(completedCount / totalCount) * 100}%` : '0%' }}
                />
              </div>
              <div className="space-y-1.5">
                {OOH_MILESTONES.map(milestone => (
                  <label
                    key={milestone.key}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <div
                      onClick={() => handleToggleChecklist(milestone.key)}
                      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all cursor-pointer ${
                        checklist[milestone.key]
                          ? 'bg-orange-500 border-orange-500'
                          : 'border-gray-300 hover:border-orange-400'
                      }`}
                    >
                      {checklist[milestone.key] && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                          <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span
                      onClick={() => handleToggleChecklist(milestone.key)}
                      className={`text-xs transition-colors ${
                        checklist[milestone.key]
                          ? 'text-gray-400 line-through'
                          : 'text-gray-700 group-hover:text-gray-900'
                      }`}
                    >
                      {milestone.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* ── Notes ─────────────────────────────────── */}
            <div>
              <button
                onClick={() => setShowNotes(v => !v)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                <StickyNote className="w-3 h-3" />
                {showNotes ? 'Hide notes' : notes ? 'View notes' : 'Add notes'}
                {showNotes ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showNotes && (
                <div className="mt-2 space-y-1.5">
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    onBlur={handleSaveNotes}
                    placeholder="Add any notes about placements, artwork, contacts..."
                    rows={3}
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 text-gray-700 placeholder-gray-400 resize-none focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-300"
                  />
                  <button
                    onClick={handleSaveNotes}
                    className="text-xs text-orange-600 hover:text-orange-700 font-medium transition-colors"
                  >
                    {isSavingNotes ? 'Saved ✓' : 'Save notes'}
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ── Action Points — right column ──────────────── */}
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
