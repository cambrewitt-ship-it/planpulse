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
  filteredClientIds?: string[] | null;
  activeClientId?: string | null;
}

const DRAFT_ID = '__draft__';

export function NotesChecklist({ filteredClientIds, activeClientId }: NotesChecklistProps = {}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [useLocal, setUseLocal] = useState(false);
  // inline text edits: noteId → current text (including the DRAFT_ID sentinel)
  const [editTexts, setEditTexts] = useState<Record<string, string>>({ [DRAFT_ID]: '' });
  // inline due-date edits keyed same way
  const [editDates, setEditDates] = useState<Record<string, string>>({});

  // refs for every input row, keyed by id (includes DRAFT_ID)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const listRef = useRef<HTMLDivElement>(null);

  const sansFont = "'DM Sans', system-ui, sans-serif";

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
        const loaded: Note[] = data || [];
        setNotes(loaded);
        // seed editTexts with all note texts so inputs are controlled
        const texts: Record<string, string> = { [DRAFT_ID]: '' };
        loaded.forEach(n => { texts[n.id] = n.text; });
        setEditTexts(texts);
      } catch {
        setUseLocal(true);
        try {
          const raw = localStorage.getItem(LOCAL_KEY(uid));
          const parsed: Note[] = raw ? JSON.parse(raw) : [];
          setNotes(parsed);
          const texts: Record<string, string> = { [DRAFT_ID]: '' };
          parsed.forEach(n => { texts[n.id] = n.text; });
          setEditTexts(texts);
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

  async function saveNoteText(id: string, text: string) {
    const trimmed = text.trim();
    const updated = notes.map(n => n.id === id ? { ...n, text: trimmed } : n);
    setNotes(updated);
    if (!useLocal && userId) {
      try {
        await (supabase as any).from('agency_notes').update({ text: trimmed }).eq('id', id);
      } catch {
        setUseLocal(true);
        persistLocal(updated);
      }
    } else {
      persistLocal(updated);
    }
  }

  // Synchronous optimistic creation — adds to state immediately, persists in background.
  function createNote(text: string, due_date: string | null, insertAfterIndex: number): string {
    const tempId = genId();
    const client_id = activeClientId ?? null;
    const trimmed = text.trim();
    const newNote: Note = { id: tempId, text: trimmed, done: false, due_date, client_id: client_id ?? undefined };

    const insertIntoList = (prev: Note[]): Note[] => {
      const visible = getVisibleNotes(prev);
      const insertAfterNote = visible[insertAfterIndex];
      if (!insertAfterNote) return [...prev, newNote];
      const globalIdx = prev.findIndex(n => n.id === insertAfterNote.id);
      const next = [...prev];
      next.splice(globalIdx + 1, 0, newNote);
      return next;
    };

    // Update state immediately — note appears before any network call
    setNotes(insertIntoList);
    setEditTexts(prev => ({ ...prev, [tempId]: trimmed }));

    if (!userId) return tempId;

    if (useLocal) {
      persistLocal(insertIntoList(notes));
      return tempId;
    }

    // Save to Supabase in background; swap temp ID for real DB ID when done
    ;(async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('agency_notes')
          .insert({ text: trimmed, done: false, user_id: userId, due_date, client_id })
          .select('id, text, done, due_date, client_id')
          .single();
        if (error) throw error;
        setNotes(prev => prev.map(n => n.id === tempId ? data : n));
        setEditTexts(prev => {
          const c = { ...prev };
          c[data.id] = c[tempId] ?? data.text;
          delete c[tempId];
          return c;
        });
      } catch {
        setUseLocal(true);
        persistLocal(insertIntoList(notes));
      }
    })();

    return tempId;
  }

  async function deleteNote(id: string) {
    const updated = notes.filter(n => n.id !== id);
    setNotes(updated);
    setEditTexts(prev => { const c = { ...prev }; delete c[id]; return c; });
    if (!useLocal && userId) {
      try {
        await (supabase as any).from('agency_notes').delete().eq('id', id);
      } catch {
        setUseLocal(true);
        persistLocal(updated);
      }
    } else {
      persistLocal(updated);
    }
  }

  async function updateNoteDate(id: string, due_date: string | null) {
    const updated = notes.map(n => (n.id === id ? { ...n, due_date } : n));
    setNotes(updated);
    if (!useLocal && userId) {
      try {
        await (supabase as any).from('agency_notes').update({ due_date }).eq('id', id);
      } catch {
        setUseLocal(true);
        persistLocal(updated);
      }
    } else {
      persistLocal(updated);
    }
  }

  function getVisibleNotes(notesList: Note[]) {
    if (activeClientId) return notesList.filter(n => n.client_id === activeClientId);
    if (filteredClientIds) return notesList.filter(n => n.client_id != null && filteredClientIds.includes(n.client_id));
    return notesList;
  }

  const visibleNotes = getVisibleNotes(notes);

  // Focus a specific input after React re-renders
  function focusAfterRender(id: string) {
    requestAnimationFrame(() => {
      const el = inputRefs.current[id];
      if (el) {
        el.focus();
        // place cursor at end
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, id: string, visibleIdx: number) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = editTexts[id] ?? '';

      if (id === DRAFT_ID) {
        if (!text.trim()) return;
        createNote(text, editDates[DRAFT_ID] ?? null, visibleNotes.length - 1);
        setEditTexts(prev => ({ ...prev, [DRAFT_ID]: '' }));
        setEditDates(prev => { const c = { ...prev }; delete c[DRAFT_ID]; return c; });
        focusAfterRender(DRAFT_ID);
      } else {
        // Fire-and-forget any pending text change on the current row
        const note = notes.find(n => n.id === id);
        if (note && text.trim() !== note.text) {
          saveNoteText(id, text);
        }
        const newId = createNote('', null, visibleIdx);
        focusAfterRender(newId);
      }
    }

    if (e.key === 'Backspace') {
      const text = editTexts[id] ?? '';
      if (text === '' && id !== DRAFT_ID) {
        e.preventDefault();
        const prevNote = visibleNotes[visibleIdx - 1];
        const focusId = prevNote ? prevNote.id : DRAFT_ID;
        deleteNote(id);
        focusAfterRender(focusId);
      }
    }
  }

  function handleBlur(id: string) {
    if (id === DRAFT_ID) return; // draft is only committed on Enter
    const note = notes.find(n => n.id === id);
    const text = editTexts[id] ?? '';
    if (note && text.trim() !== note.text) {
      if (!text.trim()) {
        deleteNote(id);
      } else {
        saveNoteText(id, text);
      }
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#FFFFFF',
        borderRadius: '0 18px 18px 0',
        border: '0.5px solid #D8D4CE',
        boxShadow: '0 2px 6px rgba(0,0,0,0.07)',
        overflow: 'hidden',
        fontFamily: sansFont,
      }}
    >
      {/* Header */}
      <div style={{
        padding: '10px 13px 8px',
        borderBottom: '1.5px solid #E0E8F4',
        background: '#FFFFFF',
      }}>
        <div style={{ fontSize: 9, fontWeight: 600, color: '#8A8578', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Notes</div>
        <div style={{ fontSize: 9, color: '#C0BBC0', marginTop: 1 }}>Only visible to you</div>
      </div>

      {/* Notes list — scrollable, moleskine-ruled */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 0',
          backgroundImage: [
            'repeating-linear-gradient(transparent, transparent 27px, rgba(160,200,240,0.55) 27px, rgba(160,200,240,0.55) 28px)',
            'linear-gradient(to right, transparent 28px, rgba(220,90,90,0.28) 28px, rgba(220,90,90,0.28) 29.5px, transparent 29.5px)',
          ].join(', '),
          backgroundPositionY: '4px',
          backgroundPositionX: '0px',
        }}
        onClick={e => {
          // Clicking empty space in the list focuses the draft input
          if (e.target === e.currentTarget) {
            inputRefs.current[DRAFT_ID]?.focus();
          }
        }}
      >
        {visibleNotes.map((note, idx) => (
          <NoteRow
            key={note.id}
            note={note}
            text={editTexts[note.id] ?? note.text}
            dateValue={editDates[note.id] !== undefined ? editDates[note.id] : (note.due_date ?? '')}
            inputRef={el => { inputRefs.current[note.id] = el; }}
            onToggle={() => toggleNote(note.id)}
            onTextChange={v => setEditTexts(prev => ({ ...prev, [note.id]: v }))}
            onDateChange={v => {
              setEditDates(prev => ({ ...prev, [note.id]: v }));
              updateNoteDate(note.id, v || null);
            }}
            onBlur={() => handleBlur(note.id)}
            onKeyDown={e => handleKeyDown(e, note.id, idx)}
            onDelete={() => deleteNote(note.id)}
            sansFont={sansFont}
          />
        ))}

        {/* Draft row — always visible at bottom for new entries */}
        <DraftRow
          text={editTexts[DRAFT_ID] ?? ''}
          dateValue={editDates[DRAFT_ID] ?? ''}
          inputRef={el => { inputRefs.current[DRAFT_ID] = el; }}
          onTextChange={v => setEditTexts(prev => ({ ...prev, [DRAFT_ID]: v }))}
          onDateChange={v => setEditDates(prev => ({ ...prev, [DRAFT_ID]: v }))}
          onKeyDown={e => handleKeyDown(e, DRAFT_ID, visibleNotes.length)}
          hasNotes={visibleNotes.length > 0}
          autoFocus={visibleNotes.length === 0}
          sansFont={sansFont}
        />
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

interface NoteRowProps {
  note: Note;
  text: string;
  dateValue: string;
  inputRef: (el: HTMLInputElement | null) => void;
  onToggle: () => void;
  onTextChange: (v: string) => void;
  onDateChange: (v: string) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onDelete: () => void;
  sansFont: string;
}

function NoteRow({ note, text, dateValue, inputRef, onToggle, onTextChange, onDateChange, onBlur, onKeyDown, onDelete, sansFont }: NoteRowProps) {
  const dateInputId = `date-${note.id}`;
  const activeDateStr = dateValue || note.due_date;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 7,
        padding: '5px 13px',
      }}
    >
      {/* Circle checkbox */}
      <div
        onClick={onToggle}
        style={{
          marginTop: 3,
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
      >
        {note.done && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1.5 4L3 5.5L6.5 2" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <input
          ref={inputRef}
          value={text}
          onChange={e => onTextChange(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          style={{
            width: '100%',
            fontSize: 12,
            lineHeight: '1.4',
            color: note.done ? '#B5B0A5' : '#1C1917',
            textDecoration: note.done ? 'line-through' : 'none',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            padding: 0,
          }}
        />
        {activeDateStr && (
          <div style={{ fontSize: 9, color: note.done ? '#B5B0A5' : dueDateColor(activeDateStr) }}>
            {formatDueDate(activeDateStr)}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginTop: 2 }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 3 }}>
          <input
            type="date"
            value={dateValue || note.due_date || ''}
            onChange={e => onDateChange(e.target.value)}
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
            id={dateInputId}
          />
          <button
            onClick={() => (document.getElementById(dateInputId) as HTMLInputElement)?.showPicker?.()}
            title={activeDateStr ? `Due: ${activeDateStr}` : 'Set due date'}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              display: 'flex', alignItems: 'center',
              color: activeDateStr ? dueDateColor(activeDateStr) : '#D5D0C5',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="0.8" />
              <path d="M4 1v2M8 1v2" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" />
              <path d="M1 5h10" stroke="currentColor" strokeWidth="0.8" />
            </svg>
          </button>
        </div>
        <button
          onClick={onDelete}
          style={{
            width: 16, height: 16, borderRadius: '50%', border: 'none',
            background: '#F5EDE9', color: '#A0442A', fontSize: 10,
            lineHeight: 1, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
          aria-label="Delete note"
        >
          ×
        </button>
      </div>
    </div>
  );
}

interface DraftRowProps {
  text: string;
  dateValue: string;
  inputRef: (el: HTMLInputElement | null) => void;
  onTextChange: (v: string) => void;
  onDateChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  hasNotes: boolean;
  sansFont: string;
  autoFocus?: boolean;
}

function DraftRow({ text, dateValue, inputRef, onTextChange, onDateChange, onKeyDown, hasNotes, sansFont, autoFocus }: DraftRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 7,
        padding: '5px 13px',
      }}
    >
      {/* Hollow circle — will become real checkbox once saved */}
      <div
        style={{
          marginTop: 3,
          width: 13,
          height: 13,
          borderRadius: '50%',
          flexShrink: 0,
          border: '0.5px dashed #D5D0C5',
          background: 'transparent',
        }}
      />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <input
          ref={inputRef}
          value={text}
          onChange={e => onTextChange(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
          placeholder={hasNotes ? 'New note…' : 'Start typing…'}
          style={{
            width: '100%',
            fontSize: 12,
            lineHeight: '1.4',
            color: '#1C1917',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            padding: 0,
          }}
        />
        {dateValue && (
          <div style={{ fontSize: 9, color: '#8A8578' }}>
            {formatDueDate(dateValue)}
          </div>
        )}
      </div>

      {/* Date picker for draft */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, marginTop: 2 }}>
        <input
          type="date"
          value={dateValue}
          onChange={e => onDateChange(e.target.value)}
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
          id="draft-note-date"
        />
        <button
          onClick={() => (document.getElementById('draft-note-date') as HTMLInputElement)?.showPicker?.()}
          title={dateValue ? `Due: ${dateValue}` : 'Set due date'}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center',
            color: dateValue ? '#8A8578' : '#D5D0C5',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="0.8" />
            <path d="M4 1v2M8 1v2" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" />
            <path d="M1 5h10" stroke="currentColor" strokeWidth="0.8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
