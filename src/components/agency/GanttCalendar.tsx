// src/components/agency/GanttCalendar.tsx
// Gantt-style timeline view of the current month showing all client channels.

'use client';

import { useMemo, useRef, useEffect } from 'react';
import { Facebook, Instagram, Search, Linkedin, Music, Radio } from 'lucide-react';
import { getChannelLogo } from '@/lib/utils/channel-icons';

// ── Types ────────────────────────────────────────────────────────────────────

export interface GanttClient {
  id: string;
  name: string;
  initials: string;
  color: string;
}

export interface GanttChannel {
  id: string;
  client_id: string;
  label: string;
  start_date: string | null; // YYYY-MM-DD
  end_date: string | null;   // YYYY-MM-DD
  type: 'paid' | 'organic';
}

export interface GanttHealthCheck {
  client_id: string;
  channel_label: string;
  due_date: string; // YYYY-MM-DD
}

export interface GanttSetupPoint {
  client_id: string;
  channel_label: string;
  due_date: string; // YYYY-MM-DD
}

export interface GanttPointEvent {
  client_id: string;
  day: number;
  type: 'start' | 'end' | 'action';
  label: string;
}

export interface GanttCalendarProps {
  clients: GanttClient[];
  channels?: GanttChannel[];
  healthChecks?: GanttHealthCheck[];
  setupPoints?: GanttSetupPoint[];
  pointEvents?: GanttPointEvent[];
  selectedDay: number | null;
  onDaySelect: (day: number | null) => void;
  filteredClientIds: string[];
  currentMonth: Date;
  /** Optional compact window mode: show only a slice of the month around "today". */
  compactWindow?: boolean;
  /** Days to show before today when compactWindow is true (default: 1). */
  windowPastDays?: number;
  /** Days to show after today when compactWindow is true (default: 8). */
  windowFutureDays?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Brand colours for channel bars — matches platform logo hues. */
function getChannelBarColor(label: string, type: 'paid' | 'organic'): { bg: string; border: string } {
  const lower = label.toLowerCase();
  if (lower.includes('meta') || lower.includes('facebook')) return { bg: 'rgba(24,119,242,0.22)', border: 'rgba(24,119,242,0.4)' };
  if (lower.includes('google')) return { bg: 'rgba(66,133,244,0.22)', border: 'rgba(66,133,244,0.4)' };
  if (lower.includes('linkedin')) return { bg: 'rgba(10,102,194,0.22)', border: 'rgba(10,102,194,0.4)' };
  if (lower.includes('tiktok')) return { bg: 'rgba(105,201,208,0.28)', border: 'rgba(105,201,208,0.5)' };
  if (lower.includes('youtube')) return { bg: 'rgba(255,0,0,0.18)', border: 'rgba(255,0,0,0.35)' };
  if (lower.includes('pinterest')) return { bg: 'rgba(230,0,35,0.18)', border: 'rgba(230,0,35,0.35)' };
  if (type === 'organic') return { bg: 'rgba(74,124,89,0.22)', border: 'rgba(74,124,89,0.4)' };
  return { bg: 'rgba(74,101,128,0.22)', border: 'rgba(74,101,128,0.4)' };
}

/** Normalize a channel label so "Google Ads", "Google-Ads", "google ads" all map to the same key. */
function normalizeChannelLabel(label: string): string {
  const lower = label.toLowerCase().trim();
  if (lower.includes('meta') || lower.includes('facebook')) return 'meta-ads';
  if (lower.includes('google')) return 'google-ads';
  if (lower.includes('linkedin')) return 'linkedin-ads';
  if (lower.includes('tiktok')) return 'tiktok-ads';
  return lower;
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function parseDayNum(dateStr: string, year: number, month: number): number | null {
  // month is 1-indexed
  const parts = dateStr.split('-');
  if (parts.length < 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (y === year && m === month) return d;
  // Clamp: if before month, return 1; if after month, return last day of month
  const dInMonth = new Date(year, month, 0).getDate();
  if (y < year || (y === year && m < month)) return 1;
  if (y > year || (y === year && m > month)) return dInMonth;
  return null;
}

function clampDay(day: number, max: number): number {
  return Math.max(1, Math.min(max, day));
}

function getChannelIcon(label: string, type: 'paid' | 'organic') {
  // For organic channels, use a simple icon
  if (type === 'organic') {
    return <Radio size={11} strokeWidth={1.5} color="#8A8578" />;
  }
  // For paid channels, use colored logos
  return getChannelLogo(label, "w-[11px] h-[11px]");
}

// ── Sub-components ───────────────────────────────────────────────────────────

interface RulerCellProps {
  day: number;
  isToday: boolean;
  isSelected: boolean;
  densityCount: number;
  maxDensity: number;
  daysInMo: number;
  onSelect: (d: number) => void;
}

function RulerCell({ day, isToday, isSelected, densityCount, maxDensity, daysInMo, onSelect }: RulerCellProps) {
  const dotSize = maxDensity > 0 ? Math.max(2, Math.round((densityCount / maxDensity) * 4)) : 0;
  return (
    <div
      onClick={() => onSelect(day)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: 3,
        cursor: 'pointer',
        gap: 1,
        userSelect: 'none',
      }}
    >
      {/* Density dot */}
      <div style={{
        width: dotSize,
        height: dotSize,
        borderRadius: '50%',
        background: densityCount > 0 ? '#B5B0A5' : 'transparent',
        flexShrink: 0,
        marginBottom: 1,
      }} />
      {/* Day number */}
      <span style={{
        fontSize: isToday ? 9 : 7.5,
        fontWeight: isToday ? 500 : 400,
        color: isToday ? '#1C1917' : '#B5B0A5',
        lineHeight: 1,
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}>
        {day}
      </span>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function GanttCalendar({
  clients,
  channels = [],
  healthChecks = [],
  setupPoints = [],
  pointEvents = [],
  selectedDay,
  onDaySelect,
  filteredClientIds,
  currentMonth,
  compactWindow = false,
  windowPastDays = 1,
  windowFutureDays = 8,
}: GanttCalendarProps) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth() + 1; // 1-indexed
  const daysInMo = daysInMonth(currentMonth);
  const todayDay = new Date().getDate();
  const todayMonth = new Date().getMonth() + 1;
  const todayYear = new Date().getFullYear();
  const isCurrentMonth = todayYear === year && todayMonth === month;
  const today = isCurrentMonth ? todayDay : null;
  const lastDay = daysInMo;

  const filteredSet = useMemo(() => new Set(filteredClientIds), [filteredClientIds]);
  const filteredClients = useMemo(
    () => clients.filter(c => filteredSet.has(c.id)),
    [clients, filteredSet]
  );

  // Index channels by client
  const channelsByClient = useMemo(() => {
    const map = new Map<string, GanttChannel[]>();
    for (const ch of channels) {
      if (!map.has(ch.client_id)) map.set(ch.client_id, []);
      map.get(ch.client_id)!.push(ch);
    }
    return map;
  }, [channels]);

  // Index health checks by client+normalised-channel
  const hcByClientChannel = useMemo(() => {
    const map = new Map<string, GanttHealthCheck[]>();
    for (const hc of healthChecks) {
      const key = `${hc.client_id}:${normalizeChannelLabel(hc.channel_label)}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(hc);
    }
    return map;
  }, [healthChecks]);

  // Index setup points by client+normalised-channel
  const spByClientChannel = useMemo(() => {
    const map = new Map<string, GanttSetupPoint[]>();
    for (const sp of setupPoints) {
      const key = `${sp.client_id}:${normalizeChannelLabel(sp.channel_label)}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(sp);
    }
    return map;
  }, [setupPoints]);

  // Index point events by client+day
  const pointsByClientDay = useMemo(() => {
    const map = new Map<string, GanttPointEvent[]>();
    for (const pe of pointEvents) {
      const key = `${pe.client_id}:${pe.day}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(pe);
    }
    return map;
  }, [pointEvents]);

  // Density: events per day (channel starts + ends + action events in current month)
  const densityByDay = useMemo(() => {
    const counts = new Array<number>(daysInMo + 1).fill(0);
    for (const ch of channels) {
      if (!filteredSet.has(ch.client_id)) continue;
      if (ch.start_date) {
        const d = parseDayNum(ch.start_date, year, month);
        if (d && d >= 1 && d <= daysInMo) counts[d]++;
      }
      if (ch.end_date) {
        const d = parseDayNum(ch.end_date, year, month);
        if (d && d >= 1 && d <= daysInMo) counts[d]++;
      }
    }
    for (const pe of pointEvents) {
      if (!filteredSet.has(pe.client_id)) continue;
      if (pe.day >= 1 && pe.day <= daysInMo) counts[pe.day]++;
    }
    return counts;
  }, [channels, pointEvents, filteredSet, daysInMo, year, month]);

  const maxDensity = useMemo(() => Math.max(...densityByDay), [densityByDay]);

  // Always show the full month; horizontal scroll handles navigation
  const days = useMemo(() => Array.from({ length: daysInMo }, (_, i) => i + 1), [daysInMo]);

  const windowStart = 1;
  const windowEnd   = daysInMo;
  const windowSpan  = daysInMo;
  const visibleDays = days;

  // Today's column left% within the visible window
  const todayLeftPct =
    today !== null && today >= windowStart && today <= windowEnd
      ? ((today - windowStart + 0.5) / windowSpan) * 100
      : null;

  // Layout constants
  const LABEL_COL = 130; // px — fixed left label column
  const DAY_WIDTH = 38;  // px per day column — fixed so horizontal scroll works
  const LABEL_BG  = '#E5E0D8'; // darker colour for sticky client column + ruler header

  const containerRef = useRef<HTMLDivElement>(null);

  // On mount, scroll so yesterday sits just after the sticky column
  useEffect(() => {
    if (!containerRef.current || !today) return;
    const yesterdayIdx = Math.max(0, today - 2);
    containerRef.current.scrollLeft = yesterdayIdx * DAY_WIDTH;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDayClick = (day: number) => {
    onDaySelect(selectedDay === day ? null : day);
  };

  return (
    <div ref={containerRef} style={{ overflowX: 'auto', overflowY: 'hidden', background: '#FDFCF8', borderRadius: 4, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ minWidth: LABEL_COL + daysInMo * DAY_WIDTH }}>
      {/* ── Ruler row ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: `${LABEL_COL}px 1fr` }}>
        {/* Label cell */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            paddingBottom: 4,
            paddingLeft: 8,
            position: 'sticky',
            left: 0,
            zIndex: 5,
            background: LABEL_BG,
          }}
        >
          <span style={{ fontSize: 9, color: '#8A8070', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Client
          </span>
        </div>
        {/* Days ruler — same background as the sticky client column */}
        <div style={{ position: 'relative', height: 28, background: LABEL_BG }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${daysInMo}, ${DAY_WIDTH}px)`, height: '100%' }}>
            {visibleDays.map(day => (
              <RulerCell
                key={day}
                day={day}
                isToday={today === day}
                isSelected={selectedDay === day}
                densityCount={densityByDay[day]}
                maxDensity={maxDensity}
                daysInMo={daysInMo}
                onSelect={handleDayClick}
              />
            ))}
          </div>
          {/* Selected day column highlight — rendered over the ruler */}
          {selectedDay !== null && selectedDay >= windowStart && selectedDay <= windowEnd && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: `${((selectedDay - windowStart) / windowSpan) * 100}%`,
                width: `${(1 / windowSpan) * 100}%`,
                height: '100%',
                background: 'rgba(74,101,128,0.06)',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      </div>

      {/* ── Client rows ───────────────────────────────────────── */}
      {filteredClients.map(client => {
        const clientChannels = channelsByClient.get(client.id) || [];

        return (
          <div key={client.id} style={{ borderTop: '1.5px solid #C8C4BC', marginTop: 2 }}>
            {/* Client header row (24px) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: `${LABEL_COL}px 1fr`,
              height: 24,
            }}>
              {/* Left label */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                paddingLeft: 8,
                position: 'sticky',
                left: 0,
                zIndex: 5,
                background: LABEL_BG,
              }}
              >
                <div style={{
                  width: 15, height: 15, borderRadius: 3,
                  background: '#E8E5DE',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: 8, fontWeight: 500, color: '#8A8578' }}>
                    {client.initials}
                  </span>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 500, color: '#1C1917',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {client.name}
                </span>
              </div>

              {/* Right: today line + point event icons */}
              <div style={{ position: 'relative' }}>
                {/* Today vertical line */}
                {todayLeftPct !== null && (
                  <div style={{
                    position: 'absolute',
                    left: `${todayLeftPct}%`,
                    top: 0,
                    bottom: 0,
                    width: '0.5px',
                    background: '#D5D0C5',
                    pointerEvents: 'none',
                  }} />
                )}
                {/* Selected column highlight */}
                {selectedDay !== null && selectedDay >= windowStart && selectedDay <= windowEnd && (
                  <div style={{
                    position: 'absolute',
                    left: `${((selectedDay - windowStart) / windowSpan) * 100}%`,
                    width: `${(1 / windowSpan) * 100}%`,
                    top: 0, bottom: 0,
                    background: 'rgba(74,101,128,0.06)',
                    pointerEvents: 'none',
                  }} />
                )}
                {/* Point events for this client */}
                {visibleDays.map(day => {
                  const events = pointsByClientDay.get(`${client.id}:${day}`) || [];
                  return events.map((pe, idx) => {
                    const leftPct = ((day - windowStart + 0.5) / windowSpan) * 100;
                    const iconConfig = pe.type === 'start'
                      ? { bg: 'rgba(74,124,89,0.15)', color: '#4A7C59', symbol: '▶' }
                      : pe.type === 'end'
                      ? { bg: 'rgba(160,68,42,0.12)', color: '#A0442A', symbol: '■' }
                      : { bg: 'rgba(74,101,128,0.15)', color: '#4A6580', symbol: '⚡' };
                    return (
                      <div
                        key={`${day}-${idx}`}
                        title={pe.label}
                        style={{
                          position: 'absolute',
                          left: `${leftPct}%`,
                          top: '50%',
                          transform: 'translate(-50%, -50%)',
                          width: 12, height: 12,
                          borderRadius: '50%',
                          background: iconConfig.bg,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          zIndex: 2,
                        }}
                      >
                        <span style={{ fontSize: 6, color: iconConfig.color, lineHeight: 1 }}>
                          {iconConfig.symbol}
                        </span>
                      </div>
                    );
                  });
                })}
              </div>
            </div>

            {/* Per-channel sub-rows (24px each) */}
            {clientChannels.map(ch => {
              // Parse start/end day numbers, clamping to month boundaries
              let startDay: number | null = null;
              let endDay: number | null = null;

              if (ch.start_date) {
                const parts = ch.start_date.split('-').map(Number);
                if (parts.length >= 3) {
                  const y2 = parts[0], m2 = parts[1], d2 = parts[2];
                  if (y2 < year || (y2 === year && m2 < month)) {
                    startDay = 1;
                  } else if (y2 === year && m2 === month) {
                    startDay = d2;
                  }
                  // If start is after this month, channel is not in this month
                }
              }

              if (ch.end_date) {
                const parts = ch.end_date.split('-').map(Number);
                if (parts.length >= 3) {
                  const y2 = parts[0], m2 = parts[1], d2 = parts[2];
                  if (y2 > year || (y2 === year && m2 > month)) {
                    endDay = daysInMo;
                  } else if (y2 === year && m2 === month) {
                    endDay = d2;
                  }
                  // If end is before this month, channel doesn't span this month
                }
              }

              // Skip if channel doesn't intersect this month at all
              if (startDay === null && endDay === null) return null;
              if (ch.start_date && !startDay && endDay) startDay = 1;
              if (ch.end_date && !endDay && startDay) endDay = daysInMo;
              if (!startDay) startDay = 1;
              if (!endDay) endDay = daysInMo;

              // Clip bar to visible window when in compact mode
              const visibleStartDay = Math.max(startDay, windowStart);
              const visibleEndDay = Math.min(endDay, windowEnd);
              if (visibleEndDay < windowStart || visibleStartDay > windowEnd) {
                // Channel bar is completely outside the visible window
                return null;
              }

              const barLeftPct = ((visibleStartDay - windowStart) / windowSpan) * 100;
              const barWidthPct = ((visibleEndDay - visibleStartDay + 1) / windowSpan) * 100;
              const endsBeforeMonthEnd = endDay < daysInMo;

              // Health checks and setup points for this channel (normalised key for matching)
              const hcKey = `${client.id}:${normalizeChannelLabel(ch.label)}`;
              const chHealthChecks = hcByClientChannel.get(hcKey) || [];
              const chSetupPoints = spByClientChannel.get(hcKey) || [];

              return (
                <div
                  key={ch.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `${LABEL_COL}px 1fr`,
                    height: 24,
                  }}
                >
                  {/* Channel label + media icon */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      paddingLeft: 18,
                      overflow: 'hidden',
                      position: 'sticky',
                      left: 0,
                      zIndex: 5,
                      background: LABEL_BG,
                      boxShadow: 'inset -1px 0 0 #C8C0B4',
                    }}
                  >
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {getChannelIcon(ch.label, ch.type)}
                    </div>
                    <span
                      style={{
                        fontSize: 9,
                        color: '#8A8578',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ch.label}
                    </span>
                  </div>

                  {/* Timeline area */}
                  <div style={{ position: 'relative', overflow: 'visible' }}>
                    {/* Today line */}
                    {todayLeftPct !== null && (
                      <div style={{
                        position: 'absolute',
                        left: `${todayLeftPct}%`,
                        top: 0, bottom: 0,
                        width: '0.5px',
                        background: '#D5D0C5',
                        pointerEvents: 'none',
                        zIndex: 1,
                      }} />
                    )}
                    {/* Selected column highlight */}
                    {selectedDay !== null && selectedDay >= windowStart && selectedDay <= windowEnd && (
                      <div style={{
                        position: 'absolute',
                        left: `${((selectedDay - 1) / daysInMo) * 100}%`,
                        width: `${(1 / daysInMo) * 100}%`,
                        top: 0, bottom: 0,
                        background: 'rgba(74,101,128,0.06)',
                        pointerEvents: 'none',
                        zIndex: 0,
                      }} />
                    )}

                    {/* Channel bar — brand colours per platform */}
                    {(() => {
                      const barColor = getChannelBarColor(ch.label, ch.type);
                      return (
                        <div style={{
                          position: 'absolute',
                          left: `${barLeftPct}%`,
                          width: `${barWidthPct}%`,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          height: 6,
                          background: barColor.bg,
                          border: `0.5px ${ch.type === 'organic' ? 'dashed' : 'solid'} ${barColor.border}`,
                          borderRadius: 3,
                          zIndex: 2,
                          boxSizing: 'border-box',
                        }} />
                      );
                    })()}

                    {/* Start dot (clipped to visible window) */}
                    <div style={{
                      position: 'absolute',
                      left: `${barLeftPct}%`,
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: 6, height: 6,
                      borderRadius: '50%',
                      background: '#4A7C59',
                      zIndex: 3,
                    }} />

                    {/* End dot (clipped to visible window) */}
                    <div style={{
                      position: 'absolute',
                      left: `${((visibleEndDay - windowStart + 1) / windowSpan) * 100}%`,
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: 6, height: 6,
                      borderRadius: '50%',
                      background: endsBeforeMonthEnd ? '#A0442A' : '#B5B0A5',
                      zIndex: 3,
                    }} />

                    {/* Health check diamonds */}
                    {chHealthChecks.map((hc, hcIdx) => {
                      const hcDay = parseDayNum(hc.due_date, year, month);
                      if (!hcDay) return null;
                      if (hcDay < windowStart || hcDay > windowEnd) return null;
                      const hcLeftPct = ((hcDay - windowStart + 0.5) / windowSpan) * 100;
                      return (
                        <div
                          key={hcIdx}
                          title={`Health check: ${hc.due_date}`}
                          style={{
                            position: 'absolute',
                            left: `${hcLeftPct}%`,
                            top: '50%',
                            transform: 'translate(-50%, -50%) rotate(45deg)',
                            width: 7, height: 7,
                            background: '#FDFCF8',
                            border: '1px solid #B07030',
                            zIndex: 4,
                          }}
                        />
                      );
                    })}

                    {/* Set Up action point dots */}
                    {chSetupPoints.map((sp, spIdx) => {
                      const spDay = parseDayNum(sp.due_date, year, month);
                      if (!spDay) return null;
                      if (spDay < windowStart || spDay > windowEnd) return null;
                      const spLeftPct = ((spDay - windowStart + 0.5) / windowSpan) * 100;
                      return (
                        <div
                          key={spIdx}
                          title={`Set Up due: ${sp.due_date}`}
                          style={{
                            position: 'absolute',
                            left: `${spLeftPct}%`,
                            top: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: 6, height: 6,
                            borderRadius: '50%',
                            background: '#A0442A',
                            zIndex: 4,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* ── Activity density bar ──────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `${LABEL_COL}px 1fr`,
        height: 18,
        marginTop: 4,
        borderTop: '0.5px solid #E8E4DC',
      }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            paddingLeft: 8,
            paddingBottom: 2,
            position: 'sticky',
            left: 0,
            zIndex: 5,
            background: LABEL_BG,
          }}
        >
          <span style={{ fontSize: 7, color: '#8A8070', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Activity
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${daysInMo}, ${DAY_WIDTH}px)`, alignItems: 'flex-end', height: '100%' }}>
          {visibleDays.map(day => {
            const count = densityByDay[day];
            const heightPx = maxDensity > 0 ? Math.max(1, Math.round((count / maxDensity) * 10)) : 0;
            return (
              <div key={day} style={{ display: 'flex', alignItems: 'flex-end', height: '100%', paddingBottom: 2 }}>
                {count > 0 && (
                  <div style={{
                    width: '80%',
                    height: heightPx,
                    background: '#B5B0A5',
                    borderRadius: 1,
                    margin: '0 auto',
                  }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Legend row ───────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '5px 10px',
        flexWrap: 'wrap',
        borderTop: '0.5px solid #E8E4DC',
      }}>
        {[
          { symbol: '▶', color: '#4A7C59', label: 'Start' },
          { symbol: '■', color: '#A0442A', label: 'End' },
          { symbol: '⚡', color: '#4A6580', label: 'Action' },
          { symbol: '◇', color: '#B07030', label: 'Health Check' },
          { symbol: '●', color: '#A0442A', label: 'Set Up' },
          { symbol: '▬', color: '#8A8578', label: 'Paid' },
          { symbol: '╌', color: '#8A8578', label: 'Organic' },
        ].map(item => (
          <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 8, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
            <span style={{ color: item.color }}>{item.symbol}</span>
            {item.label}
          </span>
        ))}
      </div>
      </div>
    </div>
  );
}
