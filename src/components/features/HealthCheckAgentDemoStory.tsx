'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Bot, ArrowUp, Globe, Link2Off, Wallet } from 'lucide-react';

// Vertical (9:16) / square variant of HealthCheckAgentDemo.tsx, rendered at
// fixed video-canvas pixel sizes for the Playwright capture pipeline in
// scripts/record-agent-video.mjs — stacked layout + larger type instead of
// the desktop side-by-side, same scripted message timing so both stay in
// sync if the copy changes.
const AGENT_RUST = '#A0442A';

interface CampaignOption {
  id: string;
  name: string;
  account?: string;
  isRegistered?: boolean;
}

interface DemoMessage {
  id: string;
  role: 'user' | 'assistant';
  content?: string;
  loadingLabel?: string;
  campaignOptions?: CampaignOption[];
  result?: { intro: string; issues: { icon: 'geo' | 'link' | 'budget'; text: string }[]; outro: string };
}

const CAMPAIGNS: CampaignOption[] = [
  { id: '1', name: 'Traffic – Website Clicks', account: 'Client ABC' },
  { id: '2', name: 'Sales – Retargeting Campaign', account: 'Client ABC', isRegistered: true },
  { id: '3', name: 'Traffic – Lookalike Audience', account: 'Client ABC' },
];

const SELECTED_CAMPAIGN = CAMPAIGNS[1];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function Dots({ color = '#C4BDB5', size = 8 }: { color?: string; size?: number }) {
  return (
    <span className="inline-flex items-center" style={{ gap: size * 0.5 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block rounded-full animate-bounce"
          style={{ width: size, height: size, background: color, animationDelay: `${i * 0.15}s`, animationDuration: '1s' }}
        />
      ))}
    </span>
  );
}

