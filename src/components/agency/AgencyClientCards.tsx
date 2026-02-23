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
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TrafficLight } from './TrafficLight';
import { cn } from '@/lib/utils';
import type { ClientWithHealth } from '@/types/database';

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
  const l = name.toLowerCase();

  if (l.includes('meta') || l.includes('facebook')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="Meta">
        <path d="M12 2.04C6.477 2.04 2 6.516 2 12.04c0 5.012 3.657 9.168 8.438 9.896V14.89h-2.54v-2.851h2.54v-2.17c0-2.509 1.493-3.893 3.775-3.893 1.094 0 2.238.196 2.238.196v2.459h-1.26c-1.243 0-1.63.772-1.63 1.563v1.845h2.773l-.443 2.85h-2.33v7.046C18.343 21.208 22 17.052 22 12.04c0-5.524-4.477-10-10-10z" fill="#1877F2"/>
      </svg>
    );
  }

  if (l.includes('google')) {
    return (
      <svg className={className} viewBox="0 0 24 24" aria-label="Google">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    );
  }

  if (l.includes('linkedin')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="LinkedIn">
        <rect width="24" height="24" rx="3" fill="#0A66C2"/>
        <path d="M7.75 9.5h-2.5v8h2.5v-8zM6.5 8.5a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5zM17.5 13.25c0-1.938-.938-3.75-3-3.75-1.188 0-2 .625-2.375 1.188V9.5H9.75v8h2.375v-4.375c0-.875.563-1.625 1.438-1.625.875 0 1.187.75 1.187 1.563V17.5H17.5v-4.25z" fill="white"/>
      </svg>
    );
  }

  if (l.includes('tiktok')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-label="TikTok">
        <rect width="24" height="24" rx="4" fill="#010101"/>
        <path d="M17.5 7.5c-.833-.583-1.292-1.542-1.333-2.5H14v9.583c0 1.084-.917 1.917-2 1.834-1.083-.084-1.833-1.084-1.667-2.167.167-1.083 1.167-1.833 2.25-1.666V10.5c-2.583-.25-4.75 1.583-4.75 4.25 0 2.5 2.083 4.25 4.667 4.167C14.917 18.833 17 16.917 17 14.583V9.75c.75.5 1.583.75 2.5.75V8c-.75 0-1.5-.167-2-.5z" fill="white"/>
      </svg>
    );
  }

  // Generic fallback
  return <Radio className="w-4 h-4 text-muted-foreground" />;
}

/** Spend variance config — positive pct = overspending, negative = underspending */
function spendConfig(pct: number | null): {
  label: string;
  severity: 'green' | 'orange' | 'red' | 'neutral';
  Icon: React.ElementType;
} {
  if (pct === null) return { label: 'No spend data', severity: 'neutral', Icon: Minus };

  const abs = Math.abs(pct);
  const over = pct > 0;

  let severity: 'green' | 'orange' | 'red';
  if (abs <= 5) severity = 'green';
  else if (abs <= 10) severity = 'orange';
  else severity = 'red';

  const label = over
    ? `${abs.toFixed(1)}% overspending`
    : `${abs.toFixed(1)}% underspending`;

  return { label, severity, Icon: over ? TrendingUp : TrendingDown };
}

const severityClass: Record<'green' | 'orange' | 'red' | 'neutral', string> = {
  green: 'bg-green-50 text-green-700 border-green-200',
  orange: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  neutral: 'bg-muted text-muted-foreground border-border',
};

/** Derive a computed health status label based on the card data */
function healthLabel(client: ClientCardData): { label: string; sub: string } {
  const overdue = client.health?.total_overdue_tasks ?? 0;
  const dueSoon = client.tasksDueSoon;
  const variance = client.spendVariancePct;
  const status = client.health?.status;

  if (status === 'red') {
    if (overdue >= 2) return { label: 'Critical', sub: `${overdue} overdue tasks` };
    if (variance !== null && Math.abs(variance) > 10)
      return {
        label: 'Critical',
        sub: variance > 0 ? 'Significantly overspending' : 'Significantly underspending',
      };
    return { label: 'Critical', sub: 'Needs immediate attention' };
  }
  if (status === 'amber') {
    if (overdue === 1) return { label: 'Warning', sub: '1 overdue task' };
    if (dueSoon > 0) return { label: 'Warning', sub: `${dueSoon} task${dueSoon > 1 ? 's' : ''} due soon` };
    if (variance !== null && Math.abs(variance) > 5)
      return { label: 'Warning', sub: variance > 0 ? 'Slightly overspending' : 'Slightly underspending' };
    return { label: 'Warning', sub: 'Monitor closely' };
  }
  return { label: 'Healthy', sub: 'All metrics on track' };
}

/** Client initials avatar */
function ClientAvatar({ name }: { name: string }) {
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

  const { label: hLabel, sub: hSub } = healthLabel(client);
  const spend = spendConfig(client.spendVariancePct);

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
      onClick={() => router.push(`/clients/${client.id}/new-client-dashboard`)}
      role="article"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          router.push(`/clients/${client.id}/new-client-dashboard`);
        }
      }}
    >
      <CardContent className="p-4 flex flex-col gap-3 flex-1">

        {/* ── Header: avatar + name + health + navigate ── */}
        <div className="flex items-start gap-3">
          <ClientAvatar name={client.name} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">{client.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <TrafficLight status={client.health?.status} size="small" />
              <span
                className={cn(
                  'text-xs font-medium',
                  client.health?.status === 'red'
                    ? 'text-red-600'
                    : client.health?.status === 'amber'
                    ? 'text-amber-600'
                    : 'text-green-600'
                )}
              >
                {hLabel}
              </span>
              <span className="text-xs text-muted-foreground truncate">· {hSub}</span>
            </div>
          </div>
          <ArrowUpRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
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
          client.spendVariancePct === null
            ? 'bg-muted/40 border-border'
            : severityClass[spend.severity]
        )}>
          {/* Row 1: label + variance badge */}
          <div className="flex items-center gap-2">
            <spend.Icon className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="text-xs flex-1 font-medium">
              {client.spendVariancePct === null ? 'No spend data this month' : spend.label}
            </span>
          </div>
          {/* Row 2: actual vs planned figures */}
          {client.plannedBudget > 0 && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-current opacity-70">
                Actual: <span className="font-semibold">${client.actualSpend.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </span>
              <span className="text-current opacity-70">
                Planned: <span className="font-semibold">${client.plannedBudget.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </span>
            </div>
          )}
        </div>

        {/* ── Channels ── */}
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
