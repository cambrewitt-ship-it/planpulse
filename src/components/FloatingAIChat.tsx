'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

const QUICK_ACTIONS = [
  { label: 'Daily briefing', prompt: 'Give me a daily briefing — how are all our clients doing today?' },
  { label: 'Topline results', prompt: 'Give me a topline results check across all clients — for each client summarise their actual spend vs planned spend, key performance highlights, and flag any significant variances or issues I should be aware of.' },
  { label: 'Channel health', prompt: 'Do a channel health check — for each client show me channel pacing, spend vs plan, and flag any channels that are over or under pacing.' },
  { label: 'Overdue tasks', prompt: 'What action points are overdue right now?' },
  { label: 'Red clients', prompt: 'Which clients have red health status and why?' },
  { label: 'Channel specs', prompt: 'What channel specs and notes do we have in our library?' },
];

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { nodes.push(<div key={i} style={{ height: 5 }} />); i++; continue; }
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const fontSize = level === 1 ? 14 : level === 2 ? 13 : 12;
      nodes.push(<div key={i} style={{ fontSize, fontWeight: 700, color: '#1C1917', marginTop: 8, marginBottom: 2 }}>{headingMatch[2]}</div>);
      i++; continue;
    }
    if (/^[-*•]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s/.test(lines[i])) { items.push(lines[i].replace(/^[-*•]\s/, '')); i++; }
      nodes.push(<ul key={i} style={{ margin: '3px 0', paddingLeft: 14 }}>{items.map((item, j) => <li key={j} style={{ fontSize: 12.5, color: '#3C3732', lineHeight: 1.5, marginBottom: 1 }}>{renderInline(item)}</li>)}</ul>);
      continue;
    }
    nodes.push(<div key={i} style={{ fontSize: 12.5, color: '#3C3732', lineHeight: 1.5 }}>{renderInline(line)}</div>);
    i++;
  }
  return nodes;
}

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} style={{ fontWeight: 600, color: '#1C1917' }}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} style={{ fontFamily: 'monospace', fontSize: 11.5, background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: 3 }}>{part.slice(1, -1)}</code>;
    return part;
  });
}

