'use client';

import { useEffect, useRef, useState } from 'react';
import { BarChart2, ArrowUp } from 'lucide-react';

// Same visual language and side-by-side layout as MediaPlanEditorDemo
// (src/components/features/MediaPlanEditorDemo.tsx) — chat thread alongside a
// live SVG remake of performance.png, so edits/answers are visible as they happen.
const AGENT_RUST = '#A0442A';

interface DemoMessage {
  id: string;
  role: 'user' | 'assistant';
  content?: string;
  loadingLabel?: string;
}

type MetricId = 'cpc' | 'ctr' | 'conv';

interface MetricLine {
  id: MetricId;
  label: string;
  color: string;
  fill: string;
  values: number[]; // normalised 0-1, one per x position
}

const X_LABELS = ['Aug 26', 'Aug 29', 'Sep 1', 'Sep 4', 'Sep 7'];
const LABEL_INDICES = [0, 2, 4, 6, 8];
const N_POINTS = 9;

const METRICS: MetricLine[] = [
  { id: 'cpc', label: 'CPC', color: '#F59E0B', fill: '#FDE68A', values: [0.42, 0.66, 0.82, 0.62, 0.52, 0.72, 0.30, 0.46, 0.24] },
  { id: 'ctr', label: 'CTR', color: '#7C6FEB', fill: '#C7C2F7', values: [0.55, 0.40, 0.32, 0.46, 0.30, 0.20, 0.28, 0.58, 0.88] },
  { id: 'conv', label: 'Conv', color: '#10B981', fill: '#A7F3D0', values: [0.48, 0.74, 0.52, 0.22, 0.18, 0.60, 0.22, 0.32, 0.10] },
];

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

// ─── Chart geometry ───
const CHART_W = 400;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 10;
const PLOT_H = 150;
const AXIS_LABEL_SPACE = 22;
const CHART_H = PAD_T + PLOT_H + AXIS_LABEL_SPACE;
const BASELINE_Y = PAD_T + PLOT_H;
const PLOT_W = CHART_W - PAD_L - PAD_R;
const STEP_X = PLOT_W / (N_POINTS - 1);

const xAt = (i: number) => PAD_L + i * STEP_X;
const yAt = (v: number) => PAD_T + (1 - v) * PLOT_H;

// Catmull-Rom -> cubic Bezier smoothing (tension 1/6), same technique most chart libs use.
function smoothPath(points: [number, number][]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 === points.length ? i + 1 : i + 2];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function areaPath(points: [number, number][]): string {
  const line = smoothPath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last[0]},${BASELINE_Y} L ${first[0]},${BASELINE_Y} Z`;
}

function MetricPath({ metric, highlighted }: { metric: MetricLine; highlighted: boolean }) {
  const points: [number, number][] = metric.values.map((v, i) => [xAt(i), yAt(v)]);
  const linePath = smoothPath(points);
  const fillPath = areaPath(points);
  const gradId = `perfDemoGrad-${metric.id}`;

  return (
    <g className="animate-in fade-in duration-500">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={metric.fill} stopOpacity="0.55" />
          <stop offset="100%" stopColor={metric.fill} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradId})`} stroke="none" />
      {/* Highlight halo — fades out after the line has just been added */}
      <path
        d={linePath}
        fill="none"
        stroke={metric.color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity: highlighted ? 0.35 : 0, transition: 'opacity 900ms ease-out' }}
      />
      <path d={linePath} fill="none" stroke={metric.color} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={highlighted ? 3.4 : 2.8} fill={metric.color} style={{ transition: 'r 300ms ease-out' }} />
      ))}
    </g>
  );
}

