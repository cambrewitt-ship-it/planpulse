// src/components/agency/GanttCalendar.tsx
// Gantt-style continuous scrollable timeline of client channels.

'use client';

import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Radio } from 'lucide-react';
import { getChannelLogo } from '@/lib/utils/channel-icons';

// ── Types ────────────────────────────────────────────────────────────────────

export interface GanttClient {
  id: string;
  name: string;
  initials: string;
  color: string;
  logo_url?: string | null;
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

export interface GanttReportPoint {
  client_id: string;
  channel_label: string;
  due_date: string; // YYYY-MM-DD — end of the last channel flight in the plan
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
  reportPoints?: GanttReportPoint[];
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

// Channel-specific bar colours — darker solid fill, no border
function getChannelBarColor(label: string, type: 'paid' | 'organic', status: ChannelStatusSimple): { bg: string; border: string } {
  if (status === 'completed') return { bg: '#6A9E6A', border: '#6A9E6A' };
  if (status === 'future')    return { bg: '#B0B0B0', border: '#B0B0B0' };

  const l = label.toLowerCase();
  if (l.includes('meta') || l.includes('facebook'))  return { bg: '#1877F2', border: '#1877F2' };
  if (l.includes('google'))                           return { bg: '#D97706', border: '#D97706' };
  if (l.includes('linkedin'))                         return { bg: '#0A66C2', border: '#0A66C2' };
  if (l.includes('tiktok'))                           return { bg: '#0D9488', border: '#0D9488' };
  if (l.includes('instagram'))                        return { bg: '#C13584', border: '#C13584' };
  if (l.includes('youtube'))                          return { bg: '#EF4444', border: '#EF4444' };
  if (l.includes('pinterest'))                        return { bg: '#E60023', border: '#E60023' };
  if (l.includes('snapchat'))                         return { bg: '#CA8A04', border: '#CA8A04' };
  if (l.includes('twitter') || l.includes('x ads') || l.includes('x-ads')) return { bg: '#1DA1F2', border: '#1DA1F2' };
  if (l.includes('bing') || l.includes('microsoft'))  return { bg: '#5C6BC0', border: '#5C6BC0' };
  if (l.includes('programmatic') || l.includes('display') || l.includes('dv360')) return { bg: '#4F46E5', border: '#4F46E5' };
  if (l.includes('linear tv') || l.includes('linear-tv')) return { bg: '#7C3AED', border: '#7C3AED' };
  if (l.includes('svod'))                             return { bg: '#9333EA', border: '#9333EA' };
  if (l.includes('bvod'))                             return { bg: '#A855F7', border: '#A855F7' };
  if (l.includes('tv'))                               return { bg: '#7C3AED', border: '#7C3AED' };
  if (l.includes('radio'))                            return { bg: '#B45309', border: '#B45309' };
  if (l.includes('ooh'))                              return { bg: '#D97706', border: '#D97706' };
  if (type === 'organic')                             return { bg: '#16A34A', border: '#16A34A' };
  return                                               { bg: '#64748B', border: '#64748B' };
}

type ChannelStatusSimple = 'completed' | 'active' | 'future';

const ROW_COLORS = ['#FDFCF8', '#F4F1EE'] as const;
const RULER_BG = '#374151';

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
  reportPoints = [],
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
  const Z_STICKY  = 20;
  const ZOOM_STEPS = [12, 18, 26, 38, 52, 68];
  const [zoomIdx, setZoomIdx] = useState(3); // default: 38px/day
  const dayWidth = ZOOM_STEPS[zoomIdx];

  const scrollToToday = useCallback(() => {
    if (!containerRef.current || todayIdx === null) return;
    const containerW = containerRef.current.clientWidth - LABEL_COL;
    containerRef.current.scrollLeft = Math.max(0, todayIdx * dayWidth - containerW * 0.3);
  }, [todayIdx, dayWidth]);

  useEffect(() => {
    scrollToToday();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomIdx]);

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

