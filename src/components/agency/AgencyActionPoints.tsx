// src/components/agency/AgencyActionPoints.tsx
// Master agency action points list – all outstanding action points across all clients,
// broken out by client then media channel, ordered by due date.

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckSquare,
  Building2,
  ChevronDown,
  ChevronRight,
  Calendar,
  AlertCircle,
  Facebook,
  Search,
  Linkedin,
  Music,
  Radio,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { getChannelLogo } from '@/lib/utils/channel-icons';

interface AgencyActionPoint {
  id: string;
  text: string;
  category: 'SET UP' | 'HEALTH CHECK';
  channel_type: string;
  due_date: string | null;
  frequency?: string | null;
}

interface AgencyChannelGroup {
  channelType: string;
  actionPoints: AgencyActionPoint[];
}

interface AgencyClientActionPoints {
  clientId: string;
  clientName: string;
  channels: AgencyChannelGroup[];
  totalOutstanding: number;
}

interface FlattenedActionPoint extends AgencyActionPoint {
  clientId: string;
  clientName: string;
  channelType: string;
}

function getChannelIcon(channelType: string) {
  return getChannelLogo(channelType, "w-3.5 h-3.5");
}

function formatDueDate(dateString: string | null): {
  label: string;
  isOverdue: boolean;
  isDueSoon: boolean;
} | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const label = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return {
    label,
    isOverdue: diffDays < 0,
    isDueSoon: diffDays >= 0 && diffDays <= 7,
  };
}

function getUrgencyPriority(dueDate: string | null): number {
  if (!dueDate) return 4; // No due date = lowest priority
  
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return 1; // Overdue
  if (diffDays === 0) return 2; // Due today
  if (diffDays <= 3) return 3; // Due within 3 days
  return 4; // Everything else
}

function flattenAndSortByUrgency(clients: AgencyClientActionPoints[]): FlattenedActionPoint[] {
  const flattened: FlattenedActionPoint[] = [];
  
  for (const client of clients) {
    for (const channel of client.channels) {
      for (const ap of channel.actionPoints) {
        flattened.push({
          ...ap,
          clientId: client.clientId,
          clientName: client.clientName,
          channelType: channel.channelType,
        });
      }
    }
  }
  
  return flattened.sort((a, b) => {
    const priorityA = getUrgencyPriority(a.due_date);
    const priorityB = getUrgencyPriority(b.due_date);
    
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    
    // Within same priority, sort by due date (earlier first)
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });
}

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Get Monday of the current week */
function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
}

/** Get Mon-Fri dates for current week */
function getWeekDays(): Date[] {
  const now = new Date();
  const monday = getMondayOfWeek(now);
  const days: Date[] = [];
  for (let i = 0; i < 5; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    days.push(date);
  }
  return days;
}

/** Count action points due on each day of the week */
function countActionPointsByDay(
  clients: AgencyClientActionPoints[],
  weekDays: Date[]
): Map<string, number> {
  const counts = new Map<string, number>();
  const weekDayStrs = weekDays.map(toDateStr);
  
  for (const client of clients) {
    for (const channel of client.channels) {
      for (const ap of channel.actionPoints) {
        if (ap.due_date && weekDayStrs.includes(ap.due_date)) {
          const count = counts.get(ap.due_date) || 0;
          counts.set(ap.due_date, count + 1);
        }
      }
    }
  }
  
  return counts;
}

/** Get bar color based on count */
function getBarColor(count: number): string {
  if (count >= 5) return 'bg-red-500';
  if (count >= 3) return 'bg-amber-500';
  if (count >= 1) return 'bg-green-500';
  return 'bg-muted';
}

