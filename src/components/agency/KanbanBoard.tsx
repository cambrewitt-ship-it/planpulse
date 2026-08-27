// src/components/agency/KanbanBoard.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Facebook, Search, Linkedin, Music, Radio, X, Check, Clock, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { DndContext, DragOverlay, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import type { AgencyClientActionPoints } from '@/app/api/agency/action-points/route';
import { getChannelLogo } from '@/lib/utils/channel-icons';
import { nzToday, nzDateKeyOffset } from '@/lib/timezone';

interface AccountManager {
  id: string;
  name: string;
  email: string | null;
}

const COLORS = ['#4A6580', '#B07030', '#4A7C59', '#A0442A', '#4A6580', '#8A8578', '#4A7C59', '#A0442A'];

function hashPalette(id: string, palette: string[]): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  return palette[Math.abs(hash) % palette.length];
}

function clientColor(id: string): string {
  return hashPalette(id, COLORS);
}

const ASSIGNEE_COLORS = ['#A0442A', '#4A6580', '#4A7C59', '#B07030'];

function assigneeColor(name: string): string {
  return hashPalette(name, ASSIGNEE_COLORS);
}

function assigneeInitials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

// Row anatomy due-label/colour rules — shared by list rows, sections, board and timeline.
function dueMeta(daysUntilDue: number | null): { label: string; color: string; weight: number } {
  if (daysUntilDue === null) return { label: 'No date', color: '#B5B0A5', weight: 400 };
  if (daysUntilDue < 0) return { label: `${-daysUntilDue}d overdue`, color: '#A0442A', weight: 500 };
  if (daysUntilDue === 0) return { label: 'Today', color: '#B07030', weight: 500 };
  if (daysUntilDue === 1) return { label: 'Tomorrow', color: '#5F5A50', weight: 400 };
  if (daysUntilDue <= 2) return { label: `${daysUntilDue}d`, color: '#5F5A50', weight: 400 };
  return { label: `${daysUntilDue}d`, color: '#8A8578', weight: 400 };
}

type ListGroupBy = 'due' | 'client' | 'stage';

interface ListSection {
  key: string;
  label: string;
  color: string;
  cards: KanbanCard[];
}

