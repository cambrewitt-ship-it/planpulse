'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarRange, ArrowUp } from 'lucide-react';

// Same visual language as InvoiceAgentDemo / HealthCheckAgentDemo
// (src/components/features/InvoiceAgentDemo.tsx) so all looping demos in the
// agent showcase read as one consistent product recording. Unlike those two,
// the chat thread here sits alongside a live SVG media plan rather than
// taking the full card, since edits need to be visible as they happen.
const AGENT_RUST = '#A0442A';

interface DemoMessage {
  id: string;
  role: 'user' | 'assistant';
  content?: string;
  loadingLabel?: string;
}

interface PlanRow {
  id: string;
  label: string;
  color: string;
  amount: number;
  colStart: number; // week index, 0-7
  colSpan: number;  // number of weeks
}

const INITIAL_ROWS: PlanRow[] = [
  { id: 'meta', label: 'META ADS', color: '#3B82F6', amount: 14000, colStart: 0, colSpan: 8 },
  { id: 'edm', label: 'EDM / EMAIL', color: '#A855F7', amount: 3000, colStart: 0, colSpan: 4 },
];

const GOOGLE_ROW: PlanRow = { id: 'google', label: 'GOOGLE ADS', color: '#EF4444', amount: 7000, colStart: 0, colSpan: 4 };
const OOH_ROW: PlanRow = { id: 'ooh', label: 'OOH BILLBOARDS', color: '#F97316', amount: 20000, colStart: 4, colSpan: 4 };

const TOTAL_SLOTS = 4;
const MONTHS = ['SEP', 'OCT'];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const formatCurrency = (n: number) => `$${n.toLocaleString('en-US')}`;

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

// ─── Grid geometry ───
const COL_WIDTH = 37;
const NUM_WEEKS = 8;
const LABEL_WIDTH = 84;
const AMOUNT_WIDTH = 48;
const START_X = LABEL_WIDTH + AMOUNT_WIDTH;
const ROW_HEIGHT = 50;
const HEADER_HEIGHT = 34;
const GRID_WIDTH = START_X + NUM_WEEKS * COL_WIDTH;
const GRID_HEIGHT = HEADER_HEIGHT + TOTAL_SLOTS * ROW_HEIGHT;

function MediaPlanRow({ row, y, alt, highlighted }: { row: PlanRow; y: number; alt: boolean; highlighted: boolean }) {
  const barX = START_X + row.colStart * COL_WIDTH + 4;
  const barW = row.colSpan * COL_WIDTH - 8;
  const barY = y + 9;
  const barH = ROW_HEIGHT - 18;

  return (
    <g className="animate-in fade-in slide-in-from-left-2 duration-500">
      <rect x="0" y={y} width={GRID_WIDTH} height={ROW_HEIGHT} fill={alt ? '#FDFCF8' : '#F8F6F2'} />
      <rect
        x="0"
        y={y}
        width={GRID_WIDTH}
        height={ROW_HEIGHT}
        fill="#EFF6FF"
        style={{ opacity: highlighted ? 1 : 0, transition: 'opacity 700ms ease-out' }}
      />
      <text x="10" y={y + ROW_HEIGHT / 2 + 4} fill="#3C3836" fontSize="9.5" fontWeight="600" fontFamily="sans-serif" letterSpacing="0.2">
        {row.label}
      </text>
      <text x={LABEL_WIDTH + AMOUNT_WIDTH / 2} y={y + ROW_HEIGHT / 2 + 4} textAnchor="middle" fill="#5C5650" fontSize="9" fontFamily="sans-serif">
        {formatCurrency(row.amount)}
      </text>
      <rect x={barX} y={barY} width={barW} height={barH} rx="6" fill={row.color} />
      <rect
        x={barX - 2.5}
        y={barY - 2.5}
        width={barW + 5}
        height={barH + 5}
        rx="8"
        fill="none"
        stroke="#93C5FD"
        strokeWidth="2"
        style={{ opacity: highlighted ? 1 : 0, transition: 'opacity 700ms ease-out' }}
      />
    </g>
  );
}

