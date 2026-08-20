'use client';

import { useState, useRef, useEffect } from 'react';
import type { HealthScoreResult } from '@/lib/utils/health-score';
import { PerformanceWidget, type PerfData } from '@/components/agency/PerformanceWidget';
import { Mail, Share2, Monitor, LayoutTemplate, Upload } from 'lucide-react';
import { getChannelLogo } from '@/lib/utils/channel-icons';

interface AccountManager {
  id: string;
  name: string;
  email: string | null;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface LiveChannel {
  id: string;
  name: string;
  type: string;
  platform?: string;
  hasSpend?: boolean;
}

export interface HeroHealthSectionProps {
  clientId: string;
  client: {
    name: string;
    notes?: string;
    logo_url?: string;
    account_manager?: string;
  };
  healthScore: HealthScoreResult;
  currentSpend: number;
  totalBudget: number;
  daysRemaining: number;
  completionPercentage: number;
  daysUntilStart?: number;
  actionItemsCount: {
    urgent: number;
    thisWeek: number;
    completed: number;
  };
  pacingStatus: {
    percentage: number;
    variance: number;
    status: 'ahead' | 'on-track' | 'behind';
  };
  performanceStatus: {
    label: string;
    ctr: number;
    status: 'excellent' | 'good' | 'needs-attention';
  };
  planStart?: string;
  planEnd?: string;
  heroDateRange: { startDate: string; endDate: string };
  onHeroDateRangeChange: (range: { startDate: string; endDate: string }) => void;
  isLoadingScore?: boolean;
  liveChannels?: LiveChannel[];
  onChannelClick?: (channelId: string) => void;
  onAccountManagerChange?: (accountManager: string | null) => void;
  isSavingAccountManager?: boolean;
  accountManagers?: AccountManager[];
  onConnect?: () => void;
  onLogoUpload?: (file: File) => void;
  isUploadingLogo?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; ring: string }> = {
  healthy:         { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', ring: '#10b981' },
  caution:         { bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   ring: '#f59e0b' },
  'at-risk':       { bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     ring: '#ef4444' },
  ahead:           { bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     ring: '#ef4444' },
  'on-track':      { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', ring: '#10b981' },
  behind:          { bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     ring: '#ef4444' },
  excellent:       { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', ring: '#10b981' },
  good:            { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',    ring: '#3b82f6' },
  'needs-attention': { bg: 'bg-amber-50',  text: 'text-amber-700',   border: 'border-amber-200',   ring: '#f59e0b' },
};

function getLiveChannelColor(type: string, platform?: string): string {
  if (type === 'paid_digital') {
    if (platform === 'meta-ads') return '#1877F2';
    if (platform === 'google-ads') return '#4285F4';
    if (platform === 'tiktok-ads') return '#010101';
    if (platform === 'linkedin-ads') return '#0A66C2';
    if (platform === 'snapchat-ads') return '#FFFC00';
    if (platform === 'pinterest-ads') return '#E60023';
    return '#6366f1';
  }
  if (type === 'organic_social') return '#7C3AED';
  if (type === 'edm') return '#EA580C';
  if (type === 'ooh') return '#0369A1';
  if (type === 'display_native') return '#0891B2';
  return '#9CA3AF';
}

function ChannelIcon({ type, platform }: { type: string; platform?: string }) {
  const s = 16;
  if (type === 'paid_digital') {
    const knownPlatforms = ['meta-ads', 'google-ads', 'tiktok-ads', 'linkedin-ads', 'snapchat-ads', 'pinterest-ads', 'reddit-ads'];
    if (platform && knownPlatforms.includes(platform)) {
      return getChannelLogo(platform, 'w-4 h-4');
    }
    // Generic paid digital
    return <LayoutTemplate size={s} color="#6366f1" />;
  }
  if (type === 'organic_social') return <Share2 size={s} color="#7C3AED" />;
  if (type === 'edm') return <Mail size={s} color="#EA580C" />;
  if (type === 'ooh') return <Monitor size={s} color="#0369A1" />;
  if (type === 'display_native') return <LayoutTemplate size={s} color="#0891B2" />;
  return <LayoutTemplate size={s} color="#9CA3AF" />;
}

function Badge({ status, label }: { status: string; label: string }) {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS['caution'];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${colors.bg} ${colors.text} ${colors.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full`} style={{ backgroundColor: colors.ring }} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Health Score Ring (SVG conic-gradient via stroke-dasharray trick)
// ---------------------------------------------------------------------------

function HealthRing({ score, status, perf, loading, scale = 1 }: {
  score: number;
  status: HealthScoreResult['status'];
  perf?: PerfData | null;
  loading?: boolean;
  scale?: number;
}) {
  const W = 144, H = 96;
  const sw = 10;
  const r = 62;
  const cx = W / 2;
  const cy = 70;

  if (loading) {
    const W = 144, H = 96, sw = 10, r = 62, cx = 72, cy = 70;
    const spinR = 9;
    const spinCx = cx, spinCy = cy + 20;
    const spinCircumference = 2 * Math.PI * spinR;
    const spinDash = spinCircumference * 0.28;
    const spinGap = spinCircumference - spinDash;
    return (
      <svg width={W * scale} height={H * scale} viewBox={`0 0 ${W} ${H}`} style={{ fontFamily: "'DM Sans', system-ui, sans-serif", display: 'block' }}>
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#e5e7eb" strokeWidth={sw} strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={cx - r + sw / 2 + 4} y2={cy} stroke="#d1d5db" strokeWidth={2} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={4.5} fill="#d1d5db" />
        {/* Spinner */}
        <circle cx={spinCx} cy={spinCy} r={spinR} fill="none" stroke="#e5e7eb" strokeWidth={2.5} />
        <circle cx={spinCx} cy={spinCy} r={spinR} fill="none" stroke="#f97316" strokeWidth={2.5}
          strokeDasharray={`${spinDash.toFixed(2)} ${spinGap.toFixed(2)}`} strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate"
            from={`0 ${spinCx} ${spinCy}`} to={`360 ${spinCx} ${spinCy}`}
            dur="0.8s" repeatCount="indefinite" />
        </circle>
      </svg>
    );
  }

  const usePerf = !!(perf?.hasData);
  const needle = usePerf ? perf!.needle : score / 100;
  const ringColor = usePerf ? perf!.color : '#d1d5db';
  const needleColor = usePerf ? '#374151' : '#d1d5db';
  const centerLabel = usePerf ? perf!.actualLabel : '—';
  const centerColor = usePerf ? '#1C1917' : '#d1d5db';
  const subLabel = usePerf
    ? perf!.metric.toUpperCase()
    : (status === 'healthy' ? 'Healthy' : status === 'caution' ? 'Caution' : 'At Risk');
  const subLabelColor = usePerf ? ringColor : '#d1d5db';

  const s = Math.min(0.998, Math.max(0.002, needle));
  const rad = Math.PI * (1 - s);
  const ex = cx + r * Math.cos(rad);
  const ey = cy - r * Math.sin(rad);
  const nLen = r - sw / 2 - 4;
  const nx = cx + nLen * Math.cos(rad);
  const ny = cy - nLen * Math.sin(rad);

  const ticks = [0, 33, 67, 100].map(v => {
    const tr = Math.PI * (1 - Math.min(0.999, Math.max(0.001, v / 100)));
    const inner = r - sw / 2 - 2;
    const outer = r + sw / 2 + 3;
    return {
      x1: cx + inner * Math.cos(tr), y1: cy - inner * Math.sin(tr),
      x2: cx + outer * Math.cos(tr), y2: cy - outer * Math.sin(tr),
    };
  });

  return (
    <svg
      width={W * scale} height={H * scale}
      viewBox={`0 0 ${W} ${H}`}
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif", display: 'block' }}
    >
      {/* Track */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="#e5e7eb" strokeWidth={sw} strokeLinecap="round"
      />
      {/* Coloured fill */}
      {needle > 0.005 && (
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${ex} ${ey}`}
          fill="none" stroke={ringColor} strokeWidth={sw} strokeLinecap="round"
          style={{ transition: 'all 0.5s ease' }}
        />
      )}
      {/* Zone tick marks */}
      {ticks.map((t, i) => (
        <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="#d1d5db" strokeWidth={1.5} strokeLinecap="round" />
      ))}
      {/* End labels (only shown without perf data) */}
      {!usePerf && (
        <>
          <text x={cx - r - 6} y={cy + 12} textAnchor="end" fontSize={8} fill="#9ca3af">0</text>
          <text x={cx + r + 6} y={cy + 12} textAnchor="start" fontSize={8} fill="#9ca3af">100</text>
        </>
      )}
      {/* Needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={needleColor} strokeWidth={2} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={4.5} fill={needleColor} />
      {/* Center value */}
      <text x={cx} y={cy + 24} textAnchor="middle" fontSize={20} fontWeight="700" fill={centerColor}>{centerLabel}</text>
      {/* Sub-label */}
      <text
        x={cx} y={cy + 33}
        textAnchor="middle" fontSize={9} fontWeight="600" fill={subLabelColor}
        style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}
      >{subLabel}</text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Metric Card
// ---------------------------------------------------------------------------

interface MetricCardProps {
  title: string;
  value: string;
  sub?: string;
  badge?: { status: string; label: string };
  progress?: { value: number; max: number; color: string };
  children?: React.ReactNode;
}

function MetricCard({ title, value, sub, badge, progress, children }: MetricCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col gap-2">
      <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">{title}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        {badge && <Badge status={badge.status} label={badge.label} />}
      </div>
      {sub && <p className="text-sm text-gray-500">{sub}</p>}
      {progress && (
        <div className="mt-1">
          <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, (progress.value / progress.max) * 100)}%`,
                backgroundColor: progress.color,
              }}
            />
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Info button + tooltip for the chart header
// ---------------------------------------------------------------------------

function InfoButton({ showInfo, setShowInfo, infoRef }: {
  showInfo: boolean;
  setShowInfo: (v: boolean) => void;
  infoRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div className="relative flex-shrink-0" ref={infoRef}>
      <button
        onClick={() => setShowInfo(!showInfo)}
        className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 text-[9px] font-bold flex items-center justify-center hover:border-gray-400 hover:text-gray-600 transition-colors leading-none"
        aria-label="How this chart is calculated"
      >
        i
      </button>
      {showInfo && (
        <div className="absolute right-0 top-5 w-60 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-50 text-[11px] text-gray-600 leading-relaxed">
          <p className="font-semibold text-gray-800 mb-2">How this chart works</p>
          <p><span className="font-medium text-gray-700">Each point</span> shows the 7-day rolling average — total spend ÷ total conversions over the trailing 7 days. This smooths out noisy single-day spikes.</p>
          <p className="mt-1.5"><span className="font-medium text-gray-700">Speedometer</span> shows the latest completed 7-day rolling value vs your target.</p>
          <p className="mt-1.5"><span className="font-medium text-gray-700">Arrow badge</span> compares today's rolling value to yesterday's rolling value — a stable 24h signal.</p>
          <p className="mt-1.5"><span className="font-medium text-gray-700">Historical points</span> are locked in once the day closes and will never change.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Build separate area paths for above/below-target regions.
// Each segment extends all the way to the chart bottom so red and green
// never bleed into each other's columns.
// ---------------------------------------------------------------------------

function buildSplitAreaPaths(
  pts: { x: number; y: number }[],
  targetY: number,
  bottom: number
): { redPath: string; greenPath: string } {
  if (pts.length === 0) return { redPath: '', greenPath: '' };

  const isAbove = (p: { x: number; y: number }) => p.y < targetY;

  function crossX(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    if (p2.y === p1.y) return p1.x;
    return p1.x + ((targetY - p1.y) / (p2.y - p1.y)) * (p2.x - p1.x);
  }

  // Insert crossing points at target-line transitions
  const aug: { x: number; y: number; above: boolean }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i > 0) {
      const prev = pts[i - 1];
      if (isAbove(prev) !== isAbove(p)) {
        const cx = crossX(prev, p);
        aug.push({ x: cx, y: targetY, above: isAbove(prev) });
        aug.push({ x: cx, y: targetY, above: isAbove(p) });
      }
    }
    aug.push({ x: p.x, y: p.y, above: isAbove(p) });
  }

  function buildPath(wantAbove: boolean): string {
    let d = '';
    let seg: { x: number; y: number }[] = [];

    const flush = () => {
      if (seg.length < 1) return;
      const f = seg[0], l = seg[seg.length - 1];
      d += `M ${f.x.toFixed(1)} ${bottom.toFixed(1)} L ${f.x.toFixed(1)} ${f.y.toFixed(1)}`;
      for (let i = 1; i < seg.length; i++) d += ` L ${seg[i].x.toFixed(1)} ${seg[i].y.toFixed(1)}`;
      d += ` L ${l.x.toFixed(1)} ${bottom.toFixed(1)} Z `;
      seg = [];
    };

    for (const p of aug) {
      if (p.above === wantAbove) seg.push(p);
      else flush();
    }
    flush();
    return d.trim();
  }

  return { redPath: buildPath(true), greenPath: buildPath(false) };
}

// ---------------------------------------------------------------------------
// Perf Sparkline — 30-day rolling metric time series for the hero card
// ---------------------------------------------------------------------------

function PerfSparkline({ clientId, perf, perfLoading, onConnect }: { clientId: string; perf: PerfData | null; perfLoading?: boolean; onConnect?: () => void }) {
  const [series, setSeries] = useState<Array<{ date: string; value: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!perf?.metric) return;
    let config: { platform?: string; campaignIds?: string[]; metaActionType?: string } = {};
    try {
      const raw = localStorage.getItem(`perf_widget_${clientId}`);
      if (raw) config = JSON.parse(raw);
    } catch {}

    const params = new URLSearchParams();
    params.set('metric', perf.metric);
    if (config.platform) params.set('platforms', config.platform);
    if (config.campaignIds?.length) params.set('campaignIds', config.campaignIds.join(','));
    // Prefer the value carried through PerfData (always current); fall back to localStorage
    const metaActionType = perf.metaActionType ?? config.metaActionType;
    if (metaActionType) params.set('metaActionType', metaActionType);
    // Pass the browser's local date so the server uses the client's timezone (not UTC)
    const now = new Date();
    params.set('clientDate', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);

    setLoading(true);
    fetch(`/api/clients/${clientId}/perf-series?${params}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data.series)) setSeries(data.series); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId, perf?.metric, perf?.metaActionType]);

  // ── Layout constants (shared across all render states) ──────────────────────
  const W = 300, H = 100;
  const PL = 38, PR = 12, PT = 8, PB = 22;
  const pw = W - PL - PR;
  const ph = H - PT - PB;
  const bottom = PT + ph;
  const metric = perf?.metric ?? '';

  // Skeleton SVG shell — axes + 10 Y gridlines + 30 X ticks
  const yGridLines = Array.from({ length: 10 }, (_, i) => PT + (i / 9) * ph);
  const xTicks = Array.from({ length: 30 }, (_, i) => PL + (i / 29) * pw);
  const shellSvg = (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      <line x1={PL} y1={PT} x2={PL} y2={bottom} stroke="#E5E7EB" strokeWidth={0.75} />
      <line x1={PL} y1={bottom} x2={PL + pw} y2={bottom} stroke="#E5E7EB" strokeWidth={0.75} />
      {yGridLines.map((y, i) => (
        <line key={`y${i}`} x1={PL} y1={y} x2={PL + pw} y2={y} stroke="#F3F4F6" strokeWidth={0.5} />
      ))}
      {xTicks.map((x, i) => (
        <line key={`x${i}`} x1={x} y1={bottom} x2={x} y2={bottom + 3} stroke="#E5E7EB" strokeWidth={0.75} />
      ))}
    </svg>
  );

  if (perfLoading || loading) {
    return (
      <div className="w-full">
        <style>{`
          @keyframes heroSpinLoader { to { transform: rotate(360deg); } }
        `}</style>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-300 uppercase tracking-wide font-medium">
            {metric || 'Performance'} · 7d rolling
          </span>
        </div>
        <div className="relative rounded overflow-hidden" style={{ background: '#F9FAFB' }}>
          {shellSvg}
          <div className="absolute inset-0 flex items-center justify-center">
            <svg width={32} height={32} viewBox="0 0 32 32" style={{ animation: 'heroSpinLoader 0.8s linear infinite', display: 'block' }}>
              <circle cx={16} cy={16} r={12} fill="none" stroke="#E5E7EB" strokeWidth={3} />
              <path d="M 16 4 A 12 12 0 0 1 28 16" fill="none" stroke="#6366f1" strokeWidth={3} strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  const cleanSeries = series.filter(s => s.value != null && isFinite(s.value) && !isNaN(s.value));
  const noData = !perf?.hasData || cleanSeries.length < 1;

  if (noData) {
    const hasGoal = !!(perf?.metric);
    const targetVal = perf?.targetValue;
    const targetDisplay = targetVal != null && isFinite(targetVal) && perf?.metric
      ? (() => {
          const mk = (perf.metric ?? '').toLowerCase();
          if (/ctr/.test(mk)) return `${targetVal.toFixed(1)}%`;
          if (/roas/.test(mk)) return `${targetVal.toFixed(1)}x`;
          if (/cpa|cpc|cpm|cpl/.test(mk)) return targetVal >= 100 ? `$${Math.round(targetVal)}` : `$${targetVal.toFixed(2)}`;
          return targetVal >= 1000 ? `${(targetVal / 1000).toFixed(1)}k` : String(Math.round(targetVal));
        })()
      : null;
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-300 uppercase tracking-wide font-medium">
            {metric || 'Performance'} · 7d rolling
          </span>
        </div>
        <div className="relative">
          {shellSvg}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <span className="text-[11px] font-bold tracking-widest text-gray-400 uppercase">
              {hasGoal ? 'No conversions data' : 'No Data'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const target = (perf.targetValue != null && isFinite(perf.targetValue)) ? perf.targetValue : null;
  const mk = metric.toLowerCase();
  const values = cleanSeries.map(s => s.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);

  // Y scale anchored at target (target = vertical midpoint).
  // Symmetric headroom: ±max(deviation_from_target × 1.25, target × 10%, 1).
  // Falls back to a data-padded range when no target.
  let chartMin: number, chartMax: number;
  if (target !== null) {
    chartMax = target * 1.5;
    chartMin = target * 0.5;
  } else {
    const r = (dataMax - dataMin) || Math.abs(dataMax) * 0.1 || 1;
    chartMin = dataMin - r * 0.15;
    chartMax = dataMax + r * 0.15;
  }
  if (/cpa|cpc|cpm|cpl/.test(mk) && chartMin < 0) chartMin = 0;
  const span = chartMax - chartMin || 1;

  const toX = (i: number) =>
    PL + (cleanSeries.length === 1 ? pw / 2 : (i / (cleanSeries.length - 1)) * pw);

  // Standard convention: high values at top, low values at bottom.
  const toY = (v: number) => {
    const ratio = (chartMax - v) / span;
    return PT + Math.max(0, Math.min(1, ratio)) * ph;
  };

  const pts = values.map((v, i) => ({ x: toX(i), y: toY(v) }));
  const polyPts = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const areaPath = [
    `M ${pts[0].x.toFixed(1)} ${bottom}`,
    `L ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`,
    ...pts.slice(1).map(p => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
    `L ${pts[pts.length - 1].x.toFixed(1)} ${bottom}`,
    'Z',
  ].join(' ');

  const targetY = target !== null ? toY(target) : null;

  function fmtY(v: number): string {
    if (/ctr/.test(mk)) return `${v.toFixed(1)}%`;
    if (/cpa|cpc|cpm|cpl/.test(mk)) return v >= 100 ? `$${Math.round(v)}` : `$${v.toFixed(1)}`;
    return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
  }

  // Y axis: top tick = high value, bottom tick = low value (standard convention).
  const yTicks = [
    { y: PT,      label: fmtY(chartMax) },
    { y: PT + ph, label: fmtY(chartMin) },
  ];

  // When a target exists, colour the line red above and green below.
  // Direction flips for "higher is better" metrics (ROAS, CTR, Clicks…).
  const lowerBetter = /cpa|cpc|cpm|cpl|cost/.test(metric.toLowerCase());
  const aboveColor = lowerBetter ? '#ef4444' : '#22c55e';
  const belowColor = lowerBetter ? '#22c55e' : '#ef4444';
  const hasSplit = targetY !== null;

  // Fallback single colour (used when there is no target).
  let lineColor = perf.color ?? '#6366f1';
  if (perf.trend24h) {
    const { pctChange, improving } = perf.trend24h;
    if (Math.abs(pctChange) > 3) lineColor = improving ? '#4A7C59' : '#A0442A';
    else lineColor = '#B07030';
  }

  const gradId = `sg_${clientId}`;
  const clipId = `sc_${clientId}`;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    let nearest = 0, minDist = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(p.x - svgX);
      if (d < minDist) { minDist = d; nearest = i; }
    });
    setHoverIdx(nearest);
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400 uppercase tracking-wide font-medium">{metric} · 7d rolling</span>
      </div>
      <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible', cursor: 'crosshair' }} onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIdx(null)}>
        <defs>
          {hasSplit ? (
            <>
              <linearGradient id={`${gradId}_a`} x1="0" y1={PT} x2="0" y2={bottom} gradientUnits="userSpaceOnUse">
                <stop offset="0%"   stopColor={aboveColor} stopOpacity={0.15} />
                <stop offset="100%" stopColor={aboveColor} stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id={`${gradId}_b`} x1="0" y1={PT} x2="0" y2={bottom} gradientUnits="userSpaceOnUse">
                <stop offset="0%"   stopColor={belowColor} stopOpacity={0.03} />
                <stop offset="100%" stopColor={belowColor} stopOpacity={0.15} />
              </linearGradient>
              <clipPath id={clipId}><rect x={PL} y={PT} width={pw} height={ph} /></clipPath>
              <clipPath id={`${clipId}_a`}><rect x={PL} y={PT} width={pw} height={targetY! - PT} /></clipPath>
              <clipPath id={`${clipId}_b`}><rect x={PL} y={targetY!} width={pw} height={bottom - targetY!} /></clipPath>
</>
          ) : (
            <>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={lineColor} stopOpacity={0.2} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0.01} />
              </linearGradient>
              <clipPath id={clipId}><rect x={PL} y={PT} width={pw} height={ph} /></clipPath>
            </>
          )}
        </defs>

        {/* Axes */}
        <line x1={PL} y1={PT} x2={PL} y2={bottom} stroke="#E5E7EB" strokeWidth={0.75} />
        <line x1={PL} y1={bottom} x2={PL + pw} y2={bottom} stroke="#E5E7EB" strokeWidth={0.75} />

        {/* Y axis: top + bottom ticks with short value labels */}
        {yTicks.map(({ y, label }, i) => (
          <g key={i}>
            <line x1={PL - 3} y1={y} x2={PL} y2={y} stroke="#D1D5DB" strokeWidth={0.75} />
            <text x={PL - 5} y={y + 4} textAnchor="end" fontSize={8} fill="#9CA3AF"
              fontFamily="system-ui, sans-serif">{label}</text>
          </g>
        ))}

        {/* Subtle horizontal grid lines */}
        {[PT, PT + ph / 2, bottom].map((y, i) => (
          <line key={i} x1={PL} y1={y} x2={PL + pw} y2={y} stroke="#F3F4F6" strokeWidth={0.5} />
        ))}

        {/* Target dashed line + Y-axis label */}
        {targetY !== null && (
          <>
            <line x1={PL} y1={targetY} x2={PL + pw} y2={targetY}
              stroke="#9CA3AF" strokeWidth={1} strokeDasharray="3 3" />
            <line x1={PL - 3} y1={targetY} x2={PL} y2={targetY} stroke="#D1D5DB" strokeWidth={0.75} />
            <text
              x={PL - 5}
              y={targetY + 3.5}
              textAnchor="end"
              fontSize={8}
              fill="#9CA3AF"
              fontFamily="system-ui, sans-serif"
            >
              {target !== null ? fmtY(target) : ''}
            </text>
          </>
        )}

        {/* X axis ticks + date number labels (every 5th point to avoid crowding) */}
        {cleanSeries.map((s, i) => {
          const x = toX(i);
          const d = new Date(`${s.date}T12:00:00`);
          const label = isNaN(d.getTime()) ? '' : String(d.getDate());
          const showLabel = i === 0 || i === cleanSeries.length - 1 || i % 5 === 0;
          return (
            <g key={i}>
              <line x1={x} y1={bottom} x2={x} y2={bottom + 3} stroke="#D1D5DB" strokeWidth={0.75} />
              {showLabel && (
                <text x={x} y={bottom + 14} textAnchor="middle" fontSize={8} fill="#9CA3AF"
                  fontFamily="system-ui, sans-serif">{label}</text>
              )}
            </g>
          );
        })}

        {/* Area fill — split by target when available */}
        {hasSplit ? (() => {
          const { redPath, greenPath } = buildSplitAreaPaths(pts, targetY!, bottom);
          return (
            <>
              {redPath && <path d={redPath} fill={`url(#${gradId}_a)`} clipPath={`url(#${clipId})`} />}
              {greenPath && <path d={greenPath} fill={`url(#${gradId}_b)`} clipPath={`url(#${clipId})`} />}
            </>
          );
        })() : (
          <path d={areaPath} fill={`url(#${gradId})`} clipPath={`url(#${clipId})`} />
        )}

        {/* Line — red above target, green below (or single colour when no target) */}
        {hasSplit ? (
          <>
            <polyline points={polyPts} fill="none" stroke={aboveColor}
              strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              clipPath={`url(#${clipId}_a)`} />
            <polyline points={polyPts} fill="none" stroke={belowColor}
              strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              clipPath={`url(#${clipId}_b)`} />
          </>
        ) : (
          <polyline points={polyPts} fill="none" stroke={lineColor}
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            clipPath={`url(#${clipId})`} />
        )}

        {/* Latest value dot */}
        {(() => {
          const lp = pts[pts.length - 1];
          const dotColor = hasSplit && targetY !== null
            ? (lp.y < targetY ? aboveColor : belowColor)
            : lineColor;
          return <circle cx={lp.x} cy={lp.y} r={3} fill={dotColor} />;
        })()}

        {/* Hover crosshair + tooltip */}
        {hoverIdx !== null && (() => {
          const hp = pts[hoverIdx];
          const hs = cleanSeries[hoverIdx];
          const hv = values[hoverIdx];
          const d = new Date(`${hs.date}T12:00:00`);
          const dateLabel = isNaN(d.getTime()) ? hs.date : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const valLabel = fmtY(hv);
          const tipW = 54, tipH = 30, tipPad = 6;
          const tipX = hp.x + tipPad + tipW > PL + pw ? hp.x - tipW - tipPad : hp.x + tipPad;
          const tipY = Math.max(PT, Math.min(hp.y - tipH / 2, bottom - tipH));
          const hoverColor = hasSplit && targetY !== null
            ? (hp.y < targetY ? aboveColor : belowColor)
            : lineColor;
          return (
            <g>
              <line x1={hp.x} y1={PT} x2={hp.x} y2={bottom} stroke="#9CA3AF" strokeWidth={0.75} strokeDasharray="3 2" />
              <circle cx={hp.x} cy={hp.y} r={3.5} fill="white" stroke={hoverColor} strokeWidth={1.5} />
              <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={3} fill="#1C1917" opacity={0.88} />
              <text x={tipX + tipW / 2} y={tipY + 12} textAnchor="middle" fontSize={9.5} fontWeight="700" fill="white" fontFamily="system-ui, sans-serif">{valLabel}</text>
              <text x={tipX + tipW / 2} y={tipY + 23} textAnchor="middle" fontSize={7.5} fill="#9CA3AF" fontFamily="system-ui, sans-serif">{dateLabel}</text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function HeroHealthSection({
  clientId,
  client,
  healthScore,
  currentSpend,
  totalBudget,
  daysRemaining,
  completionPercentage,
  daysUntilStart = 0,
  actionItemsCount,
  pacingStatus,
  performanceStatus,
  planStart,
  planEnd,
  heroDateRange,
  onHeroDateRangeChange,
  isLoadingScore = false,
  liveChannels,
  onChannelClick,
  onAccountManagerChange,
  isSavingAccountManager = false,
  accountManagers = [],
  onConnect,
  onLogoUpload,
  isUploadingLogo = false,
}: HeroHealthSectionProps) {
  const [showAmMenu, setShowAmMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [perfData, setPerfData] = useState<PerfData | null>(null);
  const [perfReady, setPerfReady] = useState(false);
  const [showPerfConfig, setShowPerfConfig] = useState(false);
  const [showChartInfo, setShowChartInfo] = useState(false);
  const chartInfoRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showAmMenu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowAmMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showAmMenu]);

  useEffect(() => {
    if (!showChartInfo) return;
    function handleClick(e: MouseEvent) {
      if (chartInfoRef.current && !chartInfoRef.current.contains(e.target as Node)) setShowChartInfo(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showChartInfo]);

  const handleAssignAm = (am: string | null) => {
    setShowAmMenu(false);
    onAccountManagerChange?.(am);
  };
  const spendPct = totalBudget > 0 ? (currentSpend / totalBudget) * 100 : 0;
  const spendColor = spendPct > 100 ? STATUS_COLORS['at-risk'].ring : STATUS_COLORS[healthScore.breakdown.budgetPacing.score >= 80 ? 'healthy' : healthScore.breakdown.budgetPacing.score >= 60 ? 'caution' : 'at-risk'].ring;

  const pacingVarianceLabel =
    pacingStatus.variance >= 0
      ? `+${formatPct(pacingStatus.variance)} vs plan`
      : `${formatPct(pacingStatus.variance)} vs plan`;

  // Human-readable spend pacing label for the Spend badge (no % over/under wording)
  const pacingLabel =
    pacingStatus.status === 'ahead'
      ? 'Overspending'
      : pacingStatus.status === 'behind'
        ? 'Behind plan'
        : 'On track';

  const perfLabel =
    performanceStatus.status === 'excellent' ? 'Excellent'
    : performanceStatus.status === 'good' ? 'Good'
    : 'Needs Attention';

  const urgentTotal = actionItemsCount.urgent + actionItemsCount.thisWeek;

  return (
    <div className="space-y-5">
      {/* ── Top row: client identity + spend | CPA/CTR sparkline ── */}
      <div className="bg-white rounded-xl border border-gray-200 px-7 py-6 grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6 xl:items-stretch">
        {/* Col 1: avatar + name/notes + spend row (spend text + speedometer inline) */}
        <div className="flex items-start gap-4 min-w-0">
          <div className="flex flex-col items-center gap-3 flex-shrink-0">
            {client.logo_url ? (
              <img
                src={client.logo_url}
                alt={`${client.name} logo`}
                className="w-14 h-14 rounded-full object-cover flex-shrink-0 border border-gray-200"
              />
            ) : onLogoUpload ? (
              <>
                <button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={isUploadingLogo}
                  title="Upload client logo"
                  className="w-14 h-14 rounded-full bg-gray-100 flex-shrink-0 flex flex-col items-center justify-center border border-dashed border-gray-300 hover:border-indigo-400 hover:bg-indigo-50 transition-all group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploadingLogo ? (
                    <svg className="animate-spin w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <Upload size={16} className="text-gray-400 group-hover:text-indigo-500 transition-colors" />
                  )}
                </button>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) onLogoUpload(file);
                    e.target.value = '';
                  }}
                />
                <span className="text-[10px] leading-tight text-red-600 text-center max-w-[70px]">1:1 photos only</span>
              </>
            ) : (
              <div className="w-14 h-14 rounded-full bg-gray-100 flex-shrink-0 flex items-center justify-center border border-gray-200">
                <span className="text-xl font-bold text-gray-400 select-none">
                  {client.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold truncate mb-1" style={{ color: '#1C1917', fontFamily: "'Inter', system-ui, sans-serif" }}>{client.name}</h1>
            {client.notes && (
              <p className="text-base text-gray-500 line-clamp-1">{client.notes}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {onAccountManagerChange && (
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setShowAmMenu(v => !v)}
                    disabled={isSavingAccountManager}
                    title="Assign account manager"
                    className={`text-xs font-medium px-2 py-1 rounded border transition-colors ${
                      client.account_manager
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-dashed border-gray-300 bg-transparent text-gray-400'
                    } ${isSavingAccountManager ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-blue-300'}`}
                  >
                    {isSavingAccountManager ? 'Saving...' : (client.account_manager ?? 'Assign AM')}
                  </button>
                  {showAmMenu && (
                    <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[100px] overflow-hidden">
                      {accountManagers.map(am => (
                        <button
                          key={am.id}
                          onClick={() => handleAssignAm(am.name)}
                          className={`block w-full text-left px-3 py-2 text-sm transition-colors ${
                            client.account_manager === am.name
                              ? 'bg-blue-50 text-blue-700 font-semibold'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {am.name}
                        </button>
                      ))}
                      {client.account_manager && (
                        <button
                          onClick={() => handleAssignAm(null)}
                          className="block w-full text-left px-3 py-2 text-xs text-gray-500 border-t border-gray-200 hover:bg-gray-50"
                        >
                          Unassign
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Pre-launch banner */}
            {completionPercentage <= 0 && daysUntilStart > 0 ? (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm font-medium text-gray-500">Starting in</span>
                <span className="text-sm font-bold text-blue-600">{daysUntilStart} day{daysUntilStart !== 1 ? 's' : ''}</span>
              </div>
            ) : null}
            {/* Spend */}
            <div className="mt-3 space-y-1.5" style={{ display: completionPercentage <= 0 ? 'none' : 'block' }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Spend</span>
                  <span className="text-xs text-gray-400">
                    {new Date(heroDateRange.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {' – '}
                    {new Date(heroDateRange.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-2xl font-bold text-gray-900">{formatCurrency(currentSpend)}</span>
                  <span className="text-sm text-gray-500">{formatPct(spendPct, 0)} of {formatCurrency(totalBudget)} budget</span>
                </div>
                <div className="mt-1">
                  <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, (currentSpend / Math.max(totalBudget, 1)) * 100)}%`,
                        backgroundColor: spendColor,
                      }}
                    />
                  </div>
                </div>
                {/* Media plan time progress */}
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Plan Timeline</span>
                    <span className="text-xs text-gray-400">
                      {completionPercentage >= 100
                        ? '100% completed'
                        : `${formatPct(completionPercentage, 0)} completed`}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, completionPercentage)}%`,
                        backgroundColor: '#6366f1',
                      }}
                    />
                  </div>
                  {(planStart || planEnd) && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-gray-400">
                        {planStart ? new Date(planStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                      </span>
                      <span className="text-xs text-gray-400">
                        {planEnd ? new Date(planEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                      </span>
                    </div>
                  )}
                </div>
            </div>

          </div>
        </div>

        {/* Col 2: CPA/CTR Sparkline + metric widget + speedometer */}
        <div className="min-w-0">
          <div className="relative w-full border border-gray-100 rounded-lg bg-gray-50/80 px-4 py-4">
            <PerformanceWidget clientId={clientId} onNeedle={setPerfData} onFetched={() => setPerfReady(true)} floatingGear modalOpen={showPerfConfig} onModalOpenChange={setShowPerfConfig} onConnect={onConnect} dateRange={heroDateRange} onDateRangeChange={onHeroDateRangeChange} />
            <div className="mt-3">
              <PerfSparkline clientId={clientId} perf={perfData} perfLoading={!perfReady} onConnect={() => setShowPerfConfig(true)} />
            </div>
            <div className="absolute top-2 right-2" style={{ zIndex: 20 }}>
              <InfoButton showInfo={showChartInfo} setShowInfo={setShowChartInfo} infoRef={chartInfoRef} />
            </div>
            <div className="absolute top-4 right-16 pointer-events-none flex flex-row items-center gap-2">
              {/* 24h change badge — shown to the left of the speedometer */}
              {perfData?.hasData && perfData?.trend24h && (() => {
                const { pctChange, improving } = perfData.trend24h;
                const color = improving ? '#4A7C59' : '#A0442A';
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <span style={{ fontSize: 21, lineHeight: 1, fontWeight: 800, color }}>
                      {pctChange < 0 ? '↓' : '↑'}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.1, color }}>
                      {Math.abs(pctChange).toFixed(1)}%
                    </span>
                    <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      24h
                    </span>
                  </div>
                );
              })()}
              {/* Speedometer */}
              <div className="flex flex-col items-center">
                <HealthRing score={healthScore.overallScore} status={healthScore.status} perf={perfData} loading={isLoadingScore || !perfReady} scale={0.6} />
                {perfData?.hasData && (
                  <p className="text-[10px] font-bold text-center leading-tight mt-0.5" style={{ color: perfData.color }}>
                    {perfData.metric.toUpperCase()}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
