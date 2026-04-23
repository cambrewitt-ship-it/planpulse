// src/components/agency/AgencyClientCards.tsx
// Rich client card grid for the agency dashboard.
// Shows: logo initial, client name, health traffic light + label,
//        action point tally, tasks-due-soon alert, live/upcoming channels,
//        spend variance indicator.

'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Clock,
  Radio,
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckSquare,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ClientWithHealth } from '@/types/database';
import { getChannelLogo } from '@/lib/utils/channel-icons';

// ─── Extended type (mirrors ClientCardData from the API) ─────────────────────

interface ClientChannel {
  channelName: string;
  status: 'live' | 'upcoming' | 'ended';
  startDate: string | null;
  endDate: string | null;
}

interface ClientCardData extends ClientWithHealth {
  channels: ClientChannel[];
  tasksDueSoon: number;
  plannedBudget: number;
  actualSpend: number;
  spendVariancePct: number | null;
  totalActionPoints: number;
  completedActionPoints: number;
}

interface AgencyClientCardsProps {
  clients: ClientCardData[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ChannelLogo({ name, className = 'w-4 h-4' }: { name: string; className?: string }) {
  return getChannelLogo(name, className);
}

/** Calculate month progress: days elapsed / days in month * 100 */
function getMonthProgress(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysElapsed = now.getDate();
  return (daysElapsed / daysInMonth) * 100;
}

/**
 * Calculate pace-based variance:
 *   spendPct (actual / planned * 100) minus monthElapsedPct
 * Positive = ahead of pace (overspending), negative = behind pace (underspending).
 * Returns null when there's no planned budget.
 */
function getPaceVariancePct(actualSpend: number, plannedBudget: number): number | null {
  if (plannedBudget <= 0) return null;
  const monthElapsedPct = getMonthProgress();
  const spendThroughPct = (actualSpend / plannedBudget) * 100;
  return spendThroughPct - monthElapsedPct;
}

/** Spend variance config — positive pct = ahead of pace, negative = behind pace */
function spendConfig(pct: number | null): {
  label: string;
  severity: 'green' | 'orange' | 'red' | 'neutral';
  Icon: React.ElementType;
} {
  if (pct === null) return { label: 'No spend data', severity: 'neutral', Icon: Minus };

  const abs = Math.abs(pct);
  const over = pct > 0;

  // Only flag as non-green when 10%+ pace variance
  let severity: 'green' | 'orange' | 'red';
  if (abs < 10) severity = 'green';
  else if (abs < 20) severity = 'orange';
  else severity = 'red';

  const label = over
    ? `${abs.toFixed(1)}% ahead of pace`
    : `${abs.toFixed(1)}% behind pace`;

  return { label, severity, Icon: over ? TrendingUp : TrendingDown };
}

const severityClass: Record<'green' | 'orange' | 'red' | 'neutral', string> = {
  green: 'bg-green-50 text-green-700 border-green-200',
  orange: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  neutral: 'bg-muted text-muted-foreground border-border',
};

/** Derive a computed health status label based on the card data */
function healthLabel(client: ClientCardData, paceVariancePct: number | null): { label: string; sub: string } {
  const overdue = client.health?.total_overdue_tasks ?? 0;
  const dueSoon = client.tasksDueSoon;
  const variance = paceVariancePct;
  const status = client.health?.status;

  if (status === 'red') {
    if (overdue >= 2) return { label: 'Critical', sub: `${overdue} overdue tasks` };
    if (variance !== null && Math.abs(variance) >= 10)
      return {
        label: 'Critical',
        sub: variance > 0 ? 'Significantly ahead of pace' : 'Significantly behind pace',
      };
    return { label: 'Critical', sub: 'Needs immediate attention' };
  }
  if (status === 'amber') {
    if (overdue === 1) return { label: 'Warning', sub: '1 overdue task' };
    if (dueSoon > 0) return { label: 'Warning', sub: `${dueSoon} task${dueSoon > 1 ? 's' : ''} due soon` };
    if (variance !== null && Math.abs(variance) >= 10)
      return { label: 'Warning', sub: variance > 0 ? 'Slightly ahead of pace' : 'Slightly behind pace' };
    return { label: 'Warning', sub: 'Monitor closely' };
  }
  return { label: 'Healthy', sub: 'All metrics on track' };
}

/** Client initials avatar */
function ClientAvatar({ name, logo_url }: { name: string; logo_url?: string | null }) {
  if (logo_url) {
    return (
      <img
        src={logo_url}
        alt={name}
        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
      />
    );
  }

  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  // Deterministic colour from name
  const colors = [
    'bg-blue-600', 'bg-violet-600', 'bg-emerald-600',
    'bg-rose-600', 'bg-amber-600', 'bg-cyan-600', 'bg-indigo-600',
  ];
  const idx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;

  return (
    <div
      className={cn(
        'w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0',
        colors[idx]
      )}
    >
      {initials}
    </div>
  );
}

// ─── Single card ──────────────────────────────────────────────────────────────

function ClientCard({ client }: { client: ClientCardData }) {
  const router = useRouter();

  const overdue = client.health?.total_overdue_tasks ?? 0;
  const atRisk = client.health?.at_risk_tasks ?? 0;
  const completed =
    (client.health?.at_risk_tasks !== undefined && client.health?.total_overdue_tasks !== undefined)
      ? Math.max(0, (atRisk + (client.health?.total_overdue_tasks ?? 0) - atRisk))
      : 0;

  // Total tasks = at_risk (incomplete) + whatever has been completed
  // at_risk_tasks = total incomplete; total = at_risk + completed
  // We don't have completed count directly, so show incomplete / show overdue
  const totalIncomplete = atRisk;

  const paceVariancePct = getPaceVariancePct(client.actualSpend, client.plannedBudget);
  const { label: hLabel, sub: hSub } = healthLabel(client, paceVariancePct);
  const spend = spendConfig(paceVariancePct);

  const liveChannels = client.channels.filter((c) => c.status === 'live');
  const upcomingChannels = client.channels.filter((c) => c.status === 'upcoming');

  return (
    <Card
      className={cn(
        'cursor-pointer hover:shadow-md transition-all duration-200 border-l-4 flex flex-col',
        client.health?.status === 'red'
          ? 'border-l-red-500'
          : client.health?.status === 'amber'
          ? 'border-l-amber-500'
          : 'border-l-green-500'
      )}
      onClick={() => router.push(`/clients/${client.id}/dashboard`)}
      role="article"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          router.push(`/clients/${client.id}/dashboard`);
        }
      }}
    >
      <CardContent className="p-4 flex flex-col gap-3 flex-1">

