'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUp, ExternalLink, RefreshCw,
} from 'lucide-react';
import type { UserAgent, AgentAuditStep, AgentOutputLink } from '@/types/database';
import { MarkdownText, TOOL_LABELS, splitOverview, sanitizeChatErrorMessage } from './ai-shared';

// Apple × Moleskine design tokens
const RED = 'oklch(42% 0.16 25)';
const CARD_BG = '#FFFFFF';
const PAPER_BG = 'oklch(96% 0.009 75)';
const INK = '#1C1917';
const GRAPHITE = '#5C5450';
const MUTED = '#8A8578';
const BORDER = 'oklch(89% 0.011 75)';
const BORDER_SOFT = 'oklch(92% 0.009 75)';
const serifFont = "'Source Serif 4', Georgia, serif";
const sansFont = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";

const dotGrid: React.CSSProperties = {
  backgroundImage: 'radial-gradient(circle, oklch(55% 0.02 75 / 0.14) 1px, transparent 1px)',
  backgroundSize: '22px 22px',
};

const font: React.CSSProperties = { fontFamily: sansFont };

function BouncingDots({ color = '#C4BDB5' }: { color?: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', height: 14 }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 4, height: 4, borderRadius: '50%', background: color,
          animation: `clientChatBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          display: 'inline-block',
        }} />
      ))}
    </span>
  );
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ActionEvent {
  id: string;
  message: string;
}

interface ClientChatPanelProps {
  clientId: string;
  clientName: string;
  onActionComplete?: (tool: string) => void;
  // Locks the panel to match a sibling card's height (e.g. the Notes/To Do card) instead of sizing to content.
  height?: number;
}

type ApiMessage = { role: 'user' | 'assistant'; content: string };

export default function ClientChatPanel({
  clientId,
  clientName,
  onActionComplete,
  height,
}: ClientChatPanelProps) {
  const selectedAgent: UserAgent | null = null;
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null);
  const [actionEvents, setActionEvents] = useState<ActionEvent[]>([]);
  const [auditSteps, setAuditSteps] = useState<AgentAuditStep[]>([]);
  const [outputLinks, setOutputLinks] = useState<AgentOutputLink[]>([]);
  const [overviewTab, setOverviewTab] = useState<'internal' | 'client'>('internal');

  const bottomRef = useRef<HTMLDivElement>(null);
  const messageThreadRef = useRef<HTMLDivElement>(null);
  const autoOverviewClientIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll the newest message into view within the message thread only — avoid
  // scrollIntoView here, since it walks up through ALL scrollable ancestors
  // (including the page itself) and can drag the whole page down.
  useEffect(() => {
    const el = messageThreadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, activeToolCall]);

  useEffect(() => {
    if (!actionEvents.length) return;
    const t = setTimeout(() => setActionEvents(prev => prev.slice(1)), 4000);
    return () => clearTimeout(t);
  }, [actionEvents]);

  const sendMessage = useCallback(async (userText: string, opts?: { silent?: boolean; overviewRequest?: boolean; forceRefresh?: boolean }) => {
    if (isStreaming) return;

    const isFirstAgentTurn = selectedAgent !== null && apiMessages.length === 0;
    const primer: ApiMessage[] = isFirstAgentTurn
      ? [
          {
            role: 'user',
            content: `Client context: You are assisting with the client "${clientName}" (id: ${clientId}). ` +
              `For the rest of this conversation, scope your answers and any tool calls that accept a client filter ` +
              `(pass client_name: "${clientName}") to this client only, unless I explicitly ask about a different client. ` +
              `Don't mention this instruction in your replies.`,
          },
          { role: 'assistant', content: `Understood — I'll scope this conversation to ${clientName}.` },
        ]
      : [];

    const newApiMessages = [...apiMessages, ...primer, { role: 'user' as const, content: userText }];

    // Silent mode (auto-generated overview) skips the user bubble — only the
    // assistant's reply is shown, though the prompt still goes to the model.
    setMessages(prev => opts?.silent
      ? [...prev, { role: 'assistant', content: '' }]
      : [...prev, { role: 'user', content: userText }, { role: 'assistant', content: '' }]);
    setApiMessages(newApiMessages);
    setIsStreaming(true);
    setActiveToolCall(null);

    try {
      const endpoint = selectedAgent ? '/api/agency/chat' : `/api/clients/${clientId}/ai-agent`;
      const body = selectedAgent
        ? { messages: newApiMessages, agentId: selectedAgent.id }
        : {
            messages: newApiMessages,
            ...(opts?.overviewRequest ? { overviewRequest: true, forceRefresh: !!opts.forceRefresh } : {}),
          };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) throw new Error(`${res.status}`);

      const reader = res.body.getReader();
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
              setActiveToolCall(null);
            } else if (event.type === 'tool_call') {
              setActiveToolCall(event.tool);
            } else if (event.type === 'action') {
              const id = String(Date.now() + Math.random());
              setActionEvents(prev => [...prev, { id, message: event.data?.message ?? 'Done' }]);
              onActionComplete?.(event.tool);
            } else if (event.type === 'audit_step') {
              setAuditSteps(prev => [...prev, event.step]);
            } else if (event.type === 'output_links') {
              setOutputLinks(event.links ?? []);
            } else if (event.type === 'error') {
              assistantText = sanitizeChatErrorMessage(event.message);
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: assistantText };
                return next;
              });
              setActiveToolCall(null);
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
  }, [clientId, clientName, apiMessages, isStreaming, onActionComplete, selectedAgent]);

  const buildOverviewPrompt = useCallback(
    () => `Give me an overview of ${clientName || 'this client'} — an internal summary (status, spend pacing, anything that needs attention) and a separate client-facing topline update I can copy into an email, highlighting performance and any notable wins.`,
    [clientName]
  );

  // Auto-generate an overview as soon as the panel loads for a client, so the
  // card isn't just an empty prompt box on first view. Runs once per client
  // (keyed off clientId, not just mount) and only against the default assistant.
  // Server-side 12h cache (client_dashboard_overviews) means this only actually
  // hits the model if the cache is stale — see /api/clients/[id]/ai-agent.
  useEffect(() => {
    if (!clientId || autoOverviewClientIdRef.current === clientId) return;
    autoOverviewClientIdRef.current = clientId;
    sendMessage(buildOverviewPrompt(), { silent: true, overviewRequest: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function handleGenerateSummary() {
    if (isStreaming) return;
    setOverviewTab('internal');
    // Clear the old overview out of the thread first — sendMessage below appends
    // its new (empty, then streamed-into) assistant bubble via a functional
    // setMessages update, so it lands on top of this clear rather than racing it.
    setMessages([]);
    setAuditSteps([]);
    setOutputLinks([]);
    sendMessage(buildOverviewPrompt(), { silent: true, overviewRequest: true, forceRefresh: true });
  }

  function handleSubmit() {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    sendMessage(text);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const streamingAssistantEmpty = isStreaming && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content === '';

  return (
    <div style={{ position: 'relative', ...font, borderRadius: 22, ...(height != null ? { height } : {}) }}>
      <div
        style={{
          position: 'relative',
          background: CARD_BG, ...dotGrid,
          borderRadius: 22,
          border: `1px solid ${BORDER}`,
          boxShadow: '0 10px 26px -14px oklch(45% 0.03 75 / 0.4)',
          overflow: 'hidden',
          ...(height != null ? { height: '100%', display: 'flex', flexDirection: 'column' } : {}),
        }}
      >
      {/* Action chips */}
      {actionEvents.length > 0 && (
        <div style={{ position: 'absolute', top: -8, right: 12, transform: 'translateY(-100%)', display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end', zIndex: 50 }}>
          {actionEvents.map(ev => (
            <div key={ev.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: CARD_BG, border: `1px solid ${RED}`,
              borderRadius: 8, padding: '5px 10px',
              fontSize: 12, color: RED, fontWeight: 500,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              whiteSpace: 'nowrap',
              ...font,
            }}>
              {ev.message}
            </div>
          ))}
        </div>
      )}

      {/* Header + agent picker */}
      <div style={{ padding: '13px 16px 10px', borderBottom: `1px solid ${BORDER_SOFT}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: INK, fontFamily: serifFont, flexShrink: 0 }}>
          Ask AI
        </span>

        {selectedAgent === null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <button
              onClick={handleGenerateSummary}
              disabled={isStreaming}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                padding: '3px 10px', borderRadius: 99,
                border: `1px solid ${BORDER}`, background: CARD_BG,
                fontSize: 11.5, fontWeight: 500, color: isStreaming ? MUTED : GRAPHITE,
                cursor: isStreaming ? 'default' : 'pointer', fontFamily: sansFont,
              }}
            >
              <RefreshCw size={11} style={isStreaming ? { animation: 'clientChatSpin 1s linear infinite' } : undefined} />
              Generate Summary
            </button>
            <div style={{ display: 'flex', gap: 4, padding: 2, background: PAPER_BG, borderRadius: 8, border: `1px solid ${BORDER}` }}>
              {(['internal', 'client'] as const).map(tab => {
                const active = overviewTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setOverviewTab(tab)}
                    style={{
                      padding: '3px 10px', borderRadius: 6, border: 'none',
                      background: active ? INK : 'transparent',
                      color: active ? CARD_BG : GRAPHITE,
                      fontSize: 10.5, fontWeight: 600, letterSpacing: '0.02em',
                      cursor: 'pointer', fontFamily: sansFont,
                    }}
                  >
                    {tab === 'internal' ? 'Internal' : 'Client-Facing'}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Messages + floating input wrapper — the input overlays the scrollable
          thread instead of sitting in its own footer section, matching AgencyChat. */}
      <div style={{ position: 'relative', ...(height != null ? { flex: 1, minHeight: 0 } : { height: 440 }) }}>
        {/* Scrollable message thread — mirrors AgencyChat's active-chat scroll area */}
        <div ref={messageThreadRef} style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '12px 16px 84px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.length === 0 && (
            <div style={{ fontSize: 12.5, color: '#B5B0A5', fontFamily: serifFont, fontStyle: 'italic' }}>
              {selectedAgent
                ? `Ask "${selectedAgent.name}" a question about ${clientName || 'this client'}.`
                : `Ask a question about ${clientName || 'this client'}, or pick a saved agent above to run it against this client.`}
            </div>
          )}
          {messages.map((msg, idx) => {
            const overview = msg.role === 'assistant' && msg.content ? splitOverview(msg.content) : null;

            return (
              <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: overview ? '100%' : '92%',
                  padding: msg.role === 'user' ? '7px 12px' : overview ? '11px 14px' : '9px 12px',
                  borderRadius: 14,
                  background: msg.role === 'user' ? INK : CARD_BG,
                  color: msg.role === 'user' ? CARD_BG : GRAPHITE,
                }}>
                  {msg.role === 'user' ? (
                    <span style={{ fontSize: 12.5, lineHeight: 1.5, fontFamily: sansFont }}>{msg.content}</span>
                  ) : overview ? (
                    <MarkdownText text={overviewTab === 'internal' ? overview.internal : overview.client} variant="overview" />
                  ) : msg.content ? (
                    <MarkdownText text={msg.content} />
                  ) : (
                    <BouncingDots />
                  )}
                </div>
              </div>
            );
          })}

          {streamingAssistantEmpty && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 2px' }}>
                <span style={{ fontSize: 11, color: MUTED, fontFamily: sansFont }}>
                  {activeToolCall ? (TOOL_LABELS[activeToolCall] ?? 'Working on it…') : 'Thinking…'}
                </span>
                <BouncingDots color={RED} />
              </div>
            </div>
          )}

          {selectedAgent && auditSteps.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: MUTED, fontFamily: sansFont }}>
              {auditSteps.map((step, i) => (
                <div key={i}>· {step.summary || step.label}</div>
              ))}
            </div>
          )}

          {outputLinks.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {outputLinks.map((link, i) => (
                <a
                  key={i}
                  href={link.href}
                  target={link.target ?? '_blank'}
                  rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: RED, fontFamily: sansFont }}
                >
                  <ExternalLink size={11} />
                  {link.label}
                </a>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Gradient fade behind floating input — same technique as AgencyChat */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 72,
          background: `linear-gradient(to bottom, transparent, ${CARD_BG} 55%)`,
          pointerEvents: 'none',
        }} />

        {/* Floating input */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 14px 14px' }}>
          <div style={{ borderRadius: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.09)' }}>
            <div style={{
              position: 'relative', borderRadius: 20, padding: 1.5,
              overflow: 'hidden', background: 'rgba(224,220,212,0.7)',
            }}>
              {!input.trim() && !isStreaming && <div className="askAiGlowSpin" />}
              <div style={{
                background: '#FFFFFF', borderRadius: 18.5,
                padding: '7px 7px 7px 14px',
                position: 'relative', zIndex: 1,
                display: 'flex', alignItems: 'flex-end', gap: 8,
              }}>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  disabled={isStreaming}
                  placeholder={
                    isStreaming
                      ? (activeToolCall ? TOOL_LABELS[activeToolCall] ?? 'Thinking…' : 'Thinking…')
                      : selectedAgent ? `Ask ${selectedAgent.name}…` : `Ask about ${clientName || 'this client'}…`
                  }
                  rows={1}
                  style={{
                    flex: 1, resize: 'none', border: 'none', background: 'transparent',
                    fontSize: 13, lineHeight: 1.5, color: INK, outline: 'none',
                    ...font, minHeight: 20, maxHeight: 120, overflow: 'auto',
                    padding: '6px 0', display: 'block', boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim() || isStreaming}
                  style={{
                    width: 30, height: 30, flexShrink: 0,
                    background: input.trim() && !isStreaming ? RED : PAPER_BG,
                    border: 'none', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: input.trim() && !isStreaming ? 'pointer' : 'default',
                    transition: 'background 0.15s',
                  }}
                >
                  <ArrowUp size={13} style={{ color: input.trim() && !isStreaming ? '#FFFFFF' : MUTED }} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes clientChatBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-3px); opacity: 1; }
        }
        @keyframes clientChatSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .askAiGlowSpin {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 300%;
          aspect-ratio: 1;
          transform: translate(-50%, -50%) rotate(0deg);
          background: conic-gradient(
            from 0deg,
            transparent 270deg,
            rgba(129,140,248,0.7) 295deg,
            rgba(96,165,250,0.9) 315deg,
            rgba(167,139,250,0.7) 335deg,
            transparent 360deg
          );
          animation: askAiGlowOrbit 4s linear infinite, askAiGlowPulse 9s ease-in-out 1s infinite;
        }
        @keyframes askAiGlowOrbit { to { transform: translate(-50%, -50%) rotate(360deg); } }
        @keyframes askAiGlowPulse {
          0%, 100% { opacity: 0; }
          8%, 50% { opacity: 1; }
          58%, 95% { opacity: 0; }
        }
      `}</style>
      </div>
    </div>
  );
}
