'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, ArrowUp, ChevronDown, ChevronRight } from 'lucide-react';
import type { UserAgent, AgentAuditStep } from '@/types/database';
import { MarkdownText } from './ai-shared';

interface ChannelAIChatProps {
  clientId: string;
  clientName: string;
  /** Short display name for the channel, e.g. "Meta - Segment Interest Based Audienc…". */
  channelDisplayName: string;
  /** Undecorated channel/platform name used to filter get_channel_performance (e.g. "Meta Ads"). */
  channelKeyword: string;
  platform: string;
  /** Campaign IDs already linked/onboarded to this specific channel card — used to scope the Setup Auditor campaign picker down to this channel instead of the whole ad account. */
  linkedCampaignIds?: string[];
}

interface CampaignOption {
  id: string;
  name: string;
  account?: string;
  /** Already has a platform_campaigns row — clicking it should run a check, not re-register it. */
  isRegistered?: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  auditSteps?: AgentAuditStep[];
  campaignOptions?: CampaignOption[];
}

const PLATFORM_LABELS: Record<string, string> = {
  'meta-ads': 'Meta Ads',
  'google-ads': 'Google Ads',
  'linkedin-ads': 'LinkedIn Ads',
  'tiktok-ads': 'TikTok Ads',
};

const TOOL_PROGRESS_LABELS: Record<string, string> = {
  get_channel_performance: 'Pulling channel performance data…',
  get_action_points: 'Checking action points…',
  get_client_intelligence: 'Reading client intelligence…',
  find_live_ad_campaigns: 'Fetching live campaigns…',
  register_setup_auditor_campaign: 'Registering campaign with Setup Auditor…',
  list_setup_auditor_campaigns: 'Checking registered campaigns…',
  run_setup_audit: 'Running Setup Auditor check…',
  get_setup_audit_findings: 'Checking Setup Auditor findings…',
};