function buildListSections(cards: KanbanCard[], groupBy: ListGroupBy): ListSection[] {
  const sortByDue = (a: KanbanCard, b: KanbanCard) => {
    if (a.daysUntilDue === null && b.daysUntilDue === null) return 0;
    if (a.daysUntilDue === null) return 1;
    if (b.daysUntilDue === null) return -1;
    return a.daysUntilDue - b.daysUntilDue;
  };

  if (groupBy === 'due') {
    const defs: { key: string; label: string; color: string; test: (d: number | null) => boolean }[] = [
      { key: 'overdue', label: 'Overdue', color: '#A0442A', test: d => d !== null && d < 0 },
      { key: 'today', label: 'Today', color: '#B07030', test: d => d === 0 },
      { key: 'week', label: 'Next 7 days', color: '#4A6580', test: d => d !== null && d > 0 && d <= 7 },
      { key: 'later', label: 'Later', color: '#C7C2B7', test: d => d !== null && d > 7 },
      { key: 'none', label: 'No date', color: '#C7C2B7', test: d => d === null },
    ];
    return defs
      .map(d => ({ key: d.key, label: d.label, color: d.color, cards: cards.filter(c => d.test(c.daysUntilDue)).sort(sortByDue) }))
      .filter(s => s.cards.length > 0);
  }

  if (groupBy === 'client') {
    const map = new Map<string, KanbanCard[]>();
    for (const c of cards) {
      if (!map.has(c.clientId)) map.set(c.clientId, []);
      map.get(c.clientId)!.push(c);
    }
    return Array.from(map.entries())
      .map(([clientId, list]) => ({ key: clientId, label: list[0].clientName, color: clientColor(clientId), cards: [...list].sort(sortByDue) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  // stage — Reporting has no source field yet, so it will always be empty and omitted.
  const stageDefs: { key: string; label: string; test: (c: KanbanCard) => boolean }[] = [
    { key: 'setup', label: 'Set up', test: c => c.tag === 'SET UP' },
    { key: 'health', label: 'Health check', test: c => c.tag === 'HEALTH CHECK' || c.tag === 'ONGOING' },
    { key: 'reporting', label: 'Reporting', test: () => false },
    { key: 'other', label: 'Other', test: c => c.tag !== 'SET UP' && c.tag !== 'HEALTH CHECK' && c.tag !== 'ONGOING' },
  ];
  return stageDefs
    .map(d => ({ key: d.key, label: d.label, color: '#8A8578', cards: cards.filter(d.test).sort(sortByDue) }))
    .filter(s => s.cards.length > 0);
}

// ── Board view ──────────────────────────────────────────────────────────
// Status isn't a persisted field on action points yet — board placement is
// local-only (resets on reload) until a schema decision lands alongside
// drag-and-drop (see the summary flagged to the user).
type BoardStatus = 'To do' | 'In progress' | 'Blocked' | 'Done';

const BOARD_COLUMNS: { key: BoardStatus; color: string }[] = [
  { key: 'To do', color: '#C7C2B7' },
  { key: 'In progress', color: '#4A6580' },
  { key: 'Blocked', color: '#A0442A' },
  { key: 'Done', color: '#4A7C59' },
];

// ── Capture bar token parsing ───────────────────────────────────────────
const DOW_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const MONTH_NAME_MAP: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4,
  jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const MONTH_NAME_ALT = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysUntil(dateStr: string, today: Date): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const due = new Date(y, m - 1, d);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

function nextWeekday(word: string, from: Date): Date {
  const idx = DOW_SHORT.indexOf(word.toLowerCase());
  const d = new Date(from);
  const diff = ((idx - d.getDay()) + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d;
}

// Resolves a bare day+month (no year) to the next occurrence on/after `today`.
function resolveMonthDay(day: number, month: number, today: Date): Date {
  const year = today.getFullYear();
  let d = new Date(year, month, day);
  if (d.getTime() < today.getTime()) d = new Date(year + 1, month, day);
  return d;
}

interface ParsedCapture {
  text: string;
  clientId: string | null;
  clientName: string | null;
  assignedToName: string | null;
  dueDate: string | null;
  dueLabel: string | null;
}

function parseCaptureText(raw: string, clientOptions: ClientOption[], accountManagers: AccountManager[]): ParsedCapture {
  let text = raw;
  let clientId: string | null = null;
  let clientName: string | null = null;
  let assignedToName: string | null = null;
  let dueDate: string | null = null;
  let dueLabel: string | null = null;

  const clientMatch = text.match(/#(\S+)/);
  if (clientMatch) {
    const token = clientMatch[1].toLowerCase();
    const found = clientOptions.find(c => c.name.toLowerCase().includes(token));
    if (found) {
      clientId = found.id;
      clientName = found.name;
      text = (text.slice(0, clientMatch.index) + text.slice(clientMatch.index! + clientMatch[0].length)).replace(/\s{2,}/g, ' ').trim();
    }
  }

  const assigneeMatch = text.match(/@(\S+)/);
  if (assigneeMatch) {
    const token = assigneeMatch[1].toLowerCase();
    const found = accountManagers.find(am => assigneeInitials(am.name).toLowerCase() === token || am.name.toLowerCase().startsWith(token));
    if (found) {
      assignedToName = found.name;
      text = (text.slice(0, assigneeMatch.index) + text.slice(assigneeMatch.index! + assigneeMatch[0].length)).replace(/\s{2,}/g, ' ').trim();
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // "7th october" / "7 oct" — day before month
  const dayMonthRe = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAME_ALT})\\b`, 'i');
  // "october 7th" / "oct 7" — month before day
  const monthDayRe = new RegExp(`\\b(${MONTH_NAME_ALT})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i');

  let calendarMatched = false;
  const dmMatch = text.match(dayMonthRe);
  const mdMatch = dmMatch ? null : text.match(monthDayRe);
  const full = dmMatch?.[0] ?? mdMatch?.[0];
  const dayStr = dmMatch?.[1] ?? mdMatch?.[2];
  const monthStr = dmMatch?.[2] ?? mdMatch?.[1];
  if (full && dayStr && monthStr) {
    const monthIdx = MONTH_NAME_MAP[monthStr.toLowerCase()];
    const dayNum = parseInt(dayStr, 10);
    if (monthIdx !== undefined && dayNum >= 1 && dayNum <= 31) {
      const d = resolveMonthDay(dayNum, monthIdx, today);
      dueDate = toDateStr(d);
      const diffDays = Math.round((d.getTime() - today.getTime()) / 86400000);
      dueLabel = dueMeta(diffDays).label;
      text = text.replace(full, '').replace(/\s{2,}/g, ' ').trim();
      calendarMatched = true;
    }
  }

  if (!calendarMatched) {
    const dayWordRe = /\b(?:(this|next)\s+)?(today|tomorrow|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i;
    const dayMatch = text.match(dayWordRe);
    if (dayMatch) {
      const modifier = dayMatch[1]?.toLowerCase();
      const lw = dayMatch[2].toLowerCase();
      let d: Date;
      if (lw === 'today') d = today;
      else if (lw === 'tomorrow') { d = new Date(today); d.setDate(d.getDate() + 1); }
      else {
        d = nextWeekday(lw.slice(0, 3), today);
        if (modifier === 'next') d.setDate(d.getDate() + 7);
      }
      dueDate = toDateStr(d);
      const diffDays = Math.round((d.getTime() - today.getTime()) / 86400000);
      dueLabel = dueMeta(diffDays).label;
      text = text.replace(dayWordRe, '').replace(/\s{2,}/g, ' ').trim();
    }
  }

  return { text: text.trim(), clientId, clientName, assignedToName, dueDate, dueLabel };
}

function CaptureChip({ label, matched }: { label: string; matched: boolean }) {
  return (
    <div style={{
      fontSize: 11, padding: '3px 7px', borderRadius: 3, whiteSpace: 'nowrap',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      background: matched ? '#E8E4DC' : 'transparent',
      border: matched ? 'none' : '1px dashed #E0DCD3',
      color: matched ? '#1C1917' : '#B5B0A5',
    }}>{label}</div>
  );
}

interface KanbanCard {
  id: string;
  text: string;
  clientName: string;
  clientId: string;
  channelType: string;
  tag: string;
  urgent: boolean;
  dueDate: string | null;
  daysUntilDue: number | null;
  assignedTo: string | null;
  frequency: string | null;
}

function getChannelIcon(channelType: string) {
  return getChannelLogo(channelType, "w-[11px] h-[11px]");
}

// SET UP / HEALTH CHECK action points are global templates shared across
// every client with that channel — `card.id` (== the template's id) is NOT
// unique across the flattened card list, only (id, clientId) is. Anything
// that needs a stable per-card identity (React keys, drag-and-drop ids, the
// board-status override map) must use this, not bare card.id.
function cardKey(card: KanbanCard): string {
  return `${card.id}::${card.clientId}`;
}

// ── Board card + column (drag-and-drop between the 4 fixed columns) ────────
function BoardCardContent({ card }: { card: KanbanCard }) {
  const due = dueMeta(card.daysUntilDue);
  const initials = card.assignedTo ? assigneeInitials(card.assignedTo) : null;
  return (
    <>
      <div style={{ fontSize: 13, lineHeight: 1.4, color: '#1C1917', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{card.text}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: '#FDFCF8', background: clientColor(card.clientId), padding: '3px 9px', borderRadius: 3, whiteSpace: 'nowrap', fontFamily: "'DM Sans', system-ui, sans-serif" }}>{card.clientName}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: due.color, fontWeight: due.weight, fontFamily: "'DM Sans', system-ui, sans-serif" }}>{due.label}</span>
          {initials ? (
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: assigneeColor(card.assignedTo!), color: '#FDFCF8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
          ) : (
            <div style={{ width: 24, height: 24, borderRadius: '50%', border: '1.5px dashed #D5D0C5', flexShrink: 0 }} />
          )}
        </div>
      </div>
    </>
  );
}

interface BoardCardProps {
  card: KanbanCard;
  isCompleting: boolean;
  isFlashing: boolean;
  onOpenPopup: (card: KanbanCard, x: number, y: number) => void;
}

function BoardCard({ card, isCompleting, isFlashing, onOpenPopup }: BoardCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: cardKey(card) });
  return (
    <div style={{ display: 'grid', gridTemplateRows: isCompleting ? '0fr' : '1fr', transition: 'grid-template-rows 0.45s ease 0.35s', overflow: 'hidden' }}>
    <div style={{ overflow: 'hidden' }}>
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={e => { if (!isDragging) onOpenPopup(card, e.clientX, e.clientY); }}
      style={{
        background: '#FDFCF8', border: '1px solid #E8E4DC', borderLeft: `3px solid ${clientColor(card.clientId)}`,
        borderRadius: 4, padding: '10px 11px', cursor: 'grab',
        display: 'flex', flexDirection: 'column', gap: 8,
        opacity: isDragging ? 0.3 : isCompleting ? 0.4 : 1,
        animation: isFlashing ? 'aiFlash 2s ease-out' : undefined,
        touchAction: 'none',
      }}
    >
      <BoardCardContent card={card} />
    </div>
    </div>
    </div>
  );
}

interface BoardColumnProps {
  col: { key: BoardStatus; color: string };
  cards: KanbanCard[];
  completingIds: Set<string>;
  flashingIds: Set<string>;
  ck: (c: KanbanCard) => string;
  onOpenPopup: (card: KanbanCard, x: number, y: number) => void;
  isAdding: boolean;
  addText: string;
  onAddTextChange: (v: string) => void;
  onStartAdd: () => void;
  onCommitAdd: () => void;
  onCancelAdd: () => void;
}

function BoardColumn({ col, cards, completingIds, flashingIds, ck, onOpenPopup, isAdding, addText, onAddTextChange, onStartAdd, onCommitAdd, onCancelAdd }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  return (
    <div ref={setNodeRef} style={{ width: 236, flexShrink: 0, background: isOver ? '#E8E4DC' : '#F0EDE6', borderRadius: 5, padding: 9, display: 'flex', flexDirection: 'column', gap: 7, transition: 'background 0.12s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 3px 4px' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1C1917', fontFamily: "'DM Sans', system-ui, sans-serif" }}>{col.key}</div>
        <div style={{ fontSize: 11, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>{cards.length}</div>
      </div>

      {cards.map(card => (
        <BoardCard
          key={cardKey(card)}
          card={card}
          isCompleting={completingIds.has(ck(card))}
          isFlashing={flashingIds.has(card.id)}
          onOpenPopup={onOpenPopup}
        />
      ))}

      {isAdding ? (
        <div style={{ background: '#FDFCF8', border: '1px solid #1C1917', borderRadius: 4, padding: '8px 10px' }}>
          <input
            autoFocus
            value={addText}
            onChange={e => onAddTextChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') onCommitAdd();
              if (e.key === 'Escape') onCancelAdd();
            }}
            onBlur={() => { if (!addText.trim()) onCancelAdd(); }}
            placeholder={`New task in ${col.key.toLowerCase()}`}
            style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: '#1C1917', fontFamily: "'DM Sans', system-ui, sans-serif" }}
          />
          <div style={{ fontSize: 11, color: '#B5B0A5', marginTop: 5 }}>↵ add · esc cancel</div>
        </div>
      ) : (
        <div
          onClick={onStartAdd}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 3px', fontSize: 12, color: '#B5B0A5', cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif" }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Add
        </div>
      )}
    </div>
  );
}

interface AssignMenuProps {
  card: KanbanCard;
  onAssign: (card: KanbanCard, am: string | null) => void;
  accountManagers?: AccountManager[];
  variant?: 'default' | 'header';
  onAccountManagerCreated?: () => void;
}

function AssignMenu({ card, onAssign, accountManagers = [], variant = 'default', onAccountManagerCreated }: AssignMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowAddForm(false);
        setNewName('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.top - 4,
        left: rect.right,
      });
    } else {
      setMenuPosition(null);
    }
  }, [open]);

  useEffect(() => {
    if (showAddForm) setTimeout(() => addInputRef.current?.focus(), 50);
  }, [showAddForm]);

  async function handleSaveTeamMember() {
    if (!newName.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/account-managers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        setNewName('');
        setShowAddForm(false);
        setOpen(false);
        onAccountManagerCreated?.();
      }
    } catch {}
    setSaving(false);
  }

  return (
    <>
      <div style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center' }} ref={ref}>
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
          title="Assign to account manager"
          style={{
            fontSize: 9,
            fontWeight: 500,
            padding: '1px 5px',
            borderRadius: 3,
            border: variant === 'header'
              ? (card.assignedTo ? '0.5px solid rgba(255,255,255,0.5)' : '0.5px dashed rgba(255,255,255,0.4)')
              : (card.assignedTo ? '0.5px solid rgba(74,101,128,0.3)' : '0.5px dashed #D5D0C5'),
            background: variant === 'header'
              ? (card.assignedTo ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)')
              : (card.assignedTo ? 'rgba(74,101,128,0.08)' : 'transparent'),
            color: variant === 'header' ? 'rgba(255,255,255,0.9)' : (card.assignedTo ? '#4A6580' : '#B5B0A5'),
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
            minWidth: 160,
            width: 'auto',
            overflow: 'visible',
            maxHeight: 'none',
            display: 'flex',
            flexDirection: 'column',
          }}>
          {accountManagers.map((am) => (
            <button
              key={am.id}
              onClick={(e) => { e.stopPropagation(); setOpen(false); onAssign(card, am.name); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '6px 10px', fontSize: 11,
                color: card.assignedTo === am.name ? '#4A6580' : '#1C1917',
                fontWeight: card.assignedTo === am.name ? 600 : 400,
                background: card.assignedTo === am.name ? 'rgba(74,101,128,0.06)' : 'transparent',
                border: 'none', cursor: 'pointer',
                fontFamily: "'DM Sans', system-ui, sans-serif",
                minHeight: '24px',
              }}
            >{am.name}</button>
          ))}

          {/* Add team member section */}
          {showAddForm ? (
            <div style={{ padding: '8px 10px', borderTop: accountManagers.length > 0 ? '0.5px solid #E8E4DC' : 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                ref={addInputRef}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleSaveTeamMember(); if (e.key === 'Escape') { setShowAddForm(false); setNewName(''); } }}
                placeholder="Name…"
                style={{
                  fontSize: 11, padding: '4px 7px',
                  border: '0.5px solid #D5D0C5', borderRadius: 4,
                  background: '#fff', outline: 'none',
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  color: '#1C1917', width: '100%', boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); void handleSaveTeamMember(); }}
                  disabled={!newName.trim() || saving}
                  style={{
                    flex: 1, fontSize: 10, fontWeight: 600, padding: '3px 0',
                    borderRadius: 3, border: 'none',
                    background: newName.trim() && !saving ? '#1C1917' : '#D5D0C5',
                    color: '#fff', cursor: newName.trim() && !saving ? 'pointer' : 'default',
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}
                >{saving ? 'Saving…' : 'Save'}</button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowAddForm(false); setNewName(''); }}
                  style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 3,
                    border: '0.5px solid #D5D0C5', background: 'transparent',
                    color: '#8A8578', cursor: 'pointer',
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}
                >Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setShowAddForm(true); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                width: '100%', textAlign: 'left',
                padding: '6px 10px', fontSize: 11,
                color: '#4A6580', fontWeight: 500,
                background: 'transparent',
                border: 'none',
                borderTop: accountManagers.length > 0 ? '0.5px solid #E8E4DC' : 'none',
                cursor: 'pointer',
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1, color: '#4A6580' }}>+</span>
              Add team member
            </button>
          )}

          {card.assignedTo && !showAddForm && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onAssign(card, null); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '6px 10px', fontSize: 10, color: '#B5B0A5',
                background: 'transparent', border: 'none',
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

// ── Due date picker (mini calendar) ─────────────────────────────────────────

function MiniCalendar({ selected, onSelect }: { selected: string | null; onSelect: (dateStr: string) => void }) {
  const [viewDate, setViewDate] = useState(() => {
    if (selected) {
      const [y, m] = selected.split('-').map(Number);
      return new Date(y, m - 1, 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = toDateStr(new Date());

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div style={{ padding: 9, width: 216 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setViewDate(new Date(year, month - 1, 1)); }}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#8A8578', padding: 2, display: 'flex' }}
        ><ChevronLeft size={13} /></button>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#1C1917', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          {viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setViewDate(new Date(year, month + 1, 1)); }}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#8A8578', padding: 2, display: 'flex' }}
        ><ChevronRight size={13} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} style={{ fontSize: 9, textAlign: 'center', color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const dateStr = toDateStr(new Date(year, month, d));
          const isSelected = dateStr === selected;
          const isToday = dateStr === todayStr;
          return (
            <button
              key={i}
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelect(dateStr); }}
              style={{
                fontSize: 10, height: 22, borderRadius: 4, cursor: 'pointer',
                border: isToday && !isSelected ? '1px solid #B5B0A5' : 'none',
                background: isSelected ? '#1C1917' : 'transparent',
                color: isSelected ? '#fff' : '#1C1917',
                fontFamily: "'DM Sans', system-ui, sans-serif",
                fontWeight: isSelected ? 600 : 400,
              }}
            >{d}</button>
          );
        })}
      </div>
    </div>
  );
}

