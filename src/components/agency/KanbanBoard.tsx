// src/components/agency/KanbanBoard.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Facebook, Search, Linkedin, Music, Radio } from 'lucide-react';
import type { AgencyClientActionPoints } from '@/app/api/agency/action-points/route';
import { getChannelLogo } from '@/lib/utils/channel-icons';

const AM_OPTIONS = ['Cam', 'Lockie', 'James', 'Sarah'];

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
}

function AssignMenu({ card, onAssign }: AssignMenuProps) {
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

  // Debug: Log AM_OPTIONS when menu opens
  useEffect(() => {
    if (open) {
      console.log('[AssignMenu] AM_OPTIONS:', AM_OPTIONS);
    }
  }, [open]);

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
          {AM_OPTIONS.map((am, index) => {
            console.log(`[AssignMenu] Rendering option ${index}:`, am);
            return (
              <button
                key={am}
                onClick={(e) => { 
                  e.stopPropagation(); 
                  console.log(`[AssignMenu] Clicked on:`, am);
                  setOpen(false); 
                  onAssign(card, am); 
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 10px',
                  fontSize: 11,
                  color: card.assignedTo === am ? '#4A6580' : '#1C1917',
                  fontWeight: card.assignedTo === am ? 600 : 400,
                  background: card.assignedTo === am ? 'rgba(74,101,128,0.06)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  visibility: 'visible',
                  opacity: 1,
                  height: 'auto',
                  minHeight: '24px',
                }}
              >{am}</button>
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
}

export function KanbanBoard({ actionPointClients, amFilter, onActionPointCompleted }: KanbanBoardProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Local override map for optimistic assigned_to updates
  const [assignedOverrides, setAssignedOverrides] = useState<Map<string, string | null>>(new Map());

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 400, textTransform: 'uppercase', color: '#B5B0A5', letterSpacing: '0.1em' }}>
                {col.label}
              </span>
              <span style={{ fontSize: 9, color: '#B5B0A5', marginLeft: 2 }}>{colCards.length}</span>
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
                      <AssignMenu card={card} onAssign={handleAssign} />
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
  );
}
