'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow, format } from 'date-fns';

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

// ── Brief Types ───────────────────────────────────────────────────────────────

export interface ClientBrief {
  id: string;
  client_id: string;
  objectives: string | null;
  kpis: string | null;
  budget: number | null;
  start_date: string | null;
  end_date: string | null;
  target_audience: string | null;
  brief_body: string | null;
  is_locked: boolean;
  locked_at: string | null;
  locked_by: string | null;
  locked_by_name: string | null;
  version: number;
  created_at: string;
  created_by: string | null;
}

export interface ClientBriefVersion {
  id: string;
  client_id: string;
  brief_id: string;
  brief_data: Record<string, unknown>;
  version: number;
  saved_at: string;
  saved_by: string | null;
}

// ── BriefField ────────────────────────────────────────────────────────────────

function BriefField({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#8A8578', textTransform: 'uppercase' as const, letterSpacing: '0.07em', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        {label}
      </span>
      <p style={{ fontSize: 13, color: '#1C1917', marginTop: 4, lineHeight: 1.6, fontFamily: "'DM Sans', system-ui, sans-serif", whiteSpace: 'pre-wrap' }}>
        {typeof value === 'number' ? `$${value.toLocaleString()}` : value}
      </p>
    </div>
  );
}

// ── BriefVersionModal ─────────────────────────────────────────────────────────

