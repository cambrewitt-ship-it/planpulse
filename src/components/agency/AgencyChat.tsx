'use client';

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { RefreshCw, ChevronDown, ChevronRight, ExternalLink, Bot, X, ReceiptText, BarChart2, CalendarRange, ListChecks, ClipboardList, TrendingUp, FileText, PenLine, Users, Zap, Target } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import type { AgentAuditStep, AgentOutputLink, UserAgent } from '@/types/database';

const AGENT_ICONS: Record<string, LucideIcon> = {
  ReceiptText, BarChart2, CalendarRange, ListChecks, ClipboardList,
  Bot, TrendingUp, FileText, PenLine, Users, Zap, Target,
};
const EMOJI_ICON_FALLBACK: Record<string, string> = {
  '🧾': 'ReceiptText', '📊': 'BarChart2', '📅': 'CalendarRange',
  '✅': 'ListChecks', '📋': 'ClipboardList',
};
function AgentIcon({ name, size = 16 }: { name?: string | null; size?: number }) {
  const resolved = (name && EMOJI_ICON_FALLBACK[name]) ? EMOJI_ICON_FALLBACK[name] : name;
  const Icon = (resolved && AGENT_ICONS[resolved]) ? AGENT_ICONS[resolved] : Bot;
  return <Icon size={size} style={{ color: '#7B1F2C', flexShrink: 0 }} />;
}

interface ParsedChannel {
  channelName: string;
  format: string;
  totalBudget: number;
  percentOfInvestment: number;
  flights: Array<{
    startDate: string;
    endDate: string;
    monthlySpend: Record<string, number>;
  }>;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  imagePreview?: string;
  planChannels?: ParsedChannel[];
  planError?: string;
  auditSteps?: AgentAuditStep[];
  outputLinks?: AgentOutputLink[];
  // wizard-step fields — renders chips inline in chat, no API call
  isWizard?: boolean;
  wizardStep?: WizardStepId;
  wizardChips?: Array<{ value: string; label: string }>;
}

