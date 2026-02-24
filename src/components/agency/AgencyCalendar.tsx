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

/** Get the 7 days of the week starting from Monday */
function getWeekDays(weekStart: Date): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    days.push(date);
  }
  return days;
}

/** Get Monday of the week containing the given date */
function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
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

// ─── Week View ────────────────────────────────────────────────────────────────

interface WeekViewProps {
  weekDays: Date[];
  eventsByDate: Map<string, CalendarEvent[]>;
  todayStr: string;
  onDayClick: (date: Date, events: CalendarEvent[]) => void;
}

function WeekView({ weekDays, eventsByDate, todayStr, onDayClick }: WeekViewProps) {
  // Separate channel events (start/end) from action points
  const channelEventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const day of weekDays) {
      const dateStr = toDateStr(day);
      const allEvents = eventsByDate.get(dateStr) || [];
      const channelEvents = allEvents.filter(
        (ev) => ev.type === 'channel-start' || ev.type === 'channel-end'
      );
      if (channelEvents.length > 0) {
        map.set(dateStr, channelEvents);
      }
    }
    return map;
  }, [weekDays, eventsByDate]);

  const actionPointEventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const day of weekDays) {
      const dateStr = toDateStr(day);
      const allEvents = eventsByDate.get(dateStr) || [];
      const apEvents = allEvents.filter((ev) => ev.type === 'action-point');
      if (apEvents.length > 0) {
        map.set(dateStr, apEvents);
      }
    }
    return map;
  }, [weekDays, eventsByDate]);

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-t border-border">
        {weekDays.map((day, idx) => {
          const dateStr = toDateStr(day);
          const isToday = dateStr === todayStr;
          return (
            <div
              key={idx}
              className={cn(
                'text-center py-2 border-r border-border last:border-r-0',
                isToday && 'bg-blue-50/60'
              )}
            >
              <div className="text-xs font-medium text-muted-foreground mb-0.5">
                {DAY_NAMES[idx]}
              </div>
              <div
                className={cn(
                  'text-sm font-semibold inline-flex items-center justify-center w-7 h-7 rounded-full',
                  isToday ? 'bg-blue-600 text-white' : 'text-foreground'
                )}
              >
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* All day row for channel events */}
      <div className="grid grid-cols-7 border-b border-border min-h-[60px]">
        {weekDays.map((day, idx) => {
          const dateStr = toDateStr(day);
          const channelEvents = channelEventsByDate.get(dateStr) || [];
          return (
            <div
              key={idx}
              className="border-r border-border last:border-r-0 p-2 space-y-1"
            >
              {channelEvents.map((ev) => {
                const cfg = eventConfig(ev.type, ev.category);
                return (
                  <div
                    key={ev.id}
                    className={cn(
                      'flex items-center gap-1.5 text-xs px-2 py-1 rounded border',
                      cfg.bg
                    )}
                    title={`${ev.clientName} · ${ev.channelName} · ${ev.label}`}
                  >
                    {cfg.icon}
                    <span className="truncate font-medium">{ev.clientName}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Action points rows */}
      <div className="grid grid-cols-7 border-l border-border">
        {weekDays.map((day, idx) => {
          const dateStr = toDateStr(day);
          const isToday = dateStr === todayStr;
          const apEvents = actionPointEventsByDate.get(dateStr) || [];
          return (
            <div
              key={idx}
              className={cn(
                'min-h-[120px] p-2 border-b border-r border-border last:border-r-0 space-y-1',
                isToday && 'bg-blue-50/60'
              )}
            >
              {apEvents.map((ev) => {
                const cfg = eventConfig(ev.type, ev.category);
                return (
                  <div
                    key={ev.id}
                    className={cn(
                      'flex items-start gap-1.5 text-xs px-2 py-1.5 rounded border cursor-pointer hover:opacity-80 transition-opacity',
                      cfg.bg
                    )}
                    onClick={() => onDayClick(day, [ev])}
                    title={`${ev.clientName} · ${ev.channelName} · ${ev.label}`}
                  >
                    <span className="mt-0.5 flex-shrink-0">{cfg.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{ev.clientName}</p>
                      <p className="text-[10px] leading-snug opacity-80 line-clamp-2">
                        {ev.label}
                      </p>
                    </div>
                    {ev.category && (
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

// ─── Main component ───────────────────────────────────────────────────────────

export function AgencyCalendar() {
  const now = new Date();
  const [view, setView] = useState<'month' | 'week'>('week');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-indexed
  const [weekStart, setWeekStart] = useState<Date>(() => {
    // Get Monday of current week
    const d = new Date(now);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(d.setDate(diff));
  });
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

  const prevWeek = () => {
    const newWeekStart = new Date(weekStart);
    newWeekStart.setDate(weekStart.getDate() - 7);
    setWeekStart(newWeekStart);
    // Update month/year if needed to trigger reload
    const newMonth = newWeekStart.getMonth() + 1;
    const newYear = newWeekStart.getFullYear();
    if (newMonth !== month || newYear !== year) {
      setMonth(newMonth);
      setYear(newYear);
    }
  };

  const nextWeek = () => {
    const newWeekStart = new Date(weekStart);
    newWeekStart.setDate(weekStart.getDate() + 7);
    setWeekStart(newWeekStart);
    // Update month/year if needed to trigger reload
    const newMonth = newWeekStart.getMonth() + 1;
    const newYear = newWeekStart.getFullYear();
    if (newMonth !== month || newYear !== year) {
      setMonth(newMonth);
      setYear(newYear);
    }
  };

  const goToday = () => {
    if (view === 'month') {
      setYear(now.getFullYear());
      setMonth(now.getMonth() + 1);
    } else {
      setWeekStart(getMondayOfWeek(now));
    }
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

  // Calculate view label for week and month views
  const viewLabel = useMemo(() => {
    if (view === 'week') {
      const currentWeekStart = getMondayOfWeek(now);
      const weekDiff = Math.round((weekStart.getTime() - currentWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
      
      if (weekDiff === 0) return 'This week';
      if (weekDiff === 1) return 'Next week';
      if (weekDiff === -1) return 'Last week';
      if (weekDiff > 1) return `in ${weekDiff} weeks`;
      return `${Math.abs(weekDiff)} weeks ago`;
    } else {
      // Month view
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1; // 1-indexed
      const monthDiff = (year - currentYear) * 12 + (month - currentMonth);
      
      if (monthDiff === 0) return 'This month';
      if (monthDiff === 1) return 'Next month';
      if (monthDiff === -1) return 'Last month';
      if (monthDiff > 1) return `in ${monthDiff} months`;
      return `${Math.abs(monthDiff)} months ago`;
    }
  }, [view, weekStart, year, month, now]);

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

          {/* View toggle and navigation */}
          <div className="flex items-center gap-3">
            {/* View toggle */}
            <div className="flex items-center gap-1 border rounded-md p-0.5">
              <Button
                variant={view === 'month' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setView('month')}
                className="h-7 text-xs px-2"
              >
                Month
              </Button>
              <Button
                variant={view === 'week' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setView('week')}
                className="h-7 text-xs px-2"
              >
                Week
              </Button>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={view === 'month' ? prevMonth : prevWeek} 
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {view === 'month' ? (
                <span className="text-sm font-semibold min-w-[130px] text-center">
                  {MONTH_NAMES[month - 1]} {year}
                </span>
              ) : (
                <span className="text-sm font-semibold min-w-[180px] text-center">
                  {weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} –{' '}
                  {new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={view === 'month' ? nextMonth : nextWeek} 
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={goToday} className="h-8 text-xs">
                {viewLabel}
              </Button>
            </div>
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
        ) : view === 'week' ? (
          <div>
            <WeekView
              weekDays={getWeekDays(weekStart)}
              eventsByDate={eventsByDate}
              todayStr={todayStr}
              onDayClick={(d, evs) =>
                setSelectedDay((prev) =>
                  prev && toDateStr(prev.date) === toDateStr(d) ? null : { date: d, events: evs }
                )
              }
            />

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
                No events this week
              </div>
            )}
          </div>
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
