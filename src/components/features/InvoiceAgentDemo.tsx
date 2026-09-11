'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ReceiptText, ArrowUp, FileText, X } from 'lucide-react';

// Same visual language as HealthCheckAgentDemo (src/components/features/HealthCheckAgentDemo.tsx)
// so both looping demos in the agent showcase read as one consistent product recording.
const AGENT_RUST = '#A0442A';

interface PickerOption {
  id: string;
  label: string;
}

interface DemoMessage {
  id: string;
  role: 'user' | 'assistant';
  content?: string;
  loadingLabel?: string;
  options?: PickerOption[];
  invoice?: { intro: string };
}

const CLIENTS: PickerOption[] = [
  { id: 'c1', label: 'Client ABC' },
  { id: 'c2', label: 'XYZ Company' },
  { id: 'c3', label: 'Best Brands' },
  { id: 'c4', label: 'Company 123' },
];

const MONTHS: PickerOption[] = [
  { id: 'm1', label: 'September 2026' },
  { id: 'm2', label: 'August 2026' },
  { id: 'm3', label: 'July 2026' },
];

const SELECTED_CLIENT = CLIENTS[0];
const SELECTED_MONTH = MONTHS[1];

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

export default function InvoiceAgentDemo() {
  const [pressed, setPressed] = useState(false);
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedMonthId, setSelectedMonthId] = useState<string | null>(null);
  const [linkPressed, setLinkPressed] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
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
      if (reduceMotion) {
        setMessages([
          { id: 'm1', role: 'user', content: `Generate an invoice for ${SELECTED_CLIENT.label} — ${SELECTED_MONTH.label}` },
          { id: 'm4', role: 'assistant', invoice: { intro: `Here's the invoice for ${SELECTED_CLIENT.label} — ${SELECTED_MONTH.label}:` } },
        ]);
        setSelectedClientId(SELECTED_CLIENT.id);
        setSelectedMonthId(SELECTED_MONTH.id);
        setShowPdf(true);
        return;
      }

      while (active) {
        setFading(false);
        setMessages([]);
        setSelectedClientId(null);
        setSelectedMonthId(null);
        setLinkPressed(false);
        setShowPdf(false);
        setPressed(false);
        await sleep(1800);
        if (!active) return;

        setPressed(true);
        await sleep(150);
        if (!active) return;
        setPressed(false);
        setMessages([{ id: 'm1', role: 'user', content: 'Generate an invoice' }]);

        await sleep(375);
        if (!active) return;
        setMessages((prev) => [...prev, { id: 'm2', role: 'assistant', loadingLabel: 'Thinking…' }]);

        await sleep(560);
        if (!active) return;
        setMessages((prev) => prev.map((m) => (m.id === 'm2'
          ? { ...m, loadingLabel: undefined, content: 'Which client is this for?', options: CLIENTS }
          : m)));

        await sleep(1350);
        if (!active) return;
        setSelectedClientId(SELECTED_CLIENT.id);

        await sleep(410);
        if (!active) return;
        setMessages((prev) => [...prev, { id: 'm3', role: 'user', content: SELECTED_CLIENT.label }]);

        await sleep(375);
        if (!active) return;
        setMessages((prev) => [...prev, { id: 'm4', role: 'assistant', loadingLabel: 'Thinking…' }]);

        await sleep(490);
        if (!active) return;
        setMessages((prev) => prev.map((m) => (m.id === 'm4'
          ? { ...m, loadingLabel: undefined, content: 'Which month should this invoice cover?', options: MONTHS }
          : m)));

        await sleep(1200);
        if (!active) return;
        setSelectedMonthId(SELECTED_MONTH.id);

        await sleep(410);
        if (!active) return;
        setMessages((prev) => [...prev, { id: 'm5', role: 'user', content: SELECTED_MONTH.label }]);

        await sleep(375);
        if (!active) return;
        setMessages((prev) => [...prev, { id: 'm6', role: 'assistant', loadingLabel: 'Pulling spend data…' }]);

        await sleep(825);
        if (!active) return;
        setMessages((prev) => prev.map((m) => (m.id === 'm6' ? { ...m, loadingLabel: 'Calculating commission…' } : m)));

        await sleep(825);
        if (!active) return;
        setMessages((prev) => prev.map((m) => (m.id === 'm6'
          ? { ...m, loadingLabel: undefined, invoice: { intro: `Here's the invoice for ${SELECTED_CLIENT.label} — ${SELECTED_MONTH.label}:` } }
          : m)));

        await sleep(1350);
        if (!active) return;
        setLinkPressed(true);

        await sleep(165);
        if (!active) return;
        setLinkPressed(false);
        setShowPdf(true);

        await sleep(2550);
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
        className="h-full flex flex-col p-4 transition-opacity duration-400 ease-out"
        style={{ opacity: fading ? 0 : 1 }}
      >
        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center px-3">
            <div
              className="flex items-center justify-center gap-2.5 rounded-full bg-white px-6 py-3.5 text-sm font-semibold shadow-lg border border-black/[0.04] transition-transform duration-150"
              style={{ color: AGENT_RUST, transform: pressed ? 'scale(0.96)' : 'scale(1)' }}
            >
              <ReceiptText size={24} />
              Generate an Invoice
            </div>
            <p className="text-xs text-gray-600 leading-relaxed max-w-[210px]">
              Or ask anything about billing — commission rates, spend, past invoices.
            </p>
          </div>
        ) : (
          <div ref={threadRef} className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
            <div className="flex flex-col gap-2">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-1 duration-300`}
                >
                  <div
                    className={`max-w-[92%] rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user' ? 'bg-gray-900 text-white px-2.5 py-1.5' : 'bg-gray-100 text-gray-800 px-2.5 py-2'
                    }`}
                  >
                    {msg.invoice ? (
                      <div className="flex flex-col gap-2">
                        <span>{msg.invoice.intro}</span>
                        <div
                          className="rounded-lg overflow-hidden bg-white"
                          style={{ width: 180, border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 4px 16px rgba(0,0,0,0.10)' }}
                        >
                          <Image
                            src="/invoice.png"
                            alt="Generated client invoice with commission breakdown"
                            width={1466}
                            height={1396}
                            className="w-full h-auto"
                          />
                        </div>
                        <span
                          className="inline-flex items-center gap-1 font-medium w-fit transition-transform duration-150"
                          style={{ color: AGENT_RUST, transform: linkPressed ? 'scale(0.94)' : 'scale(1)' }}
                        >
                          <FileText size={11} />
                          View Invoice as PDF
                        </span>
                      </div>
                    ) : msg.content ? (
                      msg.content
                    ) : msg.loadingLabel ? (
                      <span className="flex items-center gap-1.5">
                        <span className="text-[11px] text-gray-400">{msg.loadingLabel}</span>
                        <Dots color="#CC785C" />
                      </span>
                    ) : null}

                    {msg.options && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {msg.options.map((o) => {
                          const selected = o.id === selectedClientId || o.id === selectedMonthId;
                          return (
                            <span
                              key={o.id}
                              className="px-2.5 py-1 rounded-full border text-gray-800 text-[11.5px] font-medium transition-colors duration-300"
                              style={{
                                background: selected ? '#EFF6FF' : '#FFFFFF',
                                borderColor: selected ? '#93C5FD' : '#E5E7EB',
                              }}
                            >
                              {o.label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input bar — decorative only, mirrors the real floating input chrome */}
        <div className="flex-shrink-0 mt-2 pt-2 border-t border-gray-100">
          <div style={{ borderRadius: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.09)' }}>
            <div style={{ position: 'relative', borderRadius: 20, padding: 1.5, overflow: 'hidden', background: 'rgba(224,220,212,0.7)' }}>
              {isEmpty && <div className="invoiceDemoGlowSpin" />}
              <div style={{ background: '#FFFFFF', borderRadius: 18.5, padding: '13px 13px 10px', position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: 13, color: '#9CA3AF', minHeight: 20 }}>Ask about clients, tasks, or specs…</div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#D1D5DB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ArrowUp size={16} style={{ color: '#FFFFFF' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Full PDF view — opens over the whole card once "View Invoice as PDF" is pressed */}
      {showPdf && (
        <div
          className="absolute inset-0 z-20 flex flex-col animate-in fade-in zoom-in-95 duration-300 transition-opacity ease-out"
          style={{ background: '#F0EDE8', opacity: fading ? 0 : 1, transitionDuration: '400ms' }}
        >
          <div className="flex-shrink-0 flex items-center justify-between px-3 py-2.5 bg-white border-b border-gray-100">
            <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-gray-700">
              <FileText size={13} style={{ color: AGENT_RUST }} />
              Invoice_{SELECTED_CLIENT.label.replace(/\s+/g, '')}_{SELECTED_MONTH.label.replace(/\s+/g, '')}.pdf
            </span>
            <X size={14} className="text-gray-400" />
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center p-4">
            <div
              className="rounded-md overflow-hidden bg-white"
              style={{ maxHeight: '100%', maxWidth: '100%', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 12px 40px rgba(0,0,0,0.16)' }}
            >
              <Image
                src="/invoice.png"
                alt="Generated client invoice with commission breakdown"
                width={1466}
                height={1396}
                className="w-auto h-auto max-w-full object-contain"
                style={{ maxHeight: 380 }}
              />
            </div>
          </div>
        </div>
      )}

      <style>{`
        .invoiceDemoGlowSpin {
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
          animation: invoiceDemoGlowOrbit 4s linear infinite, invoiceDemoGlowPulse 9s ease-in-out 1s infinite;
        }
        @keyframes invoiceDemoGlowOrbit { to { transform: rotate(360deg); } }
        @keyframes invoiceDemoGlowPulse {
          0%, 100% { opacity: 0; }
          8%, 50% { opacity: 1; }
          58%, 95% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
