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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type CalendarEventType = 'action-point' | 'channel-start' | 'channel-end' | 'health-check';

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

interface ClientInfo {
  id: string;
  name: string;
  color: string;
  initials: string;
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

// ─── Client color/initials helpers ────────────────────────────────────────────

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

function clientColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  return COLORS[Math.abs(hash) % COLORS.length];
}

function clientInitials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Event pill config ────────────────────────────────────────────────────────

function eventConfig(type: CalendarEventType, category?: string) {
  if (type === 'channel-start') {
    return {
      icon: '▶',
      label: 'starts',
    };
  }
  if (type === 'channel-end') {
    return {
      icon: '■',
      label: 'ends',
    };
  }
  if (type === 'health-check') {
    return {
      icon: '◇',
      label: 'health check',
    };
  }
  // action-point
  return {
    icon: '⚡',
    label: category === 'SET UP' ? 'set up' : 'action point',
  };
}

// ─── DayCell ──────────────────────────────────────────────────────────────────

const MAX_VISIBLE = 2;

interface DayCellProps {
  date: Date;
  events: CalendarEvent[];
  isToday: boolean;
  clientMap: Map<string, ClientInfo>;
  onDayClick: (date: Date, events: CalendarEvent[]) => void;
}

function DayCell({ date, events, isToday, clientMap, onDayClick }: DayCellProps) {
  const visible = events.slice(0, MAX_VISIBLE);
  const overflow = events.length - MAX_VISIBLE;
  
  // Get first event's client color for background tint
  const firstEvent = events[0];
  const firstClientColor = firstEvent ? (clientMap.get(firstEvent.clientId)?.color || '#6366f1') : null;
  const bgTint = firstClientColor ? hexToRgba(firstClientColor, 0.04) : null; // 4% opacity

  return (
    <div
      className={cn(
        'min-h-[80px] p-1 border-b border-r border-border flex flex-col cursor-pointer transition-colors relative',
        isToday 
          ? 'bg-indigo-50 border-indigo-300' 
          : bgTint 
            ? 'bg-background' 
            : 'bg-background hover:bg-muted/30',
        events.length > 0 && 'cursor-pointer'
      )}
      style={bgTint && !isToday ? { backgroundColor: bgTint } : undefined}
      onClick={() => events.length > 0 && onDayClick(date, events)}
    >
      {/* Day number - top-left */}
      <div
        className={cn(
          'text-[11px] font-bold mb-1',
          isToday
            ? 'text-indigo-600'
            : 'text-foreground'
        )}
      >
        {date.getDate()}
      </div>

      {/* Event chips */}
      <div className="flex flex-col gap-1 flex-1">
        {visible.map((ev) => {
          const cfg = eventConfig(ev.type, ev.category);
          const clientInfo = clientMap.get(ev.clientId);
          const clientColor = clientInfo?.color || '#6366f1';
          const clientInitials = clientInfo?.initials || ev.clientName.slice(0, 2).toUpperCase();
          
          // Determine chip color based on event type
          let chipBg = '';
          let chipText = '';
          let chipBorder = '';
          
          if (ev.type === 'channel-end') {
            chipBg = '#fef2f2';
            chipText = '#ef4444';
            chipBorder = '#fecaca';
          } else if (ev.type === 'health-check') {
            chipBg = '#fffbeb';
            chipText = '#d97706';
            chipBorder = '#fde68a';
          } else if (ev.type === 'action-point') {
            chipBg = '#f3e8ff';
            chipText = '#9333ea';
            chipBorder = '#e9d5ff';
          } else {
            // channel-start - use client color
            chipBg = hexToRgba(clientColor, 0.1); // 10% opacity
            chipText = clientColor;
            chipBorder = hexToRgba(clientColor, 0.25); // 25% opacity
          }

          return (
            <div
              key={ev.id}
              className="flex items-center gap-1 text-[8px] leading-tight px-[5px] py-[1px] rounded border truncate"
              style={{
                backgroundColor: chipBg,
                color: chipText,
                borderColor: chipBorder,
                height: '18px',
                borderRadius: '4px',
              }}
              title={`${ev.clientName} · ${ev.channelName} · ${ev.label}`}
            >
              <span style={{ fontSize: '8px', lineHeight: '1' }}>{cfg.icon}</span>
              <span className="truncate font-medium" style={{ fontSize: '8px' }}>
                {clientInitials} · {ev.channelName} {cfg.label}
              </span>
            </div>
          );
        })}

        {overflow > 0 && (
          <div className="text-[8px] text-muted-foreground px-1" style={{ fontSize: '8px' }}>
            +{overflow} more
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Day detail panel ─────────────────────────────────────────────────────────

interface DayDetailProps {
  date: Date;
  events: CalendarEvent[];
  clientMap: Map<string, ClientInfo>;
  onClose: () => void;
}

function DayDetail({ date, events, clientMap, onClose }: DayDetailProps) {
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
          const clientInfo = clientMap.get(clientId);
          const clientColor = clientInfo?.color || '#6366f1';
          return (
            <div key={clientId} className="space-y-1">
              <button
                onClick={() =>
                  router.push(`/clients/${clientId}/new-client-dashboard`)
                }
                className="text-xs font-semibold hover:underline flex items-center gap-2"
                style={{ color: clientColor }}
              >
                <span 
                  className="w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold text-white"
                  style={{ backgroundColor: clientColor }}
                >
                  {clientInfo?.initials || clientName.slice(0, 2).toUpperCase()}
                </span>
                {clientName}
              </button>
              {clientEvents.map((ev) => {
                const cfg = eventConfig(ev.type, ev.category);
                let chipBg = '';
                let chipText = '';
                let chipBorder = '';
                
                if (ev.type === 'channel-end') {
                  chipBg = '#fef2f2';
                  chipText = '#ef4444';
                  chipBorder = '#fecaca';
                } else if (ev.type === 'health-check') {
                  chipBg = '#fffbeb';
                  chipText = '#d97706';
                  chipBorder = '#fde68a';
                } else if (ev.type === 'action-point') {
                  chipBg = '#f3e8ff';
                  chipText = '#9333ea';
                  chipBorder = '#e9d5ff';
                } else {
                  chipBg = hexToRgba(clientColor, 0.1);
                  chipText = clientColor;
                  chipBorder = hexToRgba(clientColor, 0.25);
                }
                
                return (
                  <div
                    key={ev.id}
                    className="flex items-start gap-2 text-xs px-2 py-1.5 rounded border"
                    style={{
                      backgroundColor: chipBg,
                      color: chipText,
                      borderColor: chipBorder,
                    }}
                  >
                    <span className="mt-0.5 text-[10px]">{cfg.icon}</span>
                    <div className="min-w-0 flex-1">
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
    { icon: '▶', label: 'Channel starts', color: '#10b981' },
    { icon: '■', label: 'Channel ends', color: '#ef4444' },
    { icon: '◇', label: 'Health check due', color: '#d97706' },
    { icon: '⚡', label: 'Action points due', color: '#9333ea' },
  ];
  return (
    <div className="flex flex-wrap gap-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <div 
            className="flex items-center justify-center w-5 h-5 rounded border text-[10px]"
            style={{ 
              backgroundColor: `${item.color}1A`,
              borderColor: `${item.color}40`,
              color: item.color,
            }}
          >
            {item.icon}
          </div>
          <span className="text-xs text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AgencyCalendarProps {
  clients?: Array<{ id: string; name: string }>;
}

export function AgencyCalendar({ clients = [] }: AgencyCalendarProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-indexed
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<{ date: Date; events: CalendarEvent[] } | null>(null);

  const todayStr = toDateStr(now);

  // Build client map for colors and initials
  const clientMap = useMemo(() => {
    const map = new Map<string, ClientInfo>();
    for (const client of clients) {
      map.set(client.id, {
        id: client.id,
        name: client.name,
        color: clientColor(client.id),
        initials: clientInitials(client.name),
      });
    }
    // Also add clients from events that might not be in the clients prop
    for (const ev of events) {
      if (!map.has(ev.clientId)) {
        map.set(ev.clientId, {
          id: ev.clientId,
          name: ev.clientName,
          color: clientColor(ev.clientId),
          initials: clientInitials(ev.clientName),
        });
      }
    }
    return map;
  }, [clients, events]);

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

  // Label for the "go to today" button
  const viewLabel = useMemo(() => {
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const monthDiff = (year - currentYear) * 12 + (month - currentMonth);
    if (monthDiff === 0) return 'This month';
    if (monthDiff === 1) return 'Next month';
    if (monthDiff === -1) return 'Last month';
    if (monthDiff > 1) return `in ${monthDiff} months`;
    return `${Math.abs(monthDiff)} months ago`;
  }, [year, month, now]);

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

          {/* Navigation */}
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
              {viewLabel}
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
                      className="min-h-[80px] border-b border-r border-border bg-muted/20"
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
                    clientMap={clientMap}
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
                  clientMap={clientMap}
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
