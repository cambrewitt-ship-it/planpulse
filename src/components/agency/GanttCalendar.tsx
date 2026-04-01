// src/components/agency/GanttCalendar.tsx
// Gantt-style continuous scrollable timeline of client channels.

'use client';

import { useMemo, useRef, useEffect } from 'react';
import { Radio } from 'lucide-react';
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
  /** Kept for API compatibility but not used for display range (always centers on Today). */
  currentMonth: Date;
  /** @deprecated No longer used. */
  compactWindow?: boolean;
  windowPastDays?: number;
  windowFutureDays?: number;
}

// ── Palette ───────────────────────────────────────────────────────────────────

// Channel-specific bar colours — solid bg + solid border
function getChannelBarColor(label: string, type: 'paid' | 'organic', status: ChannelStatusSimple): { bg: string; border: string } {
  if (status === 'completed') return { bg: '#C8D8C4', border: '#6A9E6A' };
  if (status === 'future')    return { bg: '#D8D8D8', border: '#A0A0A0' };

  const l = label.toLowerCase();
  if (l.includes('meta') || l.includes('facebook'))  return { bg: '#BFDBFE', border: '#1877F2' };
  if (l.includes('google'))                           return { bg: '#FDE68A', border: '#D97706' };
  if (l.includes('linkedin'))                         return { bg: '#BAE6FD', border: '#0A66C2' };
  if (l.includes('tiktok'))                           return { bg: '#99F6E4', border: '#0D9488' };
  if (l.includes('instagram'))                        return { bg: '#FBCFE8', border: '#C13584' };
  if (l.includes('youtube'))                          return { bg: '#FECACA', border: '#EF4444' };
  if (l.includes('pinterest'))                        return { bg: '#FECDD3', border: '#E60023' };
  if (l.includes('snapchat'))                         return { bg: '#FEF08A', border: '#CA8A04' };
  if (l.includes('twitter') || l.includes('x ads') || l.includes('x-ads')) return { bg: '#BAE6FD', border: '#1DA1F2' };
  if (l.includes('bing') || l.includes('microsoft'))  return { bg: '#DDD6FE', border: '#5C6BC0' };
  if (l.includes('programmatic') || l.includes('display') || l.includes('dv360')) return { bg: '#C7D2FE', border: '#4F46E5' };
  if (type === 'organic')                             return { bg: '#BBF7D0', border: '#16A34A' };
  return                                               { bg: '#CBD5E1', border: '#64748B' };
}

type ChannelStatusSimple = 'completed' | 'active' | 'future';

const ROW_COLORS = ['#FAF9F8', '#F4F1EE'] as const;

// ── Date helpers ──────────────────────────────────────────────────────────────