export default function PerformanceAnalystDemo() {
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [activeMetrics, setActiveMetrics] = useState<MetricId[]>(['cpc']);
  const [highlightedMetric, setHighlightedMetric] = useState<MetricId | null>(null);
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
        setActiveMetrics(['cpc', 'ctr', 'conv']);
        setMessages([
          { id: 'm1', role: 'user', content: 'How is CTR looking?' },
          { id: 'm2', role: 'assistant', content: "CTR dipped mid-week but's climbing back — now at 4.1%, trending up." },
          { id: 'm3', role: 'user', content: 'Are our conversions tracking well?' },
          { id: 'm4', role: 'assistant', content: 'Conversions dipped early September but have recovered — pacing 12% ahead of last week.' },
        ]);
        return;
      }

      while (active) {
        setFading(false);
        setMessages([]);
        setActiveMetrics(['cpc']);
        setHighlightedMetric(null);
        await sleep(1500);
        if (!active) return;

        setMessages([{ id: 'm1', role: 'user', content: 'How is CTR looking?' }]);

        await sleep(450);
        if (!active) return;
        setMessages((prev) => [...prev, { id: 'm2', role: 'assistant', loadingLabel: 'Thinking…' }]);

        await sleep(600);
        if (!active) return;
        setMessages((prev) => prev.map((m) => (m.id === 'm2' ? { ...m, loadingLabel: 'Pulling CTR data…' } : m)));

        await sleep(650);
        if (!active) return;
        setActiveMetrics((prev) => [...prev, 'ctr']);
        setHighlightedMetric('ctr');
        setMessages((prev) => prev.map((m) => (m.id === 'm2'
          ? { ...m, loadingLabel: undefined, content: "CTR dipped mid-week but's climbing back — now at 4.1%, trending up." }
          : m)));

        await sleep(1500);
        if (!active) return;
        setHighlightedMetric(null);

        await sleep(1100);
        if (!active) return;
        setMessages((prev) => [...prev, { id: 'm3', role: 'user', content: 'Are our conversions tracking well?' }]);

        await sleep(450);
        if (!active) return;
        setMessages((prev) => [...prev, { id: 'm4', role: 'assistant', loadingLabel: 'Thinking…' }]);

        await sleep(600);
        if (!active) return;
        setMessages((prev) => prev.map((m) => (m.id === 'm4' ? { ...m, loadingLabel: 'Pulling conversion data…' } : m)));

        await sleep(650);
        if (!active) return;
        setActiveMetrics((prev) => [...prev, 'conv']);
        setHighlightedMetric('conv');
        setMessages((prev) => prev.map((m) => (m.id === 'm4'
          ? { ...m, loadingLabel: undefined, content: 'Conversions dipped early September but have recovered — pacing 12% ahead of last week.' }
          : m)));

        await sleep(1500);
        if (!active) return;
        setHighlightedMetric(null);

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
        {/* Performance chart */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
          <div className="flex items-center justify-between gap-2 flex-wrap px-0.5">
            <div className="flex items-center gap-1.5">
              {METRICS.map((m) => {
                const isActive = activeMetrics.includes(m.id);
                return (
                  <span
                    key={m.id}
                    className="rounded-full text-[10px] font-semibold px-2.5 py-1 transition-colors duration-500"
                    style={{
                      background: isActive ? m.color : '#FFFFFF',
                      color: isActive ? '#FFFFFF' : '#8A8578',
                      border: `1px solid ${isActive ? m.color : '#E8E4DC'}`,
                    }}
                  >
                    {m.label}
                  </span>
                );
              })}
            </div>
            <span className="text-[9px]" style={{ color: '#A8A296' }}>Relative scale</span>
          </div>

          <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
            <rect width={CHART_W} height={CHART_H} rx="10" fill="#FDFCF8" />
            <rect x="0.5" y="0.5" width={CHART_W - 1} height={CHART_H - 1} rx="9.5" fill="none" stroke="#E8E4DC" strokeWidth="1" />

            {/* Gridlines + x-axis labels */}
            {LABEL_INDICES.map((i, li) => (
              <g key={i}>
                <line x1={xAt(i)} y1={PAD_T} x2={xAt(i)} y2={BASELINE_Y} stroke="#E8E4DC" strokeWidth="0.75" strokeDasharray="3 3" />
                <text x={xAt(i)} y={BASELINE_Y + 15} textAnchor="middle" fill="#A8A296" fontSize="8" fontFamily="sans-serif">
                  {X_LABELS[li]}
                </text>
              </g>
            ))}
            <line x1={PAD_L} y1={BASELINE_Y} x2={CHART_W - PAD_R} y2={BASELINE_Y} stroke="#D8D3C8" strokeWidth="1" />

            {METRICS.filter((m) => activeMetrics.includes(m.id)).map((m) => (
              <MetricPath key={m.id} metric={m} highlighted={highlightedMetric === m.id} />
            ))}
          </svg>
        </div>

        {/* Chat column */}
        <div className="flex-shrink-0 flex flex-col" style={{ width: 190 }}>
          <div ref={threadRef} className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
            {isEmpty ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-1">
                <BarChart2 size={18} style={{ color: AGENT_RUST }} />
                <p className="text-[10.5px] leading-snug" style={{ color: '#8A8578' }}>
                  Ask about pacing, variance, or any metric on this chart.
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
                {isEmpty && <div className="perfDemoGlowSpin" />}
                <div style={{ background: '#FFFFFF', borderRadius: 16.5, padding: '10px 10px 8px', position: 'relative', zIndex: 1 }}>
                  <div style={{ fontSize: 11, color: '#9CA3AF', minHeight: 16 }}>Ask about performance…</div>
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
        .perfDemoGlowSpin {
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
          animation: perfDemoGlowOrbit 4s linear infinite, perfDemoGlowPulse 9s ease-in-out 1s infinite;
        }
        @keyframes perfDemoGlowOrbit { to { transform: rotate(360deg); } }
        @keyframes perfDemoGlowPulse {
          0%, 100% { opacity: 0; }
          8%, 50% { opacity: 1; }
          58%, 95% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
