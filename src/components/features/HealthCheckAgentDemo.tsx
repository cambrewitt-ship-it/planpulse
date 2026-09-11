'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Bot, ArrowUp, Globe, Link2Off, Wallet } from 'lucide-react';

// Same side-by-side layout as MediaPlanEditorDemo / PerformanceAnalystDemo
// (src/components/features/MediaPlanEditorDemo.tsx), mirrored — chat on the
// left, the real pacing dashboard screenshot on the right — so this looping
// demo reads as an authentic recording rather than a mockup.
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

function Dots({ color = '#C4BDB5' }: { color?: string }) {
  return (
    <span className="inline-flex gap-0.5 items-center">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block w-1 h-1 rounded-full animate-bounce"
          style={{ background: color, animationDelay: `${i * 0.15}s`, animationDuration: '1s' }}
        />
      ))}
    </span>
  );
}

export default function HealthCheckAgentDemo() {
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [fading, setFading] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    // A closure-local flag, not a ref — React Strict Mode's dev double-invoke
    // (mount -> cleanup -> mount) would otherwise flip a shared ref back to
    // true from the second mount, letting the first effect's loop keep running
    // and duplicate every message.
    let active = true;

    const reduceMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    async function run() {
      // A viewer who prefers reduced motion still gets the finished state, just
      // no looping/typing choreography.
      if (reduceMotion) {
        setMessages([
          { id: 'm1', role: 'user', content: 'Activate Health Check Agent' },
          {
            id: 'm4',
            role: 'assistant',
            result: {
              intro: `Looking at ${SELECTED_CAMPAIGN.name}, I found 3 errors:`,
              issues: [
                { icon: 'geo', text: 'Geotargeting is incorrectly pushing ads to USA, instead of New Zealand' },
                { icon: 'link', text: 'The URL in the ad is a broken link' },
                { icon: 'budget', text: 'The budget is set to daily budget instead of lifetime budget, and the campaign is overpacing' },
              ],
              outro: 'Would you like me to help you fix these errors?',
            },
          },
        ]);
        return;
      }

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

        await sleep(4050);
        if (!active) return;
        setFading(true);
        await sleep(400);
      }
    }

    run();
    return () => { active = false; };
  }, []);

  const isEmpty = messages.length === 0;

  return (
    <div
      aria-hidden="true"
      className="relative w-full overflow-hidden bg-white"
      style={{ height: 480 }}
    >
      <div
        className="h-full flex p-4 gap-3 transition-opacity duration-400 ease-out"
        style={{ opacity: fading ? 0 : 1 }}
      >
        {/* Pacing dashboard screenshot */}
        <div className="flex-1 min-w-0 flex items-center justify-center">
          <div
            className="w-full rounded-xl overflow-hidden"
            style={{ border: '1px solid #E8E4DC', boxShadow: '0 8px 24px rgba(28,25,23,0.08)' }}
          >
            <Image
              src="/channel-performance.png"
              alt="Channel performance dashboard showing pacing and actual vs planned spend"
              width={2002}
              height={1502}
              className="w-full h-auto"
            />
          </div>
        </div>

        {/* Chat column */}
        <div className="flex-shrink-0 flex flex-col" style={{ width: 205 }}>
          <div ref={threadRef} className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
            {isEmpty ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-1">
                <Bot size={18} style={{ color: AGENT_RUST }} />
                <p className="text-[10.5px] leading-snug" style={{ color: '#8A8578' }}>
                  Ask me to check a live campaign&apos;s setup and health.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-1 duration-300`}
                  >
                    <div
                      className={`max-w-[95%] rounded-xl text-[10.5px] leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user' ? 'bg-gray-900 text-white px-2 py-1.5' : 'bg-gray-100 text-gray-800 px-2 py-1.5'
                      }`}
                    >
                      {msg.result ? (
                        <div className="flex flex-col gap-1.5">
                          <span>{msg.result.intro}</span>
                          {msg.result.issues.map((issue, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                              {issue.icon === 'geo' ? (
                                <Globe size={12} className="shrink-0 mt-0.5" style={{ color: AGENT_RUST }} />
                              ) : issue.icon === 'link' ? (
                                <Link2Off size={12} className="shrink-0 mt-0.5" style={{ color: AGENT_RUST }} />
                              ) : (
                                <Wallet size={12} className="shrink-0 mt-0.5" style={{ color: AGENT_RUST }} />
                              )}
                              <span>{issue.text}</span>
                            </div>
                          ))}
                          <span className="mt-0.5">{msg.result.outro}</span>
                        </div>
                      ) : msg.content ? (
                        msg.content
                      ) : msg.loadingLabel ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-400">{msg.loadingLabel}</span>
                          <Dots color="#CC785C" />
                        </span>
                      ) : null}

                      {msg.campaignOptions && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {msg.campaignOptions.map((c) => (
                            <span
                              key={c.id}
                              className="px-2 py-1 rounded-full border text-gray-800 text-[10px] font-medium transition-colors duration-300"
                              style={{
                                background: selectedCampaignId === c.id ? '#EFF6FF' : '#FFFFFF',
                                borderColor: selectedCampaignId === c.id ? '#93C5FD' : '#E5E7EB',
                              }}
                            >
                              {c.name}
                              {c.account && <span className="text-gray-400 font-normal"> · {c.account}</span>}
                              {c.isRegistered && <span className="text-emerald-600 font-normal"> · Registered</span>}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Input bar — decorative only, mirrors the real floating input chrome */}
          <div className="flex-shrink-0 mt-2 pt-2 border-t border-gray-100">
            <div style={{ borderRadius: 18, boxShadow: '0 2px 16px rgba(0,0,0,0.09)' }}>
              <div style={{ position: 'relative', borderRadius: 18, padding: 1.5, overflow: 'hidden', background: 'rgba(224,220,212,0.7)' }}>
                {isEmpty && <div className="hcaDemoGlowSpin" />}
                <div style={{ background: '#FFFFFF', borderRadius: 16.5, padding: '10px 10px 8px', position: 'relative', zIndex: 1 }}>
                  <div style={{ fontSize: 11, color: '#9CA3AF', minHeight: 16 }}>Ask about this channel…</div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#D1D5DB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ArrowUp size={13} style={{ color: '#FFFFFF' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .hcaDemoGlowSpin {
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
          animation: hcaDemoGlowOrbit 4s linear infinite, hcaDemoGlowPulse 9s ease-in-out 1s infinite;
        }
        @keyframes hcaDemoGlowOrbit { to { transform: rotate(360deg); } }
        @keyframes hcaDemoGlowPulse {
          0%, 100% { opacity: 0; }
          8%, 50% { opacity: 1; }
          58%, 95% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
