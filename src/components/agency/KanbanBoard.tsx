// src/components/agency/KanbanBoard.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Facebook, Search, Linkedin, Music, Radio, Plus, X, Check } from 'lucide-react';
import type { AgencyClientActionPoints } from '@/app/api/agency/action-points/route';
import { getChannelLogo } from '@/lib/utils/channel-icons';

const COMMON_CHANNELS = [
  'Meta Ads',
  'Google Ads',
  'LinkedIn Ads',
  'TikTok Ads',
  'Email',
  'OOH',
  'Radio',
  'Other',
];

interface AccountManager {
  id: string;
  name: string;
  email: string | null;
}

const COLORS = ['#4A6580', '#B07030', '#4A7C59', '#A0442A', '#4A6580', '#8A8578', '#4A7C59', '#A0442A'];

function clientColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  return COLORS[Math.abs(hash) % COLORS.length];
}

type KanbanStatus = '1-3' | '4-6' | '7+';

interface KanbanCard {
  id: string;
  text: string;
  status: KanbanStatus;
  clientName: string;
  clientId: string;
  channelType: string;
  tag: string;
  urgent: boolean;
  daysUntilDue: number | null;
  assignedTo: string | null;
}

function getChannelIcon(channelType: string) {
  return getChannelLogo(channelType, "w-[11px] h-[11px]");
}

const COLUMNS: { key: KanbanStatus; label: string; color: string }[] = [
  { key: '1-3', label: '1–3 days', color: '#A0442A' },
  { key: '4-6', label: '4–6 days', color: '#B07030' },
  { key: '7+', label: '7+ days', color: '#4A6580' },
];

interface AssignMenuProps {
  card: KanbanCard;
  onAssign: (card: KanbanCard, am: string | null) => void;
  accountManagers?: AccountManager[];
}

