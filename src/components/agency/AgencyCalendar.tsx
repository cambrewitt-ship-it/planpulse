// src/components/agency/AgencyCalendar.tsx
// Agency month-view calendar showing:
// - Action point due dates (per client + channel)
// - Channel flight start / end dates

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Play,
  Square,
  AlertCircle,
  CheckSquare,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type CalendarEventType = 'action-point' | 'channel-start' | 'channel-end';

interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  date: string; // YYYY-MM-DD
  clientId: string;
  clientName: string;
  channelName: string;
  label: string;
  category?: 'SET UP' | 'HEALTH CHECK';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Returns an array of Date objects for every day in the calendar grid (Mon–Sun rows,
 *  padded with nulls for days outside the month). */
function buildCalendarGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  // Day of week for first day (0=Sun,1=Mon...6=Sat) → convert to Mon-based (0=Mon...6=Sun)
  const firstDow = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();

  const grid: (Date | null)[] = [];

  // Pad start
  for (let i = 0; i < firstDow; i++) grid.push(null);

  // Days in month
  for (let d = 1; d <= daysInMonth; d++) {
    grid.push(new Date(year, month - 1, d));
  }

  // Pad end to complete last row
  while (grid.length % 7 !== 0) grid.push(null);

  return grid;
}

// ─── Event pill config ────────────────────────────────────────────────────────

function eventConfig(type: CalendarEventType, category?: string) {
  if (type === 'channel-start') {
    return {
      bg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      icon: <Play className="w-2.5 h-2.5 flex-shrink-0" />,
    };
  }
  if (type === 'channel-end') {
    return {
      bg: 'bg-slate-100 text-slate-700 border-slate-300',
      icon: <Square className="w-2.5 h-2.5 flex-shrink-0" />,
    };
  }
  // action-point
  if (category === 'SET UP') {
    return {
      bg: 'bg-amber-100 text-amber-800 border-amber-300',
      icon: <CheckSquare className="w-2.5 h-2.5 flex-shrink-0" />,
    };
  }
  return {
    bg: 'bg-blue-100 text-blue-800 border-blue-300',
    icon: <AlertCircle className="w-2.5 h-2.5 flex-shrink-0" />,
  };
}

// ─── DayCell ──────────────────────────────────────────────────────────────────

const MAX_VISIBLE = 3;

interface DayCellProps {
  date: Date;
  events: CalendarEvent[];
  isToday: boolean;
  onDayClick: (date: Date, events: CalendarEvent[]) => void;
}

function DayCell({ date, events, isToday, onDayClick }: DayCellProps) {
  const visible = events.slice(0, MAX_VISIBLE);
  const overflow = events.length - MAX_VISIBLE;

  return (
    <div
      className={cn(
        'min-h-[90px] p-1.5 border-b border-r border-border flex flex-col gap-0.5 cursor-pointer transition-colors',
        isToday ? 'bg-blue-50/60' : 'bg-background hover:bg-muted/30',
        events.length > 0 && 'cursor-pointer'
      )}
      onClick={() => events.length > 0 && onDayClick(date, events)}
    >
      {/* Day number */}
      <div
        className={cn(
          'text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-0.5 self-end',
          isToday
            ? 'bg-blue-600 text-white'
            : 'text-foreground'
        )}
      >
        {date.getDate()}
      </div>

      {/* Event pills */}
      {visible.map((ev) => {
        const cfg = eventConfig(ev.type, ev.category);
        return (
          <div
            key={ev.id}
            className={cn(
              'flex items-center gap-1 text-[10px] leading-tight px-1 py-0.5 rounded border truncate',
              cfg.bg
            )}
            title={`${ev.clientName} · ${ev.channelName} · ${ev.label}`}
          >
            {cfg.icon}
            <span className="truncate font-medium">{ev.clientName}</span>
          </div>
        );
      })}

      {overflow > 0 && (
        <div className="text-[10px] text-muted-foreground px-1">
          +{overflow} more
        </div>
      )}
    </div>
  );
}

// ─── Day detail panel ─────────────────────────────────────────────────────────

interface DayDetailProps {
  date: Date;
  events: CalendarEvent[];
  onClose: () => void;
}

