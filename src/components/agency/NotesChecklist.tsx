// src/components/agency/NotesChecklist.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';

interface Note {
  id: string;
  text: string;
  done: boolean;
  due_date: string | null;
  client_id?: string | null;
}

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const LOCAL_KEY = (userId: string) => `agency_notes_${userId}`;

function formatDueDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const note = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((note.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 7) return `${diff}d`;
  return note.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function dueDateColor(dateStr: string | null): string {
  if (!dateStr) return '#B5B0A5';
  const [y, m, d] = dateStr.split('-').map(Number);
  const note = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((note.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return '#A0442A';
  if (diff <= 2) return '#A0442A';
  if (diff <= 6) return '#B07030';
  return '#8A8578';
}

interface NotesChecklistProps {
  /** When set, only show notes linked to these client IDs (or notes with no client_id) */
  filteredClientIds?: string[] | null;
}

export function NotesChecklist({ filteredClientIds }: NotesChecklistProps = {}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [input, setInput] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [useLocal, setUseLocal] = useState(false);
  const [newDate, setNewDate] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (!uid) return;

      try {
        const { data, error } = await (supabase as any)
          .from('agency_notes')
          .select('id, text, done, due_date, client_id')
          .eq('user_id', uid)
          .order('created_at', { ascending: true });
        if (error) throw error;
        setNotes(data || []);
      } catch {
        setUseLocal(true);
        try {
          const raw = localStorage.getItem(LOCAL_KEY(uid));
          const parsed = raw ? JSON.parse(raw) : [];
          setNotes(parsed);
        } catch {
          setNotes([]);
        }
      }
    })();
  }, []);

  function persistLocal(updated: Note[]) {
    if (userId) {
      try { localStorage.setItem(LOCAL_KEY(userId), JSON.stringify(updated)); } catch {}
    }
  }

  async function toggleNote(id: string) {
    const updated = notes.map(n => n.id === id ? { ...n, done: !n.done } : n);
    setNotes(updated);
    if (!useLocal && userId) {
      const note = updated.find(n => n.id === id);
      await (supabase as any).from('agency_notes').update({ done: note?.done }).eq('id', id);
    } else {
      persistLocal(updated);
    }
  }

  async function addNote() {
    const text = input.trim();
    if (!text || !userId) return;
    setInput('');
    const due_date = newDate || null;
    setNewDate('');

    if (!useLocal) {
      try {
        const { data, error } = await (supabase as any)
          .from('agency_notes')
          .insert({ text, done: false, user_id: userId, due_date })
          .select('id, text, done, due_date')
          .single();
        if (error) throw error;
        setNotes(prev => [...prev, data]);
        return;
      } catch {
        setUseLocal(true);
      }
    }

    const updated = [...notes, { id: genId(), text, done: false, due_date }];
    setNotes(updated);
    persistLocal(updated);
  }

  async function updateNoteDate(id: string, due_date: string | null) {
    const updated = notes.map(n => (n.id === id ? { ...n, due_date } : n));
    setNotes(updated);
    if (!useLocal && userId) {
      try {
        await (supabase as any)
          .from('agency_notes')
          .update({ due_date })
          .eq('id', id);
      } catch {
        setUseLocal(true);
        persistLocal(updated);
      }
    } else {
      persistLocal(updated);
    }
  }

  async function deleteNote(id: string) {
    const updated = notes.filter(n => n.id !== id);
    setNotes(updated);
    if (!useLocal && userId) {
      try {
        await (supabase as any)
          .from('agency_notes')
          .delete()
          .eq('id', id);
      } catch {
        setUseLocal(true);
        persistLocal(updated);
      }
    } else {
      persistLocal(updated);
    }
  }

  const sansFont = "'DM Sans', system-ui, sans-serif";

  // When a client filter is active, show notes linked to those clients + notes with no client
  const visibleNotes = filteredClientIds
    ? notes.filter(n => !n.client_id || filteredClientIds.includes(n.client_id))
    : notes;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#FDFCF8',
      borderRadius: 6,
      border: '0.5px solid #E8E4DC',
      overflow: 'hidden',
      fontFamily: sansFont,
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 13px 8px',
        borderBottom: '0.5px solid #E8E4DC',
      }}>
        <div style={{ fontSize: 9, fontWeight: 400, color: '#B5B0A5', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Notes</div>
        <div style={{ fontSize: 9, color: '#B5B0A5', marginTop: 1 }}>Only visible to you</div>
      </div>

      {/* Notes list — scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {visibleNotes.length === 0 ? (
          <div style={{ padding: '10px 13px', fontSize: 10, color: '#B5B0A5', fontStyle: 'italic' }}>
            No notes yet…
          </div>
        ) : (
          visibleNotes.map((note, idx) => (
            <div
              key={note.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 7,
                padding: '7px 13px',
                cursor: 'default',
                borderBottom: idx < visibleNotes.length - 1 ? '0.5px solid #E8E4DC' : 'none',
              }}
            >
              {/* Circle checkbox */}
              <div
                style={{
                  marginTop: 1,
                  width: 13,
                  height: 13,
                  borderRadius: '50%',
                  flexShrink: 0,
                  border: note.done ? '0.5px solid #4A7C59' : '0.5px solid #D5D0C5',
                  background: note.done ? '#4A7C59' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                onClick={() => toggleNote(note.id)}
              >
                {note.done && (
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path
                      d="M1.5 4L3 5.5L6.5 2"
                      stroke="#fff"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span
                    onClick={() => toggleNote(note.id)}
                    style={{
                      fontSize: 12,
                      lineHeight: 1.4,
                      color: note.done ? '#B5B0A5' : '#1C1917',
                      textDecoration: note.done ? 'line-through' : 'none',
                      wordBreak: 'break-word',
                      cursor: 'pointer',
                    }}
                  >
                    {note.text}
                  </span>
                  {note.due_date && (
                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 9,
                        color: note.done ? '#B5B0A5' : dueDateColor(note.due_date),
                      }}
                    >
                      {formatDueDate(note.due_date)}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    flexShrink: 0,
                  }}
                >
                  {/* Hidden date input triggered by calendar icon */}
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <input
                      type="date"
                      value={note.due_date ?? ''}
                      onChange={e => updateNoteDate(note.id, e.target.value || null)}
                      style={{
                        position: 'absolute',
                        opacity: 0,
                        width: 0,
                        height: 0,
                        pointerEvents: 'none',
                      }}
                      id={`date-${note.id}`}
                    />
                    <button
                      onClick={() => (document.getElementById(`date-${note.id}`) as HTMLInputElement)?.showPicker?.()}
                      title={note.due_date ? `Due: ${note.due_date}` : 'Set due date'}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        color: note.due_date ? dueDateColor(note.due_date) : '#D5D0C5',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="0.8"/>
                        <path d="M4 1v2M8 1v2" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
                        <path d="M1 5h10" stroke="currentColor" strokeWidth="0.8"/>
                      </svg>
                    </button>
                    {note.due_date && (
                      <span style={{
                        fontSize: 9,
                        color: note.done ? '#B5B0A5' : dueDateColor(note.due_date),
                        whiteSpace: 'nowrap',
                        lineHeight: 1,
                      }}>
                        {formatDueDate(note.due_date)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => deleteNote(note.id)}
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      border: 'none',
                      background: '#F5EDE9',
                      color: '#A0442A',
                      fontSize: 10,
                      lineHeight: 1,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    aria-label="Delete note"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input — pinned at bottom */}
      <div style={{
        borderTop: '0.5px solid #E8E4DC',
        padding: '7px 9px',
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        background: '#FDFCF8',
      }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addNote()}
          placeholder="New note…"
          style={{
            flex: 1, fontSize: 11, border: 'none', outline: 'none',
            background: 'transparent', color: '#1C1917', fontFamily: sansFont,
          }}
        />
        {/* Hidden date input for new note, triggered by calendar icon */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
          <input
            type="date"
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
            style={{
              position: 'absolute',
              opacity: 0,
              width: 0,
              height: 0,
              pointerEvents: 'none',
            }}
            id="new-note-date"
          />
          <button
            onClick={() => (document.getElementById('new-note-date') as HTMLInputElement)?.showPicker?.()}
            title={newDate ? `Due: ${newDate}` : 'Set due date'}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              color: newDate ? '#8A8578' : '#D5D0C5',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="0.8"/>
              <path d="M4 1v2M8 1v2" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round"/>
              <path d="M1 5h10" stroke="currentColor" strokeWidth="0.8"/>
            </svg>
          </button>
          {newDate && (
            <span style={{
              fontSize: 9,
              color: '#8A8578',
              whiteSpace: 'nowrap',
              lineHeight: 1,
            }}>
              {formatDueDate(newDate)}
            </span>
          )}
        </div>
        <button
          onClick={addNote}
          style={{
            width: 20, height: 20, borderRadius: '50%', border: 'none',
            background: '#8A8578', color: '#fff',
            fontSize: 14, lineHeight: 1, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, fontWeight: 300,
          }}
        >+</button>
      </div>
    </div>
  );
}
