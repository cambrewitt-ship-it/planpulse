'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUp, Bot, Loader2, Paperclip, Undo2, Lock,
  ChevronDown, Users, FileSpreadsheet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UserAgent, AgentAuditStep, AgentOutputLink } from '@/types/database';
import { MarkdownText, TOOL_LABELS, splitOverview } from './ai-shared';
import type { SandboxPlan } from '@/components/sandbox/types';
import { mergeExtractionIntoPlan, type PlanExtraction } from '@/lib/media-plan/sandbox-sync';
import type { VisionExtraction } from '@/app/api/media-plan-agent/vision-extract/route';
import { ExtractionCard } from '@/components/sandbox/extraction-card';

// Same Apple × Moleskine tokens as client-chat-panel.tsx, for visual consistency
const RED = 'oklch(42% 0.16 25)';
const CARD_BG = 'oklch(98% 0.006 75)';
const PAPER_BG = 'oklch(96% 0.009 75)';
const INK = '#1C1917';
const GRAPHITE = '#5C5450';
const MUTED = '#8A8578';
const BORDER = 'oklch(89% 0.011 75)';
const BORDER_SOFT = 'oklch(92% 0.009 75)';
const GREEN = 'oklch(52% 0.13 150)';
const serifFont = "'Source Serif 4', Georgia, serif";
const sansFont = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";

const dotGrid: React.CSSProperties = {
  backgroundImage: 'radial-gradient(circle, oklch(55% 0.02 75 / 0.14) 1px, transparent 1px)',
  backgroundSize: '22px 22px',
};

const font: React.CSSProperties = { fontFamily: sansFont };

const AGENT_ICONS: Record<string, LucideIcon> = { Bot };
function AgentIcon({ name, size = 14 }: { name?: string | null; size?: number }) {
  const Icon = (name && AGENT_ICONS[name]) ? AGENT_ICONS[name] : Bot;
  return <Icon size={size} style={{ color: RED, flexShrink: 0 }} />;
}

