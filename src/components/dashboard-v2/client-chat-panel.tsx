'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Sparkles, Send, Bot, ReceiptText, BarChart2, Loader2,
  CalendarRange, ListChecks, ClipboardList, ExternalLink, ChevronDown, Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UserAgent, AgentAuditStep, AgentOutputLink } from '@/types/database';
import { MarkdownText, TOOL_LABELS } from './ai-shared';

const AGENT_ICON_COLOR = '#7B1F2C';
const font: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };

const AGENT_ICONS: Record<string, LucideIcon> = {
  ReceiptText, BarChart2, CalendarRange, ListChecks, ClipboardList, Bot,
};

function AgentIcon({ name, size = 14 }: { name?: string | null; size?: number }) {
  const Icon = (name && AGENT_ICONS[name]) ? AGENT_ICONS[name] : Bot;
  return <Icon size={size} style={{ color: AGENT_ICON_COLOR, flexShrink: 0 }} />;
}

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
  const [agents, setAgents] = useState<UserAgent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<UserAgent | null>(null);
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null);
  const [actionEvents, setActionEvents] = useState<ActionEvent[]>([]);
  const [auditSteps, setAuditSteps] = useState<AgentAuditStep[]>([]);
  const [outputLinks, setOutputLinks] = useState<AgentOutputLink[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messageThreadRef = useRef<HTMLDivElement>(null);
  const autoOverviewClientIdRef = useRef<string | null>(null);
  const agentMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAgentMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (agentMenuRef.current && !agentMenuRef.current.contains(e.target as Node)) setShowAgentMenu(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAgentMenu]);

  useEffect(() => {
    fetch('/api/agents')
      .then(res => res.ok ? res.json() : { agents: [] })
      .then(data => setAgents((data.agents ?? []).filter((a: UserAgent) => a.is_enabled !== false)))
      .catch(() => {});
  }, []);

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

  function selectAgent(agent: UserAgent | null) {
    setSelectedAgent(agent);
    setMessages([]);
    setApiMessages([]);
    setAuditSteps([]);
    setOutputLinks([]);
  }

  const sendMessage = useCallback(async (userText: string, opts?: { silent?: boolean }) => {
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
        : { messages: newApiMessages };

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
              assistantText = event.message ?? 'Something went wrong. Please try again.';
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

  // Auto-generate an overview as soon as the panel loads for a client, so the
  // card isn't just an empty prompt box on first view. Runs once per client
  // (keyed off clientId, not just mount) and only against the default assistant.
  useEffect(() => {
    if (!clientId || autoOverviewClientIdRef.current === clientId) return;
    autoOverviewClientIdRef.current = clientId;
    sendMessage(
      `Give me an overview of ${clientName || 'this client'} — current status, health, spend pacing, and anything that needs attention right now.`,
      { silent: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function handleSubmit() {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    sendMessage(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }

  const streamingAssistantEmpty = isStreaming && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content === '';

  return (
    <div
      className="bg-white rounded-xl border border-gray-200"
      style={{
        position: 'relative', ...font,
        ...(height != null ? { height, display: 'flex', flexDirection: 'column', overflow: 'hidden' } : {}),
      }}
    >
      {/* Action chips */}
      {actionEvents.length > 0 && (
        <div style={{ position: 'absolute', top: -8, right: 12, transform: 'translateY(-100%)', display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end', zIndex: 50 }}>
          {actionEvents.map(ev => (
            <div key={ev.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#ECFDF5', border: '1px solid #A7F3D0',
              borderRadius: 8, padding: '5px 10px',
              fontSize: 12, color: '#065F46', fontWeight: 500,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              whiteSpace: 'nowrap',
              ...font,
            }}>
              <Sparkles size={12} />
              {ev.message}
            </div>
          ))}
        </div>
      )}

      {/* Header + agent picker */}
      <div style={{ padding: '10px 14px', borderBottom: '0.5px solid #F0EDE8', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
        <Sparkles size={13} style={{ color: '#8A8578', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#5C5450', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
          Ask AI
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>
          <button
            onClick={() => selectAgent(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 99,
              border: `0.5px solid ${selectedAgent === null ? '#1C1917' : '#D5D0C5'}`,
              background: selectedAgent === null ? '#1C1917' : '#FDFCF8',
              color: selectedAgent === null ? '#FDFCF8' : '#5C564F',
              fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
            }}
          >
            <Bot size={12} />
            Default Assistant
          </button>

          {/* Use an Agent — dropdown housing all configured agents */}
          <div ref={agentMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowAgentMenu(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '3px 10px', borderRadius: 99,
                border: `0.5px solid ${selectedAgent ? '#1C1917' : '#D5D0C5'}`,
                background: selectedAgent ? '#1C1917' : '#FDFCF8',
                color: selectedAgent ? '#FDFCF8' : '#5C564F',
                fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
              }}
            >
              {selectedAgent ? <AgentIcon name={selectedAgent.icon} size={12} /> : <Users size={12} />}
              {selectedAgent ? selectedAgent.name : 'Use an Agent'}
              <ChevronDown size={12} style={{ transform: showAgentMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>

            {showAgentMenu && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4,
                background: '#FFFFFF', border: '0.5px solid #E8E4DC', borderRadius: 10,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 190, zIndex: 20,
                padding: 4, display: 'flex', flexDirection: 'column', gap: 2,
                maxHeight: 260, overflowY: 'auto',
              }}>
                {agents.length === 0 ? (
                  <div style={{ padding: '8px 10px', fontSize: 12, color: '#A0998F' }}>
                    No agents configured yet.
                  </div>
                ) : agents.map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => { selectAgent(agent); setShowAgentMenu(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '6px 10px', borderRadius: 6, border: 'none',
                      background: selectedAgent?.id === agent.id ? '#F5F3F0' : 'transparent',
                      color: '#3C3732', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
                      textAlign: 'left', width: '100%',
                    }}
                    title={agent.description ?? undefined}
                  >
                    <AgentIcon name={agent.icon} size={13} />
                    {agent.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable message thread — mirrors AgencyChat's active-chat scroll area */}
      <div ref={messageThreadRef} style={{ ...(height != null ? { flex: 1, minHeight: 0 } : { height: 420 }), overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ fontSize: 12.5, color: '#B5B0A5' }}>
            {selectedAgent
              ? `Ask "${selectedAgent.name}" a question about ${clientName || 'this client'}.`
              : `Ask a question about ${clientName || 'this client'}, or pick a saved agent above to run it against this client.`}
          </div>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '92%',
              padding: msg.role === 'user' ? '7px 12px' : '9px 12px',
              borderRadius: 14,
              background: msg.role === 'user' ? '#1C1917' : '#F0EDE8',
              color: msg.role === 'user' ? '#FDFCF8' : '#3C3732',
            }}>
              {msg.role === 'user' ? (
                <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>{msg.content}</span>
              ) : msg.content ? (
                <MarkdownText text={msg.content} />
              ) : (
                <BouncingDots />
              )}
            </div>
          </div>
        ))}

        {streamingAssistantEmpty && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 2px' }}>
              <span style={{ fontSize: 11, color: '#A0998F' }}>
                {activeToolCall ? (TOOL_LABELS[activeToolCall] ?? 'Working on it…') : 'Thinking…'}
              </span>
              <BouncingDots color="#CC785C" />
            </div>
          </div>
        )}

        {selectedAgent && auditSteps.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#8A8578' }}>
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
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#4A6580' }}
              >
                <ExternalLink size={11} />
                {link.label}
              </a>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input — pill bar */}
      <div style={{ padding: '10px 14px', borderTop: '0.5px solid #F0EDE8', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#FFFFFF',
          border: '1.5px solid #E8E4DC',
          borderRadius: 24,
          padding: '8px 10px 8px 16px',
        }}>
          {isStreaming ? (
            <Loader2 size={14} style={{ color: '#9C8F84', animation: 'clientChatSpin 1s linear infinite', flexShrink: 0 }} />
          ) : (
            <Sparkles size={14} style={{ color: '#9C8F84', flexShrink: 0 }} />
          )}
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isStreaming
                ? (activeToolCall ? TOOL_LABELS[activeToolCall] ?? 'Thinking…' : 'Thinking…')
                : selectedAgent ? `Ask ${selectedAgent.name}…` : `Ask about ${clientName || 'this client'}…`
            }
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 14, color: '#1C1917', minWidth: 0, ...font,
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isStreaming}
            style={{
              width: 30, height: 30, flexShrink: 0,
              background: input.trim() && !isStreaming ? '#1C1917' : '#F5F3F0',
              border: input.trim() && !isStreaming ? 'none' : '1px solid #E8E4DC',
              borderRadius: '50%',
              cursor: input.trim() && !isStreaming ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Send size={13} style={{ color: input.trim() && !isStreaming ? '#FAFAF8' : '#7C6F64' }} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes clientChatBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-3px); opacity: 1; }
        }
        @keyframes clientChatSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