function BriefVersionModal({
  version,
  onClose,
}: {
  version: ClientBriefVersion;
  onClose: () => void;
}) {
  const d = version.brief_data as Partial<ClientBrief>;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FDFCF8', borderRadius: 18, padding: '24px 28px',
          maxWidth: 560, width: '100%', maxHeight: '80vh', overflowY: 'auto',
          border: '1px solid #E8E4DC', boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1C1917', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
            Brief Version {version.version}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
              Saved {format(new Date(version.saved_at), 'd MMM yyyy, h:mm a')}
            </span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8A8578', fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
        </div>
        <BriefField label="Objectives" value={d.objectives} />
        <BriefField label="KPIs" value={d.kpis} />
        <BriefField label="Budget" value={d.budget} />
        <BriefField label="Campaign Dates" value={d.start_date && d.end_date ? `${d.start_date} → ${d.end_date}` : d.start_date ?? null} />
        <BriefField label="Target Audience" value={d.target_audience} />
        <BriefField label="Brief" value={d.brief_body} />
        {!d.objectives && !d.kpis && !d.budget && !d.start_date && !d.target_audience && !d.brief_body && (
          <p style={{ fontSize: 13, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>No content recorded in this version.</p>
        )}
      </div>
    </div>
  );
}

// ── BriefSection ──────────────────────────────────────────────────────────────

function BriefSection({ clientId }: { clientId: string }) {
  const [brief, setBrief] = useState<ClientBrief | null>(null);
  const [versions, setVersions] = useState<ClientBriefVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<ClientBriefVersion | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    objectives: '', kpis: '', budget: '', start_date: '', end_date: '',
    target_audience: '', brief_body: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/brief`);
      const data = await res.json();
      if (res.ok) {
        setBrief(data.brief);
        setVersions(data.versions ?? []);
        if (data.brief) {
          setForm({
            objectives: data.brief.objectives ?? '',
            kpis: data.brief.kpis ?? '',
            budget: data.brief.budget != null ? String(data.brief.budget) : '',
            start_date: data.brief.start_date ?? '',
            end_date: data.brief.end_date ?? '',
            target_audience: data.brief.target_audience ?? '',
            brief_body: data.brief.brief_body ?? '',
          });
        }
      }
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  function startEdit() {
    if (brief) {
      setForm({
        objectives: brief.objectives ?? '',
        kpis: brief.kpis ?? '',
        budget: brief.budget != null ? String(brief.budget) : '',
        start_date: brief.start_date ?? '',
        end_date: brief.end_date ?? '',
        target_audience: brief.target_audience ?? '',
        brief_body: brief.brief_body ?? '',
      });
    }
    setEditing(true);
    setError(null);
  }

  async function handleSave(lock = false) {
    setSaving(true);
    if (lock) setLocking(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          budget: form.budget ? Number(form.budget) : null,
          lock,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to save brief');
        return;
      }
      setBrief(data.brief);
      setVersions(data.versions ?? []);
      setEditing(false);
    } catch {
      setError('Failed to save brief');
    } finally {
      setSaving(false);
      setLocking(false);
    }
  }

  const field = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm(f => ({ ...f, [key]: e.target.value }));

  const inputStyle: React.CSSProperties = { ...INPUT_STYLE, minHeight: 'auto', resize: 'none' as const };

  return (
    <>
      {selectedVersion && (
        <BriefVersionModal version={selectedVersion} onClose={() => setSelectedVersion(null)} />
      )}

      <div style={CARD_STYLE}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={SECTION_TITLE_STYLE}>Campaign Brief</span>
            {brief?.is_locked && (
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
                background: '#F0EDE8', color: '#8A8578', border: '0.5px solid #E0DCD4',
                fontFamily: "'DM Sans', system-ui, sans-serif", letterSpacing: '0.05em',
                textTransform: 'uppercase' as const,
              }}>
                Locked
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {brief && !brief.is_locked && !editing && (
              <button onClick={startEdit} style={BTN_SECONDARY}>Edit Brief</button>
            )}
            {brief && versions.length > 0 && (
              <button onClick={() => setShowVersions(v => !v)} style={BTN_SECONDARY}>
                {showVersions ? 'Hide History' : `Version History (${versions.length})`}
              </button>
            )}
            {!brief && !editing && (
              <button onClick={startEdit} style={BTN_SECONDARY}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Create Brief
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3].map(i => <div key={i} style={{ height: 40, borderRadius: 8, background: '#F0EDE8' }} />)}
          </div>
        ) : editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {error && <p style={{ fontSize: 12, color: '#A0442A', fontFamily: "'DM Sans', system-ui, sans-serif" }}>{error}</p>}
            {([
              { key: 'objectives', label: 'Objectives', multiline: true },
              { key: 'kpis', label: 'KPIs', multiline: true },
              { key: 'budget', label: 'Budget ($)', multiline: false },
              { key: 'start_date', label: 'Start Date', multiline: false, type: 'date' },
              { key: 'end_date', label: 'End Date', multiline: false, type: 'date' },
              { key: 'target_audience', label: 'Target Audience', multiline: true },
              { key: 'brief_body', label: 'Brief Body', multiline: true },
            ] as Array<{ key: keyof typeof form; label: string; multiline: boolean; type?: string }>).map(({ key, label, multiline, type }) => (
              <div key={key}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#8A8578', textTransform: 'uppercase' as const, letterSpacing: '0.07em', fontFamily: "'DM Sans', system-ui, sans-serif", display: 'block', marginBottom: 4 }}>
                  {label}
                </label>
                {multiline ? (
                  <textarea
                    value={form[key]}
                    onChange={field(key)}
                    rows={key === 'brief_body' ? 5 : 2}
                    style={{ ...INPUT_STYLE, boxSizing: 'border-box' }}
                  />
                ) : (
                  <input
                    type={type ?? 'text'}
                    value={form[key]}
                    onChange={field(key)}
                    style={{ ...inputStyle, height: 32, boxSizing: 'border-box' }}
                  />
                )}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={() => setEditing(false)} style={BTN_SECONDARY}>Cancel</button>
              <div style={{ flex: 1 }} />
              {brief && !brief.is_locked && (
                <button
                  onClick={() => handleSave(true)}
                  disabled={locking}
                  style={{ ...BTN_SECONDARY, color: '#4A7C59', borderColor: 'rgba(74,124,89,0.4)', opacity: locking ? 0.6 : 1 }}
                >
                  {locking ? 'Locking…' : 'Lock Brief'}
                </button>
              )}
              <button
                onClick={() => handleSave(false)}
                disabled={saving}
                style={{ ...BTN_PRIMARY, opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Saving…' : 'Save Brief'}
              </button>
            </div>
          </div>
        ) : brief ? (
          <div>
            {brief.is_locked && brief.locked_at && (
              <p style={{ fontSize: 12, color: '#8A8578', marginBottom: 12, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                Locked by {brief.locked_by_name ?? 'Team member'} on {format(new Date(brief.locked_at), 'd MMM yyyy')}
              </p>
            )}
            <BriefField label="Objectives" value={brief.objectives} />
            <BriefField label="KPIs" value={brief.kpis} />
            <BriefField label="Budget" value={brief.budget} />
            {(brief.start_date || brief.end_date) && (
              <BriefField
                label="Campaign Dates"
                value={brief.start_date && brief.end_date
                  ? `${brief.start_date} → ${brief.end_date}`
                  : brief.start_date ?? brief.end_date}
              />
            )}
            <BriefField label="Target Audience" value={brief.target_audience} />
            <BriefField label="Brief Body" value={brief.brief_body} />
            {!brief.objectives && !brief.kpis && !brief.budget && !brief.start_date && !brief.target_audience && !brief.brief_body && (
              <p style={{ fontSize: 13, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>No brief content yet. Click Edit Brief to fill it in.</p>
            )}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
            No brief created yet. Click Create Brief to get started.
          </p>
        )}

        {/* Version History */}
        {showVersions && versions.length > 0 && (
          <div style={{ marginTop: 16, borderTop: '0.5px solid #E8E4DC', paddingTop: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#8A8578', fontFamily: "'DM Sans', system-ui, sans-serif" }}>Version History</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              {versions.map(v => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVersion(v)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderRadius: 10, border: '0.5px solid #E8E4DC',
                    background: '#FAFAF8', cursor: 'pointer', textAlign: 'left',
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}
                >
                  <span style={{ fontSize: 13, color: '#1C1917', fontWeight: 500 }}>Version {v.version}</span>
                  <span style={{ fontSize: 11, color: '#B5B0A5' }}>
                    {format(new Date(v.saved_at), 'd MMM yyyy, h:mm a')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── ClientIntelTab ────────────────────────────────────────────────────────────

interface ClientIntelTabProps {
  clientId: string;
}

export function ClientIntelTab({ clientId }: ClientIntelTabProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <BriefSection clientId={clientId} />
      <HandoverNotesSection clientId={clientId} />
    </div>
  );
}

export { HandoverNotesSection };