function AuditTrail({ steps }: { steps: AgentAuditStep[] }) {
  const [expanded, setExpanded] = useState(true);
  if (!steps.length) return null;
  return (
    <div style={{ marginTop: 8, borderTop: '0.5px solid rgba(0,0,0,0.08)', paddingTop: 6 }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', color: '#8A8578' }}
      >
        {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span style={{ fontSize: 11, fontWeight: 500 }}>{steps.length} step{steps.length !== 1 ? 's' : ''}</span>
      </button>
      {expanded && (
        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, paddingLeft: 2 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: step.is_write ? '#CC785C' : '#A0998F', flexShrink: 0, marginTop: 4 }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#3C3732' }}>{step.label}</div>
                <div style={{ fontSize: 10.5, color: '#8A8578', lineHeight: 1.4 }}>{step.summary}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OutputLinks({ links }: { links: AgentOutputLink[] }) {
  if (!links.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {links.map((link, i) => (
        <a
          key={i}
          href={link.href}
          target={link.target}
          rel={link.target === '_blank' ? 'noopener noreferrer' : undefined}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 20, border: '0.5px solid #D5D0C5', background: '#F7F5F2', color: '#4A6580', fontSize: 11.5, fontWeight: 500, textDecoration: 'none' }}
        >
          <ExternalLink size={10} />
          {link.label}
        </a>
      ))}
    </div>
  );
}

function AgentPickerInline({ agents, activeAgent, onSelect, onClear }: {
  agents: UserAgent[];
  activeAgent: UserAgent | null;
  onSelect: (a: UserAgent) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  if (!agents.length) return null;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 10, border: '0.5px solid #D5D0C5', background: activeAgent ? '#EDE9E1' : '#F7F5F2', color: '#5C564F', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}
      >
        {activeAgent ? (
          <>
            <AgentIcon name={activeAgent.icon} size={12} />
            <span style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeAgent.name}</span>
            <span onClick={e => { e.stopPropagation(); onClear(); setOpen(false); }} style={{ marginLeft: 2, color: '#A0998F', cursor: 'pointer', display: 'flex' }}>
              <X size={10} />
            </span>
          </>
        ) : (
          <>
            <Bot size={11} />
            <span>Use agent</span>
            <ChevronDown size={10} />
          </>
        )}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, minWidth: 220, background: '#FDFCF8', border: '0.5px solid #E0DCD4', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 20, overflow: 'hidden' }}>
          {agents.map(agent => (
            <button
              key={agent.id}
              onClick={() => { onSelect(agent); setOpen(false); }}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', padding: '8px 12px', border: 'none', background: activeAgent?.id === agent.id ? '#F0EDE8' : 'transparent', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => { if (activeAgent?.id !== agent.id) e.currentTarget.style.background = '#F7F5F2'; }}
              onMouseLeave={e => { if (activeAgent?.id !== agent.id) e.currentTarget.style.background = 'transparent'; }}
            >
              <AgentIcon name={agent.icon} size={16} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1C1917' }}>{agent.name}</div>
                {agent.description && <div style={{ fontSize: 11, color: '#8A8578', marginTop: 1, lineHeight: 1.3 }}>{agent.description}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const CHANNEL_COLORS: Record<string, string> = {
  'meta ads': '#3B82F6', 'google ads': '#EF4444', 'display ads': '#06B6D4',
  'native ads': '#14B8A6', 'linkedin ads': '#6366F1', 'tiktok ads': '#6B7280',
  'instagram ads': '#EC4899', 'twitter ads': '#0EA5E9', 'youtube ads': '#DC2626',
  'edm / email': '#A855F7', 'ooh': '#F97316', 'radio': '#F59E0B',
};
function channelColor(name: string): string {
  return CHANNEL_COLORS[name.toLowerCase()] ?? '#8A8578';
}

// ── Agent wizard ───────────────────────────────────────────────────────────────

type WizardStepId = 'pick_client' | 'pick_month' | 'pick_channel' | 'pick_spend_type';
interface WizardParams { clientId?: string; clientName?: string; channel?: string; month?: string; spendType?: string; }
interface WizardClient { id: string; name: string; channels: string[]; }
interface WizardState { agent: UserAgent; steps: WizardStepId[]; stepIndex: number; params: WizardParams; }

const AGENT_FLOWS: Record<string, {
  startMessage: string;
  steps: WizardStepId[];
  buildPrompt: (p: WizardParams) => string;
  stepLabel: (step: WizardStepId) => string;
}> = {
  invoice_generator: {
    startMessage: 'Generate Invoice',
    steps: ['pick_client', 'pick_month', 'pick_spend_type'],
    buildPrompt: p => `Generate an invoice for ${p.clientName} for ${p.month} using ${p.spendType} spend`,
    stepLabel: s => s === 'pick_client' ? 'Which client?' : s === 'pick_month' ? 'Which month?' : 'Actual or planned spend?',
  },
  performance_analyst: {
    startMessage: 'Run Performance Analysis',
    steps: ['pick_client', 'pick_channel'],
    buildPrompt: p => p.channel === 'All channels'
      ? `Analyse performance across all channels for ${p.clientName}`
      : `Analyse ${p.channel} performance for ${p.clientName}`,
    stepLabel: s => s === 'pick_client' ? 'Which client?' : 'Which channel?',
  },
  media_plan_editor: {
    startMessage: 'Edit Media Plan',
    steps: ['pick_client', 'pick_channel'],
    buildPrompt: p => p.channel === 'All channels'
      ? `Show me the full media plan for ${p.clientName} so I can review and update it`
      : `Show me the ${p.channel} budget for ${p.clientName} so I can update it`,
    stepLabel: s => s === 'pick_client' ? 'Which client?' : 'Which channel?',
  },
  action_points_manager: {
    startMessage: 'Review Action Points',
    steps: ['pick_client'],
    buildPrompt: p => p.clientId === '__all__'
      ? 'Show me all action points — overdue first, then due soon'
      : `Show me action points for ${p.clientName} — overdue first`,
    stepLabel: () => 'Which client?',
  },
  report_creator: {
    startMessage: 'Create Report',
    steps: ['pick_client', 'pick_month'],
    buildPrompt: p => `Create a comprehensive performance report for ${p.clientName} for ${p.month}`,
    stepLabel: s => s === 'pick_client' ? 'Which client?' : 'Which month?',
  },
};

// Match an agent to a flow — try template_slug first, then fall back to name matching
// so the wizard works even if template_slug is null in the database
function getFlowForAgent(agent: UserAgent) {
  if (agent.template_slug && AGENT_FLOWS[agent.template_slug]) {
    return AGENT_FLOWS[agent.template_slug];
  }
  const n = (agent.name ?? '').toLowerCase();
  if (n.includes('invoice'))                                    return AGENT_FLOWS.invoice_generator;
  if (n.includes('performance') || n.includes('analyst'))      return AGENT_FLOWS.performance_analyst;
  if (n.includes('media') || n.includes('editor'))             return AGENT_FLOWS.media_plan_editor;
  if (n.includes('action') || n.includes('points') || n.includes('task')) return AGENT_FLOWS.action_points_manager;
  if (n.includes('report'))                                    return AGENT_FLOWS.report_creator;
  return null;
}

function getRecentMonths(count = 6): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toLocaleString('en-GB', { month: 'long', year: 'numeric' }));
  }
  return months;
}

function buildChipsForStep(
  step: WizardStepId,
  params: WizardParams,
  clients: WizardClient[],
  agentSlug: string,
): Array<{ value: string; label: string }> {
  if (step === 'pick_client') {
    const opts: Array<{ value: string; label: string }> = [];
    if (agentSlug === 'action_points_manager') opts.push({ value: '__all__', label: 'All clients' });
    opts.push(...clients.map(c => ({ value: c.id, label: c.name })));
    return opts;
  }
  if (step === 'pick_month') return getRecentMonths(6).map(m => ({ value: m, label: m }));
  if (step === 'pick_channel') {
    const client = clients.find(c => c.id === params.clientId);
    return [
      { value: 'All channels', label: 'All channels' },
      ...(client?.channels || []).map(ch => ({ value: ch, label: ch })),
    ];
  }
  if (step === 'pick_spend_type') return [
    { value: 'actual', label: 'Actual spend' },
    { value: 'planned', label: 'Planned spend' },
  ];
  return [];
}

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
      const listStart = i;
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*•]\s/, ''));
        i++;
      }
      nodes.push(
        <ul key={`ul-${listStart}`} style={{ margin: '3px 0', paddingLeft: 14, listStyle: 'none' }}>
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
      const listStart = i;
      const items: Array<{ num: string; text: string }> = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        const m = lines[i].match(/^(\d+)\.\s(.*)/);
        items.push({ num: m![1], text: m![2] });
        i++;
      }
      nodes.push(
        <ol key={`ol-${listStart}`} style={{ margin: '3px 0', paddingLeft: 0, listStyle: 'none' }}>
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

export interface AgencyChatHandle {
  sendMessage: (text: string) => void;
}

interface AgencyChatProps {
  notesSlot?: React.ReactNode;
}

export const AgencyChat = forwardRef<AgencyChatHandle, AgencyChatProps>(function AgencyChat({ notesSlot }, ref) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toolInProgress, setToolInProgress] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [dailyBriefing, setDailyBriefing] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [briefingDisplayed, setBriefingDisplayed] = useState('');
  const [briefingTick, setBriefingTick] = useState(0);
  // notesOpen = true means notes is visible below (chat retracted to CHAT_CARD_H)
  const [notesOpen, setNotesOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [colHeight, setColHeight] = useState(800);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Image attachment
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [attachedImage, setAttachedImage] = useState<{ base64: string; mimeType: string; preview: string; name: string } | null>(null);

  // Plan import modal
  const [importModal, setImportModal] = useState<{ channels: ParsedChannel[]; imagePreview: string } | null>(null);
  const [importClients, setImportClients] = useState<Array<{ id: string; name: string }>>([]);
  const [importClientId, setImportClientId] = useState('');
  const [importSaving, setImportSaving] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  // Agent state
  const [agents, setAgents] = useState<UserAgent[]>([]);
  const [activeAgent, setActiveAgent] = useState<UserAgent | null>(null);
  const [agentRunId, setAgentRunId] = useState<string | null>(null);

  // Wizard state
  const [wizardState, setWizardState] = useState<WizardState | null>(null);
  const [wizardClients, setWizardClients] = useState<WizardClient[] | null>(null);
  const [wizardClientsLoading, setWizardClientsLoading] = useState(false);

  const isEmpty = messages.length === 0;

  // Load agents + pre-fetch clients on mount so wizard launches are instant
  useEffect(() => {
    fetch('/api/agents').then(r => r.ok ? r.json() : null).then(d => { if (d?.agents) setAgents(d.agents); }).catch(() => {});
    fetch('/api/agency/clients')
      .then(r => r.json())
      .then((d: any) => {
        const list: WizardClient[] = (Array.isArray(d) ? d : d.clients || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          channels: (c.channels || []).map((ch: any) => typeof ch === 'string' ? ch : ch.channelName).filter(Boolean),
        }));
        setWizardClients(list);
      })
      .catch(() => setWizardClients([]));
  }, []);

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
    let cancelled = false;
    const CACHE_KEY = 'agency_daily_briefing_cache';
    const TTL = 12 * 60 * 60 * 1000;

    const fetchAndCache = () => {
      setBriefingLoading(true);
      fetch('/api/agency/daily-briefing')
        .then(r => r.json())
        .then(data => {
          if (!cancelled) {
            const briefing = data.briefing ?? null;
            setDailyBriefing(briefing);
            if (briefing) {
              try { localStorage.setItem(CACHE_KEY, JSON.stringify({ briefing, ts: Date.now() })); } catch { /* ignore */ }
            }
          }
        })
        .catch(() => { if (!cancelled) setDailyBriefing(null); })
        .finally(() => { if (!cancelled) setBriefingLoading(false); });
    };

    // Forced refresh via reload button — always re-fetch
    if (briefingTick > 0) {
      fetchAndCache();
      return () => { cancelled = true; };
    }

    // Initial load — use cache if fresh
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const { briefing, ts } = JSON.parse(raw);
        if (briefing && Date.now() - ts < TTL) {
          setDailyBriefing(briefing);
          return () => { cancelled = true; };
        }
      }
    } catch { /* ignore malformed cache */ }

    fetchAndCache();
    return () => { cancelled = true; };
  }, [briefingTick]);

  useEffect(() => {
    if (!dailyBriefing) return;
    setBriefingDisplayed('');
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setBriefingDisplayed(dailyBriefing.slice(0, i));
      if (i >= dailyBriefing.length) clearInterval(interval);
    }, 18);
    return () => clearInterval(interval);
  }, [dailyBriefing]);

  useEffect(() => {
    if (!notesOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, notesOpen]);

  const handleImageAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (file.size > 20 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setAttachedImage({
        base64: dataUrl.split(',')[1],
        mimeType: file.type,
        preview: dataUrl,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  const sendWithImage = useCallback(async (image: typeof attachedImage, text: string) => {
    if (!image) return;
    const userMsg: Message = {
      role: 'user',
      content: text.trim() || 'Please analyse this media plan screenshot.',
      imagePreview: image.preview,
    };
    const assistantMsg: Message = { role: 'assistant', content: '', isStreaming: true };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setAttachedImage(null);
    setIsLoading(true);
    setNotesOpen(false);

    try {
      const res = await fetch('/api/media-plan/parse-screenshot', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: image.base64, mimeType: image.mimeType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to analyse screenshot');
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') {
          next[next.length - 1] = {
            ...last,
            content: `I've extracted ${data.channels.length} channel${data.channels.length !== 1 ? 's' : ''} from your screenshot.`,
            planChannels: data.channels,
            isStreaming: false,
          };
        }
        return next;
      });
    } catch (err: any) {
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, content: '', planError: err.message ?? 'Failed to analyse screenshot.', isStreaming: false };
        }
        return next;
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const openImportModal = useCallback(async (channels: ParsedChannel[], imagePreview: string) => {
    setImportModal({ channels, imagePreview });
    setImportClientId('');
    setImportSuccess(null);
    try {
      const res = await fetch('/api/agency/clients');
      const data = await res.json();
      const clients = (Array.isArray(data) ? data : []).map((c: any) => ({ id: c.id, name: c.name }));
      setImportClients(clients);
    } catch {
      setImportClients([]);
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!importModal || !importClientId) return;
    setImportSaving(true);
    try {
      // Convert parsed channels to the serialised format the plan builder expects
      const total = importModal.channels.reduce((s, c) => s + (c.totalBudget || 0), 0);
      const serialized = importModal.channels.map(ch => ({
        id: `channel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        channelName: ch.channelName,
        format: ch.format || '',
        totalBudget: ch.totalBudget || 0,
        percentOfInvestment: total > 0 ? Math.round((ch.totalBudget / total) * 100) : (ch.percentOfInvestment || 0),
        flights: ch.flights.map(f => ({
          id: `flight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          startWeek: f.startDate,
          endWeek: f.endDate,
          monthlySpend: f.monthlySpend || {},
          color: channelColor(ch.channelName),
        })),
        channelCategory: 'paid_digital',
      }));
      const res = await fetch(`/api/clients/${importClientId}/media-plan-builder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: serialized, commission: 0 }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setImportSuccess(importClientId);
    } catch (err: any) {
      alert(err.message ?? 'Failed to save plan.');
    } finally {
      setImportSaving(false);
    }
  }, [importModal, importClientId]);

  const send = useCallback(async (text: string, agentOverride?: UserAgent | null) => {
    if (attachedImage) { sendWithImage(attachedImage, text); return; }
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const agentForRequest = agentOverride !== undefined ? agentOverride : activeAgent;

    const userMsg: Message = { role: 'user', content: trimmed };
    const assistantMsg: Message = { role: 'assistant', content: '', isStreaming: true, auditSteps: [], outputLinks: [] };

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
        body: JSON.stringify({
          messages: history,
          agentId: agentForRequest?.id ?? undefined,
          runId: agentRunId ?? undefined,
        }),
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
                complete_action_point: 'Marking task as complete…',
                create_action_point: 'Adding new action point…',
                create_client: 'Creating new client…',
                update_media_plan_budget: 'Updating media plan budget…',
                get_live_meta_campaigns: 'Fetching live Meta campaigns…',
              };
              setToolInProgress(labels[event.tool] ?? 'Working on it…');
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
                if (last?.role === 'assistant') next[next.length - 1] = { ...last, outputLinks: event.links };
                return next;
              });
            } else if (event.type === 'action') {
              window.dispatchEvent(new CustomEvent('planpulse:ai-action', { detail: { tool: event.tool, data: event.data } }));
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
  }, [messages, isLoading, activeAgent, agentRunId, attachedImage, sendWithImage]);

  useImperativeHandle(ref, () => ({
    sendMessage: (text: string) => { send(text); },
  }), [send]);

  // ── Wizard handlers ────────────────────────────────────────────────────────

  // appendAndStream — used by wizard final step. Appends assistant msg and streams API response.
  // Only the built prompt is sent as history (wizard messages are local-only).
  const appendAndStream = useCallback(async (prompt: string, agent: UserAgent) => {
    const assistantMsg: Message = { role: 'assistant', content: '', isStreaming: true, auditSteps: [], outputLinks: [] };
    setMessages(prev => [...prev, assistantMsg]);
    setIsLoading(true);
    setToolInProgress(null);

    const TOOL_LABELS: Record<string, string> = {
      get_daily_briefing: 'Fetching daily briefing…',
      get_client_status: 'Looking up client data…',
      get_action_points: 'Checking action points…',
      get_channel_library: 'Searching channel library…',
      get_channel_performance: 'Pulling channel performance data…',
      complete_action_point: 'Marking task as complete…',
      create_action_point: 'Adding new action point…',
      create_client: 'Creating new client…',
      update_media_plan_budget: 'Updating media plan budget…',
      get_live_meta_campaigns: 'Fetching live Meta campaigns…',
      generate_invoice: 'Generating invoice…',
      generate_report: 'Generating report…',
    };

    try {
      const res = await fetch('/api/agency/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], agentId: agent.id }),
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
              setToolInProgress(TOOL_LABELS[event.tool] ?? 'Working on it…');
            } else if (event.type === 'audit_step') {
              setMessages(prev => { const next = [...prev]; const last = next[next.length - 1]; if (last?.role === 'assistant') next[next.length - 1] = { ...last, auditSteps: [...(last.auditSteps ?? []), event.step] }; return next; });
            } else if (event.type === 'output_links') {
              setMessages(prev => { const next = [...prev]; const last = next[next.length - 1]; if (last?.role === 'assistant') next[next.length - 1] = { ...last, outputLinks: event.links }; return next; });
            } else if (event.type === 'done') {
              setMessages(prev => { const next = [...prev]; const last = next[next.length - 1]; if (last?.role === 'assistant') next[next.length - 1] = { ...last, isStreaming: false }; return next; });
              setToolInProgress(null);
            } else if (event.type === 'error') {
              setMessages(prev => { const next = [...prev]; const last = next[next.length - 1]; if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: 'Sorry, something went wrong. Please try again.', isStreaming: false }; return next; });
              setToolInProgress(null);
            } else if (event.type === 'action') {
              window.dispatchEvent(new CustomEvent('planpulse:ai-action', { detail: { tool: event.tool, data: event.data } }));
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch {
      setMessages(prev => { const next = [...prev]; const last = next[next.length - 1]; if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: 'Sorry, something went wrong. Please try again.', isStreaming: false }; return next; });
    } finally {
      setIsLoading(false);
      setToolInProgress(null);
    }
  }, []);

  // startWizard — clicking an agent button immediately opens the chat with the first wizard step
  // startWizard — synchronous: clients are pre-loaded on mount, so this is instant
  const startWizard = useCallback((agent: UserAgent) => {
    const flow = getFlowForAgent(agent); // uses name fallback if template_slug is null
    setActiveAgent(agent);
    setAgentRunId(null);
    setInput('');
    setNotesOpen(false);

    if (!flow) return; // truly custom agent with no recognised pattern

    const clients = wizardClients || [];
    const agentSlug = agent.template_slug ?? agent.name.toLowerCase().replace(/\s+/g, '_');
    const firstStep = flow.steps[0];
    const chips = buildChipsForStep(firstStep, {}, clients, agentSlug);

    // Automatic user message + first wizard question — opens active chat immediately
    const autoUserMsg: Message = { role: 'user', content: flow.startMessage };
    const wizardMsg: Message = {
      role: 'assistant',
      content: flow.stepLabel(firstStep),
      isWizard: true,
      wizardStep: firstStep,
      wizardChips: chips,
    };
    setMessages([autoUserMsg, wizardMsg]);
    setWizardState({ agent, steps: flow.steps, stepIndex: 0, params: {} });
  }, [wizardClients]);

  // handleWizardChip — clicking a chip inside a wizard chat message
  const handleWizardChip = useCallback(async (chip: { value: string; label: string }, stepId: WizardStepId) => {
    if (!wizardState) return;
    const { steps, stepIndex, params, agent } = wizardState;

    const newParams: WizardParams = { ...params };
    if (stepId === 'pick_client') { newParams.clientId = chip.value; newParams.clientName = chip.label; }
    else if (stepId === 'pick_month') { newParams.month = chip.label; }
    else if (stepId === 'pick_channel') { newParams.channel = chip.label; }
    else if (stepId === 'pick_spend_type') { newParams.spendType = chip.label; }

    const userMsg: Message = { role: 'user', content: chip.label };
    const nextIndex = stepIndex + 1;
    const flow = getFlowForAgent(agent);
    const agentSlug = agent.template_slug ?? agent.name.toLowerCase().replace(/\s+/g, '_');

    if (nextIndex >= steps.length) {
      // Last step — build full prompt and fire the real API call
      const prompt = flow?.buildPrompt(newParams) ?? chip.label;
      setWizardState(null);
      setMessages(prev => [...prev, userMsg]);
      await appendAndStream(prompt, agent);
    } else {
      // Advance to next wizard step — add chips for it
      const nextStep = steps[nextIndex];
      const chips = buildChipsForStep(nextStep, newParams, wizardClients || [], agentSlug);
      const nextMsg: Message = {
        role: 'assistant',
        content: flow?.stepLabel(nextStep) ?? 'Select an option',
        isWizard: true,
        wizardStep: nextStep,
        wizardChips: chips,
      };
      setMessages(prev => [...prev, userMsg, nextMsg]);
      setWizardState({ ...wizardState, stepIndex: nextIndex, params: newParams });
    }
  }, [wizardState, wizardClients, appendAndStream]);

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
  const chatCardHeight = notesOpen ? CHAT_CARD_H : (colHeight || 800);

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
            {/* Top section — briefing */}
            <div style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, border: '2px solid #1C1917', overflow: 'hidden', flexShrink: 0 }}>
                    <img src="/favicon.ico" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <span style={{ fontSize: 19, color: '#8A8578', fontWeight: 700 }}>AI Agent</span>
                  {activeAgent ? (
                    <>
                      <span style={{ fontSize: 14, color: '#B5B0A5', fontWeight: 400 }}>·</span>
                      <span style={{ fontSize: 14, color: '#4A6580', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><AgentIcon name={activeAgent.icon} size={13} /> {activeAgent.name}</span>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 14, color: '#B5B0A5', fontWeight: 400 }}>·</span>
                      <span style={{ fontSize: 14, color: '#B5B0A5', fontWeight: 500 }}>Daily Briefing</span>
                    </>
                  )}
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      onClick={() => setBriefingTick(t => t + 1)}
                      disabled={briefingLoading}
                      title="Refresh briefing"
                      style={{
                        background: 'none', border: 'none',
                        cursor: briefingLoading ? 'default' : 'pointer',
                        color: '#C4BDB5', padding: 2, display: 'flex', alignItems: 'center',
                        transition: 'color 0.15s',
                      }}
                      onMouseEnter={e => { if (!briefingLoading) e.currentTarget.style.color = '#8A8578'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#C4BDB5'; }}
                    >
                      <RefreshCw size={13} style={{ animation: briefingLoading ? 'spin 1s linear infinite' : 'none' }} />
                    </button>
                  </div>
                </div>
                {/* Daily briefing */}
                {briefingLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                    <span style={{ fontSize: 11.5, color: '#B5B0A5' }}>Generating briefing…</span>
                    <span style={{ display: 'flex', gap: 2 }}>
                      {[0, 1, 2].map(i => (
                        <span key={i} style={{
                          width: 3, height: 3, borderRadius: '50%', background: '#C4BDB5',
                          animation: `chatBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                          display: 'inline-block',
                        }} />
                      ))}
                    </span>
                  </div>
                ) : dailyBriefing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {briefingDisplayed.split('\n').filter(l => l.trim()).map((line, i, arr) => {
                      const isLast = i === arr.length - 1;
                      const isTyping = briefingDisplayed.length < dailyBriefing.length;
                      const text = line.replace(/^•\s*/, '');
                      const parts = text.split(/([+\-]?\d+(?:\.\d+)?%?)/g);
                      return (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ color: '#8A8578', fontSize: 15.5, lineHeight: 1.55, flexShrink: 0, marginTop: 1 }}>•</span>
                          <span style={{ fontSize: 15.5, fontWeight: 400, lineHeight: 1.55, color: '#1C1917' }}>
                            {parts.map((part, j) =>
                              /^[+\-]?\d+(?:\.\d+)?%?$/.test(part)
                                ? <strong key={j} style={{ fontWeight: 700 }}>{part}</strong>
                                : part
                            )}
                            {isLast && isTyping && (
                              <span style={{ display: 'inline-block', width: 1.5, height: '0.85em', background: '#8A8578', marginLeft: 1, verticalAlign: 'text-bottom', animation: 'briefingCursor 0.7s step-end infinite' }} />
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Bottom section — text box + agents */}
            <div style={{ flex: 3, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ marginBottom: 10, flexShrink: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#1C1917', lineHeight: 1.25 }}>
                  Where should we start?
                </div>
              </div>

              <div style={{
                marginBottom: 10, flexShrink: 0,
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
                  {/* Image preview strip */}
                  {attachedImage && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{ position: 'relative', display: 'inline-flex' }}>
                        <img src={attachedImage.preview} alt="attachment" style={{ height: 48, width: 72, objectFit: 'cover', borderRadius: 6, border: '0.5px solid #E0DCD4' }} />
                        <button
                          onClick={() => setAttachedImage(null)}
                          style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: '50%', background: '#6B7280', border: 'none', color: '#fff', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', lineHeight: 1 }}
                        >✕</button>
                      </div>
                      <span style={{ fontSize: 11, color: '#8A8578' }}>Media plan screenshot attached</span>
                    </div>
                  )}
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    placeholder={attachedImage ? 'Add a note (optional)…' : 'Ask about clients, tasks, or specs…'}
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
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      title="Attach a media plan screenshot"
                      style={{
                        width: 30, height: 30, borderRadius: '50%', border: '1.5px solid #D1D5DB',
                        background: attachedImage ? '#EEF2FF' : 'transparent', color: '#6B7280',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0,
                      }}
                    >+</button>
                    <button
                      onClick={() => send(input)}
                      disabled={!input.trim() && !attachedImage}
                      style={{
                        width: 36, height: 36, borderRadius: '50%', border: 'none',
                        background: (input.trim() || attachedImage) ? '#3B82F6' : '#D1D5DB',
                        color: '#FFFFFF',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: (input.trim() || attachedImage) ? 'pointer' : 'default',
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

              {/* Agent launch buttons — all visible, wrapping below text box */}
              <div style={{ flexShrink: 0 }}>
                {agents.length === 0 ? (
                  <div style={{ fontSize: 11, color: '#C4BDB5' }}>No agents configured — visit /agents to set up your first agent.</div>
                ) : (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#C4BDB5', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 7 }}>
                      Launch an agent
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                      {agents.map(agent => (
                        <button
                          key={agent.id}
                          onClick={() => startWizard(agent)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '6px 12px', borderRadius: 99,
                            border: '0.5px solid #D5D0C5', background: '#F7F5F2',
                            color: '#1C1917', fontSize: 14, fontWeight: 500,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                            transition: 'background 0.12s, border-color 0.12s, transform 0.1s',
                            ...font,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#EDE9E1'; e.currentTarget.style.borderColor = '#B5B0A5'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#F7F5F2'; e.currentTarget.style.borderColor = '#D5D0C5'; e.currentTarget.style.transform = 'translateY(0)'; }}
                        >
                          <AgentIcon name={agent.icon} size={14} />
                          <span>{agent.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
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
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1C1917', lineHeight: 1.2 }}>
                  {activeAgent ? <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><AgentIcon name={activeAgent.icon} size={13} /> {activeAgent.name}</span> : 'Agency Assistant'}
                </div>
              </div>
              {/* New chat button */}
              <button
                onClick={() => { setMessages([]); setInput(''); setIsLoading(false); setToolInProgress(null); setNotesOpen(false); setAgentRunId(null); setWizardState(null); }}
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
                padding: '12px 13px 160px',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                {messages.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '92%',
                      padding: msg.role === 'user' ? '7px 11px' : '9px 12px',
                      borderRadius: 14,
                      background: msg.role === 'user' ? '#1C1917' : '#F0EDE8',
                      color: msg.role === 'user' ? '#FDFCF8' : '#3C3732',
                    }}>
                      {msg.role === 'user' ? (
                        <div>
                          {msg.imagePreview && (
                            <img src={msg.imagePreview} alt="attachment" style={{ width: '100%', borderRadius: 8, marginBottom: msg.content ? 6 : 0, display: 'block', maxHeight: 160, objectFit: 'cover' }} />
                          )}
                          {msg.content && <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>{msg.content}</span>}
                        </div>
                      ) : (
                        <div>
                          {msg.planError ? (
                            <span style={{ fontSize: 12, color: '#B45309' }}>⚠ {msg.planError}</span>
                          ) : msg.planChannels ? (
                            <div>
                              {msg.content && <div style={{ marginBottom: 10 }}>{renderMarkdown(msg.content)}</div>}
                              {/* Plan preview card */}
                              <div style={{ background: '#FDFCF8', borderRadius: 10, border: '0.5px solid #D5D0C5', overflow: 'hidden' }}>
                                <div style={{ padding: '10px 12px 8px', borderBottom: '0.5px solid #EDE9E1', fontSize: 11, fontWeight: 600, color: '#1C1917', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 14 }}>📊</span> Media Plan
                                </div>
                                <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                                  {msg.planChannels.map((ch, j) => (
                                    <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: channelColor(ch.channelName), flexShrink: 0 }} />
                                      <span style={{ fontSize: 12, color: '#1C1917', flex: 1, fontWeight: 500 }}>{ch.channelName}</span>
                                      <span style={{ fontSize: 11, color: '#8A8578' }}>${ch.totalBudget.toLocaleString()}</span>
                                    </div>
                                  ))}
                                </div>
                                <div style={{ padding: '8px 12px', borderTop: '0.5px solid #EDE9E1' }}>
                                  <button
                                    onClick={() => openImportModal(msg.planChannels!, msg.imagePreview ?? '')}
                                    style={{
                                      width: '100%', padding: '7px 12px',
                                      background: '#1C1917', color: '#FDFCF8',
                                      border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                      cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif",
                                    }}
                                  >
                                    Import to Plan Builder →
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : msg.isWizard && msg.wizardChips ? (
                            // Wizard step — question text + clickable chips
                            <div>
                              <div style={{ fontSize: 12.5, lineHeight: 1.5, color: '#3C3732', marginBottom: 8, fontWeight: 500 }}>
                                {msg.content}
                              </div>
                              {wizardClientsLoading && msg.wizardStep === 'pick_client' ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <span style={{ fontSize: 11, color: '#B5B0A5' }}>Loading clients…</span>
                                  {[0,1,2].map(i => <span key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: '#C4BDB5', animation: `chatBounce 1.2s ease-in-out ${i*0.2}s infinite`, display: 'inline-block' }} />)}
                                </div>
                              ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                  {msg.wizardChips.map(chip => (
                                    <button
                                      key={chip.value}
                                      disabled={!!wizardState && wizardState.stepIndex !== (msg.wizardStep ? wizardState.steps.indexOf(msg.wizardStep) : -1)}
                                      onClick={() => msg.wizardStep && handleWizardChip(chip, msg.wizardStep)}
                                      style={{
                                        padding: '5px 11px', borderRadius: 99, flexShrink: 0,
                                        border: '0.5px solid #D5D0C5', background: '#FDFCF8',
                                        color: '#1C1917', fontSize: 11.5, fontWeight: 500,
                                        cursor: 'pointer', whiteSpace: 'nowrap',
                                        transition: 'background 0.12s, border-color 0.12s',
                                        fontFamily: "'DM Sans', system-ui, sans-serif",
                                        opacity: (!!wizardState && wizardState.stepIndex !== (msg.wizardStep ? wizardState.steps.indexOf(msg.wizardStep) : -1)) ? 0.45 : 1,
                                      }}
                                      onMouseEnter={e => { if (!e.currentTarget.disabled) { e.currentTarget.style.background = '#EDE9E1'; e.currentTarget.style.borderColor = '#B5B0A5'; } }}
                                      onMouseLeave={e => { e.currentTarget.style.background = '#FDFCF8'; e.currentTarget.style.borderColor = '#D5D0C5'; }}
                                    >
                                      {chip.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : msg.content ? (
                            <>
                              {renderMarkdown(msg.content)}
                              {msg.auditSteps && msg.auditSteps.length > 0 && <AuditTrail steps={msg.auditSteps} />}
                              {msg.outputLinks && msg.outputLinks.length > 0 && <OutputLinks links={msg.outputLinks} />}
                            </>
                          ) : msg.isStreaming ? (
                            <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', height: 16 }}>
                              {[0, 1, 2].map(j => (
                                <span key={j} style={{
                                  width: 4, height: 4, borderRadius: '50%', background: '#C4BDB5',
                                  animation: `chatBounce 1.2s ease-in-out ${j * 0.2}s infinite`,
                                  display: 'inline-block',
                                }} />
                              ))}
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
                      <span style={{ fontSize: 11, color: '#A0998F' }}>
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
                  </div>
                )}
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
                  {/* Image preview strip (active state) */}
                  {attachedImage && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{ position: 'relative', display: 'inline-flex' }}>
                        <img src={attachedImage.preview} alt="attachment" style={{ height: 48, width: 72, objectFit: 'cover', borderRadius: 6, border: '0.5px solid #E0DCD4' }} />
                        <button
                          onClick={() => setAttachedImage(null)}
                          style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: '50%', background: '#6B7280', border: 'none', color: '#fff', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', lineHeight: 1 }}
                        >✕</button>
                      </div>
                      <span style={{ fontSize: 11, color: '#8A8578' }}>Media plan screenshot attached</span>
                    </div>
                  )}
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    placeholder={attachedImage ? 'Add a note (optional)…' : 'Ask about clients, tasks, or specs…'}
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
                      onClick={() => imageInputRef.current?.click()}
                      title="Attach a media plan screenshot"
                      style={{
                        width: 30, height: 30, borderRadius: '50%', border: '1.5px solid #D1D5DB',
                        background: attachedImage ? '#EEF2FF' : 'transparent', color: '#6B7280',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', fontSize: 18, lineHeight: 1, flexShrink: 0,
                        padding: 0,
                      }}
                    >
                      +
                    </button>
                    <button
                      onClick={() => send(input)}
                      disabled={(!input.trim() && !attachedImage) || isLoading}
                      style={{
                        width: 36, height: 36, borderRadius: '50%', border: 'none',
                        background: (input.trim() || attachedImage) && !isLoading ? '#3B82F6' : '#D1D5DB',
                        color: '#FFFFFF',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: (input.trim() || attachedImage) && !isLoading ? 'pointer' : 'default',
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

      {/* Hidden image input */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        style={{ display: 'none' }}
        onChange={handleImageAttach}
      />

      {/* Plan import modal */}
      {importModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 999999,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, fontFamily: "'DM Sans', system-ui, sans-serif",
          }}
          onClick={() => { if (!importSaving) { setImportModal(null); setImportSuccess(null); } }}
        >
          <div
            style={{
              background: '#FDFCF8', borderRadius: 16, maxWidth: 500, width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '0.5px solid #E8E4DC' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#1C1917' }}>Import to Plan Builder</div>
              <div style={{ fontSize: 12, color: '#8A8578', marginTop: 2 }}>
                {importModal.channels.length} channel{importModal.channels.length !== 1 ? 's' : ''} extracted — select a client to load this plan
              </div>
            </div>

            {/* Content */}
            <div style={{ padding: '20px 24px' }}>
              {importSuccess ? (
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1C1917', marginBottom: 6 }}>Plan imported successfully!</div>
                  <div style={{ fontSize: 12, color: '#8A8578', marginBottom: 16 }}>The extracted channels have been loaded into the client's media plan builder.</div>
                  <a
                    href={`/clients/${importSuccess}/dashboard`}
                    style={{
                      display: 'inline-block', padding: '9px 20px', borderRadius: 10,
                      background: '#1C1917', color: '#FDFCF8', fontSize: 13, fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    Open Plan Builder →
                  </a>
                </div>
              ) : (
                <>
                  {/* Channel preview */}
                  <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {importModal.channels.map((ch, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: '#F5F3EF', border: '0.5px solid #E8E4DC' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: channelColor(ch.channelName), flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: '#1C1917' }}>{ch.channelName}</span>
                        <span style={{ fontSize: 12, color: '#8A8578' }}>${ch.totalBudget.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>

                  {/* Client selector */}
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#1C1917', display: 'block', marginBottom: 6 }}>Select client</label>
                    <select
                      value={importClientId}
                      onChange={e => setImportClientId(e.target.value)}
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: 8,
                        border: '1px solid #D5D0C5', background: '#FDFCF8',
                        fontSize: 13, color: '#1C1917', outline: 'none',
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                      }}
                    >
                      <option value="">Choose a client…</option>
                      {importClients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setImportModal(null)}
                      style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #D5D0C5', background: 'transparent', fontSize: 13, color: '#5C564F', cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleImport}
                      disabled={!importClientId || importSaving}
                      style={{
                        padding: '9px 18px', borderRadius: 10, border: 'none',
                        background: importClientId && !importSaving ? '#1C1917' : '#D5D0C5',
                        color: '#FDFCF8', fontSize: 13, fontWeight: 600,
                        cursor: importClientId && !importSaving ? 'pointer' : 'default',
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                      }}
                    >
                      {importSaving ? 'Saving…' : 'Import Plan'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
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
        @keyframes briefingCursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
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
});
