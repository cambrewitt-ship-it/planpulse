'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Sparkles, Loader2, CheckCircle2, X, RefreshCw } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isOverview?: boolean;
}

interface ActionEvent {
  id: string;
  message: string;
}

const TOOL_LABELS: Record<string, string> = {
  get_client_intelligence: 'Reading client intel…',
  get_channel_performance: 'Checking channel performance…',
  get_action_points: 'Loading action points…',
  complete_action_point: 'Completing action point…',
  update_media_plan_budget: 'Updating budget…',
  update_manual_spend: 'Updating actual spend…',
  toggle_ooh_checklist: 'Updating OOH checklist…',
};

interface Props {
  clientId: string;
  clientName: string;
  onActionComplete?: (tool: string) => void;
}

export default function ClientAIChatBar({ clientId, clientName, onActionComplete }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [apiMessages, setApiMessages] = useState<{ role: string; content: string }[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null);
  const [actionEvents, setActionEvents] = useState<ActionEvent[]>([]);
  const [overviewStarted, setOverviewStarted] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasAutoLoaded = useRef(false);

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  // Auto-scroll to top on new content (newest messages at top)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [messages, activeToolCall]);

  // Auto-dismiss action chips after 4s
  useEffect(() => {
    if (!actionEvents.length) return;
    const t = setTimeout(() => setActionEvents(prev => prev.slice(1)), 4000);
    return () => clearTimeout(t);
  }, [actionEvents]);

  const sendMessage = useCallback(async (userText: string, isAuto = false) => {
    if (isStreaming) return;

    const newUserMsg = { role: 'user' as const, content: userText };
    const newApiMessages = [...apiMessages, newUserMsg];

    // Add user bubble + empty AI slot in one atomic update so user always renders above AI
    setMessages(prev => {
      const withUser: Message[] = isAuto ? prev : [...prev, { role: 'user', content: userText }];
      return [...withUser, { role: 'assistant', content: '', ...(isAuto ? { isOverview: true } : {}) }];
    });
    setApiMessages(newApiMessages);
    setIsStreaming(true);
    setActiveToolCall(null);

    try {
      const res = await fetch(`/api/clients/${clientId}/ai-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newApiMessages }),
      });

      if (!res.ok) throw new Error(`${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'text') {
              assistantText += event.text;
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: assistantText };
                return next;
              });
            } else if (event.type === 'tool_call') {
              setActiveToolCall(event.tool);
            } else if (event.type === 'action') {
              const id = String(Date.now() + Math.random());
              setActionEvents(prev => [...prev, { id, message: event.data?.message ?? 'Done' }]);
              onActionComplete?.(event.tool);
            } else if (event.type === 'done') {
              setActiveToolCall(null);
              setApiMessages(prev => [...prev, { role: 'assistant', content: assistantText }]);
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant' && last.content === '') {
          next[next.length - 1] = { role: 'assistant', content: 'Something went wrong. Please try again.' };
        }
        return next;
      });
    } finally {
      setIsStreaming(false);
      setActiveToolCall(null);
    }
  }, [clientId, apiMessages, isStreaming, onActionComplete]);

  // Auto-load overview on mount
  useEffect(() => {
    if (hasAutoLoaded.current || !clientId || !clientName) return;
    hasAutoLoaded.current = true;
    setOverviewStarted(true);
    sendMessage(
      `Give me a concise overview of ${clientName}: campaign context, health status, spend pacing, and any urgent action points or concerns. Lead with what needs attention.`,
      true
    );
  }, [clientId, clientName]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit() {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    setIsOpen(true);
    sendMessage(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
    if (e.key === 'Escape') setIsOpen(false);
  }

  function handleRefresh() {
    if (isStreaming) return;
    setMessages([]);
    setApiMessages([]);
    setOverviewStarted(false);
    hasAutoLoaded.current = false;
    setTimeout(() => {
      hasAutoLoaded.current = true;
      setOverviewStarted(true);
      sendMessage(
        `Give me a concise overview of ${clientName}: campaign context, health status, spend pacing, and any urgent action points or concerns. Lead with what needs attention.`,
        true
      );
    }, 30);
  }

  const overviewMsg = messages.find(m => m.isOverview);
  const chatMessages = messages.filter(m => !m.isOverview);
  const hasContent = messages.length > 0;

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>

      {/* Action chips (float above input) */}
      {actionEvents.length > 0 && (
        <div style={{ position: 'absolute', bottom: '110%', right: 0, display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end', zIndex: 200 }}>
          {actionEvents.map(ev => (
            <div key={ev.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#ECFDF5', border: '1px solid #A7F3D0',
              borderRadius: 8, padding: '5px 10px',
              fontSize: 12, color: '#065F46', fontWeight: 500,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              whiteSpace: 'nowrap',
              fontFamily: "'Inter', system-ui, sans-serif",
            }}>
              <CheckCircle2 size={13} strokeWidth={2.5} />
              {ev.message}
            </div>
          ))}
        </div>
      )}

      {/* Input bar — pill style */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: '#FFFFFF',
        border: `1.5px solid ${isOpen ? '#C8C3BB' : '#E8E4DC'}`,
        borderRadius: isOpen ? '24px 24px 0 0' : 24,
        padding: '8px 10px 8px 16px',
        transition: 'border-color 0.15s, border-radius 0.15s, box-shadow 0.15s',
        boxShadow: isOpen ? 'none' : '0 2px 8px rgba(0,0,0,0.07)',
        width: 480,
        minWidth: 0,
      }}>
        {isStreaming && !overviewMsg?.content ? (
          <Loader2 size={14} style={{ color: '#9C8F84', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
        ) : (
          <Sparkles size={14} style={{ color: '#9C8F84', flexShrink: 0 }} />
        )}
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (hasContent) setIsOpen(true); }}
          onClick={() => { if (hasContent) setIsOpen(true); }}
          placeholder={isStreaming && !input ? (activeToolCall ? TOOL_LABELS[activeToolCall] ?? 'Thinking…' : 'Generating overview…') : `Ask ${clientName}…`}
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 14, color: '#1C1917', minWidth: 0,
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        />
        {/* Always arrow-up (send/open), only X when dropdown is open */}
        {isOpen ? (
          <button
            onClick={() => setIsOpen(false)}
            style={{
              width: 30, height: 30, flexShrink: 0,
              background: '#F5F3F0', border: '1px solid #E8E4DC', borderRadius: '50%',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#7C6F64',
            }}
          >
            <X size={13} />
          </button>
        ) : (
          <button
            onClick={() => { if (input.trim()) { handleSubmit(); } else { setIsOpen(true); } }}
            style={{
              width: 30, height: 30, flexShrink: 0,
              background: input.trim() ? '#1C1917' : '#F5F3F0',
              border: input.trim() ? 'none' : '1px solid #E8E4DC',
              borderRadius: '50%',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: input.trim() ? '0 1px 4px rgba(0,0,0,0.18)' : 'none',
              transition: 'background 0.15s',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={input.trim() ? '#FAFAF8' : '#7C6F64'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown panel */}
      {isOpen && (
        <div style={{
          position: 'absolute', top: 'calc(100% - 2px)', right: 0, zIndex: 100,
          width: 480,
          maxHeight: 560,
          background: '#FFFFFF',
          border: '1.5px solid #C8C3BB',
          borderTop: 'none',
          borderRadius: '0 0 16px 16px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.14)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>

          {/* Dropdown header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px 8px',
            borderBottom: '1px solid #F0EDE8',
            background: '#FAFAF8',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#5C5450', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Inter', system-ui, sans-serif" }}>
                AI Agent
              </span>
              {isStreaming && (
                <span style={{ fontSize: 11, color: '#9C8F84', fontFamily: "'Inter', system-ui, sans-serif" }}>
                  · {activeToolCall ? (TOOL_LABELS[activeToolCall] ?? 'Thinking…') : 'Generating…'}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={handleRefresh}
                disabled={isStreaming}
                title="Regenerate overview"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'none', border: '1px solid #E8E4DC', borderRadius: 6,
                  padding: '3px 8px', cursor: isStreaming ? 'not-allowed' : 'pointer',
                  fontSize: 11, color: '#7C6F64', opacity: isStreaming ? 0.5 : 1,
                  fontFamily: "'Inter', system-ui, sans-serif",
                }}
              >
                <RefreshCw size={10} />
                Refresh
              </button>
              <button
                onClick={() => setIsOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9C8F84', padding: 2, display: 'flex' }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Chat messages — newest first */}
            {[...chatMessages].reverse().map((msg, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {msg.role === 'user' ? (
                  <div style={{
                    maxWidth: '80%', background: '#1C1917', color: '#FAFAF8',
                    borderRadius: '12px 12px 4px 12px', padding: '8px 12px',
                    fontSize: 13, lineHeight: 1.5,
                    fontFamily: "'Inter', system-ui, sans-serif",
                  }}>
                    {msg.content}
                  </div>
                ) : (
                  <div style={{
                    maxWidth: '95%', background: '#F5F3F0',
                    border: '1px solid #EDE9E3',
                    borderRadius: '4px 12px 12px 12px', padding: '10px 12px',
                  }}>
                    {msg.content
                      ? <MarkdownText text={msg.content} />
                      : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#9C8F84' }}>
                          <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                          <span style={{ fontSize: 12, fontFamily: "'Inter', system-ui, sans-serif" }}>
                            {activeToolCall ? (TOOL_LABELS[activeToolCall] ?? 'Thinking…') : 'Thinking…'}
                          </span>
                        </div>
                      )
                    }
                  </div>
                )}
              </div>
            ))}

            {/* Overview block — oldest, sits at bottom */}
            {overviewMsg !== undefined ? (
              <div style={{ background: '#FAFAF8', border: '1px solid #EDE9E3', borderRadius: 10, padding: '12px 14px' }}>
                {overviewMsg.content
                  ? <MarkdownText text={overviewMsg.content} />
                  : <OverviewSkeleton />
                }
              </div>
            ) : overviewStarted ? (
              <div style={{ background: '#FAFAF8', border: '1px solid #EDE9E3', borderRadius: 10, padding: '12px 14px' }}>
                <OverviewSkeleton />
              </div>
            ) : null}
          </div>

          {/* Suggestion pills (when idle + overview loaded) */}
          {!isStreaming && overviewMsg?.content && chatMessages.length === 0 && (
            <div style={{ padding: '6px 14px 10px', display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid #F0EDE8', background: '#FAFAF8', flexShrink: 0 }}>
              {['Complete overdue tasks', 'Update actual spend', 'Check channel pacing'].map(s => (
                <button
                  key={s}
                  onClick={() => { setIsOpen(true); sendMessage(s); }}
                  style={{
                    background: '#F0EDE8', border: '1px solid #E8E4DC',
                    borderRadius: 6, padding: '4px 10px',
                    fontSize: 11, color: '#5C5450', cursor: 'pointer',
                    fontFamily: "'Inter', system-ui, sans-serif",
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function OverviewSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Loader2 size={12} style={{ color: '#9C8F84', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: '#9C8F84', fontFamily: "'Inter', system-ui, sans-serif" }}>Generating overview…</span>
      </div>
      {[75, 55, 68, 42].map((w, i) => (
        <div key={i} style={{
          height: 9, width: `${w}%`, borderRadius: 4,
          background: 'linear-gradient(90deg, #EDE9E3 25%, #F5F3F0 50%, #EDE9E3 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
        }} />
      ))}
    </div>
  );
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.65, color: '#1C1917', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {lines.map((line, i) => {
        if (line.startsWith('### ')) return <div key={i} style={{ fontWeight: 700, fontSize: 11, color: '#5C5450', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: i > 0 ? 10 : 0, marginBottom: 2 }}>{line.slice(4)}</div>;
        if (line.startsWith('## ')) return <div key={i} style={{ fontWeight: 700, fontSize: 13, color: '#1C1917', marginTop: i > 0 ? 10 : 0, marginBottom: 3 }}>{line.slice(3)}</div>;
        if (line.startsWith('# ')) return <div key={i} style={{ fontWeight: 700, fontSize: 14, color: '#1C1917', marginTop: i > 0 ? 12 : 0, marginBottom: 4 }}>{line.slice(2)}</div>;
        if (line.startsWith('- ') || line.startsWith('• ')) {
          return (
            <div key={i} style={{ display: 'flex', gap: 7, marginTop: 3, paddingLeft: 2 }}>
              <span style={{ color: '#9C8F84', flexShrink: 0, marginTop: 1 }}>•</span>
              <span>{renderInline(line.slice(2))}</span>
            </div>
          );
        }
        if (line === '') return <div key={i} style={{ height: 5 }} />;
        return <div key={i} style={{ marginTop: 1 }}>{renderInline(line)}</div>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} style={{ fontWeight: 600 }}>{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  );
}
