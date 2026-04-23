'use client';

import { useState, useRef, useEffect } from 'react';
import type { HealthScoreResult } from '@/lib/utils/health-score';
import {
  GanttCalendar,
  type GanttClient,
  type GanttChannel,
  type GanttHealthCheck,
  type GanttSetupPoint,
} from '@/components/agency/GanttCalendar';

interface AccountManager {
  id: string;
  name: string;
  email: string | null;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HeroGanttProps {
  clients: GanttClient[];
  channels: GanttChannel[];
  currentMonth: Date;
  selectedDay: number | null;
  onDaySelect: (day: number | null) => void;
  filteredClientIds: string[];
  healthChecks?: GanttHealthCheck[];
  setupPoints?: GanttSetupPoint[];
}

export interface HeroHealthSectionProps {
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
  gantt?: HeroGanttProps;
  onAccountManagerChange?: (accountManager: string | null) => void;
  isSavingAccountManager?: boolean;
  accountManagers?: AccountManager[];
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
  const W = 144, H = 96;
  const sw = 10;        // stroke width
  const r = 62;         // arc radius
  const cx = W / 2;
  const cy = 70;        // needle pivot — bottom area

  const ringColor = STATUS_COLORS[status]?.ring ?? '#f59e0b';
  const label = status === 'healthy' ? 'Healthy' : status === 'caution' ? 'Caution' : 'At Risk';

  // Clamp to avoid degenerate arcs at 0 and 100
  const s = Math.min(0.998, Math.max(0.002, score / 100));
  // Math angle: π = left (score 0) → 0 = right (score 100)
  const rad = Math.PI * (1 - s);
  const ex = cx + r * Math.cos(rad);
  const ey = cy - r * Math.sin(rad);

  // Needle tip (stops just inside the track)
  const nLen = r - sw / 2 - 4;
  const nx = cx + nLen * Math.cos(rad);
  const ny = cy - nLen * Math.sin(rad);

  // Zone ticks at 0%, 33%, 67%, 100%
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
      width={W} height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif", display: 'block' }}
    >
      {/* Track (full semicircle, sweep=1 = CW in SVG = goes through top) */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="#e5e7eb" strokeWidth={sw} strokeLinecap="round"
      />
      {/* Coloured fill */}
      {score > 0.5 && (
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
      {/* End labels */}
      <text x={cx - r - 6} y={cy + 12} textAnchor="end" fontSize={8} fill="#9ca3af">0</text>
      <text x={cx + r + 6} y={cy + 12} textAnchor="start" fontSize={8} fill="#9ca3af">100</text>
      {/* Needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#374151" strokeWidth={2} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={4.5} fill="#374151" />
      {/* Score number */}
      <text x={cx} y={cy + 24} textAnchor="middle" fontSize={20} fontWeight="700" fill="#1C1917">{Math.round(score)}</text>
      {/* Status label */}
      <text
        x={cx} y={cy + 33}
        textAnchor="middle" fontSize={9} fontWeight="600" fill={ringColor}
        style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}
      >{label}</text>
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
// Main Component
// ---------------------------------------------------------------------------

export default function HeroHealthSection({
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
  gantt,
  onAccountManagerChange,
  isSavingAccountManager = false,
  accountManagers = [],
}: HeroHealthSectionProps) {
  const [showAmMenu, setShowAmMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
  const spendColor = STATUS_COLORS[healthScore.breakdown.budgetPacing.score >= 80 ? 'healthy' : healthScore.breakdown.budgetPacing.score >= 60 ? 'caution' : 'at-risk'].ring;

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

  const hasGantt = !!(gantt && gantt.clients.length > 0 && gantt.channels.length > 0);

  return (
    <div className="space-y-5">
      {/* ── Top row: [client identity + spend + speedometer] | Gantt ── */}
      <div className={`bg-white rounded-xl border border-gray-200 px-7 py-6 flex flex-col gap-7 xl:grid ${hasGantt ? 'xl:grid-cols-[minmax(0,1.8fr)_minmax(0,2.4fr)]' : ''} xl:items-start`}>
        {/* Col 1: avatar + name/notes + spend row (spend text + speedometer inline) */}
        <div className="flex items-start gap-4 min-w-0 order-1">
          <div className="flex flex-col items-center gap-3 flex-shrink-0">
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
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold truncate mb-1" style={{ color: '#1C1917', fontFamily: "'Inter', system-ui, sans-serif" }}>{client.name}</h1>
            {client.notes && (
              <p className="text-base text-gray-500 line-clamp-1">{client.notes}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-sm text-gray-400">
                {completionPercentage >= 100
                  ? 'Campaign completed'
                  : `${formatPct(completionPercentage, 0)} completed`}
              </span>
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
            {/* Spend + speedometer side-by-side */}
            <div className="mt-3 flex items-center gap-6" style={{ display: completionPercentage <= 0 ? 'none' : 'flex' }}>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Spend</span>
                  <Badge status={pacingStatus.status} label={pacingLabel} />
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
              </div>
              <div className="flex-shrink-0">
                <HealthRing score={healthScore.overallScore} status={healthScore.status} />
              </div>
            </div>
          </div>
        </div>

        {/* Col 2: Gantt calendar (only when data exists) */}
        {hasGantt && (
          <div className="w-full min-w-0 order-2">
            <div className="w-full max-h-64 overflow-x-auto overflow-y-hidden border border-gray-100 rounded-lg bg-gray-50/80 px-3 py-2">
              <GanttCalendar
                clients={gantt!.clients}
                channels={gantt!.channels}
                healthChecks={gantt!.healthChecks ?? []}
                setupPoints={gantt!.setupPoints ?? []}
                pointEvents={[]}
                selectedDay={gantt!.selectedDay}
                onDaySelect={gantt!.onDaySelect}
                filteredClientIds={gantt!.filteredClientIds}
                currentMonth={gantt!.currentMonth}
              />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
