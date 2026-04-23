'use client';

import { useState } from 'react';
import { Monitor, ChevronDown, ChevronUp, StickyNote, DollarSign } from 'lucide-react';
import { MediaPlanChannel } from '@/components/media-plan-builder/media-plan-grid';
import { format } from 'date-fns';
import InlineActionPoints from './inline-action-points';

interface DisplayNativeCardProps {
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

type CampaignStatus = 'planning' | 'live' | 'paused' | 'complete';

const STATUS_OPTIONS: { value: CampaignStatus; label: string; dot: string; bg: string; text: string; border: string }[] = [
  { value: 'planning',  label: 'Planning',  dot: 'bg-amber-400',   bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200' },
  { value: 'live',      label: 'Live',      dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  { value: 'paused',    label: 'Paused',    dot: 'bg-orange-400',  bg: 'bg-orange-50',  text: 'text-orange-700', border: 'border-orange-200' },
  { value: 'complete',  label: 'Complete',  dot: 'bg-gray-400',    bg: 'bg-gray-100',   text: 'text-gray-600',   border: 'border-gray-200' },
];

const MILESTONES: { key: string; label: string }[] = [
  { key: 'brief_approved',      label: 'Brief approved' },
  { key: 'creative_submitted',  label: 'Creative assets submitted' },
  { key: 'creative_approved',   label: 'Creative approved' },
  { key: 'campaign_live',       label: 'Campaign launched' },
  { key: 'performance_reviewed', label: 'Performance reviewed' },
];

const isDisplayChannel = (name: string) => name.toLowerCase().includes('display');

export default function DisplayNativeCard({ channel, clientId, onUpdateChannel }: DisplayNativeCardProps) {
  const isDisplay = isDisplayChannel(channel.channelName);
  const accentColor = isDisplay ? 'cyan' : 'teal';

  const [status, setStatus] = useState<CampaignStatus>(channel.campaignStatus || 'planning');
  const [checklist, setChecklist] = useState<Record<string, boolean>>(channel.checklistItems || {});
  const [notes, setNotes] = useState(channel.campaignNotes || '');
  const [showNotes, setShowNotes] = useState(!!(channel.campaignNotes));
  const [showSpend, setShowSpend] = useState(false);
  const [manualSpend, setManualSpend] = useState(channel.manualActualSpend?.toString() || '');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const flights = channel.flights || [];
  let startDate: Date | null = null;
  let endDate: Date | null = null;
  if (flights.length > 0) {
    startDate = flights[0].startWeek instanceof Date ? flights[0].startWeek : new Date(flights[0].startWeek);
    endDate = flights[flights.length - 1].endWeek instanceof Date ? flights[flights.length - 1].endWeek : new Date(flights[flights.length - 1].endWeek);
  }

  const plannedSpend = flights.reduce((sum, f) =>
    sum + Object.values(f.monthlySpend).reduce((a, b) => a + b, 0), 0
  );

  const completedCount = MILESTONES.filter(m => checklist[m.key]).length;
  const totalCount = MILESTONES.length;

  const currentStatus = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];

  const handleStatusChange = (val: CampaignStatus) => {
    setStatus(val);
    setShowStatusMenu(false);
    onUpdateChannel?.(channel.id, { campaignStatus: val });
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

  const handleSaveSpend = () => {
    const parsed = parseFloat(manualSpend.replace(/[^0-9.]/g, ''));
    if (!isNaN(parsed)) {
      onUpdateChannel?.(channel.id, { manualActualSpend: parsed });
    }
  };

  const dotColor = {
    cyan: { icon: 'bg-cyan-100 text-cyan-600', accent: 'bg-cyan-500', bar: 'bg-cyan-400', ring: 'focus:ring-cyan-300 focus:border-cyan-300', check: 'bg-cyan-500 border-cyan-500', checkHover: 'hover:border-cyan-400', textBtn: 'text-cyan-600 hover:text-cyan-700' },
    teal: { icon: 'bg-teal-100 text-teal-600', accent: 'bg-teal-500', bar: 'bg-teal-400', ring: 'focus:ring-teal-300 focus:border-teal-300', check: 'bg-teal-500 border-teal-500', checkHover: 'hover:border-teal-400', textBtn: 'text-teal-600 hover:text-teal-700' },
  }[accentColor];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200">
      <div style={{ display: 'flex' }}>
        {/* ── Main content ─────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="px-4 pt-4 pb-3 space-y-3">

            {/* Header */}
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${dotColor.icon}`}>
                <Monitor className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{channel.channelName}</h3>

                  {/* Clickable status badge */}
                  <div className="relative">
                    <button
                      onClick={() => setShowStatusMenu(v => !v)}
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-all border ${currentStatus.bg} ${currentStatus.text} ${currentStatus.border} hover:opacity-80`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${currentStatus.dot}`} />
                      {currentStatus.label}
                      <ChevronDown className="w-3 h-3 opacity-60" />
                    </button>
                    {showStatusMenu && (
                      <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[130px]">
                        {STATUS_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => handleStatusChange(opt.value)}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${opt.value === status ? 'font-semibold' : ''}`}
                          >
                            <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">Manual tracking — live data not available</p>
              </div>
            </div>

            {/* Flight dates + spend */}
            <div className="flex gap-4">
              {startDate && endDate && (
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-0.5">Flight Dates</p>
                  <p className="text-xs text-gray-700">
                    {format(startDate, 'MMM d')} → {format(endDate, 'MMM d, yyyy')}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-500 font-medium mb-0.5">Planned Spend</p>
                <p className="text-xs font-semibold text-gray-900">{formatCurrency(plannedSpend)}</p>
              </div>
              {channel.manualActualSpend !== undefined && channel.manualActualSpend > 0 && (
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-0.5">Actual Spend</p>
                  <p className="text-xs font-semibold text-gray-900">{formatCurrency(channel.manualActualSpend)}</p>
                </div>
              )}
            </div>

            {/* ── Milestones checklist ───────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-gray-500 font-medium">Milestones</p>
                <span className="text-xs text-gray-400">{completedCount}/{totalCount}</span>
              </div>
              <div className="w-full h-1.5 bg-gray-100 rounded-full mb-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${dotColor.bar}`}
                  style={{ width: totalCount > 0 ? `${(completedCount / totalCount) * 100}%` : '0%' }}
                />
              </div>
              <div className="space-y-1.5">
                {MILESTONES.map(milestone => (
                  <label key={milestone.key} className="flex items-center gap-2 cursor-pointer group">
                    <div
                      onClick={() => handleToggleChecklist(milestone.key)}
                      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all cursor-pointer ${
                        checklist[milestone.key]
                          ? dotColor.check
                          : `border-gray-300 ${dotColor.checkHover}`
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

            {/* ── Manual spend entry ─────────────────────── */}
            <div>
              <button
                onClick={() => setShowSpend(v => !v)}
                className={`flex items-center gap-1 text-xs transition-colors ${dotColor.textBtn}`}
              >
                <DollarSign className="w-3 h-3" />
                {showSpend ? 'Hide spend' : 'Log actual spend'}
                {showSpend ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showSpend && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                    <input
                      type="number"
                      value={manualSpend}
                      onChange={e => setManualSpend(e.target.value)}
                      onBlur={handleSaveSpend}
                      placeholder="0"
                      className={`w-full text-xs border border-gray-200 rounded-lg pl-6 pr-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-1 ${dotColor.ring}`}
                    />
                  </div>
                  <button
                    onClick={handleSaveSpend}
                    className={`text-xs font-medium transition-colors ${dotColor.textBtn}`}
                  >
                    Save
                  </button>
                </div>
              )}
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
                    placeholder="Add notes about the campaign, publisher contacts, creative specs..."
                    rows={3}
                    className={`w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 text-gray-700 placeholder-gray-400 resize-none focus:outline-none focus:ring-1 ${dotColor.ring}`}
                  />
                  <button
                    onClick={handleSaveNotes}
                    className={`text-xs font-medium transition-colors ${dotColor.textBtn}`}
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
            channelType={channel.channelName}
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