function ActionPointRow({ 
  ap, 
  clientId,
  clientName, 
  channelType,
  onToggle,
  isSaving
}: { 
  ap: AgencyActionPoint; 
  clientId: string;
  clientName?: string; 
  channelType?: string;
  onToggle: (actionPointId: string, clientId: string) => void;
  isSaving: boolean;
}) {
  const dueDateInfo = formatDueDate(ap.due_date);

  return (
    <div className="flex items-start gap-3 py-2 px-3 rounded-md hover:bg-muted/40 transition-colors">
      <Checkbox
        checked={false}
        onCheckedChange={() => onToggle(ap.id, clientId)}
        disabled={isSaving}
        aria-label="Mark action point as complete"
        className="mt-0.5 flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground leading-snug">{ap.text}</p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <Badge
            variant={ap.category === 'SET UP' ? 'secondary' : 'outline'}
            className="text-xs py-0 h-5"
          >
            {ap.category}
          </Badge>
          {clientName && (
            <Badge variant="outline" className="text-xs py-0 h-5">
              {clientName}
            </Badge>
          )}
          {channelType && (
            <Badge variant="outline" className="text-xs py-0 h-5 flex items-center gap-1">
              {getChannelIcon(channelType)}
              {channelType}
            </Badge>
          )}
          {ap.frequency && (
            <span className="text-xs text-muted-foreground">{ap.frequency}</span>
          )}
          {dueDateInfo && (
            <span
              className={cn(
                'flex items-center gap-1 text-xs font-medium',
                dueDateInfo.isOverdue
                  ? 'text-red-600'
                  : dueDateInfo.isDueSoon
                  ? 'text-amber-600'
                  : 'text-muted-foreground'
              )}
            >
              {dueDateInfo.isOverdue && <AlertCircle className="w-3 h-3" />}
              <Calendar className="w-3 h-3" />
              {dueDateInfo.label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ChannelSection({ 
  group, 
  clientTotal,
  clientId,
  onToggle,
  isSaving
}: { 
  group: AgencyChannelGroup; 
  clientTotal: number;
  clientId: string;
  onToggle: (actionPointId: string, clientId: string) => void;
  isSaving: boolean;
}) {
  const [open, setOpen] = useState(false);

  // Calculate percentage of action points for this channel relative to client total
  const percentage = clientTotal > 0 ? (group.actionPoints.length / clientTotal) * 100 : 0;
  
  // Traffic light color: high numbers = red (bad), low numbers = green (good)
  const getTrafficLightColor = (pct: number): 'green' | 'amber' | 'red' => {
    if (pct >= 50) return 'red'; // High percentage = many action points = bad (red)
    if (pct >= 25) return 'amber';
    return 'green'; // Low percentage = few action points = good (green)
  };

  const trafficLightColor = getTrafficLightColor(percentage);

  return (
    <div className="ml-6">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-1 w-full text-left"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
        {getChannelIcon(group.channelType)}
        <span>{group.channelType}</span>
        <Badge variant="outline" className="ml-1 text-xs py-0 h-4 px-1.5">
          {group.actionPoints.length}
        </Badge>
        {/* Traffic light indicator */}
        <div
          className={cn(
            'w-2 h-2 rounded-full ml-1 flex-shrink-0',
            trafficLightColor === 'green' && 'bg-green-400',
            trafficLightColor === 'amber' && 'bg-amber-500',
            trafficLightColor === 'red' && 'bg-red-500'
          )}
          title={`${percentage.toFixed(0)}% of client's action points`}
        />
      </button>

      {open && (
        <div className="ml-4 mt-1 space-y-0.5">
          {group.actionPoints.map((ap) => (
            <ActionPointRow 
              key={ap.id} 
              ap={ap} 
              clientId={clientId}
              onToggle={onToggle}
              isSaving={isSaving}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WeekSummary({ clients }: { clients: AgencyClientActionPoints[] }) {
  const weekDays = getWeekDays();
  const counts = countActionPointsByDay(clients, weekDays);
  const todayStr = toDateStr(new Date());
  const maxCount = Math.max(...Array.from(counts.values()), 1);
  
  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  return (
    <div className="border rounded-lg px-3 py-2 bg-muted/20 mb-4">
      <div className="grid grid-cols-5 gap-2">
        {weekDays.map((day, idx) => {
          const dateStr = toDateStr(day);
          const count = counts.get(dateStr) || 0;
          const isToday = dateStr === todayStr;
          const barHeight = maxCount > 0 ? (count / maxCount) * 24 : 0; // Max 24px height
          
          return (
            <div
              key={idx}
              className={cn(
                'flex flex-col items-center gap-1.5 py-1 rounded',
                isToday && 'bg-blue-50/50'
              )}
            >
              <span className="text-[10px] font-medium text-muted-foreground">
                {DAY_NAMES[idx]}
              </span>
              <div className="w-full flex items-end justify-center h-6">
                <div
                  className={cn(
                    'w-3/4 rounded-t transition-all',
                    getBarColor(count)
                  )}
                  style={{ height: `${Math.max(barHeight, count > 0 ? 2 : 0)}px` }}
                />
              </div>
              <span className="text-[10px] font-semibold text-foreground">
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ClientSection({ 
  client,
  onToggle,
  isSaving
}: { 
  client: AgencyClientActionPoints;
  onToggle: (actionPointId: string, clientId: string) => void;
  isSaving: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
        <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="font-semibold text-sm flex-1">{client.clientName}</span>
        <Badge variant="secondary" className="text-xs">
          {client.totalOutstanding} outstanding
        </Badge>
        <span
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/clients/${client.clientId}/dashboard`);
          }}
          className="text-xs text-blue-600 hover:underline ml-2 flex-shrink-0 cursor-pointer"
        >
          View
        </span>
      </button>

      {open && (
        <div className="px-2 py-3 space-y-3 bg-background">
          {client.channels.map((group) => (
            <ChannelSection 
              key={group.channelType} 
              group={group} 
              clientTotal={client.totalOutstanding}
              clientId={client.clientId}
              onToggle={onToggle}
              isSaving={isSaving}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AgencyActionPoints() {
  const [clients, setClients] = useState<AgencyClientActionPoints[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'byClient' | 'byUrgency'>('byClient');
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/agency/action-points');
      if (!res.ok) throw new Error('Failed to load action points');
      const data = await res.json();
      setClients(data.clients || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = useCallback(async (actionPointId: string, clientId: string) => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/action-points', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: actionPointId,
          client_id: clientId,
          completed: true,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || 'Failed to update action point');
      }

      // Reload data to reflect the change
      await load();
    } catch (err) {
      console.error('Error updating action point:', err);
      // Could show a toast/alert here if needed
    } finally {
      setIsSaving(false);
    }
  }, [load]);

  const totalOutstanding = clients.reduce((s, c) => s + c.totalOutstanding, 0);
  const flattenedByUrgency = sortMode === 'byUrgency' ? flattenAndSortByUrgency(clients) : [];

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-4 flex-shrink-0">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xl">
            <CheckSquare className="h-5 w-5" />
            Action Points
            {!loading && totalOutstanding > 0 && (
              <Badge variant="destructive" className="ml-2">
                {totalOutstanding} outstanding
              </Badge>
            )}
          </div>
          {!loading && totalOutstanding > 0 && (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={sortMode === 'byClient' ? 'default' : 'outline'}
                onClick={() => setSortMode('byClient')}
                className="h-7 text-xs"
              >
                By Client
              </Button>
              <Button
                size="sm"
                variant={sortMode === 'byUrgency' ? 'default' : 'outline'}
                onClick={() => setSortMode('byUrgency')}
                className="h-7 text-xs"
              >
                By Urgency
              </Button>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      {!loading && clients.length > 0 && (
        <div className="px-6 pb-2">
          <WeekSummary clients={clients} />
        </div>
      )}
      <CardContent className="flex-1 overflow-y-auto max-h-[600px]">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : clients.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No outstanding action points across any clients
          </div>
        ) : sortMode === 'byUrgency' ? (
          <div className="space-y-0.5">
            {flattenedByUrgency.map((ap) => (
              <ActionPointRow 
                key={`${ap.clientId}-${ap.channelType}-${ap.id}`} 
                ap={ap}
                clientId={ap.clientId}
                clientName={ap.clientName}
                channelType={ap.channelType}
                onToggle={handleToggle}
                isSaving={isSaving}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {clients.map((client) => (
              <ClientSection 
                key={client.clientId} 
                client={client}
                onToggle={handleToggle}
                isSaving={isSaving}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
