// src/components/agency/KanbanBoard.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Facebook, Search, Linkedin, Music, Radio, Plus, X, Check, Clock } from 'lucide-react';
import type { AgencyClientActionPoints } from '@/app/api/agency/action-points/route';
import { getChannelLogo } from '@/lib/utils/channel-icons';

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

type KanbanStatus = 'overdue' | '1-2' | '3-4' | '5+';

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
  frequency: string | null;
}

function getChannelIcon(channelType: string) {
  return getChannelLogo(channelType, "w-[11px] h-[11px]");
}

const COLUMNS: { key: KanbanStatus; label: string; color: string }[] = [
  { key: '1-2', label: '1–2 days', color: '#A0442A' },
  { key: '3-4', label: '3–4 days', color: '#B07030' },
  { key: '5+', label: '5+ days', color: '#4A7C59' },
];

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
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().split('T')[0];

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
            min={new Date().toISOString().split('T')[0]}
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
  onAskAI?: (prompt: string) => void;
  clients?: ClientOption[];
  onAccountManagerCreated?: () => void;
}

export function KanbanBoard(
  { actionPointClients, amFilter, onActionPointCompleted, accountManagers = [], view = 'kanban', onAskAI, clients = [], onAccountManagerCreated }: KanbanBoardProps
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Local override map for optimistic assigned_to updates
  const [assignedOverrides, setAssignedOverrides] = useState<Map<string, string | null>>(new Map());

  // In-progress state (local UI state)
  const [inProgressIds, setInProgressIds] = useState<Set<string>>(new Set());

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

  function handleToggleInProgress(card: KanbanCard) {
    setInProgressIds(prev => {
      const next = new Set(prev);
      if (next.has(card.id)) next.delete(card.id);
      else next.add(card.id);
      return next;
    });
  }

  // Delay channel modal state
  const [delayModal, setDelayModal] = useState<{
    clientId: string;
    clientName: string;
    channelType: string;
    overdueCount: number;
  } | null>(null);

  // Gantt popup state
  const [ganttPopup, setGanttPopup] = useState<{ card: KanbanCard; x: number; y: number } | null>(null);
  const ganttPopupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setGanttPopup(null);
  }, [view]);

  useEffect(() => {
    if (!ganttPopup) return;
    function handleClick(e: MouseEvent) {
      if (ganttPopupRef.current && !ganttPopupRef.current.contains(e.target as Node)) {
        setGanttPopup(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [ganttPopup]);

  // Quick-add to-do bar state
  const [addText, setAddText] = useState('');
  const [addDueDate, setAddDueDate] = useState<string>('');
  const [addClientId, setAddClientId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [activePopover, setActivePopover] = useState<'client' | 'due' | null>(null);
  const quickAddRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activePopover) return;
    function handleClick(e: MouseEvent) {
      if (quickAddRef.current && !quickAddRef.current.contains(e.target as Node)) {
        setActivePopover(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [activePopover]);

  // Flatten all outstanding action points into kanban cards
  const cards: KanbanCard[] = [];
  // Keep a ref so the AI event handler (useEffect) can resolve completion keys.
  // Must be declared before the loop so React hook order is stable.
  const cardsRef = useRef<KanbanCard[]>([]);
  for (const clientGroup of actionPointClients) {
    for (const channelGroup of clientGroup.channels) {
      for (const ap of channelGroup.actionPoints) {
        if (locallyCompletedIdsRef.current.has(ap.id)) continue;
        let status: KanbanStatus;
        let daysUntilDue: number | null = null;

        if (ap.due_date) {
          const dueParts = ap.due_date.split('-').map(Number);
          const due = new Date(dueParts[0], dueParts[1] - 1, dueParts[2]);
          daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }

        if (daysUntilDue !== null && daysUntilDue < 0) {
          status = 'overdue';
        } else if (daysUntilDue === null || daysUntilDue >= 5) {
          status = '5+';
        } else if (daysUntilDue >= 3) {
          status = '3-4';
        } else {
          status = '1-2';
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

  async function handleSaveAdd() {
    if (!addText.trim() || isSaving) return;
    setIsSaving(true);
    try {
      const body: any = { text: addText.trim(), category: 'TODO' };
      if (addDueDate) body.due_date = addDueDate;
      if (addClientId) body.client_id = addClientId;
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
      setAddText('');
      setAddDueDate('');
      setAddClientId('');
      setActivePopover(null);
      onActionPointCompleted?.();
    } catch (err) {
      console.error('Error adding action point:', err);
    } finally {
      setIsSaving(false);
    }
  }

  // Re-inject any completing cards that were removed from actionPointClients by
  // a concurrent refresh before the 900ms animation window is up.
  const existingIds = new Set(cards.map(c => c.id));
  for (const [, ghost] of completingCardSnapshots) {
    if (!existingIds.has(ghost.id)) cards.push(ghost);
  }

  // Group by column and sort by days until due (ascending - soonest first)
  const byStatus = new Map<KanbanStatus, KanbanCard[]>();
  byStatus.set('overdue', []);
  for (const col of COLUMNS) byStatus.set(col.key, []);
  for (const card of cards) {
    byStatus.get(card.status)?.push(card);
  }

  // Sort overdue cards: most overdue first (most negative daysUntilDue first)
  const overdueCards = byStatus.get('overdue') || [];
  overdueCards.sort((a, b) => (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0));

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

  const hasOverdue = overdueCards.length > 0;

  // All cards sorted by urgency (for list view)
  const allCardsSorted = [...cards].sort((a, b) => {
    if (a.daysUntilDue === null && b.daysUntilDue === null) return 0;
    if (a.daysUntilDue === null) return 1;
    if (b.daysUntilDue === null) return -1;
    return a.daysUntilDue - b.daysUntilDue;
  });

  // Channels with SET UP action points overdue by 3+ days — eligible for Delay button.
  // Key: `${clientId}::${channelType}` → { clientId, clientName, channelType, overdueCount }
  const delayEligibleChannels = new Map<string, { clientId: string; clientName: string; channelType: string; overdueCount: number }>();
  for (const card of overdueCards) {
    if (card.tag === 'SET UP' && card.daysUntilDue !== null && card.daysUntilDue <= -3) {
      const key = `${card.clientId}::${card.channelType}`;
      const existing = delayEligibleChannels.get(key);
      if (existing) {
        existing.overdueCount++;
      } else {
        delayEligibleChannels.set(key, { clientId: card.clientId, clientName: card.clientName, channelType: card.channelType, overdueCount: 1 });
      }
    }
  }

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
    `}</style>
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Quick-add to-do bar — always visible, pinned at the top */}
      <div ref={quickAddRef} style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          background: '#fff',
          border: '1.5px solid #1C1917',
          borderRadius: 10,
          padding: '7px 10px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          <Plus size={13} color="#8A8578" style={{ flexShrink: 0 }} />
          <input
            value={addText}
            onChange={e => setAddText(e.target.value)}
            placeholder="Type an action point, press Enter to add…"
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 12.5,
              fontFamily: "'DM Sans', system-ui, sans-serif",
              color: '#1C1917',
            }}
            onKeyDown={e => { if (e.key === 'Enter') void handleSaveAdd(); }}
          />
          <span style={{
            flexShrink: 0,
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.02em',
            color: '#8A8578',
            background: '#F5F3EF',
            border: '0.5px solid #E8E4DC',
            borderRadius: 6,
            padding: '2px 6px',
            whiteSpace: 'nowrap',
          }}>
            ↵ ADD
          </span>
        </div>

        {/* Optional chips: client / due date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {clients.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setActivePopover(p => p === 'client' ? null : 'client')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 10.5, padding: '3px 8px',
                  borderRadius: 8,
                  border: addClientId ? '0.5px solid rgba(74,101,128,0.35)' : '0.5px dashed #D5D0C5',
                  background: addClientId ? 'rgba(74,101,128,0.08)' : 'transparent',
                  color: addClientId ? '#4A6580' : '#8A8578',
                  cursor: 'pointer',
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                }}
              >
                + Client
                {addClientId
                  ? <span style={{ fontWeight: 600 }}>· {clients.find(c => c.id === addClientId)?.name ?? ''}</span>
                  : <span style={{ opacity: 0.7 }}>(optional)</span>}
              </button>
              {activePopover === 'client' && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 20,
                  background: '#FDFCF8', border: '0.5px solid #E8E4DC', borderRadius: 6,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)', minWidth: 160,
                  maxHeight: 220, overflowY: 'auto', padding: '4px 0',
                }}>
                  <button
                    onClick={() => { setAddClientId(''); setActivePopover(null); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px',
                      fontSize: 11, color: addClientId ? '#8A8578' : '#4A6580',
                      fontWeight: addClientId ? 400 : 600,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                    }}
                  >No client</button>
                  {clients.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setAddClientId(c.id); setActivePopover(null); }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px',
                        fontSize: 11, color: addClientId === c.id ? '#4A6580' : '#1C1917',
                        fontWeight: addClientId === c.id ? 600 : 400,
                        background: addClientId === c.id ? 'rgba(74,101,128,0.06)' : 'transparent',
                        border: 'none', cursor: 'pointer',
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                      }}
                    >{c.name}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setActivePopover(p => p === 'due' ? null : 'due')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 10.5, padding: '3px 8px',
                borderRadius: 8,
                border: addDueDate ? '0.5px solid rgba(74,101,128,0.35)' : '0.5px dashed #D5D0C5',
                background: addDueDate ? 'rgba(74,101,128,0.08)' : 'transparent',
                color: addDueDate ? '#4A6580' : '#8A8578',
                cursor: 'pointer',
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}
            >
              + Due date
              {addDueDate
                ? <span style={{ fontWeight: 600 }}>· {addDueDate}</span>
                : <span style={{ opacity: 0.7 }}>(optional)</span>}
            </button>
            {activePopover === 'due' && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 20,
                background: '#FDFCF8', border: '0.5px solid #E8E4DC', borderRadius: 6,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: 8,
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <input
                  autoFocus
                  type="date"
                  value={addDueDate}
                  onChange={e => setAddDueDate(e.target.value)}
                  style={{
                    fontSize: 11, padding: '4px 6px',
                    border: '0.5px solid #D5D0C5', borderRadius: 4,
                    background: '#fff', outline: 'none', color: '#1C1917',
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}
                />
                {addDueDate && (
                  <button
                    onClick={() => { setAddDueDate(''); setActivePopover(null); }}
                    style={{
                      fontSize: 10, padding: '3px 0',
                      border: 'none', background: 'transparent',
                      color: '#8A8578', cursor: 'pointer', textAlign: 'left',
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                    }}
                  >Clear</button>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ fontSize: 10, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          Just type and hit enter to add instantly — tap a chip above only if you want to set a client or due date.
        </div>
      </div>

    {view === 'gantt' ? (
      /* ── Gantt view: items positioned at their due date ── */
      (() => {
        const dueDays = allCardsSorted.filter(c => c.daysUntilDue !== null).map(c => c.daysUntilDue!);
        const startDay = dueDays.length ? Math.min(-2, Math.min(...dueDays)) : -2;
        const endDay   = dueDays.length ? Math.max(14, Math.max(...dueDays) + 3) : 14;
        const dayCount = endDay - startDay + 1;
        const DAY_W = 60;
        const ROW_H = 72;
        const todayMs = today.getTime();
        const withDue = allCardsSorted.filter(c => c.daysUntilDue !== null);
        const noDue   = allCardsSorted.filter(c => c.daysUntilDue === null);
        const totalW  = dayCount * DAY_W;

        // Compute month spans for header
        const monthSpans: Array<{ label: string; count: number }> = [];
        for (let i = 0; i < dayCount; i++) {
          const d = new Date(todayMs + (startDay + i) * 86400000);
          const label = d.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' });
          if (!monthSpans.length || monthSpans[monthSpans.length - 1].label !== label) {
            monthSpans.push({ label, count: 1 });
          } else {
            monthSpans[monthSpans.length - 1].count++;
          }
        }

        return (
          <div style={{ overflowX: 'auto', overflowY: 'auto', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
            {/* Month row */}
            <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 3, background: '#FDFCF8', minWidth: totalW }}>
              {monthSpans.map((span, i) => (
                <div key={i} style={{
                  width: span.count * DAY_W, flexShrink: 0,
                  padding: '4px 6px', fontSize: 9, fontWeight: 600,
                  color: '#8A8578', textTransform: 'uppercase', letterSpacing: '0.08em',
                  borderLeft: i === 0 ? 'none' : '0.5px solid #E8E4DC',
                  borderBottom: '0.5px solid #E8E4DC',
                  whiteSpace: 'nowrap', overflow: 'hidden',
                }}>
                  {span.label}
                </div>
              ))}
            </div>
            {/* Day labels row */}
            <div style={{ display: 'flex', position: 'sticky', top: 21, zIndex: 2, background: '#FDFCF8', borderBottom: '0.5px solid #E8E4DC', minWidth: totalW }}>
              {Array.from({ length: dayCount }, (_, i) => {
                const offset = startDay + i;
                const d = new Date(todayMs + offset * 86400000);
                const isToday = offset === 0;
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <div key={i} style={{
                    width: DAY_W, flexShrink: 0, textAlign: 'center', padding: '4px 0',
                    fontSize: isToday ? 7 : 8, fontWeight: isToday ? 700 : 400,
                    color: isToday ? '#3B82F6' : isWeekend ? '#D5D0C5' : '#8A8578',
                    background: isToday ? 'rgba(59,130,246,0.08)' : 'transparent',
                    borderLeft: isToday ? '1.5px solid rgba(59,130,246,0.5)' : '0.5px solid #F0EDE8',
                    letterSpacing: isToday ? '-0.02em' : undefined,
                  }}>
                    {isToday ? 'Today' : `${d.getDate()}`}
                  </div>
                );
              })}
            </div>
            {/* Rows — wrapped in a relative container so the today overlay is one continuous element */}
            <div style={{ position: 'relative', minWidth: totalW }}>
              {/* Single continuous today column overlay */}
              <div style={{
                position: 'absolute',
                left: (-startDay) * DAY_W,
                top: 0, bottom: 0, width: DAY_W,
                background: 'rgba(59,130,246,0.04)',
                pointerEvents: 'none', zIndex: 0,
              }} />
              <div style={{
                position: 'absolute',
                left: (-startDay) * DAY_W + DAY_W / 2 - 0.5,
                top: 0, bottom: 0, width: 1,
                background: 'rgba(59,130,246,0.35)',
                pointerEvents: 'none', zIndex: 1,
              }} />

            {withDue.map(card => {
              const isInProgress = inProgressIds.has(card.id);
              const isCompleting = completingIds.has(ck(card));
              const dotColor = card.urgent ? '#A0442A' : card.status === '1-2' ? '#A0442A' : card.status === '3-4' ? '#B07030' : '#4A6580';
              const dotX = (card.daysUntilDue! - startDay) * DAY_W;

              // For health checks, generate upcoming recurring occurrence offsets (days from today)
              const recurringOffsets: number[] = [];
              if (card.tag === 'HEALTH CHECK' && card.frequency && card.daysUntilDue !== null) {
                const intervalDays = card.frequency === 'weekly' ? 7 : card.frequency === 'fortnightly' ? 14 : card.frequency === 'monthly' ? 30 : 0;
                if (intervalDays > 0) {
                  for (let n = 1; n <= 20; n++) {
                    const futureDays = card.daysUntilDue + n * intervalDays;
                    if (futureDays > endDay) break;
                    recurringOffsets.push(futureDays);
                  }
                }
              }

              return (
                <div key={card.id} style={{ display: 'grid', gridTemplateRows: isCompleting ? '0fr' : '1fr', transition: 'grid-template-rows 0.45s ease 0.35s', overflow: 'hidden' }}>
                <div style={{ overflow: 'hidden' }}>
                <div style={{ position: 'relative', height: ROW_H, minWidth: totalW, borderBottom: '0.5px solid #F0EDE8', background: isInProgress ? '#FFFBF4' : 'transparent' }}>
                  {/* Grid columns */}
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', zIndex: 0 }}>
                    {Array.from({ length: dayCount }, (_, i) => {
                      const offset = startDay + i;
                      const d = new Date(todayMs + offset * 86400000);
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      return (
                        <div key={i} style={{
                          width: DAY_W, height: '100%', flexShrink: 0,
                          background: isWeekend ? 'rgba(0,0,0,0.01)' : 'transparent',
                          borderLeft: '0.5px solid #F5F3EF',
                        }} />
                      );
                    })}
                  </div>
                  {/* Future recurring occurrence dots (health checks only) */}
                  {recurringOffsets.map(futureDays => {
                    const fx = (futureDays - startDay) * DAY_W;
                    if (fx < 0 || fx > totalW) return null;
                    return (
                      <div key={futureDays} style={{
                        position: 'absolute', left: fx + DAY_W / 2 - 3, top: '50%', transform: 'translateY(-50%)',
                        width: 6, height: 6, borderRadius: '50%',
                        background: dotColor, opacity: 0.25, zIndex: 2,
                      }} />
                    );
                  })}
                  {/* Item — tick + dot + text, clickable */}
                  <div style={{
                    position: 'absolute', left: dotX, top: '50%', transform: 'translateY(-50%)',
                    display: 'flex', alignItems: 'center', gap: 4, zIndex: 3,
                  }}>
                    {/* Tick to complete */}
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); void handleComplete(card, e); }}
                      title="Mark complete"
                      style={{
                        width: 13, height: 13, borderRadius: '50%', flexShrink: 0,
                        border: isCompleting ? '1px solid #4A7C59' : '1px solid #D5D0C5',
                        background: isCompleting ? '#4A7C59' : 'transparent',
                        cursor: 'pointer', padding: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {isCompleting && <span style={{ color: '#fff', fontSize: 8, lineHeight: 1, fontWeight: 700 }}>✓</span>}
                    </button>
                    {/* Dot + text — click opens popup */}
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', maxWidth: 190 }}
                      onClick={e => setGanttPopup({ card, x: e.clientX, y: e.clientY })}
                    >
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: dotColor, boxShadow: `0 0 0 2px ${dotColor}22`,
                      }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 9, color: '#B5B0A5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.clientName}</div>
                        <div style={{ fontSize: 10, fontWeight: 500, color: isCompleting ? '#B5B0A5' : '#1C1917', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', position: 'relative', transition: 'color 0.2s' }}>
                          {card.text}
                          {isCompleting && <span style={{ position: 'absolute', left: 0, top: '50%', height: '1.5px', background: '#6B7280', width: 0, animation: 'strike 0.35s ease forwards' }} />}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                </div>
                </div>
              );
            })}
            </div>
            {/* No-date items */}
            {noDue.length > 0 && (
              <div style={{ padding: '6px 8px', borderTop: '0.5px solid #E8E4DC' }}>
                <div style={{ fontSize: 9, color: '#B5B0A5', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>No due date</div>
                {noDue.map(card => {
                  const dotColor = '#B5B0A5';
                  const isCompleting = completingIds.has(ck(card));
                  return (
                    <div key={card.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', opacity: isCompleting ? 0.5 : 1, transition: 'opacity 0.3s ease' }}>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); void handleComplete(card, e); }}
                        title="Mark complete"
                        style={{
                          width: 13, height: 13, borderRadius: '50%', flexShrink: 0,
                          border: isCompleting ? '1px solid #4A7C59' : '1px solid #D5D0C5',
                          background: isCompleting ? '#4A7C59' : 'transparent',
                          cursor: 'pointer', padding: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {isCompleting && <span style={{ color: '#fff', fontSize: 8, lineHeight: 1, fontWeight: 700 }}>✓</span>}
                      </button>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                        onClick={e => setGanttPopup({ card, x: e.clientX, y: e.clientY })}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                        <span style={{ fontSize: 10, color: isCompleting ? '#B5B0A5' : '#8A8578', textDecoration: isCompleting ? 'line-through' : 'none' }}>{card.clientName} — {card.text}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {withDue.length === 0 && noDue.length === 0 && (
              <div style={{ padding: '16px 8px', fontSize: 11, color: '#B5B0A5', textAlign: 'center' }}>No action points</div>
            )}
          </div>
        );
      })()
    ) : view === 'list' ? (
      /* ── List view: single sorted column ── */
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {allCardsSorted.map((card) => {
          const isInProgress = inProgressIds.has(card.id);
          const isCompleting = completingIds.has(ck(card));
          const isFlashing = flashingIds.has(card.id);
          const colColor = card.status === '1-2' ? '#A0442A' : card.status === '3-4' ? '#B07030' : '#4A6580';
          const clientCol = clientColor(card.clientId);
          return (
            <div key={card.id} style={{ display: 'grid', gridTemplateRows: isCompleting ? '0fr' : '1fr', marginBottom: isCompleting ? 0 : 4, transition: 'grid-template-rows 0.45s ease 0.35s, margin-bottom 0.45s ease 0.35s', overflow: 'hidden' }}>
            <div style={{ overflow: 'hidden' }}>
            <div style={{
              background: isInProgress ? '#FFFBF4' : '#FDFCF8',
              border: `0.5px solid ${isInProgress ? 'rgba(176,112,48,0.4)' : '#E8E4DC'}`,
              borderLeft: `2px solid ${isInProgress ? '#B07030' : colColor}`,
              borderRadius: 5,
              overflow: 'hidden',
              opacity: isCompleting ? 0 : 1,
              transition: 'opacity 0.3s ease',
              animation: isFlashing ? 'aiFlash 2s ease-out' : undefined,
            }}>
              {/* Client name header */}
              <div style={{
                background: clientCol,
                padding: '3px 8px',
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'nowrap',
                gap: 4,
              }}>
                <span style={{
                  fontSize: 9, fontWeight: 600, color: '#fff',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  letterSpacing: '0.02em', flex: 1, minWidth: 0,
                }}>{card.clientName}</span>
                <AssignMenu card={card} onAssign={handleAssign} accountManagers={accountManagers} variant="header" onAccountManagerCreated={onAccountManagerCreated} />
                {card.daysUntilDue !== null && (
                  card.daysUntilDue < 0 ? (
                    <span style={{ fontSize: 9, fontWeight: 600, color: '#FCA5A5', background: '#7F1D1D', borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {Math.abs(card.daysUntilDue)}d overdue
                    </span>
                  ) : (
                    <span style={{ fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.9)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {card.daysUntilDue === 0 ? 'today' : `due in ${card.daysUntilDue}d`}
                    </span>
                  )
                )}
              </div>
              {/* Card content */}
              <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0, paddingTop: 2 }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void handleComplete(card, e); }}
                  title="Mark complete"
                  style={{
                    width: 14, height: 14, borderRadius: '50%',
                    border: isCompleting ? '1px solid #4A7C59' : '1px solid #D5D0C5',
                    background: isCompleting ? '#4A7C59' : 'transparent',
                    cursor: 'pointer', padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                >
                  {isCompleting && <span style={{ color: '#fff', fontSize: 8, lineHeight: 1, fontWeight: 700 }}>✓</span>}
                </button>
                {getChannelIcon(card.channelType)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: isCompleting ? '#B5B0A5' : '#1C1917', lineHeight: 1.35, textDecoration: isCompleting ? 'line-through' : 'none', transition: 'color 0.2s' }}>{card.text}</span>
                  {card.urgent && !isCompleting && (
                    <span style={{ fontSize: 9, fontWeight: 500, color: '#A0442A', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0, whiteSpace: 'nowrap' }}>OVERDUE</span>
                  )}
                </div>
                <span style={{ fontSize: 9, fontWeight: 400, display: 'block', marginTop: 4, color: card.tag === 'SET UP' ? '#B07030' : card.tag === 'HEALTH CHECK' ? '#4A7C59' : card.tag === 'TODO' ? '#7A5C8A' : '#4A6580', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{card.tag}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleToggleInProgress(card); }}
                      style={{ fontSize: isInProgress ? 8 : 9, fontWeight: isInProgress ? 600 : 500, padding: '2px 6px', borderRadius: 3, border: isInProgress ? '0.5px solid rgba(176,112,48,0.3)' : '0.5px solid #C8C4BC', background: isInProgress ? 'rgba(176,112,48,0.12)' : 'rgba(0,0,0,0.04)', color: isInProgress ? '#B07030' : '#8A8578', cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif", whiteSpace: 'nowrap', textTransform: isInProgress ? 'uppercase' : 'none', letterSpacing: isInProgress ? '0.07em' : 'normal' }}
                    >{isInProgress ? 'In Progress' : 'In Progress'}</button>
                    {onAskAI && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); onAskAI(`Help me with this action point for ${card.clientName} (${card.channelType}): ${card.text}`); }} style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 3, border: '0.5px solid rgba(74,101,128,0.5)', background: 'rgba(74,101,128,0.12)', color: '#4A6580', cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif", whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3 }}><span style={{ fontSize: 10, lineHeight: 1 }}>✦</span>Ask AI</button>
                    )}
                  </div>
                </div>
              </div>
              </div>
              {card.tag === 'SET UP' && card.daysUntilDue !== null && card.daysUntilDue <= -3 && (() => {
                const info = delayEligibleChannels.get(`${card.clientId}::${card.channelType}`);
                return (
                  <button type="button" onClick={(e) => { e.stopPropagation(); setDelayModal({ clientId: card.clientId, clientName: card.clientName, channelType: card.channelType, overdueCount: info?.overdueCount ?? 1 }); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%', padding: '5px 8px', background: 'rgba(176,112,48,0.08)', borderTop: '0.5px solid rgba(176,112,48,0.3)', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 10, fontWeight: 600, color: '#B07030', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
                    <Clock size={10} />
                    Delay Channel
                  </button>
                );
              })()}
            </div>
            </div>
            </div>
          );
        })}
      </div>
    ) : (
    /* ── Kanban view: 3–4 columns, horizontally scrollable showing 2.5 cols ── */
    <div style={{ overflowX: 'auto', overflowY: 'visible', width: '100%' }}>
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${hasOverdue ? 4 : 3}, 280px)`,
        gap: 8,
        width: 'max-content',
        minWidth: '100%',
        paddingBottom: 4,
      }}
    >
      {/* Overdue column — only shown when there are overdue cards */}
      {hasOverdue && (() => {
        const OVERDUE_COLOR = '#7F1D1D';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, background: OVERDUE_COLOR, borderRadius: 5, padding: '5px 9px' }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: '#FFFFFF', letterSpacing: '0.08em' }}>Overdue</span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', marginLeft: 'auto' }}>{overdueCards.length}</span>
            </div>
            <div style={{ position: 'relative' }}>
              <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingBottom: overdueCards.length > 3 ? 10 : 2 }}>
                {overdueCards.map((card) => {
                  const isInProgress = inProgressIds.has(card.id);
                  const isCompleting = completingIds.has(ck(card));
                  const isFlashing = flashingIds.has(card.id);
                  const clientCol = clientColor(card.clientId);
                  return (
                    <div key={card.id} style={{ display: 'grid', gridTemplateRows: isCompleting ? '0fr' : '1fr', marginBottom: isCompleting ? 0 : 5, transition: 'grid-template-rows 0.45s ease 0.35s, margin-bottom 0.45s ease 0.35s', overflow: 'hidden', flexShrink: 0 }}>
                    <div style={{ overflow: 'hidden' }}>
                    <div style={{ background: isInProgress ? '#FFFBF4' : '#FDFCF8', border: `0.5px solid ${isInProgress ? 'rgba(176,112,48,0.4)' : '#E8E4DC'}`, borderLeft: `2px solid ${isInProgress ? '#B07030' : OVERDUE_COLOR}`, borderRadius: 5, overflow: 'hidden', animation: isFlashing ? 'aiFlash 2s ease-out' : undefined }}>
                      <div style={{ background: clientCol, padding: '3px 8px', display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 4 }}>
                        <span style={{ fontSize: 9, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.02em', flex: 1, minWidth: 0 }}>{card.clientName}</span>
                        <AssignMenu card={card} onAssign={handleAssign} accountManagers={accountManagers} variant="header" onAccountManagerCreated={onAccountManagerCreated} />
                        <span style={{ fontSize: 9, fontWeight: 600, color: '#FCA5A5', background: '#7F1D1D', borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap', flexShrink: 0 }}>{Math.abs(card.daysUntilDue!)}d overdue</span>
                      </div>
                      <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0, paddingTop: 2 }}>
                          <button type="button" onClick={(e) => { e.stopPropagation(); void handleComplete(card, e); }} title="Mark complete" style={{ width: 14, height: 14, borderRadius: '50%', border: isCompleting ? '1px solid #4A7C59' : '1px solid #D5D0C5', background: isCompleting ? '#4A7C59' : 'transparent', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s, border-color 0.15s' }}>
                            {isCompleting && <span style={{ color: '#fff', fontSize: 8, lineHeight: 1, fontWeight: 700 }}>✓</span>}
                          </button>
                          {getChannelIcon(card.channelType)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                            <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: isCompleting ? '#B5B0A5' : '#1C1917', lineHeight: 1.35, transition: 'color 0.2s', position: 'relative' }}>{card.text}{isCompleting && <span style={{ position: 'absolute', left: 0, top: '50%', height: '1.5px', background: '#6B7280', width: 0, animation: 'strike 0.35s ease forwards' }} />}</span>
                          </div>
                          <span style={{ fontSize: 9, fontWeight: 400, display: 'block', marginTop: 4, color: card.tag === 'SET UP' ? '#B07030' : card.tag === 'HEALTH CHECK' ? '#4A7C59' : card.tag === 'TODO' ? '#7A5C8A' : '#4A6580', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{card.tag}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                            <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
                              <button type="button" onClick={(e) => { e.stopPropagation(); handleToggleInProgress(card); }} title={isInProgress ? 'Clear in progress' : 'Mark as in progress'} style={{ fontSize: isInProgress ? 8 : 9, fontWeight: isInProgress ? 600 : 500, padding: '2px 6px', borderRadius: 3, border: isInProgress ? '0.5px solid rgba(176,112,48,0.3)' : '0.5px solid #C8C4BC', background: isInProgress ? 'rgba(176,112,48,0.12)' : 'rgba(0,0,0,0.04)', color: isInProgress ? '#B07030' : '#8A8578', cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif", whiteSpace: 'nowrap', textTransform: isInProgress ? 'uppercase' : 'none', letterSpacing: isInProgress ? '0.07em' : 'normal' }}>In Progress</button>
                              {onAskAI && (
                                <button type="button" onClick={(e) => { e.stopPropagation(); onAskAI(`Help me with this action point for ${card.clientName} (${card.channelType}): ${card.text}`); }} style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 3, border: '0.5px solid rgba(74,101,128,0.5)', background: 'rgba(74,101,128,0.12)', color: '#4A6580', cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif", whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3 }}><span style={{ fontSize: 10, lineHeight: 1 }}>✦</span>Ask AI</button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      {card.tag === 'SET UP' && card.daysUntilDue !== null && card.daysUntilDue <= -3 && (() => {
                        const info = delayEligibleChannels.get(`${card.clientId}::${card.channelType}`);
                        return (
                          <button type="button" onClick={(e) => { e.stopPropagation(); setDelayModal({ clientId: card.clientId, clientName: card.clientName, channelType: card.channelType, overdueCount: info?.overdueCount ?? 1 }); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%', padding: '5px 8px', background: 'rgba(176,112,48,0.08)', borderTop: '0.5px solid rgba(176,112,48,0.3)', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 10, fontWeight: 600, color: '#B07030', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
                            <Clock size={10} />
                            Delay Channel
                          </button>
                        );
                      })()}
                    </div>
                    </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
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
              background: col.color,
              borderRadius: 5,
              padding: '5px 9px',
            }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: '#FFFFFF', letterSpacing: '0.08em' }}>
                {col.label}
              </span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', marginLeft: 'auto' }}>{colCards.length}</span>
            </div>

            {/* Cards */}
            <div style={{ position: 'relative' }}>
              <div style={{
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                paddingBottom: colCards.length > 3 ? 10 : 2,
              }}>
              {colCards.map((card) => {
                const isInProgress = inProgressIds.has(card.id);
                const isCompleting = completingIds.has(ck(card));
                const isFlashing = flashingIds.has(card.id);
                const clientCol = clientColor(card.clientId);
                return (
                <div key={card.id} style={{ display: 'grid', gridTemplateRows: isCompleting ? '0fr' : '1fr', marginBottom: isCompleting ? 0 : 5, transition: 'grid-template-rows 0.45s ease 0.35s, margin-bottom 0.45s ease 0.35s', overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ overflow: 'hidden' }}>
                <div style={{
                  background: isInProgress ? '#FFFBF4' : '#FDFCF8',
                  border: `0.5px solid ${isInProgress ? 'rgba(176,112,48,0.4)' : '#E8E4DC'}`,
                  borderLeft: `2px solid ${isInProgress ? '#B07030' : col.color}`,
                  borderRadius: 5,
                  overflow: 'hidden',
                  animation: isFlashing ? 'aiFlash 2s ease-out' : undefined,
                }}>
                  {/* Client name header */}
                  <div style={{
                    background: clientCol,
                    padding: '3px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'nowrap',
                    gap: 4,
                  }}>
                    <span style={{
                      fontSize: 9, fontWeight: 600, color: '#fff',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      letterSpacing: '0.02em', flex: 1, minWidth: 0,
                    }}>{card.clientName}</span>
                    <AssignMenu card={card} onAssign={handleAssign} accountManagers={accountManagers} variant="header" onAccountManagerCreated={onAccountManagerCreated} />
                    {card.daysUntilDue !== null && (
                      card.daysUntilDue < 0 ? (
                        <span style={{ fontSize: 9, fontWeight: 600, color: '#FCA5A5', background: '#7F1D1D', borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {Math.abs(card.daysUntilDue)}d overdue
                        </span>
                      ) : (
                        <span style={{ fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.9)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {card.daysUntilDue === 0 ? 'today' : `due in ${card.daysUntilDue}d`}
                        </span>
                      )
                    )}
                  </div>

                  {/* Card content */}
                  <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  {/* Circular checkbox + channel icon stacked */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0, paddingTop: 2 }}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void handleComplete(card, e); }}
                      title="Mark complete"
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        border: isCompleting ? '1px solid #4A7C59' : '1px solid #D5D0C5',
                        background: isCompleting ? '#4A7C59' : 'transparent',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'background 0.15s, border-color 0.15s',
                      }}
                    >
                      {isCompleting && <span style={{ color: '#fff', fontSize: 8, lineHeight: 1, fontWeight: 700 }}>✓</span>}
                    </button>
                    {getChannelIcon(card.channelType)}
                  </div>

                  {/* Card body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Top row: text + urgent badge */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: isCompleting ? '#B5B0A5' : '#1C1917', lineHeight: 1.35, transition: 'color 0.2s', position: 'relative' }}>
                        {card.text}
                        {isCompleting && <span style={{ position: 'absolute', left: 0, top: '50%', height: '1.5px', background: '#6B7280', width: 0, animation: 'strike 0.35s ease forwards' }} />}
                      </span>
                      {card.urgent && (
                        <span style={{
                          fontSize: 9, fontWeight: 500, color: '#A0442A',
                          textTransform: 'uppercase', letterSpacing: '0.08em',
                          flexShrink: 0, whiteSpace: 'nowrap',
                        }}>OVERDUE</span>
                      )}
                    </div>
                    {/* Tag row */}
                    <span style={{ fontSize: 9, fontWeight: 400, display: 'block', marginTop: 4, color: card.tag === 'SET UP' ? '#B07030' : card.tag === 'HEALTH CHECK' ? '#4A7C59' : card.tag === 'TODO' ? '#7A5C8A' : '#4A6580', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{card.tag}</span>
                    {/* Actions row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleToggleInProgress(card); }}
                          title={isInProgress ? 'Clear in progress' : 'Mark as in progress'}
                          style={{
                            fontSize: isInProgress ? 8 : 9, fontWeight: isInProgress ? 600 : 500,
                            padding: '2px 6px',
                            borderRadius: 3,
                            border: isInProgress ? '0.5px solid rgba(176,112,48,0.3)' : '0.5px solid #C8C4BC',
                            background: isInProgress ? 'rgba(176,112,48,0.12)' : 'rgba(0,0,0,0.04)',
                            color: isInProgress ? '#B07030' : '#8A8578',
                            cursor: 'pointer',
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                            whiteSpace: 'nowrap',
                            textTransform: isInProgress ? 'uppercase' : 'none',
                            letterSpacing: isInProgress ? '0.07em' : 'normal',
                          }}
                        >
                          In Progress
                        </button>
                        {onAskAI && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onAskAI(`Help me with this action point for ${card.clientName} (${card.channelType}): ${card.text}`); }}
                            style={{
                              fontSize: 9, fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: 3,
                              border: '0.5px solid rgba(74,101,128,0.5)',
                              background: 'rgba(74,101,128,0.12)',
                              color: '#4A6580',
                              cursor: 'pointer',
                              fontFamily: "'DM Sans', system-ui, sans-serif",
                              whiteSpace: 'nowrap',
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                            }}
                          ><span style={{ fontSize: 10, lineHeight: 1 }}>✦</span>Ask AI</button>
                        )}
                      </div>
                    </div>
                  </div>
                  </div>
                </div>
                </div>
                </div>
                );
              })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
    </div>
    )}
    </div>

    {/* Gantt popup — portal, positioned at click coordinates */}
    {ganttPopup && typeof document !== 'undefined' && createPortal(
      <div
        ref={ganttPopupRef}
        style={{
          position: 'fixed',
          left: Math.min(ganttPopup.x + 8, window.innerWidth - 260),
          top: Math.min(ganttPopup.y + 8, window.innerHeight - 200),
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
        <div style={{ background: clientColor(ganttPopup.card.clientId), padding: '6px 12px' }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#fff', letterSpacing: '0.02em' }}>
            {ganttPopup.card.clientName}
          </span>
        </div>
        {/* Body */}
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Channel + tag row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {getChannelIcon(ganttPopup.card.channelType)}
            <span style={{ fontSize: 10, color: '#8A8578' }}>{ganttPopup.card.channelType}</span>
            <span style={{
              fontSize: 9, fontWeight: 500, marginLeft: 'auto',
              color: ganttPopup.card.tag === 'SET UP' ? '#B07030' : ganttPopup.card.tag === 'TODO' ? '#7A5C8A' : '#4A7C59',
              textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>{ganttPopup.card.tag}</span>
          </div>
          {/* Text */}
          <div style={{ fontSize: 12, fontWeight: 500, color: '#1C1917', lineHeight: 1.4 }}>
            {ganttPopup.card.text}
          </div>
          {/* Due date */}
          <div style={{ fontSize: 10, color: ganttPopup.card.urgent ? '#A0442A' : '#8A8578' }}>
            {ganttPopup.card.daysUntilDue === null
              ? 'No due date'
              : ganttPopup.card.daysUntilDue === 0
              ? 'Due today'
              : ganttPopup.card.daysUntilDue < 0
              ? `${Math.abs(ganttPopup.card.daysUntilDue)}d overdue`
              : `Due in ${ganttPopup.card.daysUntilDue}d`}
          </div>
          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4, borderTop: '0.5px solid #E8E4DC' }}>
            <button
              type="button"
              onClick={(e) => { void handleComplete(ganttPopup.card, e); setGanttPopup(null); }}
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
            <AssignMenu card={ganttPopup.card} onAssign={(card, am) => { handleAssign(card, am); }} accountManagers={accountManagers} onAccountManagerCreated={onAccountManagerCreated} />
            {onAskAI && (
              <button
                type="button"
                onClick={() => { onAskAI(`Help me with this action point for ${ganttPopup.card.clientName} (${ganttPopup.card.channelType}): ${ganttPopup.card.text}`); setGanttPopup(null); }}
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
