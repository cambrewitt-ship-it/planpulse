'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Send, RefreshCw, Sparkles, Loader2, CheckCircle2, Zap } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isOverview?: boolean;
}

interface ActionEvent {
  id: string;
  tool: string;
  message: string;
}

const TOOL_LABELS: Record<string, string> = {
  get_client_intelligence: 'Reading client intel…',
  get_channel_performance: 'Checking channel performance…',
  get_action_points: 'Loading action points…',
  complete_action_point: 'Completing action point…',
  update_media_plan_budget: 'Updating media plan budget…',
  update_manual_spend: 'Updating actual spend…',
  toggle_ooh_checklist: 'Updating OOH checklist…',
};

const ACTION_LABELS: Record<string, string> = {
  complete_action_point: 'Action point completed',
  update_media_plan_budget: 'Budget updated',
  update_manual_spend: 'Actual spend updated',
  toggle_ooh_checklist: 'Checklist updated',
};

interface ClientAIAgentProps {
  clientId: string;
  clientName: string;
  onActionComplete?: (tool: string) => void;
}

export default function ClientAIAgent({ clientId, clientName, onActionComplete }: ClientAIAgentProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [apiMessages, setApiMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null);
  const [actionEvents, setActionEvents] = useState<ActionEvent[]>([]);
  const [overviewLoaded, setOverviewLoaded] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hasAutoLoaded = useRef(false);

  // Auto-scroll to top on new content (newest messages at top)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [messages, activeToolCall]);

  // Auto-dismiss action event chips after 4s
  useEffect(() => {
    if (actionEvents.length === 0) return;
    const timer = setTimeout(() => {
      setActionEvents(prev => prev.slice(1));
    }, 4000);
    return () => clearTimeout(timer);
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

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/clients/${clientId}/ai-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newApiMessages }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error(`Request failed: ${res.status}`);

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
                if (last?.role === 'assistant') {
                  next[next.length - 1] = { ...last, content: assistantText };
                }
                return next;
              });
            } else if (event.type === 'tool_call') {
              setActiveToolCall(event.tool);
            } else if (event.type === 'action') {
              const eventId = String(Date.now() + Math.random());
              setActionEvents(prev => [
                ...prev,
                {
                  id: eventId,
                  tool: event.tool,
                  message: event.data?.message ?? ACTION_LABELS[event.tool] ?? 'Action completed',
                },
              ]);
              onActionComplete?.(event.tool);
            } else if (event.type === 'done') {
              setActiveToolCall(null);
              setApiMessages(prev => [...prev, { role: 'assistant', content: assistantText }]);
              if (isAuto) setOverviewLoaded(true);
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant' && last.content === '') {
            next[next.length - 1] = { role: 'assistant', content: 'Something went wrong. Please try again.' };
          }
          return next;
        });
      }
    } finally {
      setIsStreaming(false);
      setActiveToolCall(null);
    }
  }, [clientId, apiMessages, isStreaming, onActionComplete]);

  // Auto-load overview on mount
  useEffect(() => {
    if (hasAutoLoaded.current) return;
    hasAutoLoaded.current = true;
    sendMessage(
      `Give me a concise overview of ${clientName}: campaign context, health status, spend pacing, and any urgent action points or concerns. Start with what needs attention.`,
      true
    );
  }, [clientName]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleRegenerateOverview() {
    if (isStreaming) return;
    setMessages([]);
    setApiMessages([]);
    setOverviewLoaded(false);
    hasAutoLoaded.current = false;
    setTimeout(() => {
      hasAutoLoaded.current = true;
      sendMessage(
        `Give me a concise overview of ${clientName}: campaign context, health status, spend pacing, and any urgent action points or concerns. Start with what needs attention.`,
        true
      );
    }, 50);
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    sendMessage(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const conversationMessages = messages.filter(m => !m.isOverview);
  const overviewMessage = messages.find(m => m.isOverview);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>

      {/* Action event chips */}
      {actionEvents.length > 0 && (
        <div style={{
          position: 'absolute', top: 8, right: 8, zIndex: 10,
          display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end',
        }}>
          {actionEvents.map(ev => (
            <div key={ev.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#ECFDF5', border: '1px solid #A7F3D0',
              borderRadius: 8, padding: '5px 10px',
              fontSize: 12, color: '#065F46', fontWeight: 500,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              animation: 'fadeInUp 0.2s ease',
              fontFamily: "'Inter', system-ui, sans-serif",
            }}>
              <CheckCircle2 size={13} strokeWidth={2.5} />
              {ev.message}
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px 8px',
        borderBottom: '1px solid #F0EDE8',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Sparkles size={14} style={{ color: '#7C6F64' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#1C1917', letterSpacing: '0.02em', fontFamily: "'Inter', system-ui, sans-serif", textTransform: 'uppercase' }}>
            AI Agent
          </span>
          {isStreaming && (
            <span style={{ fontSize: 11, color: '#9C8F84', fontFamily: "'Inter', system-ui, sans-serif" }}>
              {activeToolCall ? (TOOL_LABELS[activeToolCall] ?? 'Thinking…') : 'Generating…'}
            </span>
          )}
        </div>
        <button
          onClick={handleRegenerateOverview}
          disabled={isStreaming}
          title="Regenerate overview"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'none', border: '1px solid #E8E4DC', borderRadius: 6,
            padding: '4px 9px', cursor: isStreaming ? 'not-allowed' : 'pointer',
            fontSize: 11, color: '#7C6F64', fontWeight: 500,
            opacity: isStreaming ? 0.5 : 1,
            transition: 'all 0.15s',
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          <RefreshCw size={11} style={{ ...(isStreaming && overviewMessage?.content === '' ? { animation: 'spin 1s linear infinite' } : {}) }} />
          Refresh
        </button>
      </div>

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        {/* Conversation messages — newest first */}
        {[...conversationMessages].reverse().map((msg, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            {msg.role === 'user' ? (
              <div style={{
                maxWidth: '80%',
                background: '#1C1917',
                color: '#FAFAF8',
                borderRadius: '12px 12px 4px 12px',
                padding: '8px 12px',
                fontSize: 13,
                lineHeight: 1.5,
                fontFamily: "'Inter', system-ui, sans-serif",
              }}>
                {msg.content}
              </div>
            ) : (
              <div style={{
                maxWidth: '95%',
                background: '#F5F3F0',
                borderRadius: '4px 12px 12px 12px',
                padding: '10px 12px',
                border: '1px solid #EDE9E3',
              }}>
                {msg.content ? (
                  <MarkdownText text={msg.content} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#9C8F84' }}>
                    <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: 12, fontFamily: "'Inter', system-ui, sans-serif" }}>
                      {activeToolCall ? (TOOL_LABELS[activeToolCall] ?? 'Thinking…') : 'Thinking…'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Overview section — oldest, sits at bottom */}
        {overviewMessage !== undefined ? (
          <div style={{
            background: '#FAFAF8',
            border: '1px solid #EDE9E3',
            borderRadius: 10,
            padding: '12px 14px',
          }}>
            {overviewMessage.content ? (
              <MarkdownText text={overviewMessage.content} />
            ) : (
              <OverviewSkeleton />
            )}
          </div>
        ) : (
          <OverviewSkeleton />
        )}
      </div>

      {/* Divider + Suggestions (only when not streaming and overview loaded) */}
      {overviewLoaded && !isStreaming && conversationMessages.length === 0 && (
        <div style={{ padding: '0 14px 8px', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              'Complete all overdue tasks',
              'Update actual spend',
              'Check channel pacing',
            ].map(s => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                style={{
                  background: '#F5F3F0', border: '1px solid #E8E4DC',
                  borderRadius: 6, padding: '4px 10px',
                  fontSize: 11, color: '#5C5450', cursor: 'pointer',
                  fontFamily: "'Inter', system-ui, sans-serif",
                  transition: 'background 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div style={{
        borderTop: '1px solid #F0EDE8',
        padding: '10px 12px',
        flexShrink: 0,
        background: '#FCFBF9',
      }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask about ${clientName}…`}
            rows={1}
            disabled={isStreaming}
            style={{
              flex: 1, resize: 'none', border: '1px solid #E8E4DC',
              borderRadius: 8, padding: '8px 10px',
              fontSize: 12, color: '#1C1917',
              background: isStreaming ? '#F5F3F0' : '#FFFFFF',
              outline: 'none', fontFamily: "'Inter', system-ui, sans-serif",
              lineHeight: 1.5, maxHeight: 80, overflowY: 'auto',
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            style={{
              width: 32, height: 32, flexShrink: 0,
              background: input.trim() && !isStreaming ? '#1C1917' : '#E8E4DC',
              border: 'none', borderRadius: 8, cursor: input.trim() && !isStreaming ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
            }}
          >
            {isStreaming ? (
              <Loader2 size={14} color="#9C8F84" style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Send size={13} color={input.trim() ? '#FAFAF8' : '#9C8F84'} />
            )}
          </button>
        </form>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function OverviewSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Loader2 size={13} style={{ color: '#9C8F84', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: '#9C8F84', fontFamily: "'Inter', system-ui, sans-serif" }}>
          Generating overview…
        </span>
      </div>
      {[80, 60, 72, 45].map((w, i) => (
        <div key={i} style={{
          height: 10, width: `${w}%`, borderRadius: 4,
          background: 'linear-gradient(90deg, #EDE9E3 25%, #F5F3F0 50%, #EDE9E3 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
        }} />
      ))}
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
    </div>
  );
}

function MarkdownText({ text }: { text: string }) {
  // Light markdown rendering: bold, bullets, headers
  const lines = text.split('\n');

  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.65, color: '#1C1917', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {lines.map((line, i) => {
        if (line.startsWith('### ')) {
          return <div key={i} style={{ fontWeight: 700, fontSize: 12, color: '#5C5450', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: i > 0 ? 10 : 0, marginBottom: 3 }}>{line.slice(4)}</div>;
        }
        if (line.startsWith('## ')) {
          return <div key={i} style={{ fontWeight: 700, fontSize: 13, color: '#1C1917', marginTop: i > 0 ? 12 : 0, marginBottom: 4 }}>{line.slice(3)}</div>;
        }
        if (line.startsWith('# ')) {
          return <div key={i} style={{ fontWeight: 700, fontSize: 14, color: '#1C1917', marginTop: i > 0 ? 14 : 0, marginBottom: 5 }}>{line.slice(2)}</div>;
        }
        if (line.startsWith('- ') || line.startsWith('• ')) {
          return (
            <div key={i} style={{ display: 'flex', gap: 7, marginTop: 2, paddingLeft: 2 }}>
              <span style={{ color: '#9C8F84', flexShrink: 0, marginTop: 1 }}>•</span>
              <span>{renderInline(line.slice(2))}</span>
            </div>
          );
        }
        if (line === '') {
          return <div key={i} style={{ height: 6 }} />;
        }
        return <div key={i} style={{ marginTop: 1 }}>{renderInline(line)}</div>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  // Handle **bold**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}
