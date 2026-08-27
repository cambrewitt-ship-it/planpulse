'use client';

import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Trash2, EyeOff } from 'lucide-react';
import type { MediaPlanChannel } from '@/components/legacy-plan-builder/media-plan-grid';

const CHANNEL_TYPES: { value: NonNullable<MediaPlanChannel['channelCategory']>; label: string }[] = [
  { value: 'paid_digital',   label: 'Digital Ad Platform' },
  { value: 'organic_social', label: 'Organic Social' },
  { value: 'edm',            label: 'EDM / Email' },
  { value: 'ooh',            label: 'OOH / Outdoor' },
  { value: 'display_native', label: 'Display & Native' },
  { value: 'other',          label: 'Other' },
];

const DIGITAL_PLATFORMS = [
  'Meta Ads',
  'Google Ads',
  'LinkedIn Ads',
  'TikTok Ads',
  'Snapchat Ads',
  'Pinterest Ads',
  'Reddit Ads',
  'Twitter / X Ads',
];

interface Props {
  channel: MediaPlanChannel;
  onUpdate: (channelId: string, updates: Partial<MediaPlanChannel>) => void;
  onDelete: (channelId: string) => void;
  onHide?: () => void;
}

export function ChannelManageMenu({ channel, onUpdate, onDelete, onHide }: Props) {
  const currentType = channel.channelCategory ?? 'paid_digital';

  const [open, setOpen]               = useState(false);
  const [title, setTitle]             = useState(channel.channelName);
  const [type, setType]               = useState<string>(currentType);
  const [platform, setPlatform]       = useState<string>(channel.channelName);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync if channel prop changes from outside
  useEffect(() => {
    setTitle(channel.channelName);
    setType(channel.channelCategory ?? 'paid_digital');
    setPlatform(channel.channelName);
  }, [channel.channelName, channel.channelCategory]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmDelete(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSave = () => {
    const updates: Partial<MediaPlanChannel> = {
      channelCategory: type as MediaPlanChannel['channelCategory'],
    };
    // For digital platforms the canonical name IS the platform identifier
    updates.channelName = type === 'paid_digital' ? platform : title;
    onUpdate(channel.id, updates);
    setOpen(false);
  };

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(v => !v);
    setConfirmDelete(false);
  };

  return (
    <div ref={menuRef} className="relative flex-shrink-0">
      <button
        onClick={handleOpen}
        className="p-1 rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
        title="Manage channel"
      >
        <MoreHorizontal size={14} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl"
          style={{ width: 256 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="p-3 space-y-3">

            {/* ── Title ── */}
            {type !== 'paid_digital' && (
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Channel Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-800"
                  placeholder="Channel name"
                />
              </div>
            )}

            {/* ── Type ── */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Channel Type
              </label>
              <div className="flex flex-col gap-0.5">
                {CHANNEL_TYPES.map(ct => (
                  <button
                    key={ct.value}
                    onClick={() => setType(ct.value)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-left transition-colors w-full ${
                      type === ct.value
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span className={`w-3 h-3 rounded-full border flex-shrink-0 flex items-center justify-center transition-colors ${
                      type === ct.value ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                    }`}>
                      {type === ct.value && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </span>
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Platform (paid digital only) ── */}
            {type === 'paid_digital' && (
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Ad Platform
                </label>
                <select
                  value={DIGITAL_PLATFORMS.includes(platform) ? platform : ''}
                  onChange={e => setPlatform(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-800 bg-white"
                >
                  <option value="" disabled>Select platform…</option>
                  {DIGITAL_PLATFORMS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            )}

            {/* ── Save ── */}
            <button
              onClick={handleSave}
              className="w-full px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
            >
              Save Changes
            </button>

            {/* ── Hide ── */}
            {onHide && (
              <div className="border-t border-gray-100 pt-2">
                <button
                  onClick={() => { onHide(); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <EyeOff size={13} />
                  Hide card
                </button>
              </div>
            )}

            {/* ── Delete ── */}
            <div className="border-t border-gray-100 pt-2">
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={13} />
                  Delete channel
                </button>
              ) : (
                <div>
                  <p className="text-xs text-gray-500 mb-2 text-center">Remove this channel permanently?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => { onDelete(channel.id); setOpen(false); }}
                      className="flex-1 px-2 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