function AssignMenu({ card, onAssign, accountManagers = [] }: AssignMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && 
          menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Calculate menu position when it opens
  useEffect(() => {
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.top - 4, // Position above the button
        left: rect.right, // Align to right edge of button
      });
    } else {
      setMenuPosition(null);
    }
  }, [open]);

  // Debug: Log accountManagers when menu opens
  useEffect(() => {
    if (open) {
      console.log('[AssignMenu] accountManagers:', accountManagers);
    }
  }, [open, accountManagers]);

  return (
    <>
      <div style={{ position: 'relative' }} ref={ref}>
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
          title="Assign to account manager"
          style={{
            fontSize: 9,
            fontWeight: 500,
            padding: '1px 5px',
            borderRadius: 3,
            border: card.assignedTo ? '0.5px solid rgba(74,101,128,0.3)' : '0.5px dashed #D5D0C5',
            background: card.assignedTo ? 'rgba(74,101,128,0.08)' : 'transparent',
            color: card.assignedTo ? '#4A6580' : '#B5B0A5',
            cursor: 'pointer',
            fontFamily: "'DM Sans', system-ui, sans-serif",
            whiteSpace: 'nowrap',
          }}
        >
          {card.assignedTo ?? 'assign'}
        </button>
      </div>
      {open && menuPosition && typeof window !== 'undefined' && createPortal(
        <div 
          ref={menuRef}
          style={{
            position: 'fixed',
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            transform: 'translateX(-100%)',
            background: '#FDFCF8',
            border: '0.5px solid #E8E4DC',
            borderRadius: 5,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            zIndex: 9999,
            minWidth: 100,
            width: 'auto',
            overflow: 'visible',
            maxHeight: 'none',
            display: 'flex',
            flexDirection: 'column',
          }}>
          {accountManagers.map((am, index) => {
            console.log(`[AssignMenu] Rendering option ${index}:`, am);
            return (
              <button
                key={am.id}
                onClick={(e) => { 
                  e.stopPropagation(); 
                  console.log(`[AssignMenu] Clicked on:`, am.name);
                  setOpen(false); 
                  onAssign(card, am.name); 
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 10px',
                  fontSize: 11,
                  color: card.assignedTo === am.name ? '#4A6580' : '#1C1917',
                  fontWeight: card.assignedTo === am.name ? 600 : 400,
                  background: card.assignedTo === am.name ? 'rgba(74,101,128,0.06)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  visibility: 'visible',
                  opacity: 1,
                  height: 'auto',
                  minHeight: '24px',
                }}
              >{am.name}</button>
            );
          })}
          {card.assignedTo && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onAssign(card, null); }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 10px',
                fontSize: 10,
                color: '#B5B0A5',
                background: 'transparent',
                border: 'none',
                borderTop: '0.5px solid #E8E4DC',
                cursor: 'pointer',
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}
            >Unassign</button>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

interface KanbanBoardProps {
  actionPointClients: AgencyClientActionPoints[];
  amFilter: string;
  onActionPointCompleted?: () => void;
  accountManagers?: AccountManager[];
  availableChannels?: string[];
}

export function KanbanBoard({ actionPointClients, amFilter, onActionPointCompleted, accountManagers = [], availableChannels }: KanbanBoardProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Local override map for optimistic assigned_to updates
  const [assignedOverrides, setAssignedOverrides] = useState<Map<string, string | null>>(new Map());

  // Add action point form state
  const [isAdding, setIsAdding] = useState(false);
  const [addText, setAddText] = useState('');
  const [addChannel, setAddChannel] = useState('');
  const [addCategory, setAddCategory] = useState<'SET UP' | 'HEALTH CHECK'>('SET UP');
  const [addDaysBefore, setAddDaysBefore] = useState<string>('');
  const [addFrequency, setAddFrequency] = useState<'weekly' | 'fortnightly' | 'monthly'>('weekly');
  const [isSaving, setIsSaving] = useState(false);

  const channelOptions = availableChannels && availableChannels.length > 0
    ? availableChannels
    : COMMON_CHANNELS;

  // Flatten all outstanding action points into kanban cards
  const cards: KanbanCard[] = [];
  for (const clientGroup of actionPointClients) {
    for (const channelGroup of clientGroup.channels) {
      for (const ap of channelGroup.actionPoints) {
        let status: KanbanStatus;
        let daysUntilDue: number | null = null;

        if (ap.due_date) {
          const dueParts = ap.due_date.split('-').map(Number);
          const due = new Date(dueParts[0], dueParts[1] - 1, dueParts[2]);
          daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }

        if (daysUntilDue === null || daysUntilDue > 6) {
          status = '7+';
        } else if (daysUntilDue >= 4) {
          status = '4-6';
        } else {
          status = '1-3';
        }

        // Use optimistic override if available, else API value
        const assignedTo = assignedOverrides.has(ap.id)
          ? assignedOverrides.get(ap.id) ?? null
          : (ap.assigned_to ?? null);

        cards.push({
          id: ap.id,
          text: ap.text,
          status,
          clientName: clientGroup.clientName,
          clientId: clientGroup.clientId,
          channelType: channelGroup.channelType,
          tag: ap.category,
          urgent: daysUntilDue !== null && daysUntilDue <= 0,
          daysUntilDue,
          assignedTo,
        });
      }
    }
  }

  async function handleComplete(card: KanbanCard) {
    try {
      const res = await fetch('/api/action-points', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: card.id,
          client_id: card.clientId,
          completed: true,
        }),
      });
      if (!res.ok) {
        console.error('Failed to complete action point from Kanban');
        return;
      }
      onActionPointCompleted?.();
    } catch (err) {
      console.error('Error completing action point from Kanban:', err);
    }
  }

  async function handleAssign(card: KanbanCard, am: string | null) {
    // Optimistic update
    setAssignedOverrides(prev => new Map(prev).set(card.id, am));
    try {
      const res = await fetch('/api/action-points', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: card.id,
          client_id: card.clientId,
          assigned_to: am,
        }),
      });
      if (!res.ok) {
        console.error('Failed to assign action point');
        setAssignedOverrides(prev => {
          const next = new Map(prev);
          next.delete(card.id);
          return next;
        });
      }
    } catch (err) {
      console.error('Error assigning action point:', err);
      setAssignedOverrides(prev => {
        const next = new Map(prev);
        next.delete(card.id);
        return next;
      });
    }
  }

  async function handleSaveAdd() {
    if (!addText.trim() || !addChannel) return;
    setIsSaving(true);
    try {
      const body: any = {
        channel_type: addChannel,
        text: addText.trim(),
        category: addCategory,
      };
      if (addCategory === 'SET UP') {
        body.days_before_live_due = addDaysBefore !== '' ? Number(addDaysBefore) : null;
      } else {
        body.frequency = addFrequency;
      }
      const res = await fetch('/api/action-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        console.error('Failed to add action point:', err);
        return;
      }
      setIsAdding(false);
      setAddText('');
      setAddChannel('');
      setAddDaysBefore('');
      onActionPointCompleted?.();
    } catch (err) {
      console.error('Error adding action point:', err);
    } finally {
      setIsSaving(false);
    }
  }

  // Group by column and sort by days until due (ascending - soonest first)
  const byStatus = new Map<KanbanStatus, KanbanCard[]>();
  for (const col of COLUMNS) byStatus.set(col.key, []);
  for (const card of cards) {
    byStatus.get(card.status)?.push(card);
  }

  // Sort cards within each column by days until due (nulls last)
  for (const col of COLUMNS) {
    const colCards = byStatus.get(col.key) || [];
    colCards.sort((a, b) => {
      if (a.daysUntilDue === null && b.daysUntilDue === null) return 0;
      if (a.daysUntilDue === null) return 1;
      if (b.daysUntilDue === null) return -1;
      return a.daysUntilDue - b.daysUntilDue;
    });
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Add action point button + inline form */}
      {!isAdding ? (
        <button
          onClick={() => {
            setIsAdding(true);
            setAddChannel(channelOptions[0] || '');
            setAddText('');
            setAddDaysBefore('');
            setAddCategory('SET UP');
            setAddFrequency('weekly');
          }}
          style={{
            alignSelf: 'flex-start',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: '#8A8578',
            background: 'transparent',
            border: '0.5px dashed #D5D0C5',
            borderRadius: 4,
            padding: '3px 8px',
            cursor: 'pointer',
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}
        >
          <Plus size={10} />
          Add action point
        </button>
      ) : (
        <div style={{
          background: '#FDFCF8',
          border: '0.5px solid #D5D0C5',
          borderRadius: 6,
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          {/* Row 1: text input */}
          <input
            autoFocus
            value={addText}
            onChange={e => setAddText(e.target.value)}
            placeholder="Action point text…"
            style={{
              width: '100%',
              fontSize: 12,
              padding: '5px 8px',
              border: '0.5px solid #D5D0C5',
              borderRadius: 4,
              background: '#fff',
              fontFamily: "'DM Sans', system-ui, sans-serif",
              outline: 'none',
              color: '#1C1917',
            }}
            onKeyDown={e => { if (e.key === 'Enter') void handleSaveAdd(); if (e.key === 'Escape') setIsAdding(false); }}
          />
          {/* Row 2: channel + category + conditional */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <select
              value={addChannel}
              onChange={e => setAddChannel(e.target.value)}
              style={{
                fontSize: 11,
                padding: '3px 6px',
                border: '0.5px solid #D5D0C5',
                borderRadius: 4,
                background: '#fff',
                fontFamily: "'DM Sans', system-ui, sans-serif",
                color: '#1C1917',
                cursor: 'pointer',
              }}
            >
              {channelOptions.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={addCategory}
              onChange={e => setAddCategory(e.target.value as 'SET UP' | 'HEALTH CHECK')}
              style={{
                fontSize: 11,
                padding: '3px 6px',
                border: '0.5px solid #D5D0C5',
                borderRadius: 4,
                background: '#fff',
                fontFamily: "'DM Sans', system-ui, sans-serif",
                color: '#1C1917',
                cursor: 'pointer',
              }}
            >
              <option value="SET UP">SET UP</option>
              <option value="HEALTH CHECK">HEALTH CHECK</option>
            </select>
            {addCategory === 'SET UP' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 11, color: '#8A8578', whiteSpace: 'nowrap' }}>days before:</span>
                <input
                  type="number"
                  min="0"
                  value={addDaysBefore}
                  onChange={e => setAddDaysBefore(e.target.value)}
                  placeholder="0"
                  style={{
                    width: 52,
                    fontSize: 11,
                    padding: '3px 6px',
                    border: '0.5px solid #D5D0C5',
                    borderRadius: 4,
                    background: '#fff',
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    color: '#1C1917',
                    outline: 'none',
                  }}
                />
              </div>
            )}
            {addCategory === 'HEALTH CHECK' && (
              <select
                value={addFrequency}
                onChange={e => setAddFrequency(e.target.value as 'weekly' | 'fortnightly' | 'monthly')}
                style={{
                  fontSize: 11,
                  padding: '3px 6px',
                  border: '0.5px solid #D5D0C5',
                  borderRadius: 4,
                  background: '#fff',
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  color: '#1C1917',
                  cursor: 'pointer',
                }}
              >
                <option value="weekly">weekly</option>
                <option value="fortnightly">fortnightly</option>
                <option value="monthly">monthly</option>
              </select>
            )}
          </div>
          {/* Row 3: save / cancel */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => void handleSaveAdd()}
              disabled={isSaving || !addText.trim() || !addChannel}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                fontSize: 11, padding: '3px 10px',
                borderRadius: 4, border: 'none',
                background: isSaving || !addText.trim() || !addChannel ? '#D5D0C5' : '#4A6580',
                color: '#fff', cursor: isSaving || !addText.trim() || !addChannel ? 'default' : 'pointer',
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}
            >
              <Check size={10} />
              Save
            </button>
            <button
              onClick={() => setIsAdding(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                fontSize: 11, padding: '3px 8px',
                borderRadius: 4, border: '0.5px solid #D5D0C5',
                background: 'transparent', color: '#8A8578',
                cursor: 'pointer',
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}
            >
              <X size={10} />
              Cancel
            </button>
          </div>
        </div>
      )}

    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 12,
        width: '100%',
      }}
    >
      {COLUMNS.map(col => {
        const colCards = byStatus.get(col.key) || [];
        return (
          <div
            key={col.key}
            style={{
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
          >
            {/* Column header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
              background: `${col.color}18`,
              border: `0.5px solid ${col.color}40`,
              borderRadius: 5,
              padding: '5px 9px',
            }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: col.color, letterSpacing: '0.08em' }}>
                {col.label}
              </span>
              <span style={{ fontSize: 9, color: col.color, opacity: 0.6, marginLeft: 'auto' }}>{colCards.length}</span>
            </div>

            {/* Cards */}
            <div style={{ position: 'relative' }}>
              <div style={{
                overflowY: 'auto',
                maxHeight: 340,
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                paddingBottom: colCards.length > 3 ? 10 : 2,
              }}>
              {colCards.map((card) => (
                <div key={card.id} style={{
                  background: '#FDFCF8',
                  border: '0.5px solid #E8E4DC',
                  borderLeft: `2px solid ${col.color}`,
                  borderRadius: 6,
                  padding: '9px 11px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                }}>
                  {/* Circular checkbox */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void handleComplete(card); }}
                    title="Mark complete"
                    style={{
                      flexShrink: 0,
                      marginTop: 2,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      border: `1px solid #D5D0C5`,
                      background: 'transparent',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  />

                  {/* Card body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Top row: channel icon + text + urgent badge */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                      <div style={{ flexShrink: 0, marginTop: 1 }}>
                        {getChannelIcon(card.channelType)}
                      </div>
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: '#1C1917', lineHeight: 1.35 }}>
                        {card.text}
                      </span>
                      {card.urgent && (
                        <span style={{
                          fontSize: 9, fontWeight: 500, color: '#A0442A',
                          textTransform: 'uppercase', letterSpacing: '0.08em',
                          flexShrink: 0, whiteSpace: 'nowrap',
                        }}>OVERDUE</span>
                      )}
                    </div>
                    {/* Bottom row: client dot + name + category tag + date + assignee */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
                      <div style={{
                        width: 5, height: 5, borderRadius: '50%',
                        background: col.color, opacity: 0.6, flexShrink: 0,
                      }} />
                      <span style={{ flex: 1, fontSize: 10, color: '#8A8578', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {card.clientName}
                      </span>
                      <span style={{
                        fontSize: 9, fontWeight: 400,
                        color: card.tag === 'SET UP' ? '#B07030' : card.tag === 'HEALTH CHECK' ? '#4A7C59' : '#4A6580',
                        textTransform: 'uppercase', letterSpacing: '0.08em',
                        whiteSpace: 'nowrap',
                      }}>
                        {card.tag}
                      </span>
                      <span style={{
                        fontSize: 9, fontWeight: 400, color: '#B5B0A5',
                        whiteSpace: 'nowrap',
                      }}>
                        {card.daysUntilDue === null
                          ? 'no date'
                          : card.daysUntilDue < 0
                            ? `${Math.abs(card.daysUntilDue)}d overdue`
                            : card.daysUntilDue === 0
                              ? 'today'
                              : `${card.daysUntilDue}d`}
                      </span>
                      <AssignMenu card={card} onAssign={handleAssign} accountManagers={accountManagers} />
                    </div>
                  </div>
                </div>
              ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
    </div>
  );
}
