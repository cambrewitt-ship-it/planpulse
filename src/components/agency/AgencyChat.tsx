'use client';

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Send, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

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

const QUICK_ACTIONS = [
  { label: 'Daily briefing', prompt: 'Give me a daily briefing — how are all our clients doing today?', icon: '☀' },
  { label: 'Topline results', prompt: 'Give me a topline results check across all clients — for each client summarise their actual spend vs planned spend, key performance highlights, and flag any significant variances or issues I should be aware of.', icon: '▲' },
  { label: 'Channel health', prompt: 'Do a channel health check — for each client show me channel pacing, spend vs plan, and flag any channels that are over or under pacing.', icon: '⬡' },
  { label: 'Overdue tasks', prompt: 'What action points are overdue right now?', icon: '⚑' },
  { label: 'Red clients', prompt: 'Which clients have red health status and why?', icon: '◉' },
  { label: 'Channel specs', prompt: 'What channel specs and notes do we have in our library?', icon: '≡' },
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

  const send = useCallback(async (text: string) => {
    if (attachedImage) { sendWithImage(attachedImage, text); return; }
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
                complete_action_point: 'Marking task as complete…',
                create_action_point: 'Adding new action point…',
                create_client: 'Creating new client…',
                update_media_plan_budget: 'Updating media plan budget…',
                get_live_meta_campaigns: 'Fetching live Meta campaigns…',
              };
              setToolInProgress(labels[event.tool] ?? 'Working on it…');
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
  }, [messages, isLoading]);

  useImperativeHandle(ref, () => ({
    sendMessage: (text: string) => { send(text); },
  }), [send]);

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
            {/* Top half — label at top, spacer fills remainder */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, border: '2px solid #1C1917', overflow: 'hidden', flexShrink: 0 }}>
                    <img src="/favicon.ico" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <span style={{ fontSize: 19, color: '#8A8578', fontWeight: 700 }}>AI Agent</span>
                  <span style={{ fontSize: 14, color: '#B5B0A5', fontWeight: 400 }}>·</span>
                  <span style={{ fontSize: 14, color: '#B5B0A5', fontWeight: 500 }}>Daily Briefing</span>
                  <button
                    onClick={() => setBriefingTick(t => t + 1)}
                    disabled={briefingLoading}
                    title="Refresh briefing"
                    style={{
                      marginLeft: 'auto', background: 'none', border: 'none',
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

            <div style={{ marginBottom: 10, marginTop: 16, flexShrink: 0 }}>
              <div style={{ fontSize: 21, fontWeight: 600, color: '#1C1917', lineHeight: 1.25 }}>
                Where should we start?
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

            {/* Bottom half — quick action cards */}
            <div style={{ flex: 1, paddingTop: 14, overflow: 'hidden', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {QUICK_ACTIONS.map(action => (
                  <button
                    key={action.label}
                    onClick={() => send(action.prompt)}
                    style={{
                      padding: '10px 18px',
                      borderRadius: 999,
                      border: '1px solid #4A5568',
                      background: '#3D4A5C',
                      color: '#FFFFFF',
                      fontSize: 15,
                      fontWeight: 500,
                      cursor: 'pointer',
                      ...font,
                      transition: 'opacity 0.15s, transform 0.1s',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)'; }}
                  >
                    {action.label}
                  </button>
                ))}
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
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1C1917', lineHeight: 1.2 }}>Agency Assistant</div>
              </div>
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
                          ) : msg.content ? (
                            renderMarkdown(msg.content)
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