function dateToMs(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function msToStr(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getChannelStatus(ch: GanttChannel, todayStr: string): ChannelStatusSimple {
  if (ch.end_date && ch.end_date < todayStr) return 'completed';
  if (ch.start_date && ch.start_date > todayStr) return 'future';
  return 'active';
}

function normalizeChannelLabel(label: string): string {
  const lower = label.toLowerCase().trim();
  if (lower.includes('meta') || lower.includes('facebook')) return 'meta-ads';
  if (lower.includes('google'))   return 'google-ads';
  if (lower.includes('linkedin')) return 'linkedin-ads';
  if (lower.includes('tiktok'))   return 'tiktok-ads';
  return lower;
}

function getChannelIcon(label: string, type: 'paid' | 'organic') {
  if (type === 'organic') {
    return <Radio size={11} strokeWidth={1.5} color="#8A8578" />;
  }
  return getChannelLogo(label, "w-[11px] h-[11px]");
}

// ── Main component ────────────────────────────────────────────────────────────

export function GanttCalendar({
  clients,
  channels = [],
  healthChecks = [],
  setupPoints = [],
  filteredClientIds,
  selectedDay,
  onDaySelect,
}: GanttCalendarProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const todayStr = useMemo(() => {
    const d = new Date();
    return msToStr(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }, []);

  // Compute the continuous date range: 1 month back to 12 months forward,
  // extended to cover all channel start/end dates.
  const { rangeStartMs, rangeEndMs } = useMemo(() => {
    const todayMs = dateToMs(todayStr);
    let lo = todayMs - 31 * 86400000;
    let hi = todayMs + 365 * 86400000;
    for (const ch of channels) {
      if (ch.start_date) { const s = dateToMs(ch.start_date); if (s < lo) lo = s; }
      if (ch.end_date)   { const e = dateToMs(ch.end_date);   if (e > hi) hi = e; }
    }
    // Snap to month boundaries
    const loD = new Date(lo), hiD = new Date(hi);
    return {
      rangeStartMs: Date.UTC(loD.getUTCFullYear(), loD.getUTCMonth(), 1),
      rangeEndMs:   Date.UTC(hiD.getUTCFullYear(), hiD.getUTCMonth() + 1, 0),
    };
  }, [channels, todayStr]);

  const dayList = useMemo(() => {
    const l: string[] = [];
    for (let ms = rangeStartMs; ms <= rangeEndMs; ms += 86400000) l.push(msToStr(ms));
    return l;
  }, [rangeStartMs, rangeEndMs]);

  const dateIndex = useMemo(() => {
    const m = new Map<string, number>();
    dayList.forEach((s, i) => m.set(s, i));
    return m;
  }, [dayList]);

  const todayIdx = useMemo(() => dateIndex.get(todayStr) ?? null, [dateIndex, todayStr]);

  // Month header groups
  const monthGroups = useMemo(() => {
    const g: Array<{ label: string; startIdx: number; dayCount: number }> = [];
    let cur: (typeof g)[0] | null = null;
    dayList.forEach((s, i) => {
      const mo = parseInt(s.slice(5, 7), 10) - 1;
      const yr = parseInt(s.slice(0, 4), 10);
      const label = `${MONTH_SHORT[mo]} ${yr}`;
      if (!cur || cur.label !== label) {
        cur = { label, startIdx: i, dayCount: 1 };
        g.push(cur);
      } else {
        cur.dayCount++;
      }
    });
    return g;
  }, [dayList]);

  const totalDays = dayList.length;

  // Layout constants
  const LABEL_COL = 130;
  const DAY_WIDTH = 38;
  const RULER_BG  = '#E5E0D8';
  const Z_STICKY  = 20; // above all timeline z-indices (bars=4, dots=5, markers=6)

  const filteredSet = useMemo(() => new Set(filteredClientIds), [filteredClientIds]);
  const filteredClients = useMemo(
    () => clients.filter(c => filteredSet.has(c.id)),
    [clients, filteredSet]
  );

  const channelsByClient = useMemo(() => {
    const map = new Map<string, GanttChannel[]>();
    for (const ch of channels) {
      if (!map.has(ch.client_id)) map.set(ch.client_id, []);
      map.get(ch.client_id)!.push(ch);
    }
    return map;
  }, [channels]);

  const hcByClientChannel = useMemo(() => {
    const map = new Map<string, GanttHealthCheck[]>();
    for (const hc of healthChecks) {
      const key = `${hc.client_id}:${normalizeChannelLabel(hc.channel_label)}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(hc);
    }
    return map;
  }, [healthChecks]);

  const spByClientChannel = useMemo(() => {
    const map = new Map<string, GanttSetupPoint[]>();
    for (const sp of setupPoints) {
      const key = `${sp.client_id}:${normalizeChannelLabel(sp.channel_label)}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(sp);
    }
    return map;
  }, [setupPoints]);

  // Activity density per day (index into dayList)
  const densityByIdx = useMemo(() => {
    const counts = new Array<number>(totalDays).fill(0);
    for (const ch of channels) {
      if (!filteredSet.has(ch.client_id)) continue;
      if (ch.start_date) {
        const idx = dateIndex.get(ch.start_date);
        if (idx !== undefined) counts[idx]++;
      }
      if (ch.end_date) {
        const idx = dateIndex.get(ch.end_date);
        if (idx !== undefined) counts[idx]++;
      }
    }
    return counts;
  }, [channels, filteredSet, dateIndex, totalDays]);

  const maxDensity = useMemo(() => Math.max(...densityByIdx, 1), [densityByIdx]);

  // Scroll to today on mount — yesterday sits at the left edge, today + 8 days visible ahead
  useEffect(() => {
    if (!containerRef.current || todayIdx === null) return;
    containerRef.current.scrollLeft = Math.max(0, (todayIdx - 1) * DAY_WIDTH);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDayClick = (dateStr: string) => {
    const d = parseInt(dateStr.slice(8, 10), 10);
    onDaySelect(selectedDay === d ? null : d);
  };

  const totalW = totalDays * DAY_WIDTH;

  // Helper: get pixel left for a date string
  const pxLeft = (dateStr: string) => {
    const idx = dateIndex.get(dateStr);
    return idx !== undefined ? idx * DAY_WIDTH : null;
  };

  const todayPx = todayIdx !== null ? todayIdx * DAY_WIDTH : null;

  return (
    <div
      ref={containerRef}
      style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 394, width: '100%', minWidth: 0, background: '#FAF9F8', borderRadius: 4, fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <div style={{ width: LABEL_COL + totalW, position: 'relative' }}>

        {/* ── Month header row ──────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: `${LABEL_COL}px ${totalW}px`, height: 18 }}>
          <div style={{
            position: 'sticky', left: 0, zIndex: Z_STICKY,
            background: RULER_BG,
            borderBottom: '0.5px solid rgba(0,0,0,0.08)',
          }} />
          <div style={{ position: 'relative', background: RULER_BG, borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
            {monthGroups.map(grp => (
              <div
                key={grp.label}
                style={{
                  position: 'absolute',
                  left: grp.startIdx * DAY_WIDTH,
                  width: grp.dayCount * DAY_WIDTH,
                  height: '100%',
                  display: 'flex', alignItems: 'center',
                  paddingLeft: 6,
                  borderLeft: '0.5px solid rgba(0,0,0,0.10)',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                }}
              >
                <span style={{ fontSize: 8, fontWeight: 600, color: '#5C5650', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                  {grp.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Day ruler row ──────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: `${LABEL_COL}px ${totalW}px`, height: 28 }}>
          <div style={{
            display: 'flex', alignItems: 'flex-end',
            paddingBottom: 4, paddingLeft: 8,
            position: 'sticky', left: 0, zIndex: Z_STICKY,
            background: RULER_BG,
          }}>
            <span style={{ fontSize: 9, color: '#1C1917', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Client
            </span>
          </div>

          <div style={{ position: 'relative', height: 28, background: RULER_BG }}>
            {/* Day numbers */}
            {dayList.map((dateStr, idx) => {
              const dayNum = parseInt(dateStr.slice(8, 10), 10);
              const isToday = dateStr === todayStr;
              const dotCount = densityByIdx[idx];
              const dotSize = dotCount > 0 ? Math.max(2, Math.round((dotCount / maxDensity) * 4)) : 0;
              return (
                <div
                  key={dateStr}
                  onClick={() => handleDayClick(dateStr)}
                  style={{
                    position: 'absolute',
                    left: idx * DAY_WIDTH,
                    width: DAY_WIDTH,
                    height: '100%',
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
                  <div style={{
                    width: dotSize, height: dotSize,
                    borderRadius: '50%',
                    background: dotCount > 0 ? '#B5B0A5' : 'transparent',
                    flexShrink: 0, marginBottom: 1,
                  }} />
                  <span style={{
                    fontSize: isToday ? 9 : 7.5,
                    fontWeight: isToday ? 600 : 400,
                    color: isToday ? '#1C1917' : '#4C4840',
                    lineHeight: 1,
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}>
                    {dayNum}
                  </span>
                </div>
              );
            })}

            {/* Today amber band in ruler */}
            {todayPx !== null && (
              <TodayOverlay px={todayPx} dayWidth={DAY_WIDTH} />
            )}
          </div>
        </div>

        {/* ── Client rows ────────────────────────────────────── */}
        {filteredClients.map((client, clientIdx) => {
          const clientChannels = channelsByClient.get(client.id) || [];
          const rowBg = ROW_COLORS[clientIdx % 2];

          return (
            <div key={client.id}>
              <div style={{ height: '0.5px', background: 'rgba(0,0,0,0.06)' }} />

              {/* Client header row */}
              <div style={{ display: 'grid', gridTemplateColumns: `${LABEL_COL}px ${totalW}px`, height: 24 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  paddingLeft: 8,
                  position: 'sticky', left: 0, zIndex: Z_STICKY,
                  background: rowBg,
                }}>
                  <div style={{
                    width: 15, height: 15, borderRadius: 3,
                    background: 'rgba(0,0,0,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 8, fontWeight: 500, color: '#8A8578' }}>{client.initials}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 500, color: '#1C1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {client.name}
                  </span>
                </div>

                <div style={{ position: 'relative', background: rowBg, height: 24 }}>
                  {todayPx !== null && <TodayOverlay px={todayPx} dayWidth={DAY_WIDTH} />}
                  {/* Month dividers */}
                  {monthGroups.slice(1).map(grp => (
                    <div key={grp.label} style={{
                      position: 'absolute', left: grp.startIdx * DAY_WIDTH,
                      top: 0, bottom: 0, width: '0.5px',
                      background: 'rgba(0,0,0,0.06)', pointerEvents: 'none',
                    }} />
                  ))}
                </div>
              </div>

              {/* Per-channel sub-rows */}
              {clientChannels.map(ch => {
                if (!ch.start_date && !ch.end_date) return null;

                const startStr = ch.start_date ?? ch.end_date!;
                const endStr   = ch.end_date ?? ch.start_date!;

                // Clamp to range
                const clampedStart = startStr < dayList[0] ? dayList[0] : startStr > dayList[dayList.length - 1] ? null : startStr;
                const clampedEnd   = endStr > dayList[dayList.length - 1] ? dayList[dayList.length - 1] : endStr < dayList[0] ? null : endStr;

                if (!clampedStart || !clampedEnd) return null;

                const startIdx = dateIndex.get(clampedStart) ?? 0;
                const endIdx   = dateIndex.get(clampedEnd)   ?? totalDays - 1;

                if (endIdx < startIdx) return null;

                const barLeft  = startIdx * DAY_WIDTH;
                const barWidth = (endIdx - startIdx + 1) * DAY_WIDTH;

                const hcKey        = `${client.id}:${normalizeChannelLabel(ch.label)}`;
                const chHealthChecks = hcByClientChannel.get(hcKey) || [];
                const chSetupPoints  = spByClientChannel.get(hcKey) || [];

                const status     = getChannelStatus(ch, todayStr);
                const barColor   = getChannelBarColor(ch.label, ch.type, status);
                const barOpacity = status === 'future' ? 0.5 : 1;

                const startDotColor = barColor.border;
                const endDotColor   = status === 'completed' ? '#6A9E6A' : barColor.border;

                return (
                  <div
                    key={ch.id}
                    style={{ display: 'grid', gridTemplateColumns: `${LABEL_COL}px ${totalW}px`, height: 24 }}
                  >
                    {/* Channel label */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      paddingLeft: 18, overflow: 'hidden',
                      position: 'sticky', left: 0, zIndex: Z_STICKY,
                      background: rowBg,
                      boxShadow: 'inset -1px 0 0 rgba(0,0,0,0.06)',
                    }}>
                      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {getChannelIcon(ch.label, ch.type)}
                      </div>
                      <span style={{ fontSize: 9, color: '#1C1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ch.label}
                      </span>
                    </div>

                    {/* Timeline area */}
                    <div style={{ position: 'relative', overflow: 'visible', background: rowBg }}>
                      {/* Today overlay */}
                      {todayPx !== null && <TodayOverlay px={todayPx} dayWidth={DAY_WIDTH} />}

                      {/* Month dividers */}
                      {monthGroups.slice(1).map(grp => (
                        <div key={grp.label} style={{
                          position: 'absolute', left: grp.startIdx * DAY_WIDTH,
                          top: 0, bottom: 0, width: '0.5px',
                          background: 'rgba(0,0,0,0.06)', pointerEvents: 'none',
                        }} />
                      ))}

                      {/* Channel bar */}
                      <div style={{
                        position: 'absolute',
                        left: barLeft,
                        width: barWidth,
                        top: '50%', transform: 'translateY(-50%)',
                        height: 6,
                        background: barColor.bg,
                        border: `1px ${ch.type === 'organic' ? 'dashed' : 'solid'} ${barColor.border}`,
                        borderRadius: 3,
                        opacity: barOpacity,
                        zIndex: 4,
                        boxSizing: 'border-box',
                      }} />

                      {/* Start dot */}
                      <div style={{
                        position: 'absolute',
                        left: barLeft,
                        top: '50%', transform: 'translate(-50%, -50%)',
                        width: 5, height: 5, borderRadius: '50%',
                        background: startDotColor,
                        opacity: barOpacity, zIndex: 5,
                      }} />

                      {/* End dot */}
                      <div style={{
                        position: 'absolute',
                        left: barLeft + barWidth,
                        top: '50%', transform: 'translate(-50%, -50%)',
                        width: 5, height: 5, borderRadius: '50%',
                        background: endDotColor,
                        opacity: barOpacity, zIndex: 5,
                      }} />

                      {/* Health check diamonds */}
                      {chHealthChecks.map((hc, hcIdx) => {
                        const px = pxLeft(hc.due_date);
                        if (px === null) return null;
                        return (
                          <div
                            key={hcIdx}
                            title={`Health check: ${hc.due_date}`}
                            style={{
                              position: 'absolute',
                              left: px + DAY_WIDTH / 2,
                              top: '50%',
                              transform: 'translate(-50%, -50%) rotate(45deg)',
                              width: 7, height: 7,
                              background: '#FDFCF8',
                              border: '1px solid rgba(176, 112, 48, 0.60)',
                              zIndex: 6,
                            }}
                          />
                        );
                      })}

                      {/* Set Up dots */}
                      {chSetupPoints.map((sp, spIdx) => {
                        const px = pxLeft(sp.due_date);
                        if (px === null) return null;
                        return (
                          <div
                            key={spIdx}
                            title={`Set Up due: ${sp.due_date}`}
                            style={{
                              position: 'absolute',
                              left: px + DAY_WIDTH / 2,
                              top: '50%',
                              transform: 'translate(-50%, -50%)',
                              width: 5, height: 5, borderRadius: '50%',
                              background: 'rgba(160, 68, 42, 0.70)',
                              zIndex: 6,
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

        {/* ── Activity density bar ───────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `${LABEL_COL}px ${totalW}px`,
          height: 18, marginTop: 4,
          borderTop: '0.5px solid rgba(0,0,0,0.06)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'flex-end',
            paddingLeft: 8, paddingBottom: 2,
            position: 'sticky', left: 0, zIndex: Z_STICKY,
            background: RULER_BG,
          }}>
            <span style={{ fontSize: 7, color: '#8A8070', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Activity
            </span>
          </div>
          <div style={{ position: 'relative', height: 18 }}>
            {dayList.map((_, idx) => {
              const count    = densityByIdx[idx];
              const heightPx = count > 0 ? Math.max(1, Math.round((count / maxDensity) * 10)) : 0;
              return (
                <div
                  key={idx}
                  style={{
                    position: 'absolute',
                    left: idx * DAY_WIDTH,
                    width: DAY_WIDTH,
                    height: '100%',
                    display: 'flex', alignItems: 'flex-end', paddingBottom: 2,
                  }}
                >
                  {count > 0 && (
                    <div style={{
                      width: '80%', height: heightPx,
                      background: 'rgba(138, 133, 120, 0.45)',
                      borderRadius: 1, margin: '0 auto',
                    }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Legend ────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '5px 10px', flexWrap: 'wrap',
          borderTop: '0.5px solid rgba(0,0,0,0.06)',
        }}>
          {[
            { color: '#BFDBFE', border: '#1877F2', label: 'Active (Paid)' },
            { color: '#BBF7D0', border: '#16A34A', label: 'Active (Organic)' },
            { color: '#C8D8C4', border: '#6A9E6A', label: 'Completed' },
            { color: '#D8D8D8', border: '#A0A0A0', label: 'Upcoming' },
          ].map(item => (
            <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 8, color: '#8A8070', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
              <span style={{
                display: 'inline-block', width: 16, height: 5, borderRadius: 2,
                background: item.color,
                border: `1px solid ${item.border}`,
                verticalAlign: 'middle',
              }} />
              {item.label}
            </span>
          ))}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 8, color: '#8A8070' }}>
            <span style={{ display: 'inline-block', width: 7, height: 7, background: '#FDFCF8', border: '1px solid rgba(176,112,48,0.60)', transform: 'rotate(45deg)', verticalAlign: 'middle' }} />
            Health Check
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 8, color: '#8A8070' }}>
            <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'rgba(160,68,42,0.70)', verticalAlign: 'middle' }} />
            Set Up
          </span>
        </div>

      </div>
    </div>
  );
}

// ── Today overlay ─────────────────────────────────────────────────────────────

function TodayOverlay({ px, dayWidth }: { px: number; dayWidth: number }) {
  return (
    <>
      <div style={{
        position: 'absolute',
        left: px, width: dayWidth,
        top: 0, bottom: 0,
        background: 'rgba(180, 140, 50, 0.08)',
        pointerEvents: 'none', zIndex: 1,
      }} />
      <div style={{
        position: 'absolute',
        left: px + dayWidth / 2,
        top: 0, bottom: 0, width: '1px',
        background: 'rgba(180, 140, 50, 0.45)',
        pointerEvents: 'none', zIndex: 2,
      }} />
    </>
  );
}