  const rpByClientChannel = useMemo(() => {
    const map = new Map<string, GanttReportPoint[]>();
    for (const rp of reportPoints) {
      const key = `${rp.client_id}:${normalizeChannelLabel(rp.channel_label)}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(rp);
    }
    return map;
  }, [reportPoints]);

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

  // Scroll to today on mount
  useEffect(() => {
    if (!containerRef.current || todayIdx === null) return;
    const containerW = containerRef.current.clientWidth - LABEL_COL;
    containerRef.current.scrollLeft = Math.max(0, todayIdx * ZOOM_STEPS[3] - containerW * 0.3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDayClick = (dateStr: string) => {
    const d = parseInt(dateStr.slice(8, 10), 10);
    onDaySelect(selectedDay === d ? null : d);
  };

  const totalW = totalDays * dayWidth;

  // Helper: get pixel left for a date string
  const pxLeft = (dateStr: string) => {
    const idx = dateIndex.get(dateStr);
    return idx !== undefined ? idx * dayWidth : null;
  };

  const todayPx = todayIdx !== null ? todayIdx * dayWidth : null;

  return (
    <div
      ref={containerRef}
      style={{ overflowX: 'auto', overflowY: 'auto', height: '100%', width: '100%', minWidth: 0, background: 'transparent', borderRadius: 4, fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <div style={{ width: LABEL_COL + totalW, position: 'relative' }}>

        {/* ── Month header row ──────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: `${LABEL_COL}px ${totalW}px`, height: 18, position: 'sticky', top: 0 }}>
          <div style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', position: 'sticky', left: 0, zIndex: Z_STICKY + 5 }} />
          <div style={{ position: 'relative', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', zIndex: Z_STICKY + 3 }}>
            {monthGroups.map(grp => (
              <div
                key={grp.label}
                style={{
                  position: 'absolute',
                  left: grp.startIdx * dayWidth,
                  width: grp.dayCount * dayWidth,
                  height: '100%',
                  display: 'flex', alignItems: 'center',
                  paddingLeft: 6,
                  borderLeft: '1px solid #E5E7EB',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>
                  {grp.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Day ruler row ──────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: `${LABEL_COL}px ${totalW}px`, height: 28, position: 'sticky', top: 18 }}>
          <div style={{
            background: '#F9FAFB', borderBottom: '1px solid #E5E7EB',
            position: 'sticky', left: 0, zIndex: Z_STICKY + 5,
            display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px',
          }}>
            <button
              onClick={scrollToToday}
              style={{
                fontSize: 9, fontWeight: 600, color: '#374151',
                background: '#E5E7EB', border: 'none', borderRadius: 4,
                padding: '2px 6px', cursor: 'pointer', lineHeight: 1.4,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                letterSpacing: '0.02em',
              }}
            >Today</button>
            <button
              onClick={() => setZoomIdx(i => Math.max(i - 1, 0))}
              disabled={zoomIdx === 0}
              style={{
                width: 18, height: 18, borderRadius: 4,
                background: zoomIdx === 0 ? '#F3F4F6' : '#E5E7EB',
                border: 'none', cursor: zoomIdx === 0 ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 500, color: zoomIdx === 0 ? '#D1D5DB' : '#374151',
                lineHeight: 1, flexShrink: 0,
              }}
            >−</button>
            <button
              onClick={() => setZoomIdx(i => Math.min(i + 1, ZOOM_STEPS.length - 1))}
              disabled={zoomIdx === ZOOM_STEPS.length - 1}
              style={{
                width: 18, height: 18, borderRadius: 4,
                background: zoomIdx === ZOOM_STEPS.length - 1 ? '#F3F4F6' : '#E5E7EB',
                border: 'none', cursor: zoomIdx === ZOOM_STEPS.length - 1 ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 500, color: zoomIdx === ZOOM_STEPS.length - 1 ? '#D1D5DB' : '#374151',
                lineHeight: 1, flexShrink: 0,
              }}
            >+</button>
          </div>
          <div style={{ position: 'relative', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', zIndex: Z_STICKY + 3 }}>
            {dayList.map((dateStr, idx) => {
              const dayNum = parseInt(dateStr.slice(8, 10), 10);
              const isToday = dateStr === todayStr;
              return (
                <div
                  key={dateStr}
                  style={{
                    position: 'absolute',
                    left: idx * dayWidth,
                    width: dayWidth,
                    height: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                  onClick={() => handleDayClick(dateStr)}
                >
                  <span style={{
                    fontSize: isToday ? 10 : 9,
                    fontWeight: isToday ? 700 : 400,
                    color: isToday ? '#111827' : '#9CA3AF',
                    lineHeight: 1,
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}>
                    {dayNum}
                  </span>
                  {isToday && (
                    <div style={{
                      position: 'absolute', bottom: 2,
                      width: 3, height: 3, borderRadius: '50%',
                      background: '#111827',
                    }} />
                  )}
                </div>
              );
            })}
            {todayPx !== null && <TodayOverlay px={todayPx} dayWidth={dayWidth} />}
          </div>
        </div>

        {/* ── Client rows ────────────────────────────────────── */}
        {filteredClients.map((client, clientIdx) => {
          const clientChannels = channelsByClient.get(client.id) || [];
          const rowBg = ROW_COLORS[clientIdx % 2];

          return (
            <div key={client.id}>{/* Per-channel sub-rows */}
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

                const barLeft  = startIdx * dayWidth;
                const barWidth = (endIdx - startIdx + 1) * dayWidth;

                const hcKey        = `${client.id}:${normalizeChannelLabel(ch.label)}`;
                const chHealthChecks = hcByClientChannel.get(hcKey) || [];
                const chSetupPoints  = spByClientChannel.get(hcKey) || [];
                const chReportPoints = rpByClientChannel.get(hcKey) || [];

                const status     = getChannelStatus(ch, todayStr);
                const barColor   = getChannelBarColor(ch.label, ch.type, status);
                const barOpacity = status === 'future' ? 0.5 : 1;

                const startDotColor = barColor.border;
                const endDotColor   = status === 'completed' ? '#6A9E6A' : barColor.border;

                return (
                  <div
                    key={ch.id}
                    style={{ display: 'grid', gridTemplateColumns: `${LABEL_COL}px ${totalW}px`, height: 42 }}
                  >
                    {/* Channel label */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      paddingLeft: 18, overflow: 'hidden',
                      position: 'sticky', left: 0, zIndex: Z_STICKY,
                      background: rowBg,
                    }}>
                      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {getChannelIcon(ch.label, ch.type)}
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#1C1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ch.label}
                      </span>
                    </div>

                    {/* Timeline area */}
                    <div style={{ position: 'relative', overflow: 'visible', background: 'transparent' }}>
                      {/* Today overlay */}
                      {todayPx !== null && <TodayOverlay px={todayPx} dayWidth={dayWidth} />}

                      {/* Month dividers */}
                      {monthGroups.slice(1).map(grp => (
                        <div key={grp.label} style={{
                          position: 'absolute', left: grp.startIdx * dayWidth,
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
                        height: 16,
                        background: barColor.bg,
                        borderRadius: 5,
                        opacity: barOpacity,
                        zIndex: 4,
                        boxSizing: 'border-box',
                      }} />

                      {/* Start dot */}
                      <div style={{
                        position: 'absolute',
                        left: barLeft,
                        top: '50%', transform: 'translate(-50%, -50%)',
                        width: 9, height: 9, borderRadius: '50%',
                        background: startDotColor,
                        opacity: barOpacity, zIndex: 5,
                      }} />

                      {/* End dot */}
                      <div style={{
                        position: 'absolute',
                        left: barLeft + barWidth,
                        top: '50%', transform: 'translate(-50%, -50%)',
                        width: 9, height: 9, borderRadius: '50%',
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
                              left: px + dayWidth / 2,
                              top: '50%',
                              transform: 'translate(-50%, -50%) rotate(45deg)',
                              width: 7, height: 7,
                              background: '#ABC7FF',
                              border: '1px solid rgba(147, 197, 253, 0.60)',
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
                              left: px + dayWidth / 2,
                              top: '50%',
                              transform: 'translate(-50%, -50%)',
                              width: 5, height: 5, borderRadius: '50%',
                              background: 'rgba(160, 68, 42, 0.70)',
                              zIndex: 6,
                            }}
                          />
                        );
                      })}

                      {/* Report pills */}
                      {chReportPoints.map((rp, rpIdx) => {
                        const px = pxLeft(rp.due_date);
                        if (px === null) return null;
                        return (
                          <div
                            key={rpIdx}
                            title={`Report: ${rp.due_date}`}
                            style={{
                              position: 'absolute',
                              left: px + dayWidth / 2,
                              top: '50%',
                              transform: 'translate(-50%, calc(-50% - 13px))',
                              background: '#2563EB',
                              color: '#fff',
                              fontSize: 7,
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: 3,
                              whiteSpace: 'nowrap',
                              zIndex: 7,
                              lineHeight: 1.5,
                              letterSpacing: '0.04em',
                              pointerEvents: 'none',
                            }}
                          >
                            Report
                          </div>
                        );
                      })}
                    </div>
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

// ── Today overlay ─────────────────────────────────────────────────────────────

function TodayOverlay({ px, dayWidth }: { px: number; dayWidth: number }) {
  return (
    <>
      <div style={{
        position: 'absolute',
        left: px, width: dayWidth,
        top: 0, bottom: 0,
        background: 'rgba(148, 163, 184, 0.08)',
        pointerEvents: 'none', zIndex: 1,
      }} />
      <div style={{
        position: 'absolute',
        left: px + dayWidth / 2,
        top: 0, bottom: 0, width: '1px',
        background: 'rgba(148, 163, 184, 0.45)',
        pointerEvents: 'none', zIndex: 2,
      }} />
    </>
  );
}