function EmptyRow({ y }: { y: number }) {
  const barX = START_X + 4;
  const barW = NUM_WEEKS * COL_WIDTH - 8;
  const barY = y + 9;
  const barH = ROW_HEIGHT - 18;
  return (
    <g>
      <text x="10" y={y + ROW_HEIGHT / 2 + 4} fill="#C4BDB5" fontSize="9.5" fontWeight="600" fontFamily="sans-serif">—</text>
      <rect x={barX} y={barY} width={barW} height={barH} rx="6" fill="none" stroke="#E8E4DC" strokeWidth="1.5" strokeDasharray="4 3" />
    </g>
  );
}

export default function MediaPlanEditorDemo() {
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [rows, setRows] = useState<PlanRow[]>(INITIAL_ROWS);
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null);
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
        setRows([...INITIAL_ROWS, GOOGLE_ROW, OOH_ROW]);
        setMessages([
          { id: 'm1', role: 'user', content: "Add in Google Ads, we'll spend $7,000 for the month" },
          { id: 'm2', role: 'assistant', content: 'Done — Google Ads added, $7,000 for the month.' },
          { id: 'm3', role: 'user', content: "We'll run a flight of OOH billboards, $20,000 for the month" },
          { id: 'm4', role: 'assistant', content: 'Done — OOH Billboards added, $20,000 for the month.' },
        ]);
        return;
      }

      while (active) {
        setFading(false);
        setMessages([]);
        setRows(INITIAL_ROWS);
        setHighlightedRowId(null);
        await sleep(1500);
        if (!active) return;

        setMessages([{ id: 'm1', role: 'user', content: "Add in Google Ads, we'll spend $7,000 for the month" }]);

        await sleep(450);
        if (!active) return;
        setMessages((prev) => [...prev, { id: 'm2', role: 'assistant', loadingLabel: 'Thinking…' }]);

        await sleep(600);
        if (!active) return;
        setMessages((prev) => prev.map((m) => (m.id === 'm2' ? { ...m, loadingLabel: 'Updating media plan…' } : m)));

        await sleep(650);
        if (!active) return;
        setRows((prev) => [...prev, GOOGLE_ROW]);
        setHighlightedRowId('google');
        setMessages((prev) => prev.map((m) => (m.id === 'm2'
          ? { ...m, loadingLabel: undefined, content: 'Done — Google Ads added, $7,000 for the month.' }
          : m)));

        await sleep(1500);
        if (!active) return;
        setHighlightedRowId(null);

        await sleep(1100);
        if (!active) return;
        setMessages((prev) => [...prev, { id: 'm3', role: 'user', content: "We'll run a flight of OOH billboards, $20,000 for the month" }]);

        await sleep(450);
        if (!active) return;
        setMessages((prev) => [...prev, { id: 'm4', role: 'assistant', loadingLabel: 'Thinking…' }]);

        await sleep(600);
        if (!active) return;
        setMessages((prev) => prev.map((m) => (m.id === 'm4' ? { ...m, loadingLabel: 'Updating media plan…' } : m)));

        await sleep(650);
        if (!active) return;
        setRows((prev) => [...prev, OOH_ROW]);
        setHighlightedRowId('ooh');
        setMessages((prev) => prev.map((m) => (m.id === 'm4'
          ? { ...m, loadingLabel: undefined, content: 'Done — OOH Billboards added, $20,000 for the month.' }
          : m)));

        await sleep(1500);
        if (!active) return;
        setHighlightedRowId(null);

        await sleep(2400);
        if (!active) return;
        setFading(true);
        await sleep(400);
      }
    }

    run();
    return () => { active = false; };
  }, []);

  const isEmpty = messages.length === 0;
  const totalSpend = rows.reduce((sum, r) => sum + r.amount, 0);

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
        {/* Media plan grid */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
          <div className="flex items-baseline justify-between px-0.5">
            <span className="text-[11px] font-semibold" style={{ color: '#1C1917' }}>2026 Media Plan</span>
            <span className="text-[10px]" style={{ color: '#8A8578' }}>Total: {formatCurrency(totalSpend)}</span>
          </div>
          <svg viewBox={`0 0 ${GRID_WIDTH} ${GRID_HEIGHT}`} fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
            <rect width={GRID_WIDTH} height={GRID_HEIGHT} rx="10" fill="#FDFCF8" />

            {/* Header bar */}
            <rect x="0" y="0" width={GRID_WIDTH} height={HEADER_HEIGHT} rx="10" fill="#1C1917" />
            <rect x="0" y={HEADER_HEIGHT - 10} width={GRID_WIDTH} height="10" fill="#1C1917" />
            <text x="10" y={HEADER_HEIGHT / 2 + 4} fill="#F5F3EF" fontSize="9" fontWeight="700" fontFamily="sans-serif" letterSpacing="1">
              CHANNEL
            </text>
            {MONTHS.map((month, mi) => {
              const monthX = START_X + mi * 4 * COL_WIDTH;
              const monthW = 4 * COL_WIDTH;
              return (
                <g key={month}>
                  <text x={monthX + monthW / 2} y={HEADER_HEIGHT / 2 + 4} textAnchor="middle" fill="#F5F3EF" fontSize="9.5" fontWeight="700" fontFamily="sans-serif" letterSpacing="1">
                    {month}
                  </text>
                  {mi > 0 && <line x1={monthX} y1="0" x2={monthX} y2={GRID_HEIGHT} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />}
                </g>
              );
            })}

            {/* Rows */}
            {Array.from({ length: TOTAL_SLOTS }).map((_, i) => {
              const y = HEADER_HEIGHT + i * ROW_HEIGHT;
              const row = rows[i];
              return row ? (
                <MediaPlanRow key={row.id} row={row} y={y} alt={i % 2 === 0} highlighted={highlightedRowId === row.id} />
              ) : (
                <EmptyRow key={`empty-${i}`} y={y} />
              );
            })}

            {/* Row dividers */}
            {Array.from({ length: TOTAL_SLOTS }).map((_, i) => (
              <line key={i} x1="0" y1={HEADER_HEIGHT + (i + 1) * ROW_HEIGHT} x2={GRID_WIDTH} y2={HEADER_HEIGHT + (i + 1) * ROW_HEIGHT} stroke="#E8E4DC" strokeWidth="0.5" />
            ))}

            {/* Vertical grid lines for weeks */}
            {Array.from({ length: NUM_WEEKS + 1 }).map((_, i) => (
              <line key={i} x1={START_X + i * COL_WIDTH} y1={HEADER_HEIGHT} x2={START_X + i * COL_WIDTH} y2={GRID_HEIGHT} stroke="#E8E4DC" strokeWidth="0.5" />
            ))}

            <rect x="0.5" y="0.5" width={GRID_WIDTH - 1} height={GRID_HEIGHT - 1} rx="9.5" fill="none" stroke="#E8E4DC" strokeWidth="1" />
          </svg>
        </div>

        {/* Chat column */}
        <div className="flex-shrink-0 flex flex-col" style={{ width: 190 }}>
          <div ref={threadRef} className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
            {isEmpty ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-1">
                <CalendarRange size={18} style={{ color: AGENT_RUST }} />
                <p className="text-[10.5px] leading-snug" style={{ color: '#8A8578' }}>
                  Ask to add a channel, adjust budgets, or extend a flight.
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
                      {msg.content ? (
                        msg.content
                      ) : msg.loadingLabel ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-400">{msg.loadingLabel}</span>
                          <Dots color="#CC785C" />
                        </span>
                      ) : null}
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
                {isEmpty && <div className="mediaPlanDemoGlowSpin" />}
                <div style={{ background: '#FFFFFF', borderRadius: 16.5, padding: '10px 10px 8px', position: 'relative', zIndex: 1 }}>
                  <div style={{ fontSize: 11, color: '#9CA3AF', minHeight: 16 }}>Ask about this plan…</div>
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
        .mediaPlanDemoGlowSpin {
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
          animation: mediaPlanDemoGlowOrbit 4s linear infinite, mediaPlanDemoGlowPulse 9s ease-in-out 1s infinite;
        }
        @keyframes mediaPlanDemoGlowOrbit { to { transform: rotate(360deg); } }
        @keyframes mediaPlanDemoGlowPulse {
          0%, 100% { opacity: 0; }
          8%, 50% { opacity: 1; }
          58%, 95% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