interface DueDateMenuProps {
  value: string | null;
  label: string;
  color?: string;
  onChange: (dateStr: string | null) => void;
}

function DueDateMenu({ value, label, color, onChange }: DueDateMenuProps) {
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

  useEffect(() => {
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const CALENDAR_WIDTH = 234;
      setMenuPosition({
        top: rect.bottom + 4,
        left: Math.min(rect.left, window.innerWidth - CALENDAR_WIDTH - 8),
      });
    } else {
      setMenuPosition(null);
    }
  }, [open]);

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }} ref={ref}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        title="Set due date"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 11, fontWeight: 500, padding: '3px 7px', borderRadius: 4,
          border: value ? '0.5px solid rgba(28,25,23,0.15)' : '1px dashed #D5D0C5',
          background: value ? '#F5F3EF' : 'transparent',
          color: color ?? (value ? '#1C1917' : '#B5B0A5'),
          cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif", whiteSpace: 'nowrap',
        }}
      >
        <CalendarDays size={11} />
        {label}
      </button>
      {open && menuPosition && typeof window !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed', top: `${menuPosition.top}px`, left: `${menuPosition.left}px`,
            background: '#FDFCF8', border: '0.5px solid #E8E4DC', borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 9999,
          }}
        >
          <div style={{ display: 'flex', gap: 4, padding: '7px 9px 0' }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(toDateStr(today)); setOpen(false); }}
              style={{ fontSize: 10, fontWeight: 500, padding: '3px 7px', borderRadius: 4, border: '0.5px solid #E8E4DC', background: 'transparent', color: '#1C1917', cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif" }}
            >Today</button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(toDateStr(tomorrow)); setOpen(false); }}
              style={{ fontSize: 10, fontWeight: 500, padding: '3px 7px', borderRadius: 4, border: '0.5px solid #E8E4DC', background: 'transparent', color: '#1C1917', cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif" }}
            >Tomorrow</button>
            {value && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onChange(null); setOpen(false); }}
                style={{ fontSize: 10, fontWeight: 500, padding: '3px 7px', borderRadius: 4, border: '0.5px solid #E8E4DC', background: 'transparent', color: '#A0442A', cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif" }}
              >Clear</button>
            )}
          </div>
          <MiniCalendar selected={value} onSelect={(d) => { onChange(d); setOpen(false); }} />
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Delay Channel Modal ───────────────────────────────────────────────────────

interface DelayChannelModalProps {
  clientId: string;
  clientName: string;
  channelType: string;
  overdueCount: number;
  onClose: () => void;
  onDelayed: () => void;
}

function DelayChannelModal({ clientId, clientName, channelType, overdueCount, onClose, onDelayed }: DelayChannelModalProps) {
  const defaultDate = nzDateKeyOffset(1);

  const [newStartDate, setNewStartDate] = useState(defaultDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelay() {
    if (!newStartDate) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/media-plan-builder/delay-channel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName: channelType, newStartDate }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Failed to delay channel');
        return;
      }
      onDelayed();
      onClose();
    } catch {
      setError('Failed to delay channel');
    } finally {
      setSaving(false);
    }
  }

  return typeof document !== 'undefined' ? createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99998,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#FDFCF8', borderRadius: 10,
          border: '0.5px solid #D5D0C5',
          boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
          width: 320, padding: '20px 22px',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <Clock size={14} color="#B07030" />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1C1917' }}>Delay channel</span>
            </div>
            <div style={{ fontSize: 11, color: '#8A8578' }}>
              {clientName} · {channelType}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8A8578', padding: 2 }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Warning */}
        <div style={{
          background: '#F5EDE9', border: '0.5px solid rgba(160,68,42,0.25)',
          borderRadius: 6, padding: '8px 10px', marginBottom: 16, fontSize: 11, color: '#A0442A',
        }}>
          {overdueCount} SET UP action point{overdueCount > 1 ? 's are' : ' is'} overdue for this channel.
          Delaying will push all upcoming flights forward.
        </div>

        {/* Date input */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#8A8578', marginBottom: 5 }}>
            Push channel start to
          </label>
          <input
            type="date"
            value={newStartDate}
            min={nzToday()}
            onChange={e => setNewStartDate(e.target.value)}
            style={{
              width: '100%', fontSize: 12, padding: '6px 10px',
              border: '0.5px solid #D5D0C5', borderRadius: 5,
              background: '#fff', outline: 'none', color: '#1C1917',
              fontFamily: "'DM Sans', system-ui, sans-serif",
              boxSizing: 'border-box',
            }}
          />
        </div>

        {error && (
          <p style={{ fontSize: 11, color: '#A0442A', marginBottom: 10 }}>{error}</p>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => void handleDelay()}
            disabled={saving || !newStartDate}
            style={{
              flex: 1, fontSize: 12, fontWeight: 600, padding: '7px 0',
              borderRadius: 6, border: 'none',
              background: saving || !newStartDate ? '#D5D0C5' : '#B07030',
              color: '#fff', cursor: saving || !newStartDate ? 'default' : 'pointer',
              fontFamily: "'DM Sans', system-ui, sans-serif",
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Clock size={12} />
            {saving ? 'Delaying…' : 'Delay channel'}
          </button>
          <button
            onClick={onClose}
            style={{
              fontSize: 12, padding: '7px 14px',
              borderRadius: 6, border: '0.5px solid #D5D0C5',
              background: 'transparent', color: '#8A8578',
              cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;
}

interface ClientOption {
  id: string;
  name: string;
}

interface KanbanBoardProps {
  actionPointClients: AgencyClientActionPoints[];
  amFilter: string;
  onActionPointCompleted?: () => void;
  accountManagers?: AccountManager[];
  view?: 'kanban' | 'list' | 'gantt';
  onViewChange?: (view: 'kanban' | 'list' | 'gantt') => void;
  onAskAI?: (prompt: string) => void;
  clients?: ClientOption[];
  onAccountManagerCreated?: () => void;
}

export function KanbanBoard(
  { actionPointClients, amFilter, onActionPointCompleted, accountManagers = [], view = 'kanban', onViewChange, onAskAI, clients = [], onAccountManagerCreated }: KanbanBoardProps
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Grouping for the list view — Date / Client / Stage
  const [listGroupBy, setListGroupBy] = useState<ListGroupBy>('due');

  // Local override map for optimistic assigned_to updates
  const [assignedOverrides, setAssignedOverrides] = useState<Map<string, string | null>>(new Map());

  // Local override map for optimistic due_date updates
  const [dueDateOverrides, setDueDateOverrides] = useState<Map<string, string | null>>(new Map());

  // Board view column placement — not a persisted field yet (see summary),
  // so this is local-only and resets on reload.
  const [boardStatusOverrides, setBoardStatusOverrides] = useState<Map<string, BoardStatus>>(new Map());

  // Board view inline "+ Add" per column
  const [boardAddingCol, setBoardAddingCol] = useState<BoardStatus | null>(null);
  const [boardAddText, setBoardAddText] = useState('');

  // Board view drag-and-drop between columns
  const [activeDragCard, setActiveDragCard] = useState<KanbanCard | null>(null);
  const boardSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Completing state — optimistic scratch-out before card disappears.
  // Keys are `${id}:${daysUntilDue ?? 'none'}` so health-check occurrences
  // that share the same ap.id but have different due dates are distinct.
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const ck = (c: KanbanCard) => `${c.id}:${c.daysUntilDue ?? 'none'}`;

  // Snapshot of completing cards — keeps them rendered during animation even
  // if actionPointClients refreshes and removes them before the 900ms is up.
  const [completingCardSnapshots, setCompletingCardSnapshots] = useState<Map<string, KanbanCard>>(new Map());

  // IDs of cards successfully completed locally — persists so cards never
  // reappear between animation end and the next actionPointClients refresh.
  const locallyCompletedIdsRef = useRef<Set<string>>(new Set());

  // Flash/highlight newly AI-created items
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());

  // Listen for AI write actions and trigger animations
  useEffect(() => {
    const handler = (e: Event) => {
      const { tool, data } = (e as CustomEvent<{ tool: string; data: any }>).detail;
      if (!data?.success) return;

      if (tool === 'complete_action_point') {
        const apId = data.action_point?.id;
        if (apId) {
          locallyCompletedIdsRef.current.add(apId);
          const match = cardsRef.current.find(c => c.id === apId);
          const key = match ? `${match.id}:${match.daysUntilDue ?? 'none'}` : apId;
          setCompletingIds(prev => new Set(prev).add(key));
          fireConfetti(window.innerWidth - 50, window.innerHeight - 50);
        }
        setTimeout(() => onActionPointCompleted?.(), 900);
      }

      if (tool === 'create_action_point') {
        const newId = data.action_point?.id;
        // Refresh data first, then highlight the new card
        setTimeout(() => {
          onActionPointCompleted?.();
          if (newId) {
            setTimeout(() => {
              setFlashingIds(prev => new Set(prev).add(newId));
              setTimeout(() => setFlashingIds(prev => { const n = new Set(prev); n.delete(newId); return n; }), 2000);
            }, 400); // slight delay so card is rendered before highlight
          }
        }, 200);
      }
    };

    window.addEventListener('planpulse:ai-action', handler);
    return () => window.removeEventListener('planpulse:ai-action', handler);
  }, [onActionPointCompleted]);

  // Delay channel modal state
  const [delayModal, setDelayModal] = useState<{
    clientId: string;
    clientName: string;
    channelType: string;
    overdueCount: number;
  } | null>(null);

  // Card detail popup state — click on a timeline row or board card
  const [cardPopup, setCardPopup] = useState<{ card: KanbanCard; x: number; y: number } | null>(null);
  const cardPopupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCardPopup(null);
  }, [view]);

  useEffect(() => {
    if (!cardPopup) return;
    function handleClick(e: MouseEvent) {
      if (cardPopupRef.current && !cardPopupRef.current.contains(e.target as Node)) {
        setCardPopup(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [cardPopup]);

  // Capture bar state
  const [addText, setAddText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  // Explicit calendar-picked due date — takes precedence over anything typed/parsed
  const [captureDueDate, setCaptureDueDate] = useState<string | null>(null);

  // Mine | Everyone — presentational only for now (see header comment below).
  const [scope, setScope] = useState<'mine' | 'everyone'>('everyone');

  // Flatten all outstanding action points into kanban cards
  const cards: KanbanCard[] = [];
  // Keep a ref so the AI event handler (useEffect) can resolve completion keys.
  // Must be declared before the loop so React hook order is stable.
  const cardsRef = useRef<KanbanCard[]>([]);
  for (const clientGroup of actionPointClients) {
    for (const channelGroup of clientGroup.channels) {
      for (const ap of channelGroup.actionPoints) {
        if (locallyCompletedIdsRef.current.has(ap.id)) continue;
        let daysUntilDue: number | null = null;

        // Use optimistic override if available, else API value
        const dueDate = dueDateOverrides.has(ap.id)
          ? dueDateOverrides.get(ap.id) ?? null
          : (ap.due_date ?? null);

        if (dueDate) {
          const dueParts = dueDate.split('-').map(Number);
          const due = new Date(dueParts[0], dueParts[1] - 1, dueParts[2]);
          daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }

        // Use optimistic override if available, else API value
        const assignedTo = assignedOverrides.has(ap.id)
          ? assignedOverrides.get(ap.id) ?? null
          : (ap.assigned_to ?? null);

        cards.push({
          id: ap.id,
          text: ap.text,
          clientName: clientGroup.clientName,
          clientId: clientGroup.clientId,
          channelType: channelGroup.channelType,
          dueDate,
          tag: ap.category,
          urgent: daysUntilDue !== null && daysUntilDue < 0,
          daysUntilDue,
          assignedTo,
          frequency: ap.frequency ?? null,
        });
      }
    }
  }
  cardsRef.current = cards; // sync ref each render so event handler always has latest cards

  function fireConfetti(originX: number, originY: number) {
    try {
      if (typeof window === 'undefined') return;
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:99999;';
      document.body.appendChild(canvas);
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { canvas.remove(); return; }
      const COLORS = ['#4A7C59', '#4A6580', '#B07030', '#A0442A', '#F5F0E8', '#D5D0C5'];
      const pieces = Array.from({ length: 60 }, () => ({
        x: originX,
        y: originY,
        vx: (Math.random() - 0.5) * 10,
        vy: -(Math.random() * 8 + 3),
        gravity: 0.3,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        w: Math.random() * 7 + 4,
        h: Math.random() * 4 + 3,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.25,
        opacity: 1,
      }));
      let frame = 0;
      function animate() {
        ctx!.clearRect(0, 0, canvas.width, canvas.height);
        let alive = false;
        for (const p of pieces) {
          p.vy += p.gravity;
          p.x += p.vx;
          p.y += p.vy;
          p.angle += p.spin;
          if (frame > 30) p.opacity -= 0.025;
          if (p.opacity > 0 && p.y < canvas.height + 20) {
            alive = true;
            ctx!.save();
            ctx!.globalAlpha = Math.max(0, p.opacity);
            ctx!.translate(p.x, p.y);
            ctx!.rotate(p.angle);
            ctx!.fillStyle = p.color;
            ctx!.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx!.restore();
          }
        }
        frame++;
        if (alive) requestAnimationFrame(animate);
        else canvas.remove();
      }
      requestAnimationFrame(animate);
    } catch {
      // never block completion
    }
  }

  async function handleComplete(card: KanbanCard, e?: React.MouseEvent) {
    if (e) fireConfetti(e.clientX, e.clientY);
    const key = ck(card);
    // Immediately show scratch-out and snapshot the card data so it stays
    // rendered even if actionPointClients refreshes before the animation ends.
    setCompletingIds(prev => new Set(prev).add(key));
    setCompletingCardSnapshots(prev => new Map(prev).set(card.id, card));
    try {
      const isGenericTodo = card.tag === 'TODO';
      const res = await fetch('/api/action-points', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isGenericTodo
            ? { id: card.id, completed: true }
            : { id: card.id, client_id: card.clientId, completed: true }
        ),
      });
      if (!res.ok) {
        console.error('Failed to complete action point from Kanban');
        setCompletingIds(prev => { const next = new Set(prev); next.delete(key); return next; });
        setCompletingCardSnapshots(prev => { const next = new Map(prev); next.delete(card.id); return next; });
        return;
      }
      // Mark as permanently completed locally so it never reappears while
      // the parent's actionPointClients prop is still stale.
      locallyCompletedIdsRef.current.add(card.id);
      // Let the animation play for 900ms before removing the card and refreshing
      setTimeout(() => {
        setCompletingIds(prev => { const next = new Set(prev); next.delete(key); return next; });
        setCompletingCardSnapshots(prev => { const next = new Map(prev); next.delete(card.id); return next; });
        onActionPointCompleted?.();
      }, 900);
    } catch (err) {
      console.error('Error completing action point from Kanban:', err);
      setCompletingIds(prev => { const next = new Set(prev); next.delete(key); return next; });
      setCompletingCardSnapshots(prev => { const next = new Map(prev); next.delete(card.id); return next; });
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

  async function handleSetDueDate(card: KanbanCard, dateStr: string | null) {
    // Optimistic update
    setDueDateOverrides(prev => new Map(prev).set(card.id, dateStr));
    try {
      const res = await fetch('/api/action-points', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: card.id, due_date: dateStr }),
      });
      if (!res.ok) {
        console.error('Failed to set due date');
        setDueDateOverrides(prev => {
          const next = new Map(prev);
          next.delete(card.id);
          return next;
        });
      }
    } catch (err) {
      console.error('Error setting due date:', err);
      setDueDateOverrides(prev => {
        const next = new Map(prev);
        next.delete(card.id);
        return next;
      });
    }
  }

  // Shared task-creation helper — used by the capture bar and every inline
  // "+ Add" affordance (list sections, board columns). Assignee only persists
  // when a client is resolved (see the known agency-wide-TODO schema gap).
  async function createTask(text: string, opts: { clientId?: string | null; dueDate?: string | null; assignedToName?: string | null; boardStatus?: BoardStatus }) {
    const trimmed = text.trim();
    if (!trimmed || isSaving) return;
    setIsSaving(true);
    try {
      const body: any = { text: trimmed, category: 'TODO' };
      if (opts.dueDate) body.due_date = opts.dueDate;
      if (opts.clientId) body.client_id = opts.clientId;
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
      const { data } = await res.json();
      if (opts.assignedToName && opts.clientId && data?.id) {
        await fetch('/api/action-points', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: data.id, client_id: opts.clientId, assigned_to: opts.assignedToName }),
        });
      }
      if (opts.boardStatus && opts.boardStatus !== 'To do' && data?.id) {
        // Match cardKey()'s format so this override resolves once the real
        // card (grouped under the same synthetic '__agency__' client id for
        // client-less TODOs) comes back from the next refresh.
        setBoardStatusOverrides(prev => new Map(prev).set(`${data.id}::${opts.clientId ?? '__agency__'}`, opts.boardStatus!));
      }
      onActionPointCompleted?.();
    } catch (err) {
      console.error('Error adding action point:', err);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCaptureSave() {
    const parsed = parseCaptureText(addText, clients, accountManagers);
    if (!parsed.text.trim() || isSaving) return;
    // A calendar-picked date always wins over anything typed/parsed
    await createTask(parsed.text, { clientId: parsed.clientId, dueDate: captureDueDate ?? parsed.dueDate, assignedToName: parsed.assignedToName });
    setAddText('');
    setCaptureDueDate(null);
  }

  function handleBoardStatusChange(card: KanbanCard, status: BoardStatus) {
    setBoardStatusOverrides(prev => new Map(prev).set(cardKey(card), status));
    setCardPopup(null);
  }

  function handleBoardDragEnd(event: DragEndEvent) {
    setActiveDragCard(null);
    const overId = event.over?.id;
    if (!overId || !BOARD_COLUMNS.some(c => c.key === overId)) return;
    const card = cardsRef.current.find(c => cardKey(c) === event.active.id);
    if (card) handleBoardStatusChange(card, overId as BoardStatus);
  }

  // Re-inject any completing cards that were removed from actionPointClients by
  // a concurrent refresh before the 900ms animation window is up.
  const existingIds = new Set(cards.map(c => c.id));
  for (const [, ghost] of completingCardSnapshots) {
    if (!existingIds.has(ghost.id)) cards.push(ghost);
  }

  // All cards sorted by urgency
  const allCardsSorted = [...cards].sort((a, b) => {
    if (a.daysUntilDue === null && b.daysUntilDue === null) return 0;
    if (a.daysUntilDue === null) return 1;
    if (b.daysUntilDue === null) return -1;
    return a.daysUntilDue - b.daysUntilDue;
  });

  // "Delay channel" (bulk-push an overdue SET UP channel's start date) has no
  // trigger in the new UI yet — the per-card button it lived on was removed
  // along with the rest of the old chrome. DelayChannelModal below is wired
  // but unreachable until it resurfaces as a detail-pane action.
  const overdueCount = cards.filter(c => c.daysUntilDue !== null && c.daysUntilDue < 0).length;
  const todayCount = cards.filter(c => c.daysUntilDue === 0).length;
  const parsedCapture = parseCaptureText(addText, clients, accountManagers);
  const viewTab = (v: 'kanban' | 'list' | 'gantt', label: string) => (
    <button
      key={v}
      type="button"
      onClick={() => onViewChange?.(v)}
      style={{
        border: 'none', background: 'transparent', cursor: 'pointer',
        padding: '7px 14px', fontSize: 14, fontFamily: "'DM Sans', system-ui, sans-serif",
        color: view === v ? '#1C1917' : '#8A8578',
        borderBottom: `2px solid ${view === v ? '#1C1917' : 'transparent'}`,
        marginBottom: -1,
      }}
    >{label}</button>
  );

  return (
    <>
    <style>{`
      @keyframes strike {
        from { width: 0%; }
        to   { width: 100%; }
      }
      @keyframes aiFlash {
        0%   { box-shadow: inset 0 0 0 2px rgba(74,124,89,0.7), 0 0 12px rgba(74,124,89,0.35); }
        60%  { box-shadow: inset 0 0 0 2px rgba(74,124,89,0.3), 0 0 6px rgba(74,124,89,0.15); }
        100% { box-shadow: none; }
      }
      .av2-todo-row:hover { background: #F5F3EF; }
    `}</style>
    <div style={{ width: '100%', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* Panel header — title, counts, Mine|Everyone (scope filtering needs a
          logged-in-user → account-manager mapping we don't have yet, so this
          toggle is presentational only for now). */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
          <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 700, fontSize: 19, color: '#1C1917' }}>To Do</div>
          <div style={{ fontSize: 12, color: '#8A8578', whiteSpace: 'nowrap' }}>{overdueCount} overdue · {todayCount} today</div>
        </div>
        <div style={{ display: 'flex', gap: 4, background: '#EDEAE3', padding: 3, borderRadius: 4, flexShrink: 0 }}>
          {(['mine', 'everyone'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              style={{
                border: 'none', cursor: 'pointer', padding: '5px 12px', borderRadius: 3,
                fontSize: 12, fontFamily: "'DM Sans', system-ui, sans-serif",
                background: scope === s ? '#FDFCF8' : 'transparent',
                color: scope === s ? '#1C1917' : '#8A8578',
                boxShadow: scope === s ? '0 1px 2px rgba(28,25,23,0.08)' : 'none',
              }}
            >{s === 'mine' ? 'Mine' : 'Everyone'}</button>
          ))}
        </div>
      </div>

      {/* Capture bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F5F3EF', border: '1px solid #D5D0C5', borderRadius: 5, padding: '0 12px', height: 42, flexShrink: 0 }}>
        <div style={{ width: 15, height: 15, borderRadius: '50%', border: '1.5px dashed #B5B0A5', flexShrink: 0 }} />
        <input
          value={addText}
          onChange={e => setAddText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void handleCaptureSave(); }}
          placeholder="Add a task — #client, @person, this fri, 7 oct…"
          style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: '#1C1917', height: '100%', fontFamily: "'DM Sans', system-ui, sans-serif" }}
        />
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          <CaptureChip label={parsedCapture.clientName ?? '# client'} matched={!!parsedCapture.clientName} />
          <CaptureChip label={parsedCapture.assignedToName ?? '@ assign'} matched={!!parsedCapture.assignedToName} />
          <DueDateMenu
            value={captureDueDate ?? parsedCapture.dueDate}
            label={captureDueDate ? dueMeta(daysUntil(captureDueDate, today)).label : (parsedCapture.dueLabel ?? 'due date')}
            onChange={setCaptureDueDate}
          />
        </div>
      </div>

      {/* View tabs + group-by, on a shared rule */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid #E8E4DC' }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {viewTab('list', 'List')}
          {viewTab('kanban', 'Board')}
          {viewTab('gantt', 'Timeline')}
        </div>
        {view === 'list' && (
          <div style={{ display: 'flex', gap: 2, background: '#EDEAE3', padding: 2, borderRadius: 4, marginBottom: 6 }}>
            {([
              { key: 'due', label: 'Date' },
              { key: 'client', label: 'Client' },
              { key: 'stage', label: 'Stage' },
            ] as const).map(opt => {
              const active = listGroupBy === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setListGroupBy(opt.key)}
                  style={{
                    border: 'none', cursor: 'pointer', padding: '5px 11px', borderRadius: 3,
                    fontSize: 12, fontFamily: "'DM Sans', system-ui, sans-serif",
                    background: active ? '#FDFCF8' : 'transparent',
                    color: active ? '#1C1917' : '#8A8578',
                    boxShadow: active ? '0 1px 2px rgba(28,25,23,0.08)' : 'none',
                  }}
                >{opt.label}</button>
              );
            })}
          </div>
        )}
      </div>

    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
    {view === 'gantt' ? (
      /* ── Timeline view: [230px label][64px OVERDUE gutter][8 day columns] ── */
      (() => {
        const WINDOW = 8; // today + next 7 days
        const todayMs = today.getTime();
        const days = Array.from({ length: WINDOW }, (_, i) => {
          const d = new Date(todayMs + i * 86400000);
          return {
            offset: i,
            dow: d.toLocaleDateString('en-NZ', { weekday: 'short' }).toUpperCase(),
            num: d.getDate(),
            isToday: i === 0,
            isWeekend: d.getDay() === 0 || d.getDay() === 6,
          };
        });

        const inWindow = allCardsSorted.filter(c => c.daysUntilDue !== null && c.daysUntilDue < WINDOW);
        const noDue = allCardsSorted.filter(c => c.daysUntilDue === null);

        return (
          <div style={{ overflowX: 'auto', overflowY: 'auto' }}>
            {/* Day header */}
            <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid #E8E4DC', paddingBottom: 7, minWidth: 230 + 64 + WINDOW * 60 }}>
              <div style={{ width: 230, flexShrink: 0 }} />
              <div style={{ width: 64, flexShrink: 0, marginRight: 4, textAlign: 'center', fontSize: 10, letterSpacing: '0.06em', color: '#A0442A', paddingTop: 3 }}>OVERDUE</div>
              <div style={{ flex: 1, display: 'flex' }}>
                {days.map(d => (
                  <div key={d.offset} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: d.isToday ? '#1C1917' : d.isWeekend ? '#C7C2B7' : '#8A8578', fontWeight: d.isToday ? 700 : 400 }}>
                    <div style={{ letterSpacing: '0.06em' }}>{d.dow}</div>
                    <div style={{ fontSize: 12, marginTop: 2 }}>{d.num}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rows */}
            {inWindow.map(card => {
              const isCompleting = completingIds.has(ck(card));
              const color = clientColor(card.clientId);
              const overdue = card.daysUntilDue !== null && card.daysUntilDue < 0;
              return (
                <div key={cardKey(card)} style={{ display: 'grid', gridTemplateRows: isCompleting ? '0fr' : '1fr', transition: 'grid-template-rows 0.45s ease 0.35s', overflow: 'hidden' }}>
                <div style={{ overflow: 'hidden' }}>
                <div
                  onClick={e => setCardPopup({ card, x: e.clientX, y: e.clientY })}
                  style={{ display: 'flex', alignItems: 'center', height: 40, borderBottom: '1px solid #F0EDE6', cursor: 'pointer', minWidth: 230 + 64 + WINDOW * 60, opacity: isCompleting ? 0.4 : 1 }}
                >
                  <div style={{ width: 230, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, paddingRight: 12 }}>
                    <div style={{ width: 6, height: 6, borderRadius: 2, background: color, flexShrink: 0 }} />
                    <div style={{ fontSize: 12, color: '#1C1917', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.text}</div>
                  </div>
                  <div style={{
                    width: 64, flexShrink: 0, marginRight: 4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', height: 26,
                    borderRadius: 3,
                    background: overdue ? color : 'transparent',
                    color: '#FDFCF8', fontSize: 11, fontWeight: 500,
                  }}>{overdue ? `${-card.daysUntilDue!}d` : ''}</div>
                  <div style={{ flex: 1, display: 'flex' }}>
                    {days.map(d => {
                      const hit = !overdue && card.daysUntilDue === d.offset;
                      return (
                        <div key={d.offset} style={{ flex: 1, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: `1px solid ${d.isToday ? '#D5D0C5' : '#F0EDE6'}` }}>
                          {hit && (
                            <div style={{ margin: '0 2px', width: '100%', height: '100%', borderRadius: 3, background: color, color: '#FDFCF8', fontSize: 10, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {card.clientName}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                </div>
                </div>
              );
            })}

            {/* No-date items — kept below the grid so they aren't silently dropped */}
            {noDue.length > 0 && (
              <div style={{ padding: '10px 0 0', borderTop: '1px solid #E8E4DC', marginTop: 8 }}>
                <div style={{ fontSize: 11, color: '#B5B0A5', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>No due date</div>
                {noDue.map(card => {
                  const isCompleting = completingIds.has(ck(card));
                  return (
                    <div
                      key={cardKey(card)}
                      onClick={e => setCardPopup({ card, x: e.clientX, y: e.clientY })}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', opacity: isCompleting ? 0.4 : 1 }}
                    >
                      <div style={{ width: 6, height: 6, borderRadius: 2, background: clientColor(card.clientId), flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: '#8A8578' }}>{card.clientName} — {card.text}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {inWindow.length === 0 && noDue.length === 0 && (
              <div style={{ padding: '16px 8px', fontSize: 11, color: '#B5B0A5', textAlign: 'center' }}>No action points</div>
            )}
          </div>
        );
      })()
    ) : view === 'list' ? (
      /* ── List view: rows grouped into sections, four things per row ── */
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {buildListSections(allCardsSorted, listGroupBy).map(section => (
          <div key={section.key} style={{ paddingTop: 18 }}>
            {/* Section header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingBottom: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: section.color, flexShrink: 0 }} />
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#1C1917', fontFamily: "'DM Sans', system-ui, sans-serif" }}>{section.label}</div>
              <div style={{ fontSize: 11, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>{section.cards.length}</div>
              <div style={{ flex: 1, height: 1, background: '#E8E4DC' }} />
            </div>

            {section.cards.map(card => {
              const isCompleting = completingIds.has(ck(card));
              const isFlashing = flashingIds.has(card.id);
              const due = dueMeta(card.daysUntilDue);
              const initials = card.assignedTo ? assigneeInitials(card.assignedTo) : null;

              return (
                <div key={cardKey(card)} style={{ display: 'grid', gridTemplateRows: isCompleting ? '0fr' : '1fr', transition: 'grid-template-rows 0.45s ease 0.35s', overflow: 'hidden' }}>
                <div style={{ overflow: 'hidden' }}>
                <div
                  className="av2-todo-row"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9,
                    height: 38, borderRadius: 4, opacity: isCompleting ? 0.4 : 1,
                    transition: 'opacity 0.3s ease',
                    animation: isFlashing ? 'aiFlash 2s ease-out' : undefined,
                  }}
                >
                  {/* 3px client colour bar */}
                  <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: clientColor(card.clientId), flexShrink: 0 }} />

                  {/* 18px circle checkbox */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void handleComplete(card, e); }}
                    title="Mark complete"
                    style={{
                      width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                      border: isCompleting ? '1.5px solid #4A7C59' : '1.5px solid #C7C2B7',
                      background: isCompleting ? '#4A7C59' : 'transparent',
                      cursor: 'pointer', padding: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                  >
                    {isCompleting && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1, fontWeight: 700 }}>✓</span>}
                  </button>

                  {/* Title, flex, single line, ellipsis */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      position: 'relative',
                      fontSize: 14, lineHeight: 1.4, color: isCompleting ? '#B5B0A5' : '#1C1917',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      transition: 'color 0.2s',
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                    }}>
                      {card.text}
                      {isCompleting && <span style={{ position: 'absolute', left: 0, top: '50%', height: '1.5px', background: '#6B7280', width: 0, animation: 'strike 0.35s ease forwards' }} />}
                    </span>
                    {card.frequency && (
                      <span style={{ fontSize: 11, color: '#B5B0A5', flexShrink: 0 }}>↻</span>
                    )}
                  </div>

                  {/* Client chip */}
                  <span style={{
                    fontSize: 12, fontWeight: 500, letterSpacing: '0.02em', color: '#FDFCF8',
                    background: clientColor(card.clientId), padding: '3px 9px', borderRadius: 3,
                    whiteSpace: 'nowrap', flexShrink: 0,
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}>{card.clientName}</span>

                  {/* 24px assignee avatar */}
                  {initials ? (
                    <div title={card.assignedTo ?? undefined} style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      background: assigneeColor(card.assignedTo!), color: '#FDFCF8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.02em',
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                    }}>{initials}</div>
                  ) : (
                    <div title="Unassigned" style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      border: '1.5px dashed #D5D0C5',
                    }} />
                  )}

                  {/* Due label, right-aligned */}
                  <div style={{
                    width: 86, flexShrink: 0, textAlign: 'right',
                    fontSize: 12, color: isCompleting ? '#B5B0A5' : due.color, fontWeight: due.weight,
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}>{due.label}</div>
                </div>
                </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    ) : (
    /* ── Board view: fixed 236px columns, never squeezed, drag between columns ── */
    <DndContext
      sensors={boardSensors}
      collisionDetection={closestCenter}
      onDragStart={e => setActiveDragCard(cardsRef.current.find(c => cardKey(c) === e.active.id) ?? null)}
      onDragEnd={handleBoardDragEnd}
      onDragCancel={() => setActiveDragCard(null)}
    >
    <div style={{ overflowX: 'auto', overflowY: 'visible', width: '100%' }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', paddingBottom: 8 }}>
      {BOARD_COLUMNS.map(col => (
        <BoardColumn
          key={col.key}
          col={col}
          cards={allCardsSorted.filter(c => (boardStatusOverrides.get(cardKey(c)) ?? 'To do') === col.key)}
          completingIds={completingIds}
          flashingIds={flashingIds}
          ck={ck}
          onOpenPopup={(card, x, y) => setCardPopup({ card, x, y })}
          isAdding={boardAddingCol === col.key}
          addText={boardAddText}
          onAddTextChange={setBoardAddText}
          onStartAdd={() => { setBoardAddingCol(col.key); setBoardAddText(''); }}
          onCommitAdd={() => { void createTask(boardAddText, { boardStatus: col.key }); setBoardAddText(''); setBoardAddingCol(null); }}
          onCancelAdd={() => { setBoardAddingCol(null); setBoardAddText(''); }}
        />
      ))}
    </div>
    </div>
    <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
      {activeDragCard && (
        <div style={{
          width: 214, background: '#FDFCF8', border: '1px solid #D5D0C5',
          borderLeft: `3px solid ${clientColor(activeDragCard.clientId)}`,
          borderRadius: 4, padding: '10px 11px', display: 'flex', flexDirection: 'column', gap: 8,
          boxShadow: '0 10px 28px rgba(28,25,23,0.18)', cursor: 'grabbing',
        }}>
          <BoardCardContent card={activeDragCard} />
        </div>
      )}
    </DragOverlay>
    </DndContext>
    )}
    </div>
    </div>

    {/* Card detail popup — portal, positioned at click coordinates */}
    {cardPopup && typeof document !== 'undefined' && createPortal(
      <div
        ref={cardPopupRef}
        style={{
          position: 'fixed',
          left: Math.min(cardPopup.x + 8, window.innerWidth - 260),
          top: Math.min(cardPopup.y + 8, window.innerHeight - 200),
          width: 248,
          background: '#FDFCF8',
          border: '0.5px solid #D5D0C5',
          borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          zIndex: 9999,
          fontFamily: "'DM Sans', system-ui, sans-serif",
          overflow: 'hidden',
        }}
      >
        {/* Client colour header */}
        <div style={{ background: clientColor(cardPopup.card.clientId), padding: '6px 12px' }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#fff', letterSpacing: '0.02em' }}>
            {cardPopup.card.clientName}
          </span>
        </div>
        {/* Body */}
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Channel + tag row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {getChannelIcon(cardPopup.card.channelType)}
            <span style={{ fontSize: 10, color: '#8A8578' }}>{cardPopup.card.channelType}</span>
            <span style={{
              fontSize: 9, fontWeight: 500, marginLeft: 'auto',
              color: cardPopup.card.tag === 'SET UP' ? '#B07030' : cardPopup.card.tag === 'TODO' ? '#7A5C8A' : '#4A7C59',
              textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>{cardPopup.card.tag}</span>
          </div>
          {/* Text */}
          <div style={{ fontSize: 12, fontWeight: 500, color: '#1C1917', lineHeight: 1.4 }}>
            {cardPopup.card.text}
          </div>
          {/* Due date */}
          <DueDateMenu
            value={cardPopup.card.dueDate}
            label={dueMeta(cardPopup.card.daysUntilDue).label}
            color={cardPopup.card.urgent ? '#A0442A' : undefined}
            onChange={(d) => handleSetDueDate(cardPopup.card, d)}
          />
          {/* Board status — move between columns without drag-and-drop (local-only, see summary) */}
          {view === 'kanban' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingTop: 4, borderTop: '0.5px solid #E8E4DC' }}>
              {BOARD_COLUMNS.map(col => {
                const active = (boardStatusOverrides.get(cardKey(cardPopup.card)) ?? 'To do') === col.key;
                return (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => handleBoardStatusChange(cardPopup.card, col.key)}
                    style={{
                      fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 4,
                      border: active ? `1px solid ${col.color}` : '0.5px solid #E8E4DC',
                      background: active ? `${col.color}1A` : 'transparent',
                      color: active ? col.color : '#8A8578',
                      cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif",
                    }}
                  >{col.key}</button>
                );
              })}
            </div>
          )}
          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4, borderTop: '0.5px solid #E8E4DC' }}>
            <button
              type="button"
              onClick={(e) => { void handleComplete(cardPopup.card, e); setCardPopup(null); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 11, fontWeight: 500, padding: '4px 10px',
                background: '#1C1917', color: '#fff',
                border: 'none', borderRadius: 5, cursor: 'pointer',
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}
            >
              <Check size={11} />
              Complete
            </button>
            <AssignMenu card={cardPopup.card} onAssign={(card, am) => { handleAssign(card, am); }} accountManagers={accountManagers} onAccountManagerCreated={onAccountManagerCreated} />
            {onAskAI && (
              <button
                type="button"
                onClick={() => { onAskAI(`Help me with this action point for ${cardPopup.card.clientName} (${cardPopup.card.channelType}): ${cardPopup.card.text}`); setCardPopup(null); }}
                style={{
                  fontSize: 10, fontWeight: 500, padding: '4px 8px',
                  background: 'rgba(74,101,128,0.08)', color: '#4A6580',
                  border: '0.5px solid rgba(74,101,128,0.35)', borderRadius: 5, cursor: 'pointer',
                  fontFamily: "'DM Sans', system-ui, sans-serif", whiteSpace: 'nowrap',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              ><span style={{ fontSize: 11, lineHeight: 1 }}>✦</span>Ask AI</button>
            )}
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* Delay channel modal */}
    {delayModal && (
      <DelayChannelModal
        clientId={delayModal.clientId}
        clientName={delayModal.clientName}
        channelType={delayModal.channelType}
        overdueCount={delayModal.overdueCount}
        onClose={() => setDelayModal(null)}
        onDelayed={() => { onActionPointCompleted?.(); }}
      />
    )}
    </>
  );
}
