'use client';

import { useState, useRef, useEffect } from 'react';
import type { HealthScoreResult } from '@/lib/utils/health-score';
import { PerformanceWidget, type PerfData } from '@/components/agency/PerformanceWidget';
import { Mail, Share2, Monitor, LayoutTemplate, Upload } from 'lucide-react';

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
    if (platform === 'meta-ads') return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="#1877F2" aria-label="Meta">
        <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06c0 5 3.66 9.15 8.44 9.9v-7h-2.54v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04z"/>
      </svg>
    );
    if (platform === 'google-ads') return (
      <svg width={s} height={s} viewBox="0 0 24 24" aria-label="Google">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    );
    if (platform === 'tiktok-ads') return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-label="TikTok">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.34 6.34 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z"/>
      </svg>
    );
    if (platform === 'linkedin-ads') return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="#0A66C2" aria-label="LinkedIn">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    );
    if (platform === 'snapchat-ads') return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="#FFFC00" stroke="#555" strokeWidth="0.3" aria-label="Snapchat">
        <path d="M12.166 2C9.445 2 7.09 3.78 6.558 6.396l-.203 1.038-.98-.528C4.9 6.572 4.397 6.5 4 6.5c-.827 0-1.5.673-1.5 1.5 0 .698.478 1.3 1.14 1.47l1.32.343-.614 1.08C3.55 12.086 3 13.337 3 14.5c0 .828.448 1.5 1 1.5.163 0 .434-.06.734-.197.572-.26 1.302-.59 2.193-.59.48 0 .956.089 1.408.264l.028.073c.37.998 1.24 1.922 2.564 1.922.448 0 .874-.108 1.266-.265.392.157.818.265 1.266.265 1.323 0 2.194-.924 2.564-1.922l.073-.028c.452-.175.928-.264 1.408-.264.891 0 1.62.33 2.193.59.3.137.571.197.734.197.552 0 1-.672 1-1.5 0-1.163-.55-2.414-1.346-3.607l-.614-1.08 1.32-.343C21.522 9.3 22 8.698 22 8c0-.827-.673-1.5-1.5-1.5-.397 0-.9.072-1.375.406l-.98.528-.203-1.038C17.41 3.78 15.055 2 12.334 2h-.168z"/>
      </svg>
    );
    if (platform === 'pinterest-ads') return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="#E60023" aria-label="Pinterest">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
      </svg>
    );
    if (platform === 'reddit-ads') return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="#FF4500" aria-label="Reddit">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
      </svg>
    );
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
    return (
      <svg width={W * scale} height={H * scale} viewBox={`0 0 ${W} ${H}`} style={{ fontFamily: "'DM Sans', system-ui, sans-serif", display: 'block' }}>
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#e5e7eb" strokeWidth={sw} strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={cx - r + sw / 2 + 4} y2={cy} stroke="#d1d5db" strokeWidth={2} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={4.5} fill="#d1d5db" />
        <rect x={cx - 14} y={cy + 12} width={28} height={14} rx={3} fill="#e5e7eb" className="animate-pulse" />
        <rect x={cx - 16} y={cy + 28} width={32} height={8} rx={2} fill="#f3f4f6" className="animate-pulse" />
      </svg>
    );
  }

  const usePerf = !!(perf?.hasData);
  const needle = usePerf ? perf!.needle : score / 100;
  const ringColor = usePerf ? perf!.color : (STATUS_COLORS[status]?.ring ?? '#f59e0b');
  const centerLabel = usePerf ? perf!.actualLabel : String(Math.round(score));
  const subLabel = usePerf
    ? perf!.metric.toUpperCase()
    : (status === 'healthy' ? 'Healthy' : status === 'caution' ? 'Caution' : 'At Risk');

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
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#374151" strokeWidth={2} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={4.5} fill="#374151" />
      {/* Center value */}
      <text x={cx} y={cy + 24} textAnchor="middle" fontSize={20} fontWeight="700" fill="#1C1917">{centerLabel}</text>
      {/* Sub-label */}
      <text
        x={cx} y={cy + 33}
        textAnchor="middle" fontSize={9} fontWeight="600" fill={ringColor}
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
// Perf Sparkline — MTD running metric time series for the hero card
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
    if (config.metaActionType) params.set('metaActionType', config.metaActionType);

    setLoading(true);
    fetch(`/api/clients/${clientId}/perf-series?${params}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data.series)) setSeries(data.series); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId, perf?.metric]);

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
            {metric || 'Performance'} · {/cpa|cpl/i.test(metric) ? 'MTD' : '30 day'}
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
    // Distinguish: goal exists but no actuals (platform issue) vs no goal at all
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
            {metric || 'Performance'} · {/cpa|cpl/i.test(metric) ? 'MTD' : '30 day'}
          </span>
          {targetDisplay && (
            <span className="text-xs text-gray-400">Target: {targetDisplay}</span>
          )}
        </div>
        <div className="relative">
          {shellSvg}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <span className="text-[11px] font-bold tracking-widest text-gray-400 uppercase">
              {hasGoal ? 'No conversions data' : 'No Data'}
            </span>
            <button
              onClick={() => onConnect?.()}
              className="text-[10px] font-semibold px-3 py-1 rounded-full bg-gray-800 text-white hover:bg-gray-600 transition-colors cursor-pointer"
            >
              {hasGoal ? 'Configure event' : 'Connect'}
            </button>
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
        <span className="text-xs text-gray-400 uppercase tracking-wide font-medium">{metric} · {/cpa|cpl/i.test(metric) ? 'MTD' : '30 day'}</span>
      </div>
      <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible', cursor: 'crosshair' }} onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIdx(null)}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={lineColor} stopOpacity={0.2} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0.01} />
          </linearGradient>
          <clipPath id={clipId}>
            <rect x={PL} y={PT} width={pw} height={ph} />
          </clipPath>
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

        {/* Target dashed line — always at vertical midpoint */}
        {targetY !== null && (
          <>
            <line x1={PL} y1={targetY} x2={PL + pw} y2={targetY}
              stroke="#9CA3AF" strokeWidth={1} strokeDasharray="3 3" />
            <text
              x={PL + pw}
              y={targetY - 3}
              textAnchor="end"
              fontSize={7.5}
              fill="#9CA3AF"
              fontFamily="system-ui, sans-serif"
            >
              Target {target !== null ? fmtY(target) : ''}
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

        {/* Area fill */}
        <path d={areaPath} fill={`url(#${gradId})`} clipPath={`url(#${clipId})`} />

        {/* Line */}
        <polyline points={polyPts} fill="none" stroke={lineColor}
          strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          clipPath={`url(#${clipId})`} />

        {/* Latest value dot */}
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={3} fill={lineColor} />

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
          return (
            <g>
              <line x1={hp.x} y1={PT} x2={hp.x} y2={bottom} stroke="#9CA3AF" strokeWidth={0.75} strokeDasharray="3 2" />
              <circle cx={hp.x} cy={hp.y} r={3.5} fill="white" stroke={lineColor} strokeWidth={1.5} />
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

  const hasLiveChannels = !!(liveChannels && liveChannels.length > 0);

  return (
    <div className="space-y-5">
      {/* ── Top row: [client identity + spend + speedometer] | Live Channels ── */}
      <div className="bg-white rounded-xl border border-gray-200 px-7 py-6 grid grid-cols-1 xl:grid-cols-[5fr_5fr_2fr] gap-6 xl:items-stretch">
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
            <PerformanceWidget clientId={clientId} onNeedle={setPerfData} onFetched={() => setPerfReady(true)} floatingGear modalOpen={showPerfConfig} onModalOpenChange={setShowPerfConfig} />
            <div className="mt-3">
              <PerfSparkline clientId={clientId} perf={perfData} perfLoading={!perfReady} onConnect={() => setShowPerfConfig(true)} />
            </div>
            <div className="absolute top-4 right-4 pointer-events-none flex flex-row items-center gap-2">
              {/* 24h change badge — shown to the left of the speedometer */}
              {perfData?.hasData && perfData?.trend24h && (() => {
                const { pctChange, improving } = perfData.trend24h;
                const color = improving ? '#4A7C59' : '#A0442A';
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <span style={{ fontSize: 18, lineHeight: 1, fontWeight: 800, color }}>
                      {pctChange < 0 ? '↓' : '↑'}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.1, color }}>
                      {Math.abs(pctChange).toFixed(1)}%
                    </span>
                    <span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      24h
                    </span>
                  </div>
                );
              })()}
              {/* Speedometer */}
              <div className="flex flex-col items-center">
                <HealthRing score={healthScore.overallScore} status={healthScore.status} perf={perfData} loading={isLoadingScore} scale={0.6} />
                {perfData?.hasData && (
                  <p className="text-[10px] font-bold text-center leading-tight mt-0.5" style={{ color: perfData.color }}>
                    {perfData.metric.toUpperCase()}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Col 3: Live Channels — absolutely positioned so it never contributes to row height */}
        {hasLiveChannels && (
          <div className="min-w-0 relative">
            <div className="absolute inset-0 border border-gray-100 rounded-lg bg-gray-50/80 px-4 pt-4 pb-0 flex flex-col overflow-hidden">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex-shrink-0">Live Channels</p>
              <div className="relative flex-1 min-h-0">
                <div className="flex flex-col gap-2 overflow-y-auto h-full pr-0.5">
                  {liveChannels!.map(ch => (
                    <button
                      key={ch.id}
                      onClick={() => onChannelClick?.(ch.id)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-200 transition-all text-sm font-medium text-gray-700 cursor-pointer flex-shrink-0"
                    >
                      <span className="flex-shrink-0">
                        <ChannelIcon type={ch.type} platform={ch.platform} />
                      </span>
                      <span className="flex-1 text-left truncate">{ch.name}</span>
                      <span
                        className="flex-shrink-0 w-2 h-2 rounded-full"
                        style={{ backgroundColor: ch.hasSpend ? '#10b981' : '#ef4444' }}
                        title={ch.hasSpend ? 'Spend registered' : 'No spend registered'}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