function DayDetail({ date, events, onClose }: DayDetailProps) {
  const router = useRouter();

  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = ev.clientId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return map;
  }, [events]);

  return (
    <div className="border rounded-lg bg-background shadow-md p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">
          {date.toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ✕ close
        </button>
      </div>

      <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
        {Array.from(grouped.entries()).map(([clientId, clientEvents]) => {
          const clientName = clientEvents[0].clientName;
          return (
            <div key={clientId} className="space-y-1">
              <button
                onClick={() =>
                  router.push(`/clients/${clientId}/new-client-dashboard`)
                }
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                {clientName}
              </button>
              {clientEvents.map((ev) => {
                const cfg = eventConfig(ev.type, ev.category);
                return (
                  <div
                    key={ev.id}
                    className={cn(
                      'flex items-start gap-2 text-xs px-2 py-1.5 rounded border',
                      cfg.bg
                    )}
                  >
                    <span className="mt-0.5">{cfg.icon}</span>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{ev.channelName}</p>
                      <p className="text-[10px] leading-snug opacity-80 line-clamp-2">
                        {ev.label}
                      </p>
                    </div>
                    {ev.type === 'action-point' && ev.category && (
                      <Badge
                        variant="outline"
                        className="text-[10px] py-0 h-4 px-1 flex-shrink-0 self-start"
                      >
                        {ev.category}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  const items = [
    { bg: 'bg-emerald-100 border-emerald-300', icon: <Play className="w-2.5 h-2.5 text-emerald-700" />, label: 'Channel starts' },
    { bg: 'bg-slate-100 border-slate-300', icon: <Square className="w-2.5 h-2.5 text-slate-600" />, label: 'Channel ends' },
    { bg: 'bg-amber-100 border-amber-300', icon: <CheckSquare className="w-2.5 h-2.5 text-amber-700" />, label: 'Set up due' },
    { bg: 'bg-blue-100 border-blue-300', icon: <AlertCircle className="w-2.5 h-2.5 text-blue-700" />, label: 'Health check due' },
  ];
  return (
    <div className="flex flex-wrap gap-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <div className={cn('flex items-center justify-center w-5 h-5 rounded border', item.bg)}>
            {item.icon}
          </div>
          <span className="text-xs text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AgencyCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-indexed
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<{ date: Date; events: CalendarEvent[] } | null>(null);

  const todayStr = toDateStr(now);

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true);
    setError(null);
    setSelectedDay(null);
    try {
      const res = await fetch(`/api/agency/calendar?year=${y}&month=${m}`);
      if (!res.ok) throw new Error('Failed to load calendar');
      const data = await res.json();
      setEvents(data.events || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(year, month);
  }, [load, year, month]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  const goToday = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
  };

  // Build calendar grid
  const grid = useMemo(() => buildCalendarGrid(year, month), [year, month]);

  // Map events to date keys
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date)!.push(ev);
    }
    return map;
  }, [events]);

  const totalEvents = events.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-xl">
            <CalendarDays className="h-5 w-5" />
            Agency Calendar
            {!loading && totalEvents > 0 && (
              <Badge variant="secondary" className="ml-1">
                {totalEvents} {totalEvents === 1 ? 'event' : 'events'}
              </Badge>
            )}
          </CardTitle>

          {/* Month navigation */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={prevMonth} className="h-8 w-8 p-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold min-w-[130px] text-center">
              {MONTH_NAMES[month - 1]} {year}
            </span>
            <Button variant="outline" size="sm" onClick={nextMonth} className="h-8 w-8 p-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={goToday} className="h-8 text-xs">
              Today
            </Button>
          </div>
        </div>

        <Legend />
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
            Loading calendar…
          </div>
        ) : error ? (
          <div className="h-32 flex items-center justify-center text-destructive text-sm">{error}</div>
        ) : (
          <div>
            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 border-b border-t border-border">
              {DAY_NAMES.map((day) => (
                <div
                  key={day}
                  className="text-center text-xs font-medium text-muted-foreground py-2 border-r border-border last:border-r-0"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 border-l border-border">
              {grid.map((date, idx) => {
                if (!date) {
                  // Empty cell
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="min-h-[90px] border-b border-r border-border bg-muted/20"
                    />
                  );
                }

                const dateStr = toDateStr(date);
                const dayEvents = eventsByDate.get(dateStr) || [];
                const isToday = dateStr === todayStr;

                return (
                  <DayCell
                    key={dateStr}
                    date={date}
                    events={dayEvents}
                    isToday={isToday}
                    onDayClick={(d, evs) =>
                      setSelectedDay((prev) =>
                        prev && toDateStr(prev.date) === toDateStr(d) ? null : { date: d, events: evs }
                      )
                    }
                  />
                );
              })}
            </div>

            {/* Day detail panel */}
            {selectedDay && (
              <div className="p-4 border-t border-border">
                <DayDetail
                  date={selectedDay.date}
                  events={selectedDay.events}
                  onClose={() => setSelectedDay(null)}
                />
              </div>
            )}

            {/* Empty state */}
            {events.length === 0 && (
              <div className="py-8 text-center text-muted-foreground text-sm border-t border-border">
                No events this month
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
