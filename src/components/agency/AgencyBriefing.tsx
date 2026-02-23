// src/components/agency/AgencyBriefing.tsx
// Agency briefing banner - shows key alerts and upcoming events

'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp, AlertCircle, TrendingUp, TrendingDown, Calendar, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ClientCardData } from '@/app/api/agency/clients/route';
import type { AgencyActionPoint, AgencyClientActionPoints } from '@/app/api/agency/action-points/route';

interface BriefingItem {
  type: 'overdue' | 'overpacing' | 'underpacing' | 'channel-launch' | 'all-clear';
  label: string;
  color: 'red' | 'amber' | 'blue' | 'green';
}

interface AgencyBriefingProps {
  clients: ClientCardData[];
}

function toDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { weekday: 'short' });
}

export function AgencyBriefing({ clients }: AgencyBriefingProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [overdueActionPoints, setOverdueActionPoints] = useState<AgencyActionPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch overdue action points
  useEffect(() => {
    const fetchOverdueActionPoints = async () => {
      try {
        const res = await fetch('/api/agency/action-points');
        if (!res.ok) return;
        const data = await res.json() as { clients: AgencyClientActionPoints[] };
        
        const today = toDateStr(new Date());
        const overdue: AgencyActionPoint[] = [];
        
        for (const client of data.clients || []) {
          for (const channel of client.channels) {
            for (const ap of channel.actionPoints) {
              if (ap.due_date && ap.due_date < today) {
                overdue.push(ap);
              }
            }
          }
        }
        
        setOverdueActionPoints(overdue);
      } catch (err) {
        console.error('Error fetching overdue action points:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchOverdueActionPoints();
  }, []);

  // Compute briefing items
  const items = useMemo<BriefingItem[]>(() => {
    const result: BriefingItem[] = [];

    // 1. Overdue action points
    if (overdueActionPoints.length > 0) {
      result.push({
        type: 'overdue',
        label: `${overdueActionPoints.length} action point${overdueActionPoints.length > 1 ? 's' : ''} overdue`,
        color: 'red',
      });
    }

    // 2. Overpacing clients (>15% over planned)
    const overpacingClients = clients.filter(
      (c) => c.spendVariancePct !== null && c.spendVariancePct > 15
    );
    for (const client of overpacingClients) {
      result.push({
        type: 'overpacing',
        label: `${client.name} overpacing`,
        color: 'amber',
      });
    }

    // 3. Underpacing clients (>15% under planned)
    const underpacingClients = clients.filter(
      (c) => c.spendVariancePct !== null && c.spendVariancePct < -15
    );
    for (const client of underpacingClients) {
      result.push({
        type: 'underpacing',
        label: `${client.name} underpacing`,
        color: 'amber',
      });
    }

    // 4. Channels launching within 7 days
    const today = new Date();
    const in7Days = new Date(today);
    in7Days.setDate(today.getDate() + 7);
    const todayStr = toDateStr(today);
    const in7DaysStr = toDateStr(in7Days);

    for (const client of clients) {
      for (const channel of client.channels) {
        if (channel.startDate && channel.status === 'upcoming') {
          if (channel.startDate >= todayStr && channel.startDate <= in7DaysStr) {
            const startDate = new Date(channel.startDate);
            const dayName = formatDate(startDate);
            result.push({
              type: 'channel-launch',
              label: `${client.name} - ${channel.channelName} launching ${dayName}`,
              color: 'blue',
            });
          }
        }
      }
    }

    // 5. All clear (only if no issues)
    if (result.length === 0 && !loading) {
      result.push({
        type: 'all-clear',
        label: 'All clients healthy',
        color: 'green',
      });
    }

    return result;
  }, [clients, overdueActionPoints, loading]);

  // If all clear, show simple green state
  if (items.length === 1 && items[0].type === 'all-clear') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <span className="text-sm font-medium text-green-700">All clear</span>
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-green-600 hover:text-green-700"
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>
    );
  }

  // If no items (still loading), don't show anything
  if (items.length === 0) {
    return null;
  }

  const colorClasses = {
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
  };

  const iconClasses = {
    red: 'text-red-600',
    amber: 'text-amber-600',
    blue: 'text-blue-600',
    green: 'text-green-600',
  };

  const getIcon = (type: BriefingItem['type'], color: BriefingItem['color']) => {
    switch (type) {
      case 'overdue':
        return <AlertCircle className={cn('w-3.5 h-3.5', iconClasses[color])} />;
      case 'overpacing':
        return <TrendingUp className={cn('w-3.5 h-3.5', iconClasses[color])} />;
      case 'underpacing':
        return <TrendingDown className={cn('w-3.5 h-3.5', iconClasses[color])} />;
      case 'channel-launch':
        return <Calendar className={cn('w-3.5 h-3.5', iconClasses[color])} />;
      default:
        return null;
    }
  };

  if (collapsed) {
    return (
      <div className="bg-muted/40 border-l-4 border-l-amber-500 rounded-lg px-4 py-2 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {items.length} alert{items.length > 1 ? 's' : ''}
        </span>
        <button
          onClick={() => setCollapsed(false)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Expand"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-muted/40 border-l-4 border-l-amber-500 rounded-lg px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Briefing
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Collapse"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item, idx) => (
          <Badge
            key={idx}
            variant="outline"
            className={cn(
              'text-xs font-medium px-2.5 py-1 flex items-center gap-1.5',
              colorClasses[item.color]
            )}
          >
            {getIcon(item.type, item.color)}
            {item.label}
          </Badge>
        ))}
      </div>
    </div>
  );
}