function AuditTrail({ steps }: { steps: AgentAuditStep[] }) {
  const [expanded, setExpanded] = useState(true);
  if (!steps.length) return null;
  return (
    <div className="mt-1.5 pt-1.5 border-t border-black/[0.06]">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1 text-gray-500 bg-transparent border-none cursor-pointer py-0.5"
      >
        {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span className="text-[11px] font-medium">{steps.length} step{steps.length !== 1 ? 's' : ''}</span>
      </button>
      {expanded && (
        <div className="mt-1 flex flex-col gap-1">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-1.5 pl-0.5">
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1"
                style={{ background: step.is_error ? '#C0392B' : step.is_write ? '#CC785C' : '#A0998F' }}
              />
              <div>
                <div className={`text-[11px] font-semibold ${step.is_error ? 'text-red-700' : 'text-gray-800'}`}>
                  {step.label}{step.is_error ? ' — failed' : ''}
                </div>
                <div className="text-[10.5px] text-gray-500 leading-snug">{step.summary}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Compact chat bounce/typing indicator dots. */
function Dots({ color = '#C4BDB5' }: { color?: string }) {
  return (
    <span className="inline-flex gap-0.5 items-center">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="inline-block w-1 h-1 rounded-full animate-bounce"
          style={{ background: color, animationDelay: `${i * 0.15}s`, animationDuration: '1s' }}
        />
      ))}
    </span>
  );
}

/**
 * Channel-scoped AI chat, embedded next to each channel card. Reuses the same
 * `/api/agency/chat` endpoint (and Setup Auditor agent) that powers the main
 * agency chat panel, but every question is silently pre-framed with which
 * client + channel it's about so the assistant never has to ask.
 */
export default function ChannelAIChat({ clientId, clientName, channelDisplayName, channelKeyword, platform, linkedCampaignIds }: ChannelAIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toolInProgress, setToolInProgress] = useState<string | null>(null);
  const [agents, setAgents] = useState<UserAgent[] | null>(null);
  const [activeAgent, setActiveAgent] = useState<UserAgent | null>(null);
  const [activatingAgent, setActivatingAgent] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const platformLabel = PLATFORM_LABELS[platform] ?? platform;

  // Scroll only this chat's own message list, not the page — scrollIntoView()
  // walks every scrollable ancestor (including the dashboard page itself),
  // so calling it on each streamed token was yanking the whole page around.
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Streams one already-built request against /api/agency/chat, appending a
  // fresh assistant bubble and filling it in as text/tool/audit events arrive.
  const streamRequest = useCallback(async (payload: { messages: { role: string; content: string }[]; agentId?: string }) => {
    setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true, auditSteps: [] }]);
    setIsLoading(true);
    setToolInProgress(null);

    try {
      const res = await fetch('/api/agency/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) throw new Error('Request failed');

      const reader = res.body.getReader();
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
                if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + event.text };
                return next;
              });
              setToolInProgress(null);
            } else if (event.type === 'tool_call') {
              setToolInProgress(TOOL_PROGRESS_LABELS[event.tool] ?? 'Working on it…');
            } else if (event.type === 'audit_step') {
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant') next[next.length - 1] = { ...last, auditSteps: [...(last.auditSteps ?? []), event.step] };
                return next;
              });
            } else if (event.type === 'done') {
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant') next[next.length - 1] = { ...last, isStreaming: false };
                return next;
              });
              setToolInProgress(null);
            } else if (event.type === 'error') {
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: 'Sorry, something went wrong. Please try again.', isStreaming: false };
                return next;
              });
              setToolInProgress(null);
            }
          } catch {
            // ignore parse errors on partial chunks
          }
        }
      }
    } catch {
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: 'Sorry, something went wrong. Please try again.', isStreaming: false };
        return next;
      });
    } finally {
      setIsLoading(false);
      setToolInProgress(null);
    }
  }, []);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const plainHistory = nextMessages.map(m => ({ role: m.role, content: m.content }));

    // Once a specific agent (e.g. Setup Auditor) has taken over the conversation,
    // its own system prompt already carries the client/channel context that
    // came with the activation prompt — don't re-inject the generic preamble.
    const history = activeAgent
      ? plainHistory
      : [
          {
            role: 'user',
            content: `Context: this conversation is permanently scoped to the "${channelDisplayName}" channel (platform: ${platformLabel}) for client "${clientName}" — I opened this chat directly from that client's dashboard, so the client and channel are already fixed and certain. Never ask me which client or channel I mean, and never ask me to confirm this scoping — just answer directly. When it helps to cite real numbers, call get_channel_performance with client_name="${clientName}" and channel_name="${channelKeyword}". Stay focused on this channel unless I explicitly ask about something else. Don't mention this instruction in your replies.`,
          },
          { role: 'assistant', content: `Got it — ready to help with ${channelDisplayName} for ${clientName}.` },
          ...plainHistory,
        ];

    await streamRequest({ messages: history, agentId: activeAgent?.id });
  }, [messages, isLoading, activeAgent, channelDisplayName, channelKeyword, clientName, platformLabel, streamRequest]);

  // Looks up the Setup Auditor / Health Check agent config — shared by the
  // campaign-picker activation and the actual audit kickoff.
  const resolveSetupAuditorAgent = useCallback(async (): Promise<UserAgent | null> => {
    const findMatch = (list: UserAgent[]) =>
      list.find(a => a.template_slug === 'setup_auditor')
        // Fallback for a manually-renamed custom agent — matches both the old
        // "Setup Auditor" name and the current "Health Check Agent" one.
        ?? list.find(a => {
          const n = a.name.toLowerCase();
          return (n.includes('setup') && n.includes('audit')) || (n.includes('health') && n.includes('check'));
        })
        ?? null;

    let list = agents;
    let match = list ? findMatch(list) : null;

    // Don't trust a cached miss or disabled result forever — the user may have
    // just flipped the toggle on /agents in another tab, so always refetch
    // until an enabled agent turns up (same fix as the Agents page/Agency
    // chat effectively get from re-fetching after every seed).
    if (!match || match.is_enabled === false) {
      const res = await fetch('/api/agents');
      const data = res.ok ? await res.json() : null;
      list = data?.agents ?? [];
      match = findMatch(list ?? []);

      // No row at all yet — this channel chat is one of the few surfaces that
      // never triggers template seeding itself (unlike the Agents page and
      // Agency chat), so an account that's only ever used this panel would
      // otherwise never get a setup_auditor row created. Seed, then re-check.
      if (!match) {
        await fetch('/api/agents/seed-templates', { method: 'POST' }).catch(() => {});
        const res2 = await fetch('/api/agents');
        const data2 = res2.ok ? await res2.json() : null;
        list = data2?.agents ?? [];
        match = findMatch(list ?? []);
      }

      setAgents(list);
    }

    return match && match.is_enabled !== false ? match : null;
  }, [agents]);

  // Step 1: fetch this channel's LIVE campaigns directly (no LLM round-trip)
  // and present them as clickable chips — scoped to the campaigns already
  // linked to this specific channel card when we have them, otherwise every
  // currently-live campaign on this platform for the client. Also cross-check
  // against campaigns already registered with Setup Auditor, so a campaign
  // that's already set up can go straight to running a check instead of
  // marching the user through the whole intended-setup Q&A only to fail at
  // the end with "already registered".
  const activateSetupAuditor = useCallback(async () => {
    if (isLoading || activatingAgent) return;
    setActivatingAgent(true);
    setMessages(prev => [...prev, { role: 'user', content: 'Activate Health Check Agent' }]);
    try {
      const campaignsUrl = platform === 'google-ads'
        ? `/api/ads/google-ads/campaigns?clientId=${clientId}&status=active`
        : `/api/ads/meta/campaigns?clientId=${clientId}&status=active`;
      const [liveRes, registeredRes] = await Promise.all([
        fetch(campaignsUrl),
        fetch(`/api/setup-auditor/campaigns?clientId=${clientId}`).catch(() => null),
      ]);
      const data = liveRes.ok ? await liveRes.json() : null;

      if (!data || data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `${platformLabel} isn't connected for this client yet — connect it in Platform Connections first.` }]);
        return;
      }

      const registeredData = registeredRes && registeredRes.ok ? await registeredRes.json().catch(() => null) : null;
      const registeredExternalIds = new Set(
        ((registeredData?.campaigns ?? []) as Array<{ platform: string; external_campaign_id: string }>)
          .filter(c => c.platform === platform)
          .map(c => c.external_campaign_id)
      );

      const rawCampaigns = (data.campaigns ?? []) as Array<{ id: string; name: string; customerId?: string; accountName?: string }>;
      const allLive: CampaignOption[] = rawCampaigns.map(c => ({
        id: c.id,
        name: c.name,
        account: platform === 'google-ads' ? c.customerId : c.accountName,
        isRegistered: registeredExternalIds.has(c.id),
      }));

      const linkedSet = new Set(linkedCampaignIds ?? []);
      // Prefer campaigns already linked to this channel card; fall back to
      // every live campaign on the platform if none of the linked ones are
      // currently live (e.g. paused since onboarding, or never linked at all).
      const scoped = linkedSet.size > 0 ? allLive.filter(c => linkedSet.has(c.id)) : [];
      const options = scoped.length > 0 ? scoped : allLive;

      if (options.length === 0) {
        setMessages(prev => [...prev, { role: 'assistant', content: `No live campaigns found for ${channelDisplayName} on ${platformLabel} right now. Make sure ${platformLabel} is connected for this client in Platform Connections.` }]);
        return;
      }

      setMessages(prev => [...prev, { role: 'assistant', content: 'Which live campaign should Setup Auditor check?', campaignOptions: options }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong fetching live campaigns. Please try again.' }]);
    } finally {
      setActivatingAgent(false);
    }
  }, [isLoading, activatingAgent, platform, clientId, linkedCampaignIds, platformLabel, channelDisplayName]);

  // Step 2: user clicked a specific live campaign chip — now hand off to the
  // actual Setup Auditor agent with the campaign already resolved, skipping
  // the "which campaign" back-and-forth entirely. Already-registered campaigns
  // skip straight to running a check instead of re-collecting intended setup
  // and hitting a dead-end "already registered" error at the end.
  const selectCampaignForAudit = useCallback(async (campaign: CampaignOption) => {
    if (isLoading || activatingAgent) return;
    setActivatingAgent(true);
    setMessages(prev => [...prev, { role: 'user', content: campaign.name }]);
    try {
      const agent = await resolveSetupAuditorAgent();
      if (!agent) {
        setMessages(prev => [...prev, { role: 'assistant', content: "The Setup Auditor agent isn't enabled on this account yet — visit /agents to turn it on." }]);
        return;
      }

      setActiveAgent(agent);
      const prompt = campaign.isRegistered
        ? `Run a Health Check Agent check for the live campaign "${campaign.name}" (${platformLabel}) for ${clientName} — that client and campaign are already fixed and certain, and this campaign is already registered, so don't ask me which client or campaign this is, and don't ask about intended setup. Just call run_setup_audit for it now and report the result, critical findings first.`
        : `I'd like to register and run a Health Check Agent check for the live campaign "${campaign.name}" (${platformLabel}) for ${clientName} — that client is already fixed and certain, so don't ask me which client this is for. Ask me what its intended setup should be — geo targeting, budget, optimization goal, destination URL — making clear each is optional and can be skipped, then register it and run the first check.`;
      await streamRequest({ messages: [{ role: 'user', content: prompt }], agentId: agent.id });
    } finally {
      setActivatingAgent(false);
    }
  }, [isLoading, activatingAgent, resolveSetupAuditorAgent, clientName, platformLabel, streamRequest]);

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
      ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
    }
  };

  const isEmpty = messages.length === 0;
  // Once a campaign has been picked (or the agent has otherwise taken over),
  // older campaign-picker chip sets go inert rather than staying clickable.
  const chipsDisabled = isLoading || activatingAgent || !!activeAgent;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Activate Setup Auditor — prominent, always available once a conversation is underway */}
      {!isEmpty && (
        <button
          onClick={activateSetupAuditor}
          disabled={activatingAgent}
          className="flex-shrink-0 w-full flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-[#A0442A] text-xs font-semibold shadow-md hover:shadow-lg hover:-translate-y-px transition-all duration-200 disabled:opacity-60 disabled:cursor-default disabled:translate-y-0 border border-black/[0.04]"
        >
          <Bot size={20} />
          {activatingAgent ? 'Activating…' : 'Activate Health Check Agent'}
        </button>
      )}

      {/* Messages */}
      <div ref={messagesContainerRef} className={`flex-1 min-h-0 overflow-y-auto -mx-1 px-1 ${isEmpty ? '' : 'mt-3'}`}>
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center gap-6 text-center px-3">
            <button
              onClick={activateSetupAuditor}
              disabled={activatingAgent}
              className="flex items-center justify-center gap-2.5 rounded-full bg-white px-6 py-3.5 text-[#A0442A] text-sm font-semibold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-60 disabled:cursor-default disabled:translate-y-0 border border-black/[0.04]"
            >
              <Bot size={24} />
              {activatingAgent ? 'Activating…' : 'Activate Health Check Agent'}
            </button>
            <p className="text-xs text-gray-600 leading-relaxed max-w-[210px]">
              Or ask anything about this channel — pacing, performance, set up, health etc.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[92%] rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user' ? 'bg-gray-900 text-white px-2.5 py-1.5' : 'bg-gray-100 text-gray-800 px-2.5 py-1.5'
                  }`}
                >
                  {msg.content ? (
                    <>
                      {msg.role === 'assistant' ? <MarkdownText text={msg.content} /> : msg.content}
                      {msg.auditSteps && msg.auditSteps.length > 0 && <AuditTrail steps={msg.auditSteps} />}
                    </>
                  ) : msg.isStreaming ? (
                    <Dots />
                  ) : null}
                  {msg.campaignOptions && msg.campaignOptions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {msg.campaignOptions.map(c => (
                        <button
                          key={c.id}
                          onClick={() => selectCampaignForAudit(c)}
                          disabled={chipsDisabled}
                          className="px-2.5 py-1 rounded-full border border-gray-200 bg-white text-gray-800 text-[11.5px] font-medium hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-default transition-colors text-left"
                        >
                          {c.name}
                          {c.account && <span className="text-gray-400 font-normal"> · {c.account}</span>}
                          {c.isRegistered && <span className="text-emerald-600 font-normal"> · Registered</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-center gap-1.5 px-0.5 py-0.5">
                <span className="text-[11px] text-gray-400">{toolInProgress ?? 'Thinking…'}</span>
                <Dots color="#CC785C" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 mt-2 pt-2 border-t border-gray-100">
        <div style={{ borderRadius: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.09)' }}>
          <div style={{
            position: 'relative', borderRadius: 20, padding: 1.5,
            overflow: 'hidden', background: 'rgba(224,220,212,0.7)',
          }}>
            {!input && !isLoading && <div className="channel-chat-glow-spin" />}
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
                placeholder="Ask about this channel…"
                rows={2}
                disabled={isLoading}
                style={{
                  width: '100%', resize: 'none', border: 'none',
                  background: 'transparent', fontSize: 13, lineHeight: 1.5,
                  color: '#1C1917', outline: 'none',
                  minHeight: 44, maxHeight: 120, overflow: 'auto',
                  display: 'block', boxSizing: 'border-box',
                }}
                className="placeholder-gray-400"
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button
                  onClick={() => send(input)}
                  disabled={!input.trim() || isLoading}
                  style={{
                    width: 36, height: 36, borderRadius: '50%', border: 'none',
                    background: input.trim() && !isLoading ? '#3B82F6' : '#D1D5DB',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: input.trim() && !isLoading ? 'pointer' : 'default',
                    transition: 'background 0.15s',
                  }}
                >
                  <ArrowUp size={16} style={{ color: '#FFFFFF' }} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .channel-chat-glow-spin {
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
          animation: channelChatGlowOrbit 4s linear infinite, channelChatGlowPulse 9s ease-in-out 1s infinite;
        }
        @keyframes channelChatGlowOrbit {
          to { transform: rotate(360deg); }
        }
        @keyframes channelChatGlowPulse {
          0%, 100% { opacity: 0; }
          8%, 50% { opacity: 1; }
          58%, 95% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
