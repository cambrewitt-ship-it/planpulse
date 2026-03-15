'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

export interface ClientNote {
  id: string;
  text: string;
  done: boolean;
  due_date: string | null;
  client_id: string;
}

interface ClientNotesSectionProps {
  clientId: string;
  onNotesChange?: (notes: ClientNote[]) => void;
}

const LOCAL_KEY = (clientId: string) => `client_notes_${clientId}`;

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

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
  if (!dateStr) return '#9ca3af';
  const [y, m, d] = dateStr.split('-').map(Number);
  const note = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((note.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return '#ef4444';
  if (diff <= 2) return '#ef4444';
  if (diff <= 6) return '#f59e0b';
  return '#6b7280';
}

export default function ClientNotesSection({ clientId, onNotesChange }: ClientNotesSectionProps) {
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [useLocal, setUseLocal] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [newText, setNewText] = useState('');
  const [newDate, setNewDate] = useState('');

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
          .eq('client_id', clientId)
          .order('created_at', { ascending: true });
        if (error) throw error;
        const loaded = (data || []) as ClientNote[];
        setNotes(loaded);
        onNotesChange?.(loaded);
      } catch {
        setUseLocal(true);
        try {
          const raw = localStorage.getItem(LOCAL_KEY(clientId));
          const loaded = raw ? JSON.parse(raw) : [];
          setNotes(loaded);
          onNotesChange?.(loaded);
        } catch {
          setNotes([]);
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function persistLocal(updated: ClientNote[]) {
    try { localStorage.setItem(LOCAL_KEY(clientId), JSON.stringify(updated)); } catch {}
  }

  async function toggleNote(id: string) {
    const updated = notes.map(n => n.id === id ? { ...n, done: !n.done } : n);
    setNotes(updated);
    onNotesChange?.(updated);
    if (!useLocal && userId) {
      const note = updated.find(n => n.id === id);
      await (supabase as any).from('agency_notes').update({ done: note?.done }).eq('id', id);
    } else {
      persistLocal(updated);
    }
  }

  async function addNote() {
    const text = newText.trim();
    if (!text || !userId) return;
    setNewText('');
    setNewDate('');
    setAddingNote(false);

    const due_date = newDate || null;

    if (!useLocal) {
      try {
        const { data, error } = await (supabase as any)
          .from('agency_notes')
          .insert({ text, done: false, user_id: userId, client_id: clientId, due_date })
          .select('id, text, done, due_date, client_id')
          .single();
        if (error) throw error;
        const updated = [...notes, data as ClientNote];
        setNotes(updated);
        onNotesChange?.(updated);
        return;
      } catch {
        setUseLocal(true);
      }
    }

    const updated = [...notes, { id: genId(), text, done: false, due_date, client_id: clientId }];
    setNotes(updated);
    onNotesChange?.(updated);
    persistLocal(updated);
  }

  async function deleteNote(id: string) {
    const updated = notes.filter(n => n.id !== id);
    setNotes(updated);
    onNotesChange?.(updated);
    if (!useLocal) {
      await (supabase as any).from('agency_notes').delete().eq('id', id);
    } else {
      persistLocal(updated);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 14 }}>📝</span>
          <span className="text-sm font-semibold text-gray-800">Notes</span>
          {notes.filter(n => !n.done).length > 0 && (
            <span className="text-xs font-medium text-gray-400">
              {notes.filter(n => !n.done).length} open
            </span>
          )}
        </div>
        <button
          onClick={() => setAddingNote(v => !v)}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          {addingNote ? 'Cancel' : '+ Add note'}
        </button>
      </div>

      {/* Add note form */}
      {addingNote && (
        <div className="mb-3 p-3 rounded-lg border border-indigo-100 bg-indigo-50/40">
          <input
            autoFocus
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addNote()}
            placeholder="Note text…"
            className="w-full text-sm bg-transparent border-none outline-none text-gray-800 placeholder-gray-400 mb-2"
          />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                <rect x="1" y="2" width="10" height="9" rx="1.5" stroke="#9ca3af" strokeWidth="1.1"/>
                <path d="M1 5h10" stroke="#9ca3af" strokeWidth="1.1"/>
                <path d="M4 1v2M8 1v2" stroke="#9ca3af" strokeWidth="1.1" strokeLinecap="round"/>
              </svg>
              <input
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                className="text-xs text-gray-600 bg-transparent border-none outline-none flex-1"
                style={{ colorScheme: 'light' }}
              />
            </div>
            <button
              onClick={addNote}
              disabled={!newText.trim()}
              className="px-3 py-1 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Notes list */}
      {notes.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No notes yet — add one above.</p>
      ) : (
        <div className="space-y-1">
          {notes.map((note) => (
            <div
              key={note.id}
              className="group flex items-start gap-2.5 py-2 px-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {/* Circle checkbox */}
              <button
                onClick={() => toggleNote(note.id)}
                style={{
                  marginTop: 2,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  flexShrink: 0,
                  border: note.done ? '1.5px solid #10b981' : '1.5px solid #d1d5db',
                  background: note.done ? '#10b981' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                {note.done && (
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                    <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>

              {/* Text + date */}
              <div className="flex-1 min-w-0">
                <span
                  className="text-sm"
                  style={{
                    color: note.done ? '#9ca3af' : '#111827',
                    textDecoration: note.done ? 'line-through' : 'none',
                    wordBreak: 'break-word',
                  }}
                >
                  {note.text}
                </span>
                {note.due_date && (
                  <span
                    className="ml-2 text-xs font-medium"
                    style={{ color: note.done ? '#9ca3af' : dueDateColor(note.due_date) }}
                  >
                    {formatDueDate(note.due_date)}
                  </span>
                )}
              </div>

              {/* Delete (hover only) */}
              <button
                onClick={() => deleteNote(note.id)}
                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all text-xs leading-none"
                style={{ flexShrink: 0, lineHeight: 1, paddingTop: 3 }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