function FloatingAIChatInner() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toolInProgress, setToolInProgress] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const font: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };
  const isEmpty = messages.length === 0;

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = textareaRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`; }
  };

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg: Message = { role: 'user', content: trimmed };
    const assistantMsg: Message = { role: 'assistant', content: '', isStreaming: true };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsLoading(true);
    setToolInProgress(null);
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }

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
              setMessages(prev => { const next = [...prev]; const last = next[next.length - 1]; if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + event.text }; return next; });
              setToolInProgress(null);
            } else if (event.type === 'tool_call') {
              const labels: Record<string, string> = { get_daily_briefing: 'Fetching daily briefing…', get_client_status: 'Looking up client data…', get_action_points: 'Checking action points…', get_channel_library: 'Searching channel library…', get_channel_performance: 'Pulling channel performance…' };
              setToolInProgress(labels[event.tool] ?? 'Fetching data…');
            } else if (event.type === 'done') {
              setMessages(prev => { const next = [...prev]; const last = next[next.length - 1]; if (last?.role === 'assistant') next[next.length - 1] = { ...last, isStreaming: false }; return next; });
              setToolInProgress(null);
            } else if (event.type === 'error') {
              setMessages(prev => { const next = [...prev]; const last = next[next.length - 1]; if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: 'Sorry, something went wrong.', isStreaming: false }; return next; });
              setToolInProgress(null);
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch {
      setMessages(prev => { const next = [...prev]; const last = next[next.length - 1]; if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: 'Sorry, something went wrong.', isStreaming: false }; return next; });
    } finally {
      setIsLoading(false);
      setToolInProgress(null);
    }
  }, [messages, isLoading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: 76,
          right: 24,
          width: 380,
          height: 520,
          background: '#FDFCF8',
          border: '1px solid rgba(232,228,220,0.7)',
          borderRadius: 18,
          boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 9000,
          overflow: 'hidden',
          ...font,
        }}>

          {isEmpty ? (
            /* ── Idle state — matches AgencyChat idle ── */
            <div style={{ padding: '18px 16px 14px', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              {/* Close button top-right */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 13, color: '#8A8578', fontWeight: 400, marginBottom: 2 }}>Agency Assistant</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#1C1917', lineHeight: 1.25 }}>How can I help?</div>
                </div>
                <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A0998F', padding: 4, borderRadius: 8, display: 'flex', alignItems: 'center' }}>
                  <X size={16} />
                </button>
              </div>

              {/* Input box */}
              <div style={{ marginBottom: 12, flexShrink: 0, borderRadius: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.09)' }}>
                <div style={{ position: 'relative', borderRadius: 20, padding: 1.5, overflow: 'hidden', background: 'rgba(224,220,212,0.7)' }}>
                  {!input && <div className="chat-glow-spin" />}
                  <div style={{ background: '#FFFFFF', borderRadius: 18.5, padding: '13px 13px 10px', position: 'relative', zIndex: 1 }}>
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={handleInput}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask about clients, tasks, or specs…"
                      rows={2}
                      style={{ width: '100%', resize: 'none', border: 'none', background: 'transparent', fontSize: 13, lineHeight: 1.5, color: '#1C1917', outline: 'none', ...font, minHeight: 44, maxHeight: 120, overflow: 'auto', display: 'block', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8 }}>
                      <button
                        onClick={() => send(input)}
                        disabled={!input.trim()}
                        style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: input.trim() ? '#3B82F6' : '#D1D5DB', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'default', transition: 'background 0.15s' }}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 13V3M8 3L4 7M8 3l4 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick action pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {QUICK_ACTIONS.map(action => (
                  <button
                    key={action.label}
                    onClick={() => send(action.prompt)}
                    style={{ padding: '6px 12px', borderRadius: 20, border: '0.5px solid #E0DCD4', background: '#F7F5F2', color: '#5C564F', fontSize: 11.5, fontWeight: 400, cursor: 'pointer', ...font, transition: 'all 0.15s', whiteSpace: 'nowrap' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#EDE9E1'; e.currentTarget.style.borderColor = '#D5D0C5'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#F7F5F2'; e.currentTarget.style.borderColor = '#E0DCD4'; }}
                  >{action.label}</button>
                ))}
              </div>
            </div>
          ) : (
            /* ── Active chat — matches AgencyChat active state ── */
            <>
              {/* Header */}
              <div style={{ padding: '10px 13px 9px', borderBottom: '0.5px solid #F0EDE8', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: '#FDFCF8' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '0.5px solid rgba(0,0,0,0.08)' }}>
                  <img src="/favicon.ico" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1C1917', lineHeight: 1.2 }}>Agency Assistant</div>
                </div>
                {/* New chat */}
                <button
                  onClick={() => { setMessages([]); setInput(''); setIsLoading(false); setToolInProgress(null); }}
                  title="New chat"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 12, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0, color: '#A0998F', transition: 'color 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#4C4840'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#A0998F'; }}
                >
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.4"/><path d="M5 11.5l.8-2.4 3.7-3.7 1.6 1.6-3.7 3.7L5 11.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M9.5 5.4l1.6 1.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                </button>
                {/* Close */}
                <button
                  onClick={() => setOpen(false)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 12, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0, color: '#A0998F', transition: 'color 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#4C4840'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#A0998F'; }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Messages + floating input */}
              <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                {/* Scrollable messages */}
                <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '12px 13px 160px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {messages.map((msg, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth: '92%', padding: msg.role === 'user' ? '7px 11px' : '9px 12px', borderRadius: 14, background: msg.role === 'user' ? '#1C1917' : '#F0EDE8', color: msg.role === 'user' ? '#FDFCF8' : '#3C3732' }}>
                        {msg.role === 'user' ? (
                          <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>{msg.content}</span>
                        ) : (
                          <div>
                            {msg.content ? renderMarkdown(msg.content) : msg.isStreaming ? (
                              <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', height: 16 }}>
                                {[0, 1, 2].map(j => <span key={j} style={{ width: 4, height: 4, borderRadius: '50%', background: '#C4BDB5', animation: `chatBounce 1.2s ease-in-out ${j * 0.2}s infinite`, display: 'inline-block' }} />)}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 2px' }}>
                        <span style={{ fontSize: 11, color: '#A0998F' }}>{toolInProgress ?? 'Thinking…'}</span>
                        <span style={{ display: 'flex', gap: 2 }}>
                          {[0, 1, 2].map(i => <span key={i} style={{ width: 3.5, height: 3.5, borderRadius: '50%', background: '#CC785C', animation: `chatBounce 1.2s ease-in-out ${i * 0.2}s infinite`, display: 'inline-block' }} />)}
                        </span>
                      </div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>

                {/* Gradient fade */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 110, background: 'linear-gradient(to bottom, transparent, #FDFCF8 55%)', pointerEvents: 'none' }} />

                {/* Floating input */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 10px 12px' }}>
                  <div style={{ borderRadius: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.09)' }}>
                    <div style={{ position: 'relative', borderRadius: 20, padding: 1.5, overflow: 'hidden', background: 'rgba(224,220,212,0.7)' }}>
                      {!input && !isLoading && <div className="chat-glow-spin" />}
                      <div style={{ background: '#FFFFFF', borderRadius: 18.5, padding: '13px 13px 10px', position: 'relative', zIndex: 1 }}>
                        <textarea
                          ref={textareaRef}
                          value={input}
                          onChange={handleInput}
                          onKeyDown={handleKeyDown}
                          placeholder="Ask about clients, tasks, or specs…"
                          rows={2}
                          disabled={isLoading}
                          style={{ width: '100%', resize: 'none', border: 'none', background: 'transparent', fontSize: 13, lineHeight: 1.5, color: '#1C1917', outline: 'none', ...font, minHeight: 44, maxHeight: 140, overflow: 'auto', display: 'block', boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8 }}>
                          <button
                            onClick={() => send(input)}
                            disabled={!input.trim() || isLoading}
                            style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: (input.trim() && !isLoading) ? '#3B82F6' : '#D1D5DB', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (input.trim() && !isLoading) ? 'pointer' : 'default', transition: 'background 0.15s' }}
                          >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 13V3M8 3L4 7M8 3l4 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Floating + Ask AI button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          height: 44,
          borderRadius: 22,
          paddingLeft: open ? 16 : 14,
          paddingRight: open ? 16 : 16,
          background: open ? '#1C1917' : 'linear-gradient(135deg, #4A6580 0%, #2F4558 100%)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          boxShadow: '0 4px 20px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.1)',
          zIndex: 9001,
          transition: 'background 0.2s',
          ...font,
          whiteSpace: 'nowrap',
        }}
        title="Ask AI"
      >
        {open
          ? <X size={17} color="#fff" />
          : <>
              <span style={{ fontSize: 16, color: '#fff', lineHeight: 1, marginBottom: 1 }}>+</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#fff', letterSpacing: '0.01em' }}>Ask AI</span>
            </>
        }
      </button>
    </>
  );
}

export function FloatingAIChat() {
  const pathname = usePathname();
  if (pathname === '/agency') return null;
  return <FloatingAIChatInner />;
}