        {/* ── Header: avatar + name + health score + navigate ── */}
        <div className="flex items-center gap-3">
          <ClientAvatar name={client.name} logo_url={client.logo_url} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">{client.name}</p>
          </div>
          {(() => {
            const score = client.health?.budget_health_percentage != null
              ? Number(client.health.budget_health_percentage)
              : client.health?.status === 'green' ? 85 : client.health?.status === 'amber' ? 50 : 20;
            const color = client.health?.status === 'red' ? 'text-red-600' : client.health?.status === 'amber' ? 'text-amber-600' : 'text-green-600';
            return (
              <span className={`text-sm font-semibold flex-shrink-0 ${color}`}>{Math.round(score)}</span>
            );
          })()}
          <ArrowUpRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </div>

        {/* ── Action points progress bar ── */}
        {(() => {
          const total = client.totalActionPoints ?? 0;
          const completed = client.completedActionPoints ?? 0;
          const remaining = Math.max(0, total - completed);
          const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

          const barColor =
            remaining > 3 ? 'bg-red-500' :
            remaining > 0 ? 'bg-amber-500' :
            'bg-green-500';

          const labelColor =
            remaining > 3 ? 'text-red-600' :
            remaining > 0 ? 'text-amber-600' :
            'text-green-600';

          return (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-muted-foreground flex-1">Action points</span>
                <span className={`text-xs font-semibold ${labelColor}`}>
                  {total === 0 ? 'None' : `${completed}/${total}`}
                </span>
                {overdue > 0 && (
                  <Badge variant="destructive" className="text-xs py-0 h-5 px-1.5">
                    {overdue} overdue
                  </Badge>
                )}
              </div>
              {total > 0 && (
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Tasks due soon ── */}
        {client.tasksDueSoon > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Clock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
            <span className="text-xs font-medium text-amber-700">
              {client.tasksDueSoon} task{client.tasksDueSoon > 1 ? 's' : ''} due within 3 days
            </span>
          </div>
        )}

        {/* ── Spend vs plan ── */}
        <div className={cn(
          'rounded-lg px-3 py-2 border space-y-1.5',
          paceVariancePct === null || client.plannedBudget === 0
            ? 'bg-muted/40 border-border'
            : severityClass[spend.severity]
        )}>
          {paceVariancePct === null || client.plannedBudget === 0 ? (
            <>
              {/* Row 1: label */}
              <div className="flex items-center gap-2">
                <spend.Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-xs flex-1 font-medium">
                  No spend data
                </span>
              </div>
            </>
          ) : (
            <>
              {/* Row 1: label + variance badge */}
              <div className="flex items-center gap-2">
                <spend.Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-xs flex-1 font-medium">
                  {spend.label}
                </span>
              </div>
              {/* Row 2: progress bar */}
              <div className="relative w-full h-2 bg-muted/60 rounded-full overflow-hidden">
                {/* Blue fill: actual spend as % of planned budget */}
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (client.actualSpend / client.plannedBudget) * 100)}%` }}
                />
                {/* Vertical tick mark: expected position based on month progress */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-foreground/40"
                  style={{ left: `${Math.min(100, getMonthProgress())}%` }}
                />
              </div>
              {/* Row 3: actual vs planned figures + month progress */}
              <div className="text-[11px] text-current opacity-70">
                Actual: <span className="font-semibold">${client.actualSpend.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                {' / '}
                Planned: <span className="font-semibold">${client.plannedBudget.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                {' · '}
                {Math.round(getMonthProgress())}% through month
              </div>
            </>
          )}
        </div>

        {/* ── Channels ── */}
        {liveChannels.length === 0 && upcomingChannels.length === 0 && (paceVariancePct === null || client.plannedBudget === 0) ? (
          <div className="pt-1 border-t border-border/50">
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-amber-700">
                    Setup incomplete — no channels or spend data connected
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/clients/${client.id}/dashboard`);
                    }}
                    className="text-xs text-amber-700 hover:text-amber-800 hover:underline mt-1 inline-flex items-center gap-1"
                  >
                    Go to client <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2 pt-1 border-t border-border/50">
            {/* Live */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Live
              </p>
              {liveChannels.length === 0 ? (
                <p className="text-xs text-muted-foreground/60 italic">None</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {liveChannels.map((ch) => (
                    <span
                      key={ch.channelName}
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md bg-muted/60 border border-border/60"
                      title={ch.channelName}
                    >
                      <ChannelLogo name={ch.channelName} className="w-3.5 h-3.5 flex-shrink-0" />
                      {ch.channelName}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Upcoming */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Upcoming
              </p>
              {upcomingChannels.length === 0 ? (
                <p className="text-xs text-muted-foreground/60 italic">None</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {upcomingChannels.map((ch) => (
                    <span
                      key={ch.channelName}
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md bg-background border border-dashed border-border text-muted-foreground"
                      title={ch.startDate ? `Starts ${new Date(ch.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ch.channelName}
                    >
                      <ChannelLogo name={ch.channelName} className="w-3.5 h-3.5 flex-shrink-0" />
                      {ch.channelName}
                      {ch.startDate && (
                        <span className="text-muted-foreground/60">
                          · {new Date(ch.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Filter bar + grid ────────────────────────────────────────────────────────

type FilterType = 'all' | 'red' | 'amber' | 'green';

export function AgencyClientCards({ clients }: AgencyClientCardsProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  const filtered = useMemo(() => {
    let list = clients;
    if (filter !== 'all') list = list.filter((c) => c.health?.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return list;
  }, [clients, filter, search]);

  const counts = useMemo(
    () => ({
      all: clients.length,
      red: clients.filter((c) => c.health?.status === 'red').length,
      amber: clients.filter((c) => c.health?.status === 'amber').length,
      green: clients.filter((c) => c.health?.status === 'green').length,
    }),
    [clients]
  );

  const filterBtns: { key: FilterType; label: string; dot?: string }[] = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'red', label: `Critical (${counts.red})`, dot: 'bg-red-500' },
    { key: 'amber', label: `Warning (${counts.amber})`, dot: 'bg-amber-500' },
    { key: 'green', label: `Healthy (${counts.green})`, dot: 'bg-green-500' },
  ];

  return (
    <div className="space-y-4">
      {/* Search + filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {filterBtns.map((btn) => (
            <Button
              key={btn.key}
              variant={filter === btn.key ? 'default' : 'outline'}
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => setFilter(btn.key)}
            >
              {btn.dot && (
                <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', btn.dot)} />
              )}
              {btn.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Card grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm border rounded-lg border-dashed">
          {search ? `No clients match "${search}"` : 'No clients found'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((client) => (
            <ClientCard key={client.id} client={client as ClientCardData} />
          ))}
        </div>
      )}
    </div>
  );
}
