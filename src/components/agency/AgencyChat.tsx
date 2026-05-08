'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

const QUICK_ACTIONS = [
  { label: 'Daily briefing', prompt: 'Give me a daily briefing — how are all our clients doing today?' },
  { label: 'Channel health', prompt: 'Do a channel health check — for each client show me channel pacing, spend vs plan, and flag any channels that are over or under pacing.' },
  { label: 'Overdue tasks', prompt: 'What action points are overdue right now?' },
  { label: 'Red clients', prompt: 'Which clients have red health status and why?' },
  { label: 'Channel specs', prompt: 'What channel specs and notes do we have in our library?' },
];

// Height of the chat card when idle / notes visible
const CHAT_CARD_H = 360;
// Gap between chat card bottom and notes top
const NOTES_GAP = 12;
const NOTES_TOP = CHAT_CARD_H + NOTES_GAP; // 372

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      nodes.push(<div key={i} style={{ height: 5 }} />);
      i++;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const fontSize = level === 1 ? 14 : level === 2 ? 13 : 12;
      nodes.push(
        <div key={i} style={{ fontSize, fontWeight: 700, color: '#1C1917', marginTop: 8, marginBottom: 2 }}>
          {renderInline(headingMatch[2])}
        </div>
      );
      i++;
      continue;
    }

    if (/^[-*•]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*•]\s/, ''));
        i++;
      }
      nodes.push(
        <ul key={i} style={{ margin: '3px 0', paddingLeft: 14, listStyle: 'none' }}>
          {items.map((item, j) => (
            <li key={j} style={{ display: 'flex', gap: 5, marginBottom: 2, fontSize: 12.5, lineHeight: 1.5, color: '#3C3732' }}>
              <span style={{ color: '#8A8578', flexShrink: 0, marginTop: 1 }}>•</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: Array<{ num: string; text: string }> = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        const m = lines[i].match(/^(\d+)\.\s(.*)/);
        items.push({ num: m![1], text: m![2] });
        i++;
      }
      nodes.push(
        <ol key={i} style={{ margin: '3px 0', paddingLeft: 0, listStyle: 'none' }}>
          {items.map((item, j) => (
            <li key={j} style={{ display: 'flex', gap: 7, marginBottom: 2, fontSize: 12.5, lineHeight: 1.5, color: '#3C3732' }}>
              <span style={{ color: '#8A8578', flexShrink: 0, minWidth: 13 }}>{item.num}.</span>
              <span>{renderInline(item.text)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    nodes.push(
      <p key={i} style={{ margin: '2px 0', fontSize: 12.5, lineHeight: 1.55, color: '#3C3732' }}>
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return nodes;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ fontWeight: 600, color: '#1C1917' }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} style={{
          fontFamily: 'monospace', fontSize: 11.5, background: 'rgba(0,0,0,0.06)',
          padding: '1px 4px', borderRadius: 3,
        }}>{part.slice(1, -1)}</code>
      );
    }
    return part;
  });
}

interface AgencyChatProps {
  notesSlot?: React.ReactNode;
}

export function AgencyChat({ notesSlot }: AgencyChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toolInProgress, setToolInProgress] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  // notesOpen = true means notes is visible below (chat retracted to CHAT_CARD_H)
  const [notesOpen, setNotesOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [colHeight, setColHeight] = useState(800);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isEmpty = messages.length === 0;

  // Measure container height so we can animate chat card to exact full height
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setColHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const name = data.user?.user_metadata?.first_name;
      setFirstName(typeof name === 'string' && name.trim() ? name.trim() : null);
    });
  }, []);

  useEffect(() => {
    if (!notesOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, notesOpen]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg: Message = { role: 'user', content: trimmed };
    const assistantMsg: Message = { role: 'assistant', content: '', isStreaming: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsLoading(true);
    setToolInProgress(null);
    setNotesOpen(false); // collapse notes on new message

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch('/api/agency/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok) throw new Error('Request failed');

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(part.slice(6));

            if (event.type === 'text') {
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant') {
                  next[next.length - 1] = { ...last, content: last.content + event.text };
                }
                return next;
              });
              setToolInProgress(null);
            } else if (event.type === 'tool_call') {
              const labels: Record<string, string> = {
                get_daily_briefing: 'Fetching daily briefing…',
                get_client_status: 'Looking up client data…',
                get_action_points: 'Checking action points…',
                get_channel_library: 'Searching channel library…',
                get_channel_performance: 'Pulling channel performance data…',
              };
              setToolInProgress(labels[event.tool] ?? 'Fetching data…');
            } else if (event.type === 'done') {
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant') {
                  next[next.length - 1] = { ...last, isStreaming: false };
                }
                return next;
              });
              setToolInProgress(null);
            } else if (event.type === 'error') {
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant') {
                  next[next.length - 1] = { ...last, content: 'Sorry, something went wrong. Please try again.', isStreaming: false };
                }
                return next;
              });
              setToolInProgress(null);
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch {
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, content: 'Sorry, something went wrong. Please try again.', isStreaming: false };
        }
        return next;
      });
    } finally {
      setIsLoading(false);
      setToolInProgress(null);
    }
  }, [messages, isLoading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
    }
  };

  const font: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };

  // Chat card height:
  //   idle or notes-open  → CHAT_CARD_H (360px)
  //   active + collapsed  → full column height (animated drop over notes)
  const chatCardHeight = (!isEmpty && !notesOpen) ? (colHeight || 800) : CHAT_CARD_H;

  // When spine is visible, shift chat card right so spine doesn't overlap content
  const spineVisible = !isEmpty && !notesOpen && !!notesSlot;
  const chatLeft = spineVisible ? 36 : 0;

  // Only transition after first message (avoid animating on mount)
  const chatTransition = !isEmpty
    ? 'height 0.42s cubic-bezier(0.4, 0, 0.2, 1), left 0.42s cubic-bezier(0.4, 0, 0.2, 1)'
    : undefined;

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, minHeight: 0, position: 'relative' }}
    >
      {/* ── Notes layer — always behind, positioned below chat card ── */}
      {notesSlot && (
        <div style={{
          position: 'absolute',
          top: NOTES_TOP,
          left: 0, right: 0, bottom: 0,
          zIndex: 1,
          borderRadius: 18,
          overflow: 'hidden',
        }}>
          {notesSlot}
        </div>
      )}

      {/* ── Chat card — animates downward to cover notes ────────── */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: chatLeft,
        right: 0,
        height: chatCardHeight,
        transition: chatTransition,
        zIndex: 2,
        borderRadius: spineVisible ? '18px 18px 18px 0' : 18,
        overflow: 'hidden',
        background: '#FDFCF8',
        border: '1px solid rgba(232,228,220,0.7)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        ...font,
      }}>
        {isEmpty ? (
          /* ── Idle: Gemini-style prompt ── */
          <div style={{ padding: '18px 16px 14px', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: '#8A8578', fontWeight: 400, marginBottom: 2 }}>Agency Assistant</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#1C1917', lineHeight: 1.25 }}>
                {firstName ? `Hi ${firstName}!` : 'Welcome back'}
              </div>
            </div>

            <div style={{
              marginBottom: 12, flexShrink: 0,
              borderRadius: 20,
              boxShadow: '0 2px 16px rgba(0,0,0,0.09)',
            }}>
            <div style={{
              position: 'relative', borderRadius: 20, padding: 1.5,
              overflow: 'hidden', background: 'rgba(224,220,212,0.7)',
            }}>
              {!input && <div className="chat-glow-spin" />}
              <div style={{
                background: '#FFFFFF', borderRadius: 18.5,
                padding: '13px 13px 10px',
                position: 'relative', zIndex: 1,
              }}>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about clients, tasks, or specs…"
                  rows={2}
                  style={{
                    width: '100%', resize: 'none', border: 'none',
                    background: 'transparent', fontSize: 13, lineHeight: 1.5,
                    color: '#1C1917', outline: 'none', ...font,
                    minHeight: 44, maxHeight: 120, overflow: 'auto',
                    display: 'block', boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <button style={{
                    width: 30, height: 30, borderRadius: '50%', border: '1.5px solid #D1D5DB',
                    background: 'transparent', color: '#6B7280',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0,
                  }}>+</button>
                  <button
                    onClick={() => send(input)}
                    disabled={!input.trim()}
                    style={{
                      width: 36, height: 36, borderRadius: '50%', border: 'none',
                      background: input.trim() ? '#3B82F6' : '#D1D5DB',
                      color: '#FFFFFF',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: input.trim() ? 'pointer' : 'default',
                      transition: 'background 0.15s',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M8 13V3M8 3L4 7M8 3l4 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {QUICK_ACTIONS.map(action => (
                <button
                  key={action.label}
                  onClick={() => send(action.prompt)}
                  style={{
                    padding: '6px 12px', borderRadius: 20,
                    border: '0.5px solid #E0DCD4', background: '#F7F5F2',
                    color: '#5C564F', fontSize: 11.5, fontWeight: 400,
                    cursor: 'pointer', ...font, transition: 'all 0.15s', whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#EDE9E1'; e.currentTarget.style.borderColor = '#D5D0C5'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#F7F5F2'; e.currentTarget.style.borderColor = '#E0DCD4'; }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Active chat ── */
          <>
            {/* Header */}
            <div style={{
              padding: '10px 13px 9px',
              borderBottom: '0.5px solid #F0EDE8',
              display: 'flex', alignItems: 'center', gap: 8,
              flexShrink: 0, background: '#FDFCF8',
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                overflow: 'hidden', flexShrink: 0,
                border: '0.5px solid rgba(0,0,0,0.08)',
              }}>
                <img src="/favicon.ico" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1C1917', lineHeight: 1.2 }}>Agency Assistant</div>
              </div>
              {isLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: '#A0998F', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {toolInProgress ?? 'Thinking…'}
                  </span>
                  <span style={{ display: 'flex', gap: 2 }}>
                    {[0, 1, 2].map(i => (
                      <span key={i} style={{
                        width: 3.5, height: 3.5, borderRadius: '50%', background: '#CC785C',
                        animation: `chatBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                        display: 'inline-block',
                      }} />
                    ))}
                  </span>
                </div>
              )}
              {/* New chat button */}
              <button
                onClick={() => { setMessages([]); setInput(''); setIsLoading(false); setToolInProgress(null); setNotesOpen(false); }}
                title="New chat"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32, borderRadius: 12,
                  border: 'none', background: 'none',
                  cursor: 'pointer', flexShrink: 0, color: '#A0998F',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#4C4840'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#A0998F'; }}
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M5 11.5l.8-2.4 3.7-3.7 1.6 1.6-3.7 3.7L5 11.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M9.5 5.4l1.6 1.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Messages + floating input wrapper */}
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              {/* Scrollable messages */}
              <div style={{
                position: 'absolute', inset: 0,
                overflowY: 'auto',
                padding: '12px 13px 120px',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                {messages.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '90%',
                      padding: msg.role === 'user' ? '7px 11px' : '9px 12px',
                      borderRadius: 14,
                      background: msg.role === 'user' ? '#1C1917' : '#F0EDE8',
                      color: msg.role === 'user' ? '#FDFCF8' : '#3C3732',
                    }}>
                      {msg.role === 'user' ? (
                        <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>{msg.content}</span>
                      ) : (
                        <div>
                          {msg.content
                            ? renderMarkdown(msg.content)
                            : msg.isStreaming && (
                                <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', height: 16 }}>
                                  {[0, 1, 2].map(j => (
                                    <span key={j} style={{
                                      width: 4, height: 4, borderRadius: '50%', background: '#C4BDB5',
                                      animation: `chatBounce 1.2s ease-in-out ${j * 0.2}s infinite`,
                                      display: 'inline-block',
                                    }} />
                                  ))}
                                </span>
                              )
                          }
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Gradient fade behind floating input */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: 110,
                background: 'linear-gradient(to bottom, transparent, #FDFCF8 55%)',
                pointerEvents: 'none',
              }} />

              {/* Floating input */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 10px 12px' }}>
                <div style={{ borderRadius: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.09)' }}>
                <div style={{
                  position: 'relative', borderRadius: 20, padding: 1.5,
                  overflow: 'hidden', background: 'rgba(224,220,212,0.7)',
                }}>
                  {!input && !isLoading && <div className="chat-glow-spin" />}
                <div style={{
                  background: '#FFFFFF', borderRadius: 18.5,
                  padding: '13px 13px 10px',
                  position: 'relative', zIndex: 1,
                }}>
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about clients, tasks, or specs…"
                    rows={2}
                    disabled={isLoading}
                    style={{
                      width: '100%', resize: 'none', border: 'none', background: 'transparent',
                      fontSize: 13, lineHeight: 1.5, color: '#1C1917', outline: 'none',
                      ...font, minHeight: 44, maxHeight: 140, overflow: 'auto',
                      display: 'block', boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <button
                      style={{
                        width: 30, height: 30, borderRadius: '50%', border: '1.5px solid #D1D5DB',
                        background: 'transparent', color: '#6B7280',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', fontSize: 18, lineHeight: 1, flexShrink: 0,
                        padding: 0,
                      }}
                    >
                      +
                    </button>
                    <button
                      onClick={() => send(input)}
                      disabled={!input.trim() || isLoading}
                      style={{
                        width: 36, height: 36, borderRadius: '50%', border: 'none',
                        background: input.trim() && !isLoading ? '#3B82F6' : '#D1D5DB',
                        color: '#FFFFFF',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: input.trim() && !isLoading ? 'pointer' : 'default',
                        transition: 'background 0.15s', flexShrink: 0,
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M8 13V3M8 3L4 7M8 3l4 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
                </div>
                </div>
                {/* Toggle notes visibility */}
                {notesSlot && (
                  <button
                    onClick={() => setNotesOpen(v => !v)}
                    title={notesOpen ? 'Expand chat' : 'Show notes'}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: '100%', marginTop: 4, padding: '3px 0',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#C4BDB5', transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#8A8578'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#C4BDB5'; }}
                  >
                    <svg
                      width="14" height="14" viewBox="0 0 14 14" fill="none"
                      style={{ transition: 'transform 0.25s', transform: notesOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    >
                      <path d="M2 5l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Notes spine overlay — sticks out when chat has dropped over notes ── */}
      {!isEmpty && !notesOpen && notesSlot && (
        <div
          onClick={() => setNotesOpen(true)}
          title="Open notes"
          style={{
            position: 'absolute',
            top: NOTES_TOP,
            left: 0,
            width: 36,
            bottom: 0,
            zIndex: 3,
            cursor: 'pointer',
            background: '#1C1917',
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px)',
            backgroundSize: '5px 5px',
            borderRadius: '18px 0 0 18px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 10,
            gap: 8,
            // Fade in after the chat card finishes dropping
            animation: 'spineReveal 0.2s ease 0.38s both',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{ width: 14, height: 1.5, background: 'rgba(255,255,255,0.85)', display: 'block', borderRadius: 1 }} />
            ))}
          </div>
          <span style={{
            fontSize: 12, fontWeight: 700,
            color: '#FFFFFF',
            textTransform: 'uppercase', letterSpacing: '0.14em',
            writingMode: 'vertical-rl', transform: 'rotate(180deg)',
            marginTop: 4,
          }}>
            Notes
          </span>
        </div>
      )}

      <style>{`
        @keyframes spineReveal {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes chatBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-3px); opacity: 1; }
        }
        .chat-glow-spin {
          position: absolute;
          inset: -100%;
          background: conic-gradient(
            from 0deg,
            transparent 270deg,
            rgba(129,140,248,0.7) 295deg,
            rgba(96,165,250,0.9) 315deg,
            rgba(167,139,250,0.7) 335deg,
            transparent 360deg
          );
          animation: chatGlowOrbit 4s linear infinite, chatGlowPulse 9s ease-in-out 1s infinite;
        }
        @keyframes chatGlowOrbit {
          to { transform: rotate(360deg); }
        }
        @keyframes chatGlowPulse {
          0%, 100% { opacity: 0; }
          8%, 50% { opacity: 1; }
          58%, 95% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
