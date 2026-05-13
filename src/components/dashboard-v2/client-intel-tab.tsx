'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClientNote {
  id: string;
  client_id: string;
  note_body: string;
  note_type: 'handover' | 'client_intel' | 'general';
  is_pinned: boolean;
  created_at: string;
  created_by: string | null;
  author_name: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const NOTE_TYPE_LABELS: Record<string, string> = {
  handover: 'Handover',
  client_intel: 'Client Intel',
  general: 'General',
};

const NOTE_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  handover: { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
  client_intel: { bg: '#EDE9FE', text: '#4C1D95', border: '#DDD6FE' },
  general: { bg: '#F0EDE8', text: '#4A6580', border: '#E0DCD4' },
};

// ── Design tokens ────────────────────────────────────────────────────────────

const CARD_STYLE: React.CSSProperties = {
  background: '#FDFCF8',
  border: '1px solid rgba(232,228,220,0.7)',
  borderRadius: 18,
  boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)',
  padding: '20px 24px',
  marginBottom: 14,
};

const SECTION_TITLE_STYLE: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: '#1C1917',
  fontFamily: "'DM Sans', system-ui, sans-serif",
  marginBottom: 16,
};

const BTN_SECONDARY: React.CSSProperties = {
  height: 30,
  padding: '0 12px',
  borderRadius: 12,
  border: '0.5px solid #D5D0C5',
  background: '#FDFCF8',
  color: '#1C1917',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: "'DM Sans', system-ui, sans-serif",
  display: 'flex',
  alignItems: 'center',
  gap: 5,
};

const BTN_PRIMARY: React.CSSProperties = {
  height: 30,
  padding: '0 14px',
  borderRadius: 12,
  border: 'none',
  background: '#4A6580',
  color: '#fff',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: "'DM Sans', system-ui, sans-serif",
};

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  border: '0.5px solid #D5D0C5',
  borderRadius: 10,
  background: '#FAFAF8',
  padding: '8px 12px',
  fontSize: 13,
  color: '#1C1917',
  fontFamily: "'DM Sans', system-ui, sans-serif",
  outline: 'none',
  resize: 'vertical' as const,
  minHeight: 80,
};

const SELECT_STYLE: React.CSSProperties = {
  height: 30,
  padding: '0 10px',
  borderRadius: 10,
  border: '0.5px solid #D5D0C5',
  background: '#FAFAF8',
  fontSize: 12,
  color: '#1C1917',
  fontFamily: "'DM Sans', system-ui, sans-serif",
  outline: 'none',
  cursor: 'pointer',
};

// ── PinIcon ──────────────────────────────────────────────────────────────────

function PinIcon({ pinned }: { pinned: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={pinned ? '#4A6580' : 'none'} stroke="#4A6580" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  );
}

// ── NoteCard ─────────────────────────────────────────────────────────────────