export default function HealthCheckAgentDemoStory({ format }: { format: 'vertical' | 'square' }) {
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [fading, setFading] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    let active = true;

    async function run() {
      while (active) {
        setFading(false);
        setMessages([]);
        setSelectedCampaignId(null);
        await sleep(1500);
        if (!active) return;

        setMessages([{ id: 'm1', role: 'user', content: 'Activate Health Check Agent' }]);

        await sleep(375);
        if (!active) return;
        setMessages((prev) => [...prev, { id: 'm2', role: 'assistant', loadingLabel: 'Thinking…' }]);

        await sleep(560);
        if (!active) return;
        setMessages((prev) => prev.map((m) => (m.id === 'm2'
          ? { ...m, loadingLabel: undefined, content: 'Which live campaign should Setup Auditor check?', campaignOptions: CAMPAIGNS }
          : m)));

        await sleep(1650);
        if (!active) return;
        setSelectedCampaignId(SELECTED_CAMPAIGN.id);

        await sleep(410);
        if (!active) return;
        setMessages((prev) => [...prev, { id: 'm3', role: 'user', content: SELECTED_CAMPAIGN.name }]);

        await sleep(375);
        if (!active) return;
        setMessages((prev) => [...prev, { id: 'm4', role: 'assistant', loadingLabel: 'Pulling performance data…' }]);

        await sleep(825);
        if (!active) return;
        setMessages((prev) => prev.map((m) => (m.id === 'm4' ? { ...m, loadingLabel: 'Pulling account data…' } : m)));

        await sleep(825);
        if (!active) return;
        setMessages((prev) => prev.map((m) => (m.id === 'm4'
          ? {
              ...m,
              loadingLabel: undefined,
              result: {
                intro: `Looking at ${SELECTED_CAMPAIGN.name}, I found 3 errors:`,
                issues: [
                  { icon: 'geo', text: 'Geotargeting is incorrectly pushing ads to USA, instead of New Zealand' },
                  { icon: 'link', text: 'The URL in the ad is a broken link' },
                  { icon: 'budget', text: 'The budget is set to daily budget instead of lifetime budget, and the campaign is overpacing' },
                ],
                outro: 'Would you like me to help you fix these errors?',
              },
            }
          : m)));

        // First-iteration timing marker consumed by scripts/record-agent-video.mjs
        // to know when the "punchline" state has rendered, so the capture can
        // hold and cut cleanly instead of guessing an offset.
        if (typeof window !== 'undefined' && !(window as unknown as Record<string, unknown>).__resultShownAt) {
          (window as unknown as Record<string, unknown>).__resultShownAt = Date.now();
        }

        await sleep(4050);
        if (!active) return;
        setFading(true);
        await sleep(400);
      }
    }

    run();
    return () => { active = false; };
  }, []);

  const isVertical = format === 'vertical';
  const width = 1080;
  const height = isVertical ? 1920 : 1080;
  const imagePanelHeight = isVertical ? 760 : 380;
  const isEmpty = messages.length === 0;

  return (
    <div
      style={{
        width,
        height,
        background: '#FBF9F6',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: 40,
          gap: 28,
          minHeight: 0,
          opacity: fading ? 0 : 1,
          transition: 'opacity 400ms ease-out',
        }}
      >
        {/* Branded header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: AGENT_RUST, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Bot size={30} color="#FFFFFF" />
          </div>
          <div>
            <div style={{ fontSize: 30, fontWeight: 700, color: '#1C1917' }}>Health Check Agent</div>
            <div style={{ fontSize: 20, color: '#8A8578', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} />
              Auditing live campaign setup
            </div>
          </div>
        </div>

        {/* Pacing dashboard screenshot */}
        <div
          style={{
            height: imagePanelHeight,
            borderRadius: 24,
            overflow: 'hidden',
            border: '1px solid #E8E4DC',
            boxShadow: '0 16px 40px rgba(28,25,23,0.10)',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          <Image
            src="/channel-performance.png"
            alt="Channel performance dashboard showing pacing and actual vs planned spend"
            fill
            sizes={`${width}px`}
            style={{ objectFit: 'cover', objectPosition: 'top' }}
          />
        </div>

        {/* Chat column */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div ref={threadRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {isEmpty ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', color: '#8A8578' }}>
                <Bot size={36} color={AGENT_RUST} />
                <p style={{ fontSize: 26 }}>Ask me to check a live campaign&apos;s setup and health.</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className="animate-in fade-in slide-in-from-bottom-1 duration-300"
                  style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}
                >
                  <div
                    style={{
                      maxWidth: '92%',
                      borderRadius: 22,
                      fontSize: 26,
                      lineHeight: 1.5,
                      padding: '18px 22px',
                      whiteSpace: 'pre-wrap',
                      background: msg.role === 'user' ? '#1C1917' : '#F1EFEA',
                      color: msg.role === 'user' ? '#FFFFFF' : '#292524',
                    }}
                  >
                    {msg.result ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <span>{msg.result.intro}</span>
                        {msg.result.issues.map((issue, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                            {issue.icon === 'geo' ? (
                              <Globe size={26} style={{ color: AGENT_RUST, flexShrink: 0, marginTop: 2 }} />
                            ) : issue.icon === 'link' ? (
                              <Link2Off size={26} style={{ color: AGENT_RUST, flexShrink: 0, marginTop: 2 }} />
                            ) : (
                              <Wallet size={26} style={{ color: AGENT_RUST, flexShrink: 0, marginTop: 2 }} />
                            )}
                            <span>{issue.text}</span>
                          </div>
                        ))}
                        <span style={{ marginTop: 4 }}>{msg.result.outro}</span>
                      </div>
                    ) : msg.content ? (
                      msg.content
                    ) : msg.loadingLabel ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 22, color: '#A8A29E' }}>{msg.loadingLabel}</span>
                        <Dots color="#CC785C" size={8} />
                      </span>
                    ) : null}

                    {msg.campaignOptions && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
                        {msg.campaignOptions.map((c) => (
                          <span
                            key={c.id}
                            style={{
                              padding: '10px 16px',
                              borderRadius: 999,
                              fontSize: 20,
                              fontWeight: 500,
                              color: '#292524',
                              border: `1.5px solid ${selectedCampaignId === c.id ? '#93C5FD' : '#E5E7EB'}`,
                              background: selectedCampaignId === c.id ? '#EFF6FF' : '#FFFFFF',
                              transition: 'all 300ms',
                            }}
                          >
                            {c.name}
                            {c.account && <span style={{ color: '#A8A29E', fontWeight: 400 }}> · {c.account}</span>}
                            {c.isRegistered && <span style={{ color: '#059669', fontWeight: 400 }}> · Registered</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Input bar — decorative only */}
          <div style={{ flexShrink: 0, marginTop: 20, paddingTop: 20, borderTop: '1px solid #E7E5E4' }}>
            <div style={{ borderRadius: 28, boxShadow: '0 4px 24px rgba(0,0,0,0.09)', position: 'relative', padding: 2, overflow: 'hidden', background: 'rgba(224,220,212,0.7)' }}>
              {isEmpty && <div className="hcaStoryGlowSpin" />}
              <div style={{ background: '#FFFFFF', borderRadius: 26, padding: '20px 22px 16px', position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 24, color: '#9CA3AF' }}>Ask about this channel…</span>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#D1D5DB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ArrowUp size={22} color="#FFFFFF" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .hcaStoryGlowSpin {
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
          animation: hcaStoryGlowOrbit 4s linear infinite, hcaStoryGlowPulse 9s ease-in-out 1s infinite;
        }
        @keyframes hcaStoryGlowOrbit { to { transform: rotate(360deg); } }
        @keyframes hcaStoryGlowPulse {
          0%, 100% { opacity: 0; }
          8%, 50% { opacity: 1; }
          58%, 95% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
