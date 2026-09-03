'use client';

import { useState, useEffect, useRef } from 'react';
import { getChannelLogo } from '@/lib/utils/channel-icons';
import ChannelHealthBadge from './channel-health-badge';
import { MediaPlanChannel } from '@/components/legacy-plan-builder/media-plan-grid';
import { supabase } from '@/lib/supabase/client';
import ManualSpendSlider from './manual-spend-slider';
import { nzToday } from '@/lib/timezone';

interface Note {
  id: string;
  text: string;
  done: boolean;
  due_date: string | null;
}

interface OtherChannelCardProps {
  channel: MediaPlanChannel;
  clientId: string;
  channelStartDate?: Date | null;
  refetchTrigger?: number;
  onUpdateChannel?: (channelId: string, updates: Partial<MediaPlanChannel>) => void;
  headerActions?: React.ReactNode;
}

const LOCAL_KEY = (clientId: string, name: string) =>
  `channel_notes_${clientId}_${name.toLowerCase().replace(/\s+/g, '_')}`;

const DRAFT_ID = '__draft__';

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function todayLocalMidnight(): Date {
  const [y, m, d] = nzToday().split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDueDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = todayLocalMidnight();
  const diff = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 7) return `${diff}d`;
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function dueDateColor(dateStr: string | null): string {
  if (!dateStr) return '#B5B0A5';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = todayLocalMidnight();
  const diff = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0 || diff <= 2) return '#A0442A';
  if (diff <= 6) return '#B07030';
  return '#8A8578';
}

const sansFont = "'DM Sans', system-ui, sans-serif";