function NoteCard({
  note,
  onTogglePin,
}: {
  note: ClientNote;
  onTogglePin: (id: string, pinned: boolean) => void;
}) {
  const colors = NOTE_TYPE_COLORS[note.note_type] ?? NOTE_TYPE_COLORS.general;
  const [pinning, setPinning] = useState(false);

  async function handlePin() {
    setPinning(true);
    await onTogglePin(note.id, !note.is_pinned);
    setPinning(false);
  }

  return (
    <div style={{
      padding: '12px 14px',
      borderRadius: 12,
      border: `0.5px solid ${note.is_pinned ? 'rgba(74,101,128,0.25)' : '#E8E4DC'}`,
      background: note.is_pinned ? 'rgba(74,101,128,0.04)' : '#FAFAF8',
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <p style={{ flex: 1, fontSize: 13, color: '#1C1917', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
          {note.note_body}
        </p>
        <button
          onClick={handlePin}
          disabled={pinning}
          title={note.is_pinned ? 'Unpin' : 'Pin'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0, opacity: pinning ? 0.5 : 1 }}
        >
          <PinIcon pinned={note.is_pinned} />
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '2px 7px',
          borderRadius: 8, letterSpacing: '0.05em', textTransform: 'uppercase' as const,
          background: colors.bg, color: colors.text, border: `0.5px solid ${colors.border}`,
        }}>
          {NOTE_TYPE_LABELS[note.note_type]}
        </span>
        <span style={{ fontSize: 11, color: '#B5B0A5' }}>
          {note.author_name}
        </span>
        <span style={{ fontSize: 11, color: '#B5B0A5' }}>·</span>
        <span style={{ fontSize: 11, color: '#B5B0A5' }}>
          {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}

// ── AddNoteForm ───────────────────────────────────────────────────────────────

function AddNoteForm({
  clientId,
  onCreated,
  onCancel,
}: {
  clientId: string;
  onCreated: (note: ClientNote) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState('');
  const [type, setType] = useState<'handover' | 'client_intel' | 'general'>('general');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_body: body, note_type: type }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to save note');
        return;
      }
      onCreated(data.note);
    } catch {
      setError('Failed to save note');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ marginTop: 12, padding: '14px', borderRadius: 12, border: '0.5px solid #D5D0C5', background: '#FAFAF8' }}>
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Add a handover note, client insight, or general comment…"
        style={{ ...INPUT_STYLE, boxSizing: 'border-box' }}
        autoFocus
      />
      {error && (
        <p style={{ fontSize: 12, color: '#A0442A', margin: '6px 0 0', fontFamily: "'DM Sans', system-ui, sans-serif" }}>{error}</p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <select value={type} onChange={e => setType(e.target.value as typeof type)} style={SELECT_STYLE}>
          <option value="general">General</option>
          <option value="handover">Handover</option>
          <option value="client_intel">Client Intel</option>
        </select>
        <div style={{ flex: 1 }} />
        <button onClick={onCancel} style={BTN_SECONDARY}>Cancel</button>
        <button
          onClick={handleSubmit}
          disabled={submitting || !body.trim()}
          style={{ ...BTN_PRIMARY, opacity: submitting || !body.trim() ? 0.6 : 1 }}
        >
          {submitting ? 'Saving…' : 'Save Note'}
        </button>
      </div>
    </div>
  );
}

// ── HandoverNotesSection ──────────────────────────────────────────────────────

function HandoverNotesSection({ clientId }: { clientId: string }) {
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/notes`);
      const data = await res.json();
      if (res.ok) setNotes(data.notes ?? []);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  function handleCreated(note: ClientNote) {
    setNotes(prev => {
      const next = [note, ...prev];
      // Keep pinned at top
      return [...next.filter(n => n.is_pinned), ...next.filter(n => !n.is_pinned)];
    });
    setShowForm(false);
  }

  async function handleTogglePin(id: string, pinned: boolean) {
    const res = await fetch(`/api/clients/${clientId}/notes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_pinned: pinned }),
    });
    if (res.ok) {
      setNotes(prev => {
        const updated = prev.map(n => n.id === id ? { ...n, is_pinned: pinned } : n);
        return [...updated.filter(n => n.is_pinned), ...updated.filter(n => !n.is_pinned)];
      });
    }
  }

  const pinned = notes.filter(n => n.is_pinned);
  const unpinned = notes.filter(n => !n.is_pinned);

  return (
    <div style={CARD_STYLE}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={SECTION_TITLE_STYLE}>Handover Notes</span>
        <button
          onClick={() => setShowForm(v => !v)}
          style={BTN_SECONDARY}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Note
        </button>
      </div>

      {showForm && (
        <AddNoteForm
          clientId={clientId}
          onCreated={handleCreated}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2].map(i => (
            <div key={i} style={{ height: 76, borderRadius: 12, background: '#F0EDE8', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <p style={{ fontSize: 13, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          No notes yet. Add the first handover note for this client.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Pinned notes */}
          {pinned.map(note => (
            <NoteCard key={note.id} note={note} onTogglePin={handleTogglePin} />
          ))}
          {/* Divider when both sections have content */}
          {pinned.length > 0 && unpinned.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0' }}>
              <div style={{ flex: 1, height: '0.5px', background: '#E8E4DC' }} />
              <span style={{ fontSize: 10, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif", whiteSpace: 'nowrap' }}>Earlier</span>
              <div style={{ flex: 1, height: '0.5px', background: '#E8E4DC' }} />
            </div>
          )}
          {/* Unpinned notes */}
          {unpinned.map(note => (
            <NoteCard key={note.id} note={note} onTogglePin={handleTogglePin} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── ClientIntelTab (Phase 2 — Notes only; Phases 3-5 add sections here) ──────

interface ClientIntelTabProps {
  clientId: string;
}

export function ClientIntelTab({ clientId }: ClientIntelTabProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <HandoverNotesSection clientId={clientId} />
    </div>
  );
}

export { HandoverNotesSection };