function BouncingDots({ color = '#C4BDB5' }: { color?: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', height: 14 }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 4, height: 4, borderRadius: '50%', background: color,
          animation: `mpChatBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          display: 'inline-block',
        }} />
      ))}
    </span>
  );
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  imagePreview?: string;
  isStreaming?: boolean;
  auditSteps?: AgentAuditStep[];
  outputLinks?: AgentOutputLink[];
  extraction?: VisionExtraction;
  extractionApplied?: boolean;
  isConfirmation?: boolean;
}

type ApiMessage = { role: 'user' | 'assistant'; content: string };

interface MediaPlanChatPanelProps {
  clientId: string;
  clientName: string;
  currentPlan: SandboxPlan | null;
  onPlanApplied: (plan: SandboxPlan) => void;
  /** Fires when a conversational write tool (budget/flight edit) succeeds server-side,
   *  so the parent can reload the plan from the DB and refresh the live grid. */
  onWriteAction?: (tool: string) => void;
  starterMessage?: string | null;
  /** Called once the starter message has been sent, so the parent can clear it —
   *  otherwise it would resend on every future remount of this panel (e.g. the
   *  key-based remount triggered by an agent-applied plan). */
  onStarterConsumed?: () => void;
  /** A screenshot handed off from the Upload Wizard's "AI Agent Planner" entry
   *  point — auto-runs the vision extraction once, as if the user had just
   *  attached it themselves. */
  autoAttachImage?: { base64: string; mimeType: string; preview: string; name: string } | null;
  onAutoAttachConsumed?: () => void;
  /** Fires when the user attaches an Excel file (.xlsx/.xls) instead of a
   *  screenshot — the chat panel doesn't parse spreadsheets itself, it hands
   *  the raw file off to the parent so it can open the Upload Wizard, which
   *  is the sole Excel-parsing entry point in the app. */
  onExcelFileSelected?: (file: File) => void;
  height?: number | string;
}

const EXCEL_EXTENSION_RE = /\.(xlsx?|xls)$/i;
const EXCEL_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);
function isExcelFile(file: File): boolean {
  return EXCEL_EXTENSION_RE.test(file.name) || EXCEL_MIME_TYPES.has(file.type);
}

export default function MediaPlanChatPanel({
  clientId, clientName, currentPlan, onPlanApplied, onWriteAction, starterMessage, onStarterConsumed,
  autoAttachImage, onAutoAttachConsumed, onExcelFileSelected, height,
}: MediaPlanChatPanelProps) {
  const [agents, setAgents] = useState<UserAgent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<UserAgent | null>(null);
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);

  const [pendingExtraction, setPendingExtraction] = useState<VisionExtraction | null>(null);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [preApplySnapshot, setPreApplySnapshot] = useState<SandboxPlan | null>(null);

  const messageThreadRef = useRef<HTMLDivElement>(null);
  const agentMenuRef = useRef<HTMLDivElement>(null);
  const starterSentRef = useRef(false);

  useEffect(() => {
    fetch('/api/agents')
      .then(res => res.ok ? res.json() : { agents: [] })
      .then(data => {
        const list: UserAgent[] = (data.agents ?? []).filter((a: UserAgent) => a.is_enabled !== false);
        setAgents(list);
        const mediaPlanAgent = list.find(a => a.template_slug === 'media_plan_editor')
          ?? list.find(a => /media|editor/i.test(a.name));
        if (mediaPlanAgent) setSelectedAgent(mediaPlanAgent);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!showAgentMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (agentMenuRef.current && !agentMenuRef.current.contains(e.target as Node)) setShowAgentMenu(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAgentMenu]);

  useEffect(() => {
    const el = messageThreadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, activeToolCall]);

  function selectAgent(agent: UserAgent | null) {
    setSelectedAgent(agent);
  }

  const sendMessage = useCallback(async (userText: string) => {
    if (isStreaming) return;

    const isFirstTurn = apiMessages.length === 0;
    const planYear = currentPlan?.weeks?.[0]?.year;
    const existingChannels = Array.from(new Set((currentPlan?.rows ?? []).map(r => r.channel).filter(Boolean)));
    const primer: ApiMessage[] = isFirstTurn
      ? [
          {
            role: 'user',
            content: `Client context: You are assisting with the client "${clientName}" (id: ${clientId}). ` +
              `Scope your answers and any tool calls that accept a client filter (pass client_name: "${clientName}") ` +
              `to this client only, unless told otherwise. ` +
              `The media plan grid's year selector is currently set to ${planYear ?? 'unset'} — use this as the year for ` +
              `any date the user gives without one; never assume today's real-world year. ` +
              (existingChannels.length
                ? `Channels currently in this client's plan: ${existingChannels.join(', ')}.`
                : `This client's plan is currently empty — treat any channel mentioned as a new addition, no need to ask.`) +
              ` Don't mention this instruction in your replies.`,
          },
          { role: 'assistant', content: `Understood — I'll scope this conversation to ${clientName}.` },
        ]
      : [];

    const newApiMessages = [...apiMessages, ...primer, { role: 'user' as const, content: userText }];

    setMessages(prev => [...prev, { role: 'user', content: userText }, { role: 'assistant', content: '', isStreaming: true, auditSteps: [], outputLinks: [] }]);
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
              // A write tool just succeeded server-side (channels + sandbox_plan are
              // already in sync there) — tell the parent to reload so the live grid
              // reflects it immediately.
              onWriteAction?.(event.tool);
            } else if (event.type === 'audit_step') {
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant') next[next.length - 1] = { ...last, auditSteps: [...(last.auditSteps ?? []), event.step] };
                return next;
              });
            } else if (event.type === 'output_links') {
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant') next[next.length - 1] = { ...last, outputLinks: event.links ?? [] };
                return next;
              });
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
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant') next[next.length - 1] = { ...last, isStreaming: false };
                return next;
              });
            }
          } catch { /* skip malformed chunk */ }
        }
      }
    } catch {
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant' && last.content === '') {
          next[next.length - 1] = { role: 'assistant', content: 'Something went wrong. Please try again.', isStreaming: false };
        } else if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, isStreaming: false };
        }
        return next;
      });
    } finally {
      setIsStreaming(false);
      setActiveToolCall(null);
    }
  }, [clientId, clientName, apiMessages, isStreaming, selectedAgent, onWriteAction, currentPlan]);

  const applyExtraction = useCallback((extraction: VisionExtraction, msgIndex: number) => {
    setPreApplySnapshot(currentPlan);
    const merged = mergeExtractionIntoPlan(currentPlan, extraction as PlanExtraction);
    onPlanApplied(merged);
    setConfirmedAt(null);
    setPendingExtraction(null);
    setMessages(prev => {
      const next = [...prev];
      if (next[msgIndex]) next[msgIndex] = { ...next[msgIndex], extractionApplied: true };
      next.push({
        role: 'assistant',
        content: `Applied to the plan — you can see the changes in the grid now.`,
        isConfirmation: true,
      });
      return next;
    });
  }, [currentPlan, onPlanApplied]);

  const dismissExtraction = useCallback((msgIndex: number) => {
    setPendingExtraction(null);
    setMessages(prev => {
      const next = [...prev];
      if (next[msgIndex]) next[msgIndex] = { ...next[msgIndex], extraction: undefined };
      return next;
    });
  }, []);

  const runVisionExtract = useCallback(async (image: { base64: string; mimeType: string; preview: string; name: string }, caption: string) => {
    const year = currentPlan?.weeks?.[0]?.year;
    setMessages(prev => [
      ...prev,
      { role: 'user', content: caption || 'Please read this media plan screenshot.', imagePreview: image.preview },
      { role: 'assistant', content: '', isStreaming: true },
    ]);
    setExtracting(true);

    try {
      const res = await fetch('/api/media-plan-agent/vision-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: image.base64, mimeType: image.mimeType, year }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to analyse screenshot');

      const extraction: VisionExtraction = {
        channels: data.channels, fees: data.fees, customColumns: data.customColumns, notes: data.notes,
      };
      setPendingExtraction(extraction);
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = {
          role: 'assistant',
          content: data.description,
          extraction,
          isStreaming: false,
        };
        return next;
      });
    } catch (err: any) {
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: err.message ?? 'Failed to analyse screenshot.', isStreaming: false };
        return next;
      });
    } finally {
      setExtracting(false);
    }
  }, [currentPlan]);

  const runRevise = useCallback(async (correction: string) => {
    if (!pendingExtraction) return;
    setMessages(prev => [
      ...prev,
      { role: 'user', content: correction },
      { role: 'assistant', content: 'Updating…', isStreaming: true },
    ]);
    setExtracting(true);

    try {
      const res = await fetch('/api/media-plan-agent/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current: pendingExtraction, correction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not apply that correction.');

      const extraction: VisionExtraction = {
        channels: data.channels, fees: data.fees, customColumns: data.customColumns, notes: data.notes,
      };
      setPendingExtraction(extraction);
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: "Here's the updated extraction:", extraction, isStreaming: false };
        return next;
      });
    } catch (err: any) {
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: err.message ?? 'Could not apply that correction.', isStreaming: false };
        return next;
      });
    } finally {
      setExtracting(false);
    }
  }, [pendingExtraction]);

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (isExcelFile(file)) {
      onExcelFileSelected?.(file);
      return;
    }
    if (file.size > 20 * 1024 * 1024) return;
    const caption = input.trim();
    setInput('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      runVisionExtract({ base64: dataUrl.split(',')[1], mimeType: file.type, preview: dataUrl, name: file.name }, caption);
    };
    reader.readAsDataURL(file);
  };

  function handleSubmit() {
    const text = input.trim();
    if (isStreaming || extracting || !text) return;
    setInput('');
    if (pendingExtraction) runRevise(text);
    else sendMessage(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
  }

  function handleConfirmLock() {
    const ts = new Date().toISOString();
    setConfirmedAt(ts);
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `Confirmed and locked at ${new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. The grid is still fully editable — this just marks the plan as reviewed.`,
      isConfirmation: true,
    }]);
  }

  function handleUndo() {
    if (!preApplySnapshot) return;
    onPlanApplied(preApplySnapshot);
    setPreApplySnapshot(null);
    setConfirmedAt(null);
    setMessages(prev => [...prev, { role: 'assistant', content: 'Reverted to the previous version of the plan.', isConfirmation: true }]);
  }

  // Fire the starter prompt once agents have loaded and an agent is selected (or
  // known to be absent), so the primer/agent context is correct on the first turn.
  useEffect(() => {
    if (!starterMessage || starterSentRef.current) return;
    starterSentRef.current = true;
    sendMessage(starterMessage);
    onStarterConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starterMessage]);

  // Screenshot handed off from the Upload Wizard's "AI Agent Planner" entry point —
  // run the vision extraction once, exactly as if the user had just attached it.
  const autoAttachSentRef = useRef(false);
  useEffect(() => {
    if (!autoAttachImage || autoAttachSentRef.current) return;
    autoAttachSentRef.current = true;
    runVisionExtract(autoAttachImage, '');
    onAutoAttachConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAttachImage]);

  const streamingAssistantEmpty = (isStreaming || extracting) && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content === '';
  const appliedAnything = messages.some(m => m.extractionApplied);

  return (
    <div style={{ position: 'relative', ...font, borderRadius: 22, ...(height != null ? { height } : {}) }}>
      <div style={{
        position: 'relative', borderRadius: 22, padding: 1.5, overflow: 'hidden', background: BORDER,
        boxShadow: '0 10px 26px -14px oklch(45% 0.03 75 / 0.4)',
        ...(height != null ? { height: '100%', display: 'flex', flexDirection: 'column' } : {}),
      }}>
        <div style={{
          position: 'relative', zIndex: 1, background: CARD_BG, ...dotGrid, borderRadius: 20.5,
          ...(height != null ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' } : {}),
        }}>
          {/* Header */}
          <div style={{ padding: '13px 16px 10px', borderBottom: `1px solid ${BORDER_SOFT}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
            <img src="/favicon.ico" alt="" width={20} height={20} style={{ borderRadius: 5, flexShrink: 0 }} />
            <span style={{ fontSize: 15, fontWeight: 600, color: INK, fontFamily: serifFont, flexShrink: 0 }}>
              Media Plan Editor
            </span>

            <div ref={agentMenuRef} style={{ position: 'relative', marginLeft: 'auto' }}>
              <button
                onClick={() => setShowAgentMenu(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 99, border: `1px solid ${BORDER}`,
                  background: CARD_BG, color: GRAPHITE, fontSize: 11.5, fontWeight: 500,
                  cursor: 'pointer', fontFamily: sansFont,
                }}
              >
                {selectedAgent ? <AgentIcon name={selectedAgent.icon} size={12} /> : <Users size={12} />}
                {selectedAgent ? selectedAgent.name : 'Default Assistant'}
                <ChevronDown size={12} style={{ transform: showAgentMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              </button>
              {showAgentMenu && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 4,
                  background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 10,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 190, zIndex: 20,
                  padding: 4, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 260, overflowY: 'auto',
                }}>
                  <button
                    onClick={() => { selectAgent(null); setShowAgentMenu(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', borderRadius: 6, border: 'none',
                      background: selectedAgent === null ? PAPER_BG : 'transparent', color: '#3C3732',
                      fontSize: 12.5, fontWeight: 500, cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: sansFont,
                    }}
                  >
                    <Bot size={13} /> Default Assistant
                  </button>
                  {agents.map(agent => (
                    <button
                      key={agent.id}
                      onClick={() => { selectAgent(agent); setShowAgentMenu(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', borderRadius: 6, border: 'none',
                        background: selectedAgent?.id === agent.id ? PAPER_BG : 'transparent', color: '#3C3732',
                        fontSize: 12.5, fontWeight: 500, cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: sansFont,
                      }}
                      title={agent.description ?? undefined}
                    >
                      <AgentIcon name={agent.icon} size={13} /> {agent.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {confirmedAt && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: GREEN, fontWeight: 500 }}>
                <Lock size={11} /> Confirmed
              </div>
            )}
          </div>

          {/* Message thread */}
          <div ref={messageThreadRef} style={{ ...(height != null ? { flex: 1, minHeight: 0 } : { height: 420 }), overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, justifyContent: messages.length === 0 ? 'center' : 'flex-start' }}>
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button
                  onClick={() => imageInputRef.current?.click()}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    padding: '22px 16px', borderRadius: 16, border: `1.5px dashed ${BORDER}`,
                    background: PAPER_BG, cursor: 'pointer', fontFamily: sansFont, textAlign: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Paperclip size={22} style={{ color: RED }} />
                    <FileSpreadsheet size={22} style={{ color: RED }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>
                    Upload a screenshot or Excel spreadsheet
                  </span>
                  <span style={{ fontSize: 11.5, color: MUTED }}>
                    of {clientName || 'this client'}&apos;s media plan — we&apos;ll read it automatically
                  </span>
                </button>
                <div style={{ fontSize: 12.5, color: '#B5B0A5', fontFamily: serifFont, fontStyle: 'italic', textAlign: 'center' }}>
                  Or just ask a question — e.g. &quot;set Meta Ads to $2,000 in August&quot;.
                </div>
              </div>
            )}
            {messages.map((msg, idx) => {
              const overview = msg.role === 'assistant' && msg.content ? splitOverview(msg.content) : null;
              return (
                <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '94%', padding: msg.role === 'user' ? '7px 12px' : '9px 12px', borderRadius: 14,
                    background: msg.isConfirmation ? 'transparent' : (msg.role === 'user' ? INK : CARD_BG),
                    color: msg.role === 'user' ? CARD_BG : GRAPHITE,
                    border: msg.isConfirmation ? `1px dashed ${BORDER}` : undefined,
                  }}>
                    {msg.imagePreview && (
                      <img src={msg.imagePreview} alt="Attached media plan" style={{ maxWidth: 180, borderRadius: 8, marginBottom: 6, display: 'block' }} />
                    )}
                    {msg.role === 'user' ? (
                      <span style={{ fontSize: 12.5, lineHeight: 1.5, fontFamily: sansFont }}>{msg.content}</span>
                    ) : overview ? (
                      <MarkdownText text={overview.internal} />
                    ) : msg.content ? (
                      <MarkdownText text={msg.content} />
                    ) : (
                      <BouncingDots />
                    )}

                    {msg.extraction && (
                      <ExtractionCard
                        extraction={msg.extraction}
                        applied={msg.extractionApplied}
                        onApply={() => applyExtraction(msg.extraction!, idx)}
                        onDismiss={() => dismissExtraction(idx)}
                      />
                    )}

                    {msg.auditSteps && msg.auditSteps.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, marginTop: 6 }}>
                        {msg.auditSteps.map((step, i) => (
                          <div key={i} style={{ color: step.is_error ? RED : MUTED }}>
                            {step.is_error ? '⚠ ' : '· '}{step.summary || step.label}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {streamingAssistantEmpty && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 2px' }}>
                  <span style={{ fontSize: 11, color: MUTED, fontFamily: sansFont }}>
                    {extracting ? 'Reading the screenshot…' : (activeToolCall ? TOOL_LABELS[activeToolCall] ?? 'Working on it…' : 'Thinking…')}
                  </span>
                  <BouncingDots color={RED} />
                </div>
              </div>
            )}

            {appliedAnything && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {!confirmedAt && (
                  <button
                    onClick={handleConfirmLock}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 99,
                      border: 'none', background: RED, color: CARD_BG, fontSize: 12, fontWeight: 500,
                      cursor: 'pointer', fontFamily: sansFont,
                    }}
                  >
                    <Lock size={12} /> Confirm &amp; lock
                  </button>
                )}
                {preApplySnapshot && (
                  <button
                    onClick={handleUndo}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 99,
                      border: `1px solid ${BORDER}`, background: CARD_BG, color: GRAPHITE, fontSize: 12, fontWeight: 500,
                      cursor: 'pointer', fontFamily: sansFont,
                    }}
                  >
                    <Undo2 size={12} /> Undo
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ padding: '10px 16px 14px', borderTop: `1px solid ${BORDER_SOFT}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: CARD_BG, border: `1.5px solid ${BORDER}`, borderRadius: 24, padding: '8px 10px 8px 14px' }}>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={handleFileAttach}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => imageInputRef.current?.click()}
                disabled={isStreaming || extracting}
                title="Attach a screenshot or Excel spreadsheet of a media plan"
                style={{ border: 'none', background: 'none', cursor: isStreaming || extracting ? 'default' : 'pointer', color: MUTED, display: 'flex', flexShrink: 0 }}
              >
                <Paperclip size={15} />
              </button>
              {(isStreaming || extracting) && (
                <Loader2 size={14} style={{ color: MUTED, animation: 'mpChatSpin 1s linear infinite', flexShrink: 0 }} />
              )}
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isStreaming || extracting
                    ? 'Working…'
                    : pendingExtraction
                      ? 'Type a correction, or click Apply above…'
                      : `Ask ${selectedAgent?.name ?? 'the assistant'} about this plan…`
                }
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: INK, minWidth: 0, ...font }}
              />
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || isStreaming || extracting}
                style={{
                  width: 30, height: 30, flexShrink: 0,
                  background: input.trim() && !isStreaming && !extracting ? RED : PAPER_BG,
                  border: input.trim() && !isStreaming && !extracting ? 'none' : `1px solid ${BORDER}`,
                  borderRadius: '50%', cursor: input.trim() && !isStreaming && !extracting ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s',
                }}
              >
                <ArrowUp size={13} style={{ color: input.trim() && !isStreaming && !extracting ? CARD_BG : MUTED }} />
              </button>
            </div>
          </div>

          <style>{`
            @keyframes mpChatBounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.4; } 40% { transform: translateY(-3px); opacity: 1; } }
            @keyframes mpChatSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          `}</style>
        </div>
      </div>
    </div>
  );
}