export default function OtherChannelCard({
  channel,
  clientId,
  channelStartDate,
  refetchTrigger,
  onUpdateChannel,
  headerActions,
}: OtherChannelCardProps) {
  const displayName = channel.customChannelName || channel.channelName;
  const plannedSpend = channel.flights?.reduce((sum, f) =>
    sum + Object.values(f.monthlySpend).reduce((a, b) => a + b, 0), 0) || channel.totalUpfrontSpend || 0;
  const [manualActualSpend, setManualActualSpend] = useState(channel.manualActualSpend ?? 0);

  function handleSpendChange(val: number) {
    setManualActualSpend(val);
    onUpdateChannel?.(channel.id, { manualActualSpend: val });
  }
  const localKey = LOCAL_KEY(clientId, displayName);

  const [notes, setNotes] = useState<Note[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [useLocal, setUseLocal] = useState(false);
  const [editTexts, setEditTexts] = useState<Record<string, string>>({ [DRAFT_ID]: '' });
  const [editDates, setEditDates] = useState<Record<string, string>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      setUserId(uid);

      if (uid) {
        try {
          const { data, error } = await (supabase as any)
            .from('agency_notes')
            .select('id, text, done, due_date')
            .eq('user_id', uid)
            .eq('client_id', clientId)
            .eq('channel_name', displayName)
            .order('created_at', { ascending: true });
          if (error) throw error;
          const loaded: Note[] = data || [];
          setNotes(loaded);
          const texts: Record<string, string> = { [DRAFT_ID]: '' };
          loaded.forEach(n => { texts[n.id] = n.text; });
          setEditTexts(texts);
          return;
        } catch { setUseLocal(true); }
      } else {
        setUseLocal(true);
      }

      try {
        const raw = localStorage.getItem(localKey);
        const loaded: Note[] = raw ? JSON.parse(raw) : [];
        setNotes(loaded);
        const texts: Record<string, string> = { [DRAFT_ID]: '' };
        loaded.forEach(n => { texts[n.id] = n.text; });
        setEditTexts(texts);
      } catch { setNotes([]); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, displayName]);

  function persistLocal(updated: Note[]) {
    try { localStorage.setItem(localKey, JSON.stringify(updated)); } catch {}
  }

  async function toggleNote(id: string) {
    const updated = notes.map(n => n.id === id ? { ...n, done: !n.done } : n);
    setNotes(updated);
    if (!useLocal && userId) {
      await (supabase as any).from('agency_notes').update({ done: updated.find(n => n.id === id)?.done }).eq('id', id);
    } else { persistLocal(updated); }
  }

  async function saveNoteText(id: string, text: string) {
    const trimmed = text.trim();
    const updated = notes.map(n => n.id === id ? { ...n, text: trimmed } : n);
    setNotes(updated);
    if (!useLocal && userId) {
      await (supabase as any).from('agency_notes').update({ text: trimmed }).eq('id', id);
    } else { persistLocal(updated); }
  }

  function createNote(text: string, due_date: string | null, insertAfterIdx: number): string {
    const tempId = genId();
    const trimmed = text.trim();
    const newNote: Note = { id: tempId, text: trimmed, done: false, due_date };

    setNotes(prev => {
      const next = [...prev];
      next.splice(insertAfterIdx + 1, 0, newNote);
      return next;
    });
    setEditTexts(prev => ({ ...prev, [tempId]: trimmed }));

    if (!useLocal && userId) {
      (async () => {
        try {
          const { data, error } = await (supabase as any)
            .from('agency_notes')
            .insert({ text: trimmed, done: false, user_id: userId, due_date, client_id: clientId, channel_name: displayName })
            .select('id, text, done, due_date')
            .single();
          if (error) throw error;
          setNotes(prev => prev.map(n => n.id === tempId ? data : n));
          setEditTexts(prev => {
            const c = { ...prev };
            c[data.id] = c[tempId] ?? data.text;
            delete c[tempId];
            return c;
          });
        } catch { setUseLocal(true); }
      })();
    } else {
      persistLocal([...notes.slice(0, insertAfterIdx + 1), newNote, ...notes.slice(insertAfterIdx + 1)]);
    }

    return tempId;
  }

  async function deleteNote(id: string) {
    const updated = notes.filter(n => n.id !== id);
    setNotes(updated);
    setEditTexts(prev => { const c = { ...prev }; delete c[id]; return c; });
    if (!useLocal && userId) {
      await (supabase as any).from('agency_notes').delete().eq('id', id);
    } else { persistLocal(updated); }
  }

  async function updateNoteDate(id: string, due_date: string | null) {
    const updated = notes.map(n => n.id === id ? { ...n, due_date } : n);
    setNotes(updated);
    if (!useLocal && userId) {
      await (supabase as any).from('agency_notes').update({ due_date }).eq('id', id);
    } else { persistLocal(updated); }
  }

  function focusAfterRender(id: string) {
    requestAnimationFrame(() => {
      const el = inputRefs.current[id];
      if (el) { el.focus(); const len = el.value.length; el.setSelectionRange(len, len); }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, id: string, idx: number) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = editTexts[id] ?? '';
      if (id === DRAFT_ID) {
        if (!text.trim()) return;
        createNote(text, editDates[DRAFT_ID] ?? null, notes.length - 1);
        setEditTexts(prev => ({ ...prev, [DRAFT_ID]: '' }));
        setEditDates(prev => { const c = { ...prev }; delete c[DRAFT_ID]; return c; });
        focusAfterRender(DRAFT_ID);
      } else {
        const note = notes.find(n => n.id === id);
        if (note && text.trim() !== note.text) saveNoteText(id, text);
        const newId = createNote('', null, idx);
        focusAfterRender(newId);
      }
    }
    if (e.key === 'Backspace') {
      const text = editTexts[id] ?? '';
      if (text === '' && id !== DRAFT_ID) {
        e.preventDefault();
        const prevNote = notes[idx - 1];
        deleteNote(id);
        focusAfterRender(prevNote ? prevNote.id : DRAFT_ID);
      }
    }
  }

  function handleBlur(id: string) {
    if (id === DRAFT_ID) return;
    const note = notes.find(n => n.id === id);
    const text = editTexts[id] ?? '';
    if (note && text.trim() !== note.text) {
      if (!text.trim()) deleteNote(id);
      else saveNoteText(id, text);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200">
      <div className="px-4 pt-4 pb-3">
        <div className="flex flex-col md:flex-row gap-4">

          {/* ── Left: channel header + notepad ── */}
          <div className="flex-1 min-w-0">
            {/* Channel header */}
            <div className="flex items-start gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-gray-100 text-gray-500">
                {getChannelLogo(channel.channelName, 'w-5 h-5')}
              </div>
              <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{displayName}</h3>
                  {channel.format && <p className="text-xs text-gray-400 mt-0.5">{channel.format}</p>}
                </div>
                {headerActions && <div className="-mt-0.5 flex-shrink-0">{headerActions}</div>}
              </div>
            </div>

            {/* Notepad */}
            <div style={{
              display: 'flex', flexDirection: 'row',
              background: '#FFFFFF',
              borderRadius: 12,
              border: '0.5px solid #D8D4CE',
              boxShadow: '0 2px 6px rgba(0,0,0,0.07)',
              overflow: 'hidden',
              fontFamily: sansFont,
              minHeight: 180,
            }}>
              {/* Dark spine */}
              <div style={{
                width: 18, flexShrink: 0,
                background: '#1C1917',
                backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
                backgroundSize: '4px 4px',
              }} />

              {/* Notepad content */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              {/* Notepad header */}
              <div style={{ padding: '8px 13px 6px', borderBottom: '1.5px solid #E0E8F4', background: '#FFFFFF' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#8A8578', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Notes</div>
                <div style={{ fontSize: 10, color: '#C0BBC0', marginTop: 1 }}>Only visible to you</div>
              </div>

              {/* Ruled paper area */}
              <div
                style={{
                  flex: 1,
                  padding: '4px 0',
                  backgroundImage: [
                    'repeating-linear-gradient(transparent, transparent 27px, rgba(160,200,240,0.55) 27px, rgba(160,200,240,0.55) 28px)',
                    'linear-gradient(to right, transparent 28px, rgba(220,90,90,0.28) 28px, rgba(220,90,90,0.28) 29.5px, transparent 29.5px)',
                  ].join(', '),
                  backgroundPositionY: '4px',
                }}
                onClick={e => {
                  if (e.target === e.currentTarget) inputRefs.current[DRAFT_ID]?.focus();
                }}
              >
                {/* Existing notes */}
                {notes.map((note, idx) => {
                  const dateInputId = `note-date-${note.id}`;
                  const activeDateStr = editDates[note.id] !== undefined ? editDates[note.id] : (note.due_date ?? '');
                  return (
                    <div key={note.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '5px 13px' }}>
                      {/* Checkbox */}
                      <div
                        onClick={() => toggleNote(note.id)}
                        style={{
                          marginTop: 3, width: 13, height: 13, borderRadius: '50%', flexShrink: 0,
                          border: note.done ? '0.5px solid #4A7C59' : '0.5px solid #D5D0C5',
                          background: note.done ? '#4A7C59' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        }}
                      >
                        {note.done && (
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M1.5 4L3 5.5L6.5 2" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      {/* Text */}
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <input
                          ref={el => { inputRefs.current[note.id] = el; }}
                          value={editTexts[note.id] ?? note.text}
                          onChange={e => setEditTexts(prev => ({ ...prev, [note.id]: e.target.value }))}
                          onBlur={() => handleBlur(note.id)}
                          onKeyDown={e => handleKeyDown(e, note.id, idx)}
                          style={{
                            width: '100%', fontSize: 14, lineHeight: '1.4',
                            color: note.done ? '#B5B0A5' : '#1C1917',
                            textDecoration: note.done ? 'line-through' : 'none',
                            background: 'transparent', border: 'none', outline: 'none',
                            fontFamily: 'inherit', padding: 0,
                          }}
                        />
                        {activeDateStr && (
                          <div style={{ fontSize: 10, color: note.done ? '#B5B0A5' : dueDateColor(activeDateStr) }}>
                            {formatDueDate(activeDateStr)}
                          </div>
                        )}
                      </div>
                      {/* Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginTop: 2 }}>
                        <input type="date" id={dateInputId}
                          value={editDates[note.id] ?? note.due_date ?? ''}
                          onChange={e => { setEditDates(prev => ({ ...prev, [note.id]: e.target.value })); updateNoteDate(note.id, e.target.value || null); }}
                          style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                        />
                        <button onClick={() => (document.getElementById(dateInputId) as HTMLInputElement)?.showPicker?.()}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: activeDateStr ? dueDateColor(activeDateStr) : '#D5D0C5' }}
                          title={activeDateStr ? `Due: ${activeDateStr}` : 'Set due date'}
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="0.8" />
                            <path d="M4 1v2M8 1v2" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" />
                            <path d="M1 5h10" stroke="currentColor" strokeWidth="0.8" />
                          </svg>
                        </button>
                        <button onClick={() => deleteNote(note.id)}
                          style={{ width: 16, height: 16, borderRadius: '50%', border: 'none', background: '#F5EDE9', color: '#A0442A', fontSize: 12, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          aria-label="Delete note"
                        >×</button>
                      </div>
                    </div>
                  );
                })}

                {/* Draft row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '5px 13px' }}>
                  <div style={{ marginTop: 3, width: 13, height: 13, borderRadius: '50%', flexShrink: 0, border: '0.5px dashed #D5D0C5', background: 'transparent' }} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <input
                      ref={el => { inputRefs.current[DRAFT_ID] = el; }}
                      value={editTexts[DRAFT_ID] ?? ''}
                      onChange={e => setEditTexts(prev => ({ ...prev, [DRAFT_ID]: e.target.value }))}
                      onKeyDown={e => handleKeyDown(e, DRAFT_ID, notes.length)}
                      placeholder={notes.length > 0 ? 'New note…' : 'Start typing…'}
                      style={{ width: '100%', fontSize: 14, lineHeight: '1.4', color: '#1C1917', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'inherit', padding: 0 }}
                    />
                    {(editDates[DRAFT_ID]) && (
                      <div style={{ fontSize: 10, color: '#8A8578' }}>{formatDueDate(editDates[DRAFT_ID])}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, marginTop: 2 }}>
                    <input type="date" id="draft-note-date-other"
                      value={editDates[DRAFT_ID] ?? ''}
                      onChange={e => setEditDates(prev => ({ ...prev, [DRAFT_ID]: e.target.value }))}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                    />
                    <button onClick={() => (document.getElementById('draft-note-date-other') as HTMLInputElement)?.showPicker?.()}
                      title={editDates[DRAFT_ID] ? `Due: ${editDates[DRAFT_ID]}` : 'Set due date'}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: editDates[DRAFT_ID] ? dueDateColor(editDates[DRAFT_ID]) : '#D5D0C5' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="0.8" />
                        <path d="M4 1v2M8 1v2" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" />
                        <path d="M1 5h10" stroke="currentColor" strokeWidth="0.8" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              </div>{/* end notepad content */}
            </div>
          </div>

          {/* ── Right: action points ── */}

          <div className="flex-1 md:border-l md:border-gray-100 md:pl-4">
            <ChannelHealthBadge
              channelType={channel.channelName}
              clientId={clientId}
              channelStartDate={channelStartDate}
              channelFlights={channel.flights ?? []}
              showTopBorder={false}
            />
          </div>
        </div>
      </div>

      {/* ── Spend slider — full width ─────────────────────── */}
      <ManualSpendSlider
        planned={plannedSpend}
        actual={manualActualSpend}
        onChange={handleSpendChange}
        accentColor="#4A6580"
        flightStart={channel.flights && channel.flights.length > 0 ? channel.flights[0].startWeek : null}
        flightEnd={channel.flights && channel.flights.length > 0 ? channel.flights[channel.flights.length - 1].endWeek : null}
      />
    </div>
  );
}
