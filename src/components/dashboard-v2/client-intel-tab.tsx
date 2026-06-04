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
  fontSize: 16,
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
  fontSize: 15,
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
  fontSize: 15,
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
  fontSize: 16,
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
  fontSize: 15,
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
        <p style={{ flex: 1, fontSize: 16, color: '#1C1917', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
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
          fontSize: 13, fontWeight: 600, padding: '2px 7px',
          borderRadius: 8, letterSpacing: '0.05em', textTransform: 'uppercase' as const,
          background: colors.bg, color: colors.text, border: `0.5px solid ${colors.border}`,
        }}>
          {NOTE_TYPE_LABELS[note.note_type]}
        </span>
        <span style={{ fontSize: 14, color: '#B5B0A5' }}>
          {note.author_name}
        </span>
        <span style={{ fontSize: 14, color: '#B5B0A5' }}>·</span>
        <span style={{ fontSize: 14, color: '#B5B0A5' }}>
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
        <p style={{ fontSize: 15, color: '#A0442A', margin: '6px 0 0', fontFamily: "'DM Sans', system-ui, sans-serif" }}>{error}</p>
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

// ── SectionDocUploader ────────────────────────────────────────────────────────
// Compact upload button + list of docs for a specific file_type, embedded in a section.

function SectionDocUploader({ clientId, fileType }: { clientId: string; fileType: string }) {
  const [docs, setDocs] = useState<ClientDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/documents`);
    const data = await res.json();
    if (res.ok) {
      setDocs((data.documents ?? []).filter((d: ClientDocument) => d.file_type === fileType));
    }
  }, [clientId, fileType]);

  useEffect(() => { void load(); }, [load]);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('file_type', fileType);
      const res = await fetch(`/api/clients/${clientId}/documents`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Upload failed'); return; }
      setDocs(prev => [data.document, ...prev]);
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ marginTop: 16, borderTop: '0.5px solid #E8E4DC', paddingTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: docs.length > 0 ? 10 : 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#8A8578', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          Uploaded Files
        </span>
        <label style={{
          ...BTN_SECONDARY,
          cursor: uploading ? 'not-allowed' : 'pointer',
          opacity: uploading ? 0.6 : 1,
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
          </svg>
          {uploading ? 'Uploading…' : 'Upload File'}
          <input
            type="file"
            accept=".pdf,.docx,.txt,.csv,.doc"
            style={{ display: 'none' }}
            disabled={uploading}
            onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }}
          />
        </label>
      </div>

      {error && <p style={{ fontSize: 15, color: '#A0442A', margin: '6px 0', fontFamily: "'DM Sans', system-ui, sans-serif" }}>{error}</p>}

      {docs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {docs.map(doc => {
            const hasContent = !!doc.text_content;
            const isExpanded = expandedDoc === doc.id;
            return (
              <div key={doc.id} style={{ borderRadius: 10, border: '0.5px solid #E8E4DC', background: '#FAFAF8', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8A8578" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span style={{ flex: 1, fontSize: 15, color: '#1C1917', fontFamily: "'DM Sans', system-ui, sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.file_name}
                  </span>
                  {hasContent && (
                    <span style={{
                      fontSize: 13, fontWeight: 600, padding: '1px 6px', borderRadius: 6,
                      background: 'rgba(74,124,89,0.1)', color: '#4A7C59', border: '0.5px solid rgba(74,124,89,0.25)',
                      fontFamily: "'DM Sans', system-ui, sans-serif", whiteSpace: 'nowrap',
                    }}>
                      AI readable
                    </span>
                  )}
                  <span style={{ fontSize: 14, color: '#B5B0A5', whiteSpace: 'nowrap', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                    {format(new Date(doc.uploaded_at), 'd MMM yyyy')}
                  </span>
                  {hasContent && (
                    <button
                      onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4A6580', fontSize: 14, fontFamily: "'DM Sans', system-ui, sans-serif", flexShrink: 0 }}
                    >
                      {isExpanded ? 'Hide' : 'View'}
                    </button>
                  )}
                  {doc.file_url && (
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer" title="Download" style={{ color: '#4A6580', flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </a>
                  )}
                </div>
                {hasContent && isExpanded && (
                  <div style={{
                    borderTop: '0.5px solid #E8E4DC', padding: '10px 14px',
                    fontSize: 16, color: '#1C1917', lineHeight: 1.7, whiteSpace: 'pre-wrap',
                    fontFamily: "'DM Sans', system-ui, sans-serif", maxHeight: 280, overflowY: 'auto',
                  }}>
                    {doc.text_content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
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
        <p style={{ fontSize: 16, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
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
              <span style={{ fontSize: 13, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif", whiteSpace: 'nowrap' }}>Earlier</span>
              <div style={{ flex: 1, height: '0.5px', background: '#E8E4DC' }} />
            </div>
          )}
          {/* Unpinned notes */}
          {unpinned.map(note => (
            <NoteCard key={note.id} note={note} onTogglePin={handleTogglePin} />
          ))}
        </div>
      )}

      <SectionDocUploader clientId={clientId} fileType="handover_notes" />
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
      <span style={{ fontSize: 14, fontWeight: 600, color: '#8A8578', textTransform: 'uppercase' as const, letterSpacing: '0.07em', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        {label}
      </span>
      <p style={{ fontSize: 16, color: '#1C1917', marginTop: 4, lineHeight: 1.6, fontFamily: "'DM Sans', system-ui, sans-serif", whiteSpace: 'pre-wrap' }}>
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
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1C1917', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
            Brief Version {version.version}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
              Saved {format(new Date(version.saved_at), 'd MMM yyyy, h:mm a')}
            </span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8A8578', fontSize: 21, lineHeight: 1 }}>×</button>
          </div>
        </div>
        <BriefField label="Objectives" value={d.objectives} />
        <BriefField label="KPIs" value={d.kpis} />
        <BriefField label="Budget" value={d.budget} />
        <BriefField label="Campaign Dates" value={d.start_date && d.end_date ? `${d.start_date} → ${d.end_date}` : d.start_date ?? null} />
        <BriefField label="Target Audience" value={d.target_audience} />
        <BriefField label="Brief" value={d.brief_body} />
        {!d.objectives && !d.kpis && !d.budget && !d.start_date && !d.target_audience && !d.brief_body && (
          <p style={{ fontSize: 16, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>No content recorded in this version.</p>
        )}
      </div>
    </div>
  );
}

// ── BriefSection ──────────────────────────────────────────────────────────────

function BriefSection({ clientId, onLockChange }: { clientId: string; onLockChange?: (locked: boolean) => void }) {
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
        onLockChange?.(data.brief?.is_locked ?? false);
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
      onLockChange?.(data.brief?.is_locked ?? false);
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
                fontSize: 13, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
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
            {error && <p style={{ fontSize: 15, color: '#A0442A', fontFamily: "'DM Sans', system-ui, sans-serif" }}>{error}</p>}
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
                <label style={{ fontSize: 14, fontWeight: 600, color: '#8A8578', textTransform: 'uppercase' as const, letterSpacing: '0.07em', fontFamily: "'DM Sans', system-ui, sans-serif", display: 'block', marginBottom: 4 }}>
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
              <p style={{ fontSize: 15, color: '#8A8578', marginBottom: 12, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
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
              <p style={{ fontSize: 16, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>No brief content yet. Click Edit Brief to fill it in.</p>
            )}
          </div>
        ) : (
          <p style={{ fontSize: 16, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
            No brief created yet. Click Create Brief to get started.
          </p>
        )}

        {/* Version History */}
        {showVersions && versions.length > 0 && (
          <div style={{ marginTop: 16, borderTop: '0.5px solid #E8E4DC', paddingTop: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#8A8578', fontFamily: "'DM Sans', system-ui, sans-serif" }}>Version History</span>
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
                  <span style={{ fontSize: 16, color: '#1C1917', fontWeight: 500 }}>Version {v.version}</span>
                  <span style={{ fontSize: 14, color: '#B5B0A5' }}>
                    {format(new Date(v.saved_at), 'd MMM yyyy, h:mm a')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <SectionDocUploader clientId={clientId} fileType="brief" />
      </div>
    </>
  );
}

// ── Goal Types ────────────────────────────────────────────────────────────────

export interface CampaignGoal {
  id: string;
  client_id: string;
  brief_id: string | null;
  channel: string;
  goal_type: string | null;
  is_primary: boolean;
  metric: string;
  benchmark_id: string | null;
  target_value: number | null;
  stretch_value: number | null;
  floor_value: number | null;
  set_by: string | null;
  set_at: string;
}

// ── Goal constants ────────────────────────────────────────────────────────────

const GOAL_TYPE_OPTIONS = [
  'Sales', 'Leads', 'Awareness', 'Revenue', 'Traffic',
  'Engagement', 'Retention', 'Conversions', 'Brand Lift', 'Custom',
];

const METRIC_OPTIONS = ['CPA', 'CPL', 'CPC', 'CPM', 'CTR', 'ROAS', 'Conversions', 'Impressions', 'Clicks', 'Reach'];

const METRIC_DIRECTION: Record<string, 'lower_is_better' | 'higher_is_better'> = {
  CPA: 'lower_is_better', CPL: 'lower_is_better', CPC: 'lower_is_better', CPM: 'lower_is_better',
  CTR: 'higher_is_better', ROAS: 'higher_is_better', Conversions: 'higher_is_better',
  Impressions: 'higher_is_better', Clicks: 'higher_is_better', Reach: 'higher_is_better',
};

function calcStretch(target: number, direction: 'lower_is_better' | 'higher_is_better'): number {
  return direction === 'lower_is_better' ? +(target * 0.8).toFixed(2) : +(target * 1.2).toFixed(2);
}

function calcFloor(target: number, direction: 'lower_is_better' | 'higher_is_better'): number {
  return direction === 'lower_is_better' ? +(target * 1.2).toFixed(2) : +(target * 0.8).toFixed(2);
}

// ── GoalEditor ────────────────────────────────────────────────────────────────

function GoalEditor({
  clientId,
  goal,
  isPrimary,
  onSaved,
  onRemove,
}: {
  clientId: string;
  goal: CampaignGoal | null;
  isPrimary: boolean;
  onSaved: (goal: CampaignGoal) => void;
  onRemove?: () => void;
}) {
  const [goalType, setGoalType] = useState(goal?.goal_type ?? GOAL_TYPE_OPTIONS[0]);
  const [metric, setMetric] = useState(goal?.metric ?? 'CPA');
  const [target, setTarget] = useState(goal?.target_value != null ? String(goal.target_value) : '');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(!goal);

  const direction = METRIC_DIRECTION[metric] ?? 'lower_is_better';
  const targetNum = parseFloat(target);
  const hasTarget = !isNaN(targetNum) && targetNum > 0;
  const stretchAuto = hasTarget ? calcStretch(targetNum, direction) : null;
  const floorAuto = hasTarget ? calcFloor(targetNum, direction) : null;

  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 700, color: '#8A8578', textTransform: 'uppercase',
    letterSpacing: '0.07em', fontFamily: "'DM Sans', system-ui, sans-serif", marginBottom: 4, display: 'block',
  };
  const numInput: React.CSSProperties = {
    width: 90, height: 30, borderRadius: 8, border: '0.5px solid #D5D0C5',
    background: '#FAFAF8', textAlign: 'center' as const, fontSize: 16,
    color: '#1C1917', fontFamily: "'DM Sans', system-ui, sans-serif", outline: 'none',
    padding: '0 8px',
  };

  async function handleSave() {
    if (!hasTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: goal?.id,
          channel: 'overarching',
          goal_type: goalType,
          metric,
          is_primary: isPrimary,
          target_value: targetNum,
          stretch_value: stretchAuto,
          floor_value: floorAuto,
        }),
      });
      const data = await res.json();
      if (res.ok) { onSaved(data.goal); setDirty(false); }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      padding: '14px 16px', borderRadius: 12,
      border: `0.5px solid ${isPrimary ? 'rgba(74,101,128,0.3)' : '#E8E4DC'}`,
      background: isPrimary ? 'rgba(74,101,128,0.035)' : '#FAFAF8',
    }}>
      {/* Inputs row */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' as const }}>
        <div>
          <span style={labelStyle}>Goal</span>
          <select
            value={goalType}
            onChange={e => { setGoalType(e.target.value); setDirty(true); }}
            style={{ ...SELECT_STYLE, height: 30 }}
          >
            {GOAL_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <span style={{ fontSize: 15, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif", paddingBottom: 6 }}>via</span>
        <div>
          <span style={labelStyle}>Metric</span>
          <select
            value={metric}
            onChange={e => { setMetric(e.target.value); setDirty(true); }}
            style={{ ...SELECT_STYLE, height: 30 }}
          >
            {METRIC_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <span style={labelStyle}>Target</span>
          <input
            type="number"
            value={target}
            onChange={e => { setTarget(e.target.value); setDirty(true); }}
            placeholder="e.g. 45.00"
            style={numInput}
          />
        </div>
        <div style={{ flex: 1 }} />
        {!isPrimary && onRemove && (
          <button
            onClick={onRemove}
            title="Remove goal"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B5B0A5', fontSize: 21, lineHeight: 1, paddingBottom: 6 }}
          >
            ×
          </button>
        )}
      </div>

      {/* Auto-calc row */}
      {hasTarget && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' as const }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#4A7C59', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'DM Sans', system-ui, sans-serif" }}>Stretch</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#4A7C59', fontFamily: "'DM Sans', system-ui, sans-serif" }}>{stretchAuto}</span>
            <span style={{ fontSize: 13, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>auto</span>
          </div>
          <span style={{ color: '#D5D0C5', fontSize: 15 }}>·</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#4A6580', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'DM Sans', system-ui, sans-serif" }}>Target</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#4A6580', fontFamily: "'DM Sans', system-ui, sans-serif" }}>{targetNum}</span>
          </div>
          <span style={{ color: '#D5D0C5', fontSize: 15 }}>·</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#A0442A', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'DM Sans', system-ui, sans-serif" }}>Floor</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#A0442A', fontFamily: "'DM Sans', system-ui, sans-serif" }}>{floorAuto}</span>
            <span style={{ fontSize: 13, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>auto</span>
          </div>
          <div style={{ flex: 1 }} />
          {dirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ ...BTN_PRIMARY, height: 28, fontSize: 14, opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Saving…' : 'Save Goal'}
            </button>
          )}
        </div>
      )}

      {/* Save for goal with no target yet */}
      {!hasTarget && dirty && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            onClick={handleSave}
            disabled={saving || !hasTarget}
            style={{ ...BTN_PRIMARY, height: 28, fontSize: 14, opacity: (saving || !hasTarget) ? 0.4 : 1 }}
          >
            {saving ? 'Saving…' : 'Save Goal'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── GoalsSection ──────────────────────────────────────────────────────────────

function GoalsSection({ clientId }: { clientId: string }) {
  const [goals, setGoals] = useState<CampaignGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingSecondary, setAddingSecondary] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/goals`);
      const d = await res.json();
      if (res.ok) setGoals(d.goals ?? []);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  const overarchingGoals = goals.filter(g => g.channel === 'overarching');
  const primaryGoal = overarchingGoals.find(g => g.is_primary) ?? null;
  const secondaryGoals = overarchingGoals.filter(g => !g.is_primary);

  function handleGoalSaved(goal: CampaignGoal) {
    setGoals(prev => {
      const idx = prev.findIndex(g => g.id === goal.id);
      if (idx >= 0) return prev.map(g => g.id === goal.id ? goal : g);
      return [...prev, goal];
    });
    setAddingSecondary(false);
  }

  async function removeGoal(id: string) {
    await fetch(`/api/clients/${clientId}/goals?id=${id}`, { method: 'DELETE' });
    setGoals(prev => prev.filter(g => g.id !== id));
  }

  const subLabel: React.CSSProperties = {
    fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    fontFamily: "'DM Sans', system-ui, sans-serif",
  };

  return (
    <div style={CARD_STYLE}>
      <span style={SECTION_TITLE_STYLE}>Client Goals</span>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2].map(i => <div key={i} style={{ height: 80, borderRadius: 12, background: '#F0EDE8' }} />)}
        </div>
      ) : (
        <>
          {/* Primary goal */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#B07030" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              <span style={{ ...subLabel, color: '#B07030' }}>Primary Goal</span>
            </div>
            <GoalEditor
              clientId={clientId}
              goal={primaryGoal}
              isPrimary={true}
              onSaved={handleGoalSaved}
            />
          </div>

          {/* Secondary goals */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ ...subLabel, color: '#8A8578' }}>Secondary Goals</span>
              {!addingSecondary && (
                <button onClick={() => setAddingSecondary(true)} style={BTN_SECONDARY}>
                  + Add Goal
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {secondaryGoals.map(g => (
                <GoalEditor
                  key={g.id}
                  clientId={clientId}
                  goal={g}
                  isPrimary={false}
                  onSaved={handleGoalSaved}
                  onRemove={() => removeGoal(g.id)}
                />
              ))}
              {addingSecondary && (
                <GoalEditor
                  clientId={clientId}
                  goal={null}
                  isPrimary={false}
                  onSaved={handleGoalSaved}
                  onRemove={() => setAddingSecondary(false)}
                />
              )}
              {secondaryGoals.length === 0 && !addingSecondary && (
                <p style={{ fontSize: 15, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif", margin: 0 }}>
                  No secondary goals yet — use these to track additional KPIs alongside your primary goal.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Document Types ────────────────────────────────────────────────────────────

export interface ClientDocument {
  id: string;
  client_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  text_content: string | null;
  is_text_doc: boolean;
  uploaded_at: string;
  uploaded_by: string | null;
  uploader_name: string;
}

// ── Document constants ────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  biz_info: 'Biz Info & Context',
  tov: 'Tone of Voice',
  handover_notes: 'Client Handover',
  brand_guidelines: 'Brand Guidelines',
  brief: 'Brief',
  contract: 'Contract',
  rate_card: 'Rate Card',
  media_schedule: 'Media Schedule',
  other: 'Other',
};

const DOC_TYPE_OPTIONS = [
  { value: 'biz_info', label: 'Biz Info & Context' },
  { value: 'tov', label: 'Tone of Voice' },
  { value: 'handover_notes', label: 'Client Handover' },
  { value: 'brand_guidelines', label: 'Brand Guidelines' },
  { value: 'brief', label: 'Brief' },
  { value: 'contract', label: 'Contract' },
  { value: 'rate_card', label: 'Rate Card' },
  { value: 'media_schedule', label: 'Media Schedule' },
  { value: 'other', label: 'Other' },
];

// ── DocumentsSection ──────────────────────────────────────────────────────────

function DocumentsSection({ clientId }: { clientId: string }) {
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileType, setFileType] = useState('biz_info');
  const [dragging, setDragging] = useState(false);
  const [uploadMode, setUploadMode] = useState<'file' | 'text'>('file');
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/documents`);
      const data = await res.json();
      if (res.ok) setDocuments(data.documents ?? []);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('file_type', fileType);
      const res = await fetch(`/api/clients/${clientId}/documents`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setUploadError(data.error ?? 'Upload failed'); return; }
      setDocuments(prev => [data.document, ...prev]);
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function saveText() {
    if (!textTitle.trim() || !textContent.trim()) return;
    setUploading(true);
    setUploadError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: textTitle.trim(), file_type: fileType, text_content: textContent.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setUploadError(data.error ?? 'Save failed'); return; }
      setDocuments(prev => [data.document, ...prev]);
      setTextTitle('');
      setTextContent('');
      setUploadMode('file');
    } catch {
      setUploadError('Save failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    void uploadFile(files[0]);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  const modeBtn = (mode: 'file' | 'text'): React.CSSProperties => ({
    height: 32, padding: '0 16px', borderRadius: 9999, fontSize: 16, fontWeight: 500,
    cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif",
    border: uploadMode === mode ? 'none' : '1px solid #D5D0C5',
    background: uploadMode === mode ? '#4A6580' : '#FDFCF8',
    color: uploadMode === mode ? '#fff' : '#1C1917',
  });

  return (
    <div style={CARD_STYLE}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={SECTION_TITLE_STYLE}>Documents & Context</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setUploadMode('file')} style={modeBtn('file')}>Upload File</button>
          <button onClick={() => setUploadMode('text')} style={modeBtn('text')}>Add as Text</button>
        </div>
      </div>

      {/* Type selector always visible */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 15, color: '#8A8578', fontFamily: "'DM Sans', system-ui, sans-serif" }}>Type:</span>
        <select value={fileType} onChange={e => setFileType(e.target.value)} style={SELECT_STYLE}>
          {DOC_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {uploadMode === 'text' ? (
        <div style={{ marginBottom: 14 }}>
          <input
            type="text"
            value={textTitle}
            onChange={e => setTextTitle(e.target.value)}
            placeholder="Document title (e.g. Brand Voice Guidelines)"
            style={{
              width: '100%', border: '0.5px solid #D5D0C5', borderRadius: 10,
              background: '#FAFAF8', padding: '8px 12px', fontSize: 16,
              color: '#1C1917', fontFamily: "'DM Sans', system-ui, sans-serif",
              outline: 'none', marginBottom: 8, boxSizing: 'border-box',
            }}
          />
          <textarea
            value={textContent}
            onChange={e => setTextContent(e.target.value)}
            placeholder="Paste or type the content here — biz info, TOV, handover notes, context…"
            style={{ ...INPUT_STYLE, minHeight: 120, boxSizing: 'border-box' }}
          />
          {uploadError && (
            <p style={{ fontSize: 15, color: '#A0442A', margin: '6px 0 0', fontFamily: "'DM Sans', system-ui, sans-serif" }}>{uploadError}</p>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button onClick={() => { setUploadMode('file'); setUploadError(null); }} style={BTN_SECONDARY}>Cancel</button>
            <button
              onClick={saveText}
              disabled={uploading || !textTitle.trim() || !textContent.trim()}
              style={{ ...BTN_PRIMARY, opacity: (uploading || !textTitle.trim() || !textContent.trim()) ? 0.6 : 1 }}
            >
              {uploading ? 'Saving…' : 'Save Text Doc'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <label
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 10, border: `1.5px dashed ${dragging ? '#4A6580' : '#C8C3B8'}`,
              borderRadius: 12, padding: '24px 20px', textAlign: 'center',
              background: dragging ? 'rgba(74,101,128,0.05)' : '#FAFAF8',
              marginBottom: 14, transition: 'all 0.15s ease',
              cursor: uploading ? 'not-allowed' : 'pointer',
              opacity: uploading ? 0.6 : 1,
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4A6580" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
            </svg>
            <div>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#1C1917', fontFamily: "'DM Sans', system-ui, sans-serif", margin: '0 0 2px' }}>
                {uploading ? 'Uploading…' : dragging ? 'Drop to upload' : 'Click to upload a file'}
              </p>
              <p style={{ fontSize: 14, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif", margin: 0 }}>
                PDF, DOCX, TXT — AI readable · or drag & drop
              </p>
            </div>
            <input
              type="file"
              accept=".pdf,.docx,.txt,.csv,.doc"
              style={{ display: 'none' }}
              onChange={e => handleFiles(e.target.files)}
              disabled={uploading}
            />
          </label>
          {uploadError && (
            <p style={{ fontSize: 15, color: '#A0442A', marginBottom: 10, fontFamily: "'DM Sans', system-ui, sans-serif" }}>{uploadError}</p>
          )}
        </>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[1, 2].map(i => <div key={i} style={{ height: 40, borderRadius: 8, background: '#F0EDE8' }} />)}
        </div>
      ) : documents.length === 0 ? (
        <p style={{ fontSize: 16, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          No documents yet — upload files or add text to build your client intel library.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {documents.map((doc) => {
            const hasContent = !!doc.text_content;
            const isExpanded = expandedDoc === doc.id;
            return (
              <div key={doc.id} style={{
                borderRadius: 10, border: '0.5px solid #E8E4DC', background: '#FAFAF8', overflow: 'hidden',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px' }}>
                  {doc.is_text_doc ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8A8578" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8A8578" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  )}
                  <span style={{ flex: 1, fontSize: 16, color: '#1C1917', fontFamily: "'DM Sans', system-ui, sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.file_name}
                  </span>
                  <span style={{
                    fontSize: 13, fontWeight: 600, padding: '2px 6px', borderRadius: 6,
                    background: '#F0EDE8', color: '#8A8578', border: '0.5px solid #E0DCD4',
                    fontFamily: "'DM Sans', system-ui, sans-serif", letterSpacing: '0.04em',
                    textTransform: 'uppercase' as const, whiteSpace: 'nowrap',
                  }}>
                    {DOC_TYPE_LABELS[doc.file_type] ?? doc.file_type}
                  </span>
                  {hasContent && (
                    <span style={{
                      fontSize: 13, fontWeight: 600, padding: '2px 6px', borderRadius: 6,
                      background: 'rgba(74,124,89,0.1)', color: '#4A7C59', border: '0.5px solid rgba(74,124,89,0.25)',
                      fontFamily: "'DM Sans', system-ui, sans-serif", whiteSpace: 'nowrap',
                    }}>
                      AI readable
                    </span>
                  )}
                  <span style={{ fontSize: 14, color: '#B5B0A5', whiteSpace: 'nowrap', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                    {format(new Date(doc.uploaded_at), 'd MMM yyyy')}
                  </span>
                  <span style={{ fontSize: 14, color: '#B5B0A5', whiteSpace: 'nowrap', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                    {doc.uploader_name}
                  </span>
                  {hasContent && (
                    <button
                      onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}
                      title={isExpanded ? 'Collapse' : 'View content'}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4A6580', flexShrink: 0, fontSize: 14, fontFamily: "'DM Sans', system-ui, sans-serif" }}
                    >
                      {isExpanded ? 'Hide' : 'View'}
                    </button>
                  )}
                  {!doc.is_text_doc && doc.file_url && (
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Download"
                      style={{ color: '#4A6580', flexShrink: 0 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </a>
                  )}
                </div>
                {hasContent && isExpanded && (
                  <div style={{
                    borderTop: '0.5px solid #E8E4DC', padding: '10px 14px',
                    fontSize: 16, color: '#1C1917', lineHeight: 1.7,
                    fontFamily: "'DM Sans', system-ui, sans-serif", whiteSpace: 'pre-wrap',
                    background: '#FAFAF8', maxHeight: 300, overflowY: 'auto',
                  }}>
                    {doc.text_content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── ClientIntelTab ────────────────────────────────────────────────────────────

interface ClientIntelTabProps {
  clientId: string;
}

export function ClientIntelTab({ clientId }: ClientIntelTabProps) {
  const [briefIsLocked, setBriefIsLocked] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <GoalsSection clientId={clientId} />
      <BriefSection clientId={clientId} onLockChange={setBriefIsLocked} />
      <HandoverNotesSection clientId={clientId} />
      <DocumentsSection clientId={clientId} />
    </div>
  );
}

export { HandoverNotesSection };
