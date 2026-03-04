'use client';

import type { HealthScoreResult } from '@/lib/utils/health-score';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface HeroHealthSectionProps {
  client: {
    name: string;
    notes?: string;
    logo_url?: string;
  };
  healthScore: HealthScoreResult;
  currentSpend: number;
  totalBudget: number;
  daysRemaining: number;
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
  ahead:           { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',    ring: '#3b82f6' },
  'on-track':      { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', ring: '#10b981' },
  behind:          { bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     ring: '#ef4444' },
  excellent:       { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', ring: '#10b981' },
  good:            { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',    ring: '#3b82f6' },
  'needs-attention': { bg: 'bg-amber-50',  text: 'text-amber-700',   border: 'border-amber-200',   ring: '#f59e0b' },
};

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

function HealthRing({ score, status }: { score: number; status: HealthScoreResult['status'] }) {
  const size = 96;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const ringColor = STATUS_COLORS[status]?.ring ?? '#f59e0b';
  const label =
    status === 'healthy' ? 'Healthy'
    : status === 'caution' ? 'Caution'
    : 'At Risk';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Track */}
        <svg width={size} height={size} className="rotate-[-90deg]">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={strokeWidth}
          />
          {/* Progress */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference - filled}`}
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
        </svg>
        {/* Centre label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-gray-900 leading-none">{Math.round(score)}</span>
          <span className="text-xs text-gray-500 leading-none mt-0.5">/ 100</span>
        </div>
      </div>
      <Badge status={status} label={label} />
    </div>
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
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-xl font-bold text-gray-900 leading-none">{value}</p>
        {badge && <Badge status={badge.status} label={badge.label} />}
      </div>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
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
// Main Component
// ---------------------------------------------------------------------------

export default function HeroHealthSection({
  client,
  healthScore,
  currentSpend,
  totalBudget,
  daysRemaining,
  actionItemsCount,
  pacingStatus,
  performanceStatus,
}: HeroHealthSectionProps) {
  const spendPct = totalBudget > 0 ? (currentSpend / totalBudget) * 100 : 0;
  const spendColor = STATUS_COLORS[healthScore.breakdown.budgetPacing.score >= 80 ? 'healthy' : healthScore.breakdown.budgetPacing.score >= 60 ? 'caution' : 'at-risk'].ring;

  const pacingLabel =
    pacingStatus.status === 'ahead' ? 'Ahead'
    : pacingStatus.status === 'on-track' ? 'On Track'
    : 'Behind';

  const pacingVarianceLabel =
    pacingStatus.variance >= 0
      ? `+${formatPct(pacingStatus.variance)} vs plan`
      : `${formatPct(pacingStatus.variance)} vs plan`;

  const perfLabel =
    performanceStatus.status === 'excellent' ? 'Excellent'
    : performanceStatus.status === 'good' ? 'Good'
    : 'Needs Attention';

  const urgentTotal = actionItemsCount.urgent + actionItemsCount.thisWeek;

  return (
    <div className="space-y-4">
      {/* ── Top row: client identity + health ring ── */}
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-5 flex items-center justify-between gap-6">
        {/* Left: avatar + name/notes */}
        <div className="flex items-center gap-4 min-w-0">
          {client.logo_url ? (
            <img
              src={client.logo_url}
              alt={`${client.name} logo`}
              className="w-14 h-14 rounded-full object-cover flex-shrink-0 border border-gray-200"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gray-100 flex-shrink-0 flex items-center justify-center border border-gray-200">
              <span className="text-xl font-bold text-gray-400 select-none">
                {client.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{client.name}</h1>
            {client.notes && (
              <p className="text-sm text-gray-500 line-clamp-1 mt-0.5">{client.notes}</p>
            )}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-xs text-gray-400">
                {daysRemaining > 0 ? `${daysRemaining}d remaining` : 'Campaign ended'}
              </span>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-400">
                {formatCurrency(currentSpend)} of {formatCurrency(totalBudget)} spent
              </span>
            </div>
          </div>
        </div>

        {/* Right: health ring + breakdown summary */}
        <div className="flex items-center gap-6 flex-shrink-0">
          {/* Score breakdown pills */}
          <div className="hidden sm:flex flex-col gap-1.5 text-right">
            {(
              [
                { label: 'Pacing',     score: healthScore.breakdown.budgetPacing.score,    weight: '40%' },
                { label: 'Actions',    score: healthScore.breakdown.actionCompletion.score, weight: '25%' },
                { label: 'Perf',       score: healthScore.breakdown.performance.score,      weight: '25%' },
                { label: 'Timeline',   score: healthScore.breakdown.timeline.score,         weight: '10%' },
              ] as const
            ).map(({ label, score, weight }) => {
              const s = score >= 80 ? 'healthy' : score >= 60 ? 'caution' : 'at-risk';
              const c = STATUS_COLORS[s];
              return (
                <div key={label} className="flex items-center gap-2 justify-end">
                  <span className="text-xs text-gray-400">{label} <span className="text-gray-300">({weight})</span></span>
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${c.bg} ${c.text}`}>{score}</span>
                </div>
              );
            })}
          </div>

          <HealthRing score={healthScore.overallScore} status={healthScore.status} />
        </div>
      </div>

      {/* ── Metric cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Spend */}
        <MetricCard
          title="Spend"
          value={formatCurrency(currentSpend)}
          sub={`${formatPct(spendPct, 0)} of ${formatCurrency(totalBudget)} budget`}
          progress={{ value: currentSpend, max: totalBudget, color: spendColor }}
        />

        {/* Pacing */}
        <MetricCard
          title="Pacing"
          value={formatPct(pacingStatus.percentage, 0)}
          sub={pacingVarianceLabel}
          badge={{ status: pacingStatus.status, label: pacingLabel }}
        />

        {/* Performance */}
        <MetricCard
          title="Performance"
          value={performanceStatus.label}
          sub={`CTR ${formatPct(performanceStatus.ctr * 100, 2)}`}
          badge={{ status: performanceStatus.status, label: perfLabel }}
        />

        {/* Actions */}
        <MetricCard
          title="Upcoming"
          value={String(urgentTotal)}
          sub={`${actionItemsCount.completed} completed`}
          badge={
            actionItemsCount.urgent > 0
              ? { status: 'at-risk', label: `${actionItemsCount.urgent} urgent` }
              : { status: 'healthy', label: 'All clear' }
          }
        />
      </div>
    </div>
  );
}
