// src/components/agency/FullscreenGanttView.tsx
// Full-screen detailed Gantt — continuous scrollable timeline with zoom + AP modal.

'use client';

import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { X, Target, ZoomIn, ZoomOut, User, Calendar, Clock, Tag, Layers, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { getChannelLogo } from '@/lib/utils/channel-icons';
import type { GanttClient, GanttChannel } from './GanttCalendar';

interface AccountManager { id: string; name: string; email: string | null; }

// ── Types ────────────────────────────────────────────────────────────────────

export interface GanttAPMarker {
  client_id: string;
  client_name?: string;
  channel_label: string;
  text: string;
  category: string;
  due_date: string | null;
  frequency?: string | null;
  assigned_to?: string | null;
  id?: string;
}

interface StoredMarker {
  text: string;
  category: string;
  idx: number;
  due_date: string | null;
  assigned_to?: string | null;
  client_name?: string;
  client_id: string;
  channel_label: string;
  id?: string;
}

interface SelectedAP {
  text: string;
  category: string;
  due_date: string | null;
  assigned_to?: string | null;
  client_name?: string;
  client_id: string;
  channel_label: string;
  id?: string;
  // click origin for popover positioning
  clickX: number;
  clickY: number;
}

export interface FullscreenGanttProps {
  clients: GanttClient[];
  channels: GanttChannel[];
  actionPointMarkers?: GanttAPMarker[];
  filteredClientIds: string[];
  onClose: () => void;
  onActionPointCompleted?: () => void;
}

// ── Layout constants ─────────────────────────────────────────────────────────

const LABEL_COL  = 220;
const MONTH_H    = 26;
const DAYS_H     = 42;
const RULER_H    = MONTH_H + DAYS_H;
const CLIENT_H   = 40;
const CHANNEL_H  = 76; // slightly taller to fit 2-line AP chips

// Z-index layers
const Z_AP       = 5;
const Z_STICKY   = 12;  // sticky labels always above AP markers
const Z_RULER    = 18;  // ruler above sticky labels

const ZOOM_LEVELS  = [7, 14, 30, 90, 180, 365] as const;
const DEFAULT_ZOOM = 14;
const ZOOM_LABELS: Record<number, string> = {
  7: '1 week', 14: '2 weeks', 30: '1 month', 90: '3 months', 180: '6 months', 365: '1 year',
};

const LABEL_BG   = '#ECEAE4';
const GRID_LINE  = '#E0DDD5';
const TODAY_C    = '#4A6580';

const MONTH_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_ABBR    = ['S','M','T','W','T','F','S'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function dateToMs(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function msToStr(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function normalizeChannel(n: string): string {
  const l = n.toLowerCase();
  if (l.includes('meta') || l.includes('facebook')) return 'meta-ads';
  if (l.includes('google'))    return 'google-ads';
  if (l.includes('linkedin'))  return 'linkedin-ads';
  if (l.includes('tiktok'))    return 'tiktok-ads';
  if (l.includes('youtube'))   return 'youtube';
  if (l.includes('pinterest')) return 'pinterest';
  return l.trim();
}
function barColor(label: string, type: 'paid' | 'organic') {
  const l = label.toLowerCase();
  if (l.includes('meta') || l.includes('facebook')) return { bg: '#DBEAFE', border: '#1877F2',  text: 'rgb(14,82,168)' };
  if (l.includes('google'))    return { bg: '#FEF9C3', border: '#F59E0B',  text: 'rgb(146,100,0)' };
  if (l.includes('linkedin'))  return { bg: '#CCEEFF', border: '#0A66C2',  text: 'rgb(10,102,194)' };
  if (l.includes('tiktok'))    return { bg: '#CCFBF1', border: '#0D9488',  text: 'rgb(0,140,155)' };
  if (l.includes('youtube'))   return { bg: '#FEE2E2', border: '#FF0000',  text: 'rgb(180,0,0)' };
  if (l.includes('pinterest')) return { bg: '#FCE7F3', border: '#E60023',  text: 'rgb(170,0,25)' };
  if (l.includes('instagram')) return { bg: '#FDE8F5', border: '#C13584',  text: 'rgb(160,30,110)' };
  if (l.includes('snapchat'))  return { bg: '#FEFCE8', border: '#EAB308',  text: 'rgb(130,100,0)' };
  if (l.includes('twitter') || l.includes(' x ') || l.includes('x-ads')) return { bg: '#E0F2FE', border: '#1DA1F2', text: 'rgb(10,140,200)' };
  if (type === 'organic')      return { bg: '#DCFCE7', border: '#4A7C59',  text: 'rgb(50,100,65)' };
  return                              { bg: '#E2E8F0', border: '#4A6580',  text: 'rgb(50,78,105)' };
}

function apColor(category: string): { text: string; bg: string; border: string } {
  if (category === 'HEALTH CHECK') return { text: '#92580F', bg: '#FEF3E2', border: '#F0C87A' };
  if (category === 'SET UP')       return { text: '#8C3518', bg: '#FDEAE4', border: '#E8A48E' };
  return                                  { text: '#2F4F6E', bg: '#E8EFF6', border: '#8AAAC8' };
}

function formatDate(s: string | null): string {
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${MONTH_LONG[m - 1]} ${y}`;
}

function timeToDue(dueDateStr: string | null, todayStr: string): { label: string; color: string } {
  if (!dueDateStr) return { label: 'No due date set', color: '#B5B0A5' };
  const diff = Math.round((dateToMs(dueDateStr) - dateToMs(todayStr)) / 86400000);
  if (diff < -1)  return { label: `Overdue by ${Math.abs(diff)} days`, color: '#A0442A' };
  if (diff === -1) return { label: 'Was due yesterday', color: '#A0442A' };
  if (diff === 0)  return { label: 'Due today', color: '#B07030' };
  if (diff === 1)  return { label: 'Due tomorrow', color: '#B07030' };
  if (diff < 7)    return { label: `${diff} days away`, color: '#4A7C59' };
  if (diff < 14)   return { label: '1 week away', color: '#4A7C59' };
  if (diff < 30)   return { label: `${Math.round(diff / 7)} weeks away`, color: '#4A7C59' };
  if (diff < 60)   return { label: '1 month away', color: '#4A7C59' };
  return                  { label: `${Math.round(diff / 30)} months away`, color: '#4A7C59' };
}

function apStatus(dueDateStr: string | null, todayStr: string): { label: string; color: string; bg: string } {
  if (!dueDateStr) return { label: 'Outstanding', color: '#4A6580', bg: 'rgba(74,101,128,0.1)' };
  if (dueDateStr < todayStr) return { label: 'Overdue', color: '#A0442A', bg: 'rgba(160,68,42,0.1)' };
  if (dueDateStr === todayStr) return { label: 'Due today', color: '#B07030', bg: 'rgba(176,112,48,0.1)' };
  return { label: 'Outstanding', color: '#4A6580', bg: 'rgba(74,101,128,0.1)' };
}

// ── Main component ───────────────────────────────────────────────────────────

export function FullscreenGanttView({
  clients,
  channels,
  actionPointMarkers = [],
  filteredClientIds,
  onClose,
  onActionPointCompleted,
}: FullscreenGanttProps) {
  const scrollRef    = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedAP, setSelectedAP] = useState<SelectedAP | null>(null);

  // AP interaction state
  const [accountManagers, setAccountManagers] = useState<AccountManager[]>([]);
  const [assignedOverrides, setAssignedOverrides] = useState<Map<string, string | null>>(new Map());
  const [inProgressIds,     setInProgressIds]     = useState<Set<string>>(new Set());
  const [completedIds,      setCompletedIds]       = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/account-managers')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.accountManagers) setAccountManagers(d.accountManagers); })
      .catch(() => {});
  }, []);

  const handleAssign = useCallback(async (apId: string, clientId: string, amName: string | null) => {
    setAssignedOverrides(prev => new Map(prev).set(apId, amName));
    setSelectedAP(prev => prev ? { ...prev, assigned_to: amName } : prev);
    try {
      const res = await fetch('/api/action-points', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: apId, client_id: clientId, assigned_to: amName }),
      });
      if (!res.ok) setAssignedOverrides(prev => { const n = new Map(prev); n.delete(apId); return n; });
    } catch { setAssignedOverrides(prev => { const n = new Map(prev); n.delete(apId); return n; }); }
  }, []);

  const handleComplete = useCallback(async (apId: string, clientId: string) => {
    setCompletedIds(prev => new Set(prev).add(apId));
    setSelectedAP(null);
    try {
      const res = await fetch('/api/action-points', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: apId, client_id: clientId, completed: true }),
      });
      if (res.ok) {
        onActionPointCompleted?.();
      } else {
        const errBody = await res.json().catch(() => ({}));
        console.error('Failed to mark AP complete:', res.status, errBody);
        setCompletedIds(prev => { const n = new Set(prev); n.delete(apId); return n; });
      }
    } catch (err) {
      console.error('Error marking AP complete:', err);
      setCompletedIds(prev => { const n = new Set(prev); n.delete(apId); return n; });
    }
  }, [onActionPointCompleted]);

  const handleToggleInProgress = useCallback((apId: string) => {
    setInProgressIds(prev => {
      const n = new Set(prev);
      if (n.has(apId)) n.delete(apId); else n.add(apId);
      return n;
    });
    setSelectedAP(prev => prev ? { ...prev } : prev); // re-render modal
  }, []);

  const [containerW, setContainerW] = useState(() =>
    typeof window !== 'undefined' ? Math.max(600, window.innerWidth - 32 - LABEL_COL) : 1000
  );
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => setContainerW(Math.max(300, e.contentRect.width - LABEL_COL)));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const [daysVisible, setDaysVisible] = useState<number>(DEFAULT_ZOOM);
  const dayWidth = containerW / daysVisible;

  const zoomIn  = useCallback(() => setDaysVisible(v => { const i = ZOOM_LEVELS.indexOf(v as typeof ZOOM_LEVELS[number]); return i > 0 ? ZOOM_LEVELS[i - 1] : v; }), []);
  const zoomOut = useCallback(() => setDaysVisible(v => { const i = ZOOM_LEVELS.indexOf(v as typeof ZOOM_LEVELS[number]); return i >= 0 && i < ZOOM_LEVELS.length - 1 ? ZOOM_LEVELS[i + 1] : v; }), []);
  const canZoomIn  = ZOOM_LEVELS.indexOf(daysVisible as typeof ZOOM_LEVELS[number]) > 0;
  const canZoomOut = ZOOM_LEVELS.indexOf(daysVisible as typeof ZOOM_LEVELS[number]) < ZOOM_LEVELS.length - 1;

  const todayStr = useMemo(() => { const d = new Date(); return msToStr(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); }, []);

  const { rangeStartMs, rangeEndMs } = useMemo(() => {
    const todayMs = dateToMs(todayStr);
    let lo = todayMs - 31 * 86400000, hi = todayMs + 365 * 86400000;
    for (const ch of channels) {
      if (ch.start_date) { const s = dateToMs(ch.start_date); if (s < lo) lo = s; }
      if (ch.end_date)   { const e = dateToMs(ch.end_date);   if (e > hi) hi = e; }
    }
    const loD = new Date(lo), hiD = new Date(hi);
    return {
      rangeStartMs: Date.UTC(loD.getUTCFullYear(), loD.getUTCMonth(), 1),
      rangeEndMs:   Date.UTC(hiD.getUTCFullYear(), hiD.getUTCMonth() + 1, 0),
    };
  }, [channels, todayStr]);

  const dayList = useMemo(() => { const l: number[] = []; for (let ms = rangeStartMs; ms <= rangeEndMs; ms += 86400000) l.push(ms); return l; }, [rangeStartMs, rangeEndMs]);
  const dateIndex = useMemo(() => { const m = new Map<string, number>(); dayList.forEach((ms, i) => m.set(msToStr(ms), i)); return m; }, [dayList]);
  const totalDays = dayList.length;
  const todayIdx  = useMemo(() => dateIndex.get(todayStr) ?? null, [dateIndex, todayStr]);
  const weekendIndices = useMemo(() => dayList.reduce<number[]>((a, ms, i) => { const d = new Date(ms).getUTCDay(); if (d === 0 || d === 6) a.push(i); return a; }, []), [dayList]);

  const monthGroups = useMemo(() => {
    const g: Array<{ label: string; shortLabel: string; startIdx: number; dayCount: number; year: number; month: number }> = [];
    let cur: (typeof g)[0] | null = null;
    dayList.forEach((ms, i) => {
      const d = new Date(ms), y = d.getUTCFullYear(), mo = d.getUTCMonth();
      if (!cur || cur.year !== y || cur.month !== mo) { cur = { label: `${MONTH_LONG[mo]} ${y}`, shortLabel: MONTH_SHORT[mo], startIdx: i, dayCount: 1, year: y, month: mo }; g.push(cur); }
      else cur.dayCount++;
    });
    return g;
  }, [dayList]);

  const filteredSet    = useMemo(() => new Set(filteredClientIds), [filteredClientIds]);
  const visibleClients = useMemo(() => clients.filter(c => filteredSet.has(c.id)), [clients, filteredSet]);
  const channelsByClient = useMemo(() => {
    const m = new Map<string, GanttChannel[]>();
    for (const ch of channels) { if (!m.has(ch.client_id)) m.set(ch.client_id, []); m.get(ch.client_id)!.push(ch); }
    return m;
  }, [channels]);

  const channelDates = useMemo(() => {
    const m = new Map<string, { start: string | null; end: string | null }>();
    for (const ch of channels) m.set(`${ch.client_id}:${normalizeChannel(ch.label)}`, { start: ch.start_date, end: ch.end_date });
    return m;
  }, [channels]);

  // Stores full marker data including everything needed for the modal
  const apByClientChannel = useMemo(() => {
    const result = new Map<string, StoredMarker[]>();
    const add = (ap: GanttAPMarker, dateStr: string) => {
      const idx = dateIndex.get(dateStr);
      if (idx === undefined) return;
      const key = `${ap.client_id}:${normalizeChannel(ap.channel_label)}`;
      if (!result.has(key)) result.set(key, []);
      result.get(key)!.push({
        text: ap.text, category: ap.category, idx, due_date: dateStr,
        assigned_to: ap.assigned_to, client_name: ap.client_name,
        client_id: ap.client_id, channel_label: ap.channel_label, id: ap.id,
      });
    };
    for (const ap of actionPointMarkers) {
      if (ap.category === 'HEALTH CHECK' && ap.frequency) {
        const dates = channelDates.get(`${ap.client_id}:${normalizeChannel(ap.channel_label)}`);
        if (!dates?.start) continue;
        const interval = ap.frequency === 'weekly' ? 7 : ap.frequency === 'fortnightly' ? 14 : ap.frequency === 'monthly' ? 30 : 0;
        if (!interval) continue;
        const startMs = dateToMs(dates.start);
        const endMs   = dates.end ? dateToMs(dates.end) : rangeEndMs;
        for (let n = 1; n <= 500; n++) {
          const occMs = startMs + n * interval * 86400000;
          if (occMs > endMs || occMs > rangeEndMs) break;
          if (occMs >= rangeStartMs) add(ap, msToStr(occMs));
        }
      } else if (ap.due_date) {
        add(ap, ap.due_date);
      }
    }
    return result;
  }, [actionPointMarkers, channelDates, dateIndex, rangeStartMs, rangeEndMs]);

  useEffect(() => {
    if (!scrollRef.current || todayIdx === null) return;
    scrollRef.current.scrollLeft = Math.max(0, (todayIdx - 1) * dayWidth);
  }, [dayWidth, todayIdx]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (selectedAP) setSelectedAP(null); else onClose(); }
      if (!selectedAP) {
        if (e.key === '=' || e.key === '+') zoomIn();
        if (e.key === '-' || e.key === '_') zoomOut();
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose, zoomIn, zoomOut, selectedAP]);

  const jumpToToday = () => {
    if (!scrollRef.current || todayIdx === null) return;
    scrollRef.current.scrollTo({ left: Math.max(0, (todayIdx - 1) * dayWidth), behavior: 'smooth' });
  };

  const totalW = totalDays * dayWidth;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#F5F3EF', display: 'flex', flexDirection: 'column', fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{ height: 52, background: '#FDFCF8', borderBottom: '0.5px solid #E8E4DC', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: '#1C1917', fontFamily: "'Inter', system-ui, sans-serif", whiteSpace: 'nowrap' }}>Agency Timeline</span>
        <div style={{ width: '0.5px', height: 18, background: '#E8E4DC', flexShrink: 0 }} />

        <button onClick={jumpToToday} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 28, padding: '0 10px', flexShrink: 0, border: `1px solid ${TODAY_C}55`, borderRadius: 4, background: `${TODAY_C}10`, color: TODAY_C, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
          <Target size={12} />Today
        </button>
        <div style={{ width: '0.5px', height: 18, background: '#E8E4DC', flexShrink: 0 }} />

        {/* Zoom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button onClick={zoomIn} disabled={!canZoomIn} style={{ width: 28, height: 28, border: '0.5px solid #E8E4DC', borderRadius: 4, background: canZoomIn ? '#FDFCF8' : '#F5F3EF', cursor: canZoomIn ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: canZoomIn ? 1 : 0.4 }}><ZoomIn size={13} color="#4C4840" /></button>
          <span style={{ fontSize: 11, color: '#4C4840', fontWeight: 500, minWidth: 60, textAlign: 'center' }}>{ZOOM_LABELS[daysVisible] ?? `${daysVisible}d`}</span>
          <button onClick={zoomOut} disabled={!canZoomOut} style={{ width: 28, height: 28, border: '0.5px solid #E8E4DC', borderRadius: 4, background: canZoomOut ? '#FDFCF8' : '#F5F3EF', cursor: canZoomOut ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: canZoomOut ? 1 : 0.4 }}><ZoomOut size={13} color="#4C4840" /></button>
        </div>
        <div style={{ width: '0.5px', height: 18, background: '#E8E4DC', flexShrink: 0 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
          {[{ s: '◆', c: '#B07030', l: 'Health Check' }, { s: '●', c: '#A0442A', l: 'Set Up' }, { s: '●', c: '#4A6580', l: 'Ongoing' }, { s: '●', c: '#4A7C59', l: 'Go Live' }, { s: '●', c: '#A0442A', l: 'End' }].map(i => (
            <span key={i.l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#8A8578', whiteSpace: 'nowrap' }}><span style={{ color: i.c }}>{i.s}</span>{i.l}</span>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{ width: 32, height: 32, flexShrink: 0, border: '0.5px solid #E8E4DC', borderRadius: 6, background: '#FDFCF8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} color="#8A8578" /></button>
      </div>

      {/* ── Scroll area ─────────────────────────────────────── */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', padding: '12px 16px 16px' }}>
        <div ref={scrollRef} style={{ overflowX: 'auto', overflowY: 'auto', height: '100%', background: '#FDFCF8', borderRadius: 8, border: '0.5px solid #E8E4DC' }}>
          <div style={{ minWidth: LABEL_COL + totalW, position: 'relative' }}>

            {/* ── Sticky ruler ──────────────────────────────── */}
            <div style={{ position: 'sticky', top: 0, zIndex: Z_RULER }}>
              {/* Month row */}
              <div style={{ display: 'flex', background: '#DEDAD2', borderBottom: '0.5px solid #C8C4BC' }}>
                <div style={{ width: LABEL_COL, flexShrink: 0, height: MONTH_H, position: 'sticky', left: 0, zIndex: Z_RULER + 1, background: '#D4D0C8', borderRight: '1px solid #C0BDB5', display: 'flex', alignItems: 'center', paddingLeft: 16 }}>
                  <span style={{ fontSize: 9, color: '#8A8070', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 500 }}>Client / Channel</span>
                </div>
                <div style={{ position: 'relative', width: totalW, flexShrink: 0 }}>
                  {monthGroups.map((mg, i) => {
                    const w = mg.dayCount * dayWidth;
                    const now = new Date();
                    const isCurrent = mg.year === now.getFullYear() && mg.month === now.getMonth();
                    return (
                      <div key={`${mg.year}-${mg.month}`} style={{ position: 'absolute', left: mg.startIdx * dayWidth, width: w, height: MONTH_H, display: 'flex', alignItems: 'center', paddingLeft: 10, background: isCurrent ? `${TODAY_C}12` : i % 2 === 1 ? 'rgba(0,0,0,0.02)' : 'transparent', borderLeft: '1px solid #C0BDB5', boxSizing: 'border-box', overflow: 'hidden' }}>
                        <span style={{ fontSize: w > 200 ? 11 : w > 80 ? 10 : 8.5, fontWeight: isCurrent ? 600 : 500, color: isCurrent ? TODAY_C : '#6C6860', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {w > 100 ? mg.label : mg.shortLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Day row */}
              <div style={{ display: 'flex', background: LABEL_BG, borderBottom: '2px solid #B8B4AC' }}>
                <div style={{ width: LABEL_COL, flexShrink: 0, height: DAYS_H, position: 'sticky', left: 0, zIndex: Z_RULER + 1, background: LABEL_BG, borderRight: '1px solid #C0BDB5' }} />
                <div style={{ position: 'relative', width: totalW, flexShrink: 0, height: DAYS_H }}>
                  {dayList.map((ms, i) => {
                    const d = new Date(ms), dow = d.getUTCDay(), dayNum = d.getUTCDate();
                    const isToday = i === todayIdx, isWeekend = dow === 0 || dow === 6, isMonthStart = dayNum === 1;
                    return (
                      <div key={ms} style={{ position: 'absolute', left: i * dayWidth, width: dayWidth, height: DAYS_H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, background: isToday ? `${TODAY_C}14` : isWeekend ? 'rgba(0,0,0,0.025)' : 'transparent', borderLeft: isMonthStart ? '1.5px solid #B0ACA4' : `0.5px solid ${GRID_LINE}`, boxSizing: 'border-box', zIndex: isToday ? 2 : 1 }}>
                        {isToday ? (
                          <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: '0.08em', color: '#fff', background: TODAY_C, padding: '1px 5px', borderRadius: 3, lineHeight: 1.4 }}>TODAY</span>
                        ) : (
                          <span style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.04em', color: isWeekend ? '#C0BCB4' : '#B5B0A5' }}>{DAY_ABBR[dow]}</span>
                        )}
                        <span style={{ fontSize: isToday ? 15 : dayWidth < 30 ? 9 : 11, lineHeight: 1, fontWeight: isToday ? 800 : isWeekend ? 400 : 500, color: isToday ? TODAY_C : isWeekend ? '#C0BCB4' : '#4C4840' }}>{dayNum}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Client rows ───────────────────────────────── */}
            {visibleClients.map(client => {
              const clientChs = channelsByClient.get(client.id) || [];
              const apCount   = actionPointMarkers.filter(a => a.client_id === client.id).length;
              return (
                <div key={client.id} style={{ borderTop: '2px solid #C0BDB5' }}>
                  {/* Client header */}
                  <div style={{ display: 'flex', background: '#F0EDE7' }}>
                    <div style={{ width: LABEL_COL, flexShrink: 0, height: CLIENT_H, position: 'sticky', left: 0, zIndex: Z_STICKY, background: '#EAE6DF', display: 'flex', alignItems: 'center', gap: 9, padding: '0 14px', borderRight: '1px solid #C8C4BC' }}>
                      <div style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, background: client.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#fff' }}>{client.initials}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1C1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</span>
                      {apCount > 0 && <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 500, flexShrink: 0, background: 'rgba(160,68,42,0.12)', color: '#A0442A', padding: '2px 7px', borderRadius: 10 }}>{apCount}</span>}
                    </div>
                    <RowBg totalW={totalW} height={CLIENT_H} todayIdx={todayIdx} dayWidth={dayWidth} weekendIndices={weekendIndices} />
                  </div>

                  {/* Channel rows */}
                  {clientChs.map(ch => {
                    const rawStartMs = ch.start_date ? dateToMs(ch.start_date) : null;
                    const rawEndMs   = ch.end_date   ? dateToMs(ch.end_date)   : null;
                    if (rawStartMs !== null && rawStartMs > rangeEndMs)   return null;
                    if (rawEndMs   !== null && rawEndMs   < rangeStartMs) return null;

                    const startIdx = ch.start_date ? (dateIndex.get(ch.start_date) ?? null) : null;
                    const endIdx   = ch.end_date   ? (dateIndex.get(ch.end_date)   ?? null) : null;
                    const sIdx = startIdx !== null ? Math.max(0, startIdx) : 0;
                    const eIdx = endIdx   !== null ? Math.min(totalDays - 1, endIdx) : totalDays - 1;
                    const bLeft = sIdx * dayWidth, bWidth = Math.max(4, (eIdx - sIdx + 1) * dayWidth);
                    const col = barColor(ch.label, ch.type);
                    const trueStart = startIdx !== null && startIdx >= 0 && startIdx < totalDays;
                    const trueEnd   = endIdx   !== null && endIdx   >= 0 && endIdx   < totalDays;

                    const apKey  = `${client.id}:${normalizeChannel(ch.label)}`;
                    // Apply assigned_to overrides (keep completed visible — they show as struck-through)
                    const markers = (apByClientChannel.get(apKey) || [])
                      .map(m => m.id && assignedOverrides.has(m.id) ? { ...m, assigned_to: assignedOverrides.get(m.id) } : m);

                    // Group by day index
                    const byIdx = new Map<number, StoredMarker[]>();
                    for (const m of markers) { if (!byIdx.has(m.idx)) byIdx.set(m.idx, []); byIdx.get(m.idx)!.push(m); }

                    // Chip width: show more text, wider than before
                    const chipW = Math.max(110, Math.min(180, dayWidth * 3));

                    return (
                      <div key={ch.id} style={{ display: 'flex', borderTop: '0.5px solid #E4E0D8' }}>
                        {/* Sticky label */}
                        <div style={{ width: LABEL_COL, flexShrink: 0, height: CHANNEL_H, position: 'sticky', left: 0, zIndex: Z_STICKY, background: LABEL_BG, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, padding: '0 10px 0 28px', borderRight: '1px solid #C8C4BC', overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flexShrink: 0, lineHeight: 0 }}>{getChannelLogo(ch.label, 'w-[14px] h-[14px]')}</div>
                            <span style={{ fontSize: 11, fontWeight: 500, color: '#2C2A26', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.label}</span>
                          </div>
                          {markers.length > 0 && (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {(() => { const hc = markers.filter(m => m.category === 'HEALTH CHECK').length, su = markers.filter(m => m.category === 'SET UP').length, on = markers.filter(m => m.category !== 'HEALTH CHECK' && m.category !== 'SET UP').length; return <>{hc > 0 && <span style={{ fontSize: 8, color: '#B07030', background: 'rgba(176,112,48,0.12)', padding: '1px 5px', borderRadius: 3 }}>{hc} HC</span>}{su > 0 && <span style={{ fontSize: 8, color: '#A0442A', background: 'rgba(160,68,42,0.1)', padding: '1px 5px', borderRadius: 3 }}>{su} Set Up</span>}{on > 0 && <span style={{ fontSize: 8, color: '#4A6580', background: 'rgba(74,101,128,0.1)', padding: '1px 5px', borderRadius: 3 }}>{on} Ongoing</span>}</>; })()}
                            </div>
                          )}
                        </div>

                        {/* Timeline */}
                        <div style={{ width: totalW, flexShrink: 0, height: CHANNEL_H, position: 'relative', backgroundImage: `linear-gradient(to right, ${GRID_LINE} 0.5px, transparent 0.5px)`, backgroundSize: `${dayWidth}px 100%` }}>
                          {monthGroups.slice(1).map(mg => <div key={`${mg.year}-${mg.month}`} style={{ position: 'absolute', left: mg.startIdx * dayWidth, top: 0, bottom: 0, width: 1.5, background: '#C8C4BC', pointerEvents: 'none' }} />)}
                          {weekendIndices.map(i => <div key={i} style={{ position: 'absolute', left: i * dayWidth, top: 0, bottom: 0, width: dayWidth, background: 'rgba(0,0,0,0.02)', pointerEvents: 'none' }} />)}

                          {/* TODAY line */}
                          {todayIdx !== null && <div style={{ position: 'absolute', left: (todayIdx + 0.5) * dayWidth - 1.5, top: 0, bottom: 0, width: 3, background: TODAY_C, zIndex: Z_AP + 1, pointerEvents: 'none', boxShadow: `0 0 8px ${TODAY_C}55` }} />}

                          {/* Bar */}
                          <div style={{ position: 'absolute', left: bLeft, width: bWidth, top: 10, height: 20, background: col.bg, border: `1px ${ch.type === 'organic' ? 'dashed' : 'solid'} ${col.border}`, borderRadius: 4, zIndex: 2, boxSizing: 'border-box', display: 'flex', alignItems: 'center', paddingLeft: 7, paddingRight: 7, overflow: 'hidden' }}>
                            {ch.start_date && dayWidth > 20 && <span style={{ fontSize: 8, color: col.text, whiteSpace: 'nowrap', opacity: 0.9, flexShrink: 0 }}>{ch.start_date.slice(5).replace('-', '/')}</span>}
                            <span style={{ flex: 1 }} />
                            {ch.end_date && dayWidth > 20 && <span style={{ fontSize: 8, color: col.text, whiteSpace: 'nowrap', opacity: 0.9, flexShrink: 0 }}>{ch.end_date.slice(5).replace('-', '/')}</span>}
                          </div>

                          {/* Go-live cap */}
                          {trueStart && startIdx !== null && <div style={{ position: 'absolute', left: startIdx * dayWidth, top: 20, transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: '#4A7C59', border: '2px solid #fff', zIndex: 3 }} />}
                          {/* End cap */}
                          {trueEnd && endIdx !== null && <div style={{ position: 'absolute', left: (endIdx + 1) * dayWidth, top: 20, transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: '#A0442A', border: '2px solid #fff', zIndex: 3 }} />}

                          {/* AP markers */}
                          {Array.from(byIdx.entries()).map(([idx, items]) => {
                            const cx    = (idx + 0.5) * dayWidth;
                            const show  = items.slice(0, 2);
                            const extra = items.length - show.length;
                            return (
                              <div key={idx} style={{ position: 'absolute', left: cx, top: 34, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, zIndex: Z_AP }}>
                                {show.map((item, i) => {
                                  const isHC   = item.category === 'HEALTH CHECK';
                                  const isIP   = !!item.id && inProgressIds.has(item.id);
                                  const isDone = !!item.id && completedIds.has(item.id);
                                  // Blue when in-progress, greyed when done, normal otherwise
                                  const chipCol = isIP
                                    ? { text: '#2563EB', bg: '#EFF6FF', border: '#93C5FD' }
                                    : isDone
                                    ? { text: '#9A9590', bg: '#F0EDE8', border: '#D4D0C8' }
                                    : apColor(item.category);
                                  const assigneeName = item.assigned_to ?? null;
                                  return (
                                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                      {/* Text chip — wider, 2-line, clickable */}
                                      <button
                                        onClick={(e) => setSelectedAP({ ...item, clickX: e.clientX, clickY: e.clientY })}
                                        style={{
                                          display: 'block',
                                          background: chipCol.bg,
                                          border: `1px solid ${chipCol.border}`,
                                          borderRadius: 4, padding: '3px 7px 3px 7px',
                                          width: chipW, boxSizing: 'border-box',
                                          cursor: 'pointer', textAlign: 'left',
                                          pointerEvents: 'auto',
                                          fontFamily: "'DM Sans', system-ui, sans-serif",
                                          opacity: isDone ? 0.7 : 1,
                                          position: 'relative',
                                        }}
                                        title={item.text}
                                      >
                                        {/* Assignee badge — top right */}
                                        <span style={{
                                          position: 'absolute', top: 2, right: 5,
                                          fontSize: 7, fontWeight: 500,
                                          color: isIP ? '#2563EB' : '#9A9590',
                                          whiteSpace: 'nowrap', maxWidth: '55%',
                                          overflow: 'hidden', textOverflow: 'ellipsis',
                                          lineHeight: 1.2,
                                        }}>
                                          {assigneeName ?? 'Unassigned'}
                                        </span>
                                        {/* AP text with 2-line clamp, padded top to clear badge */}
                                        <span style={{
                                          display: '-webkit-box',
                                          WebkitLineClamp: 2,
                                          WebkitBoxOrient: 'vertical',
                                          overflow: 'hidden',
                                          fontSize: 8.5, color: chipCol.text, lineHeight: 1.4,
                                          textDecoration: isDone ? 'line-through' : 'none',
                                          paddingTop: 10,
                                        } as React.CSSProperties}>{item.text}</span>
                                        {/* Category label — bottom */}
                                        <span style={{
                                          display: 'block', marginTop: 4,
                                          fontSize: 7, fontWeight: 700, letterSpacing: '0.4px',
                                          color: chipCol.text, textTransform: 'uppercase',
                                        }}>
                                          {item.category === 'HEALTH CHECK' ? 'Health Check' : item.category === 'SET UP' ? 'Set Up' : item.category}
                                        </span>
                                      </button>
                                      {/* Shape marker */}
                                      {isHC
                                        ? <div style={{ width: 10, height: 10, background: '#FDFCF8', border: `2px solid ${chipCol.text}`, transform: 'rotate(45deg)', flexShrink: 0, pointerEvents: 'none' }} />
                                        : <div style={{ width: 10, height: 10, borderRadius: '50%', background: chipCol.text, flexShrink: 0, pointerEvents: 'none' }} />
                                      }
                                    </div>
                                  );
                                })}
                                {extra > 0 && (
                                  <span style={{ fontSize: 8, color: '#8A8578', background: '#EAE7E0', borderRadius: 3, padding: '1px 6px', pointerEvents: 'auto', cursor: 'default' }}>
                                    +{extra} more
                                  </span>
                                )}
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

            {visibleClients.length === 0 && (
              <div style={{ padding: '60px 0', textAlign: 'center', color: '#B5B0A5', fontSize: 13 }}>No clients to display.</div>
            )}
          </div>
        </div>
      </div>

      {/* Keyboard hints */}
      <div style={{ position: 'absolute', bottom: 20, right: 24, display: 'flex', gap: 8, pointerEvents: 'none' }}>
        {[['+ / −', 'zoom'], ['Esc', 'close']].map(([key, label]) => (
          <span key={key} style={{ fontSize: 10, color: '#B5B0A5', background: 'rgba(0,0,0,0.04)', padding: '3px 7px', borderRadius: 4, border: '0.5px solid #E0DDD5' }}>
            <span style={{ fontWeight: 600 }}>{key}</span> {label}
          </span>
        ))}
      </div>

      {/* ── AP Detail Modal ──────────────────────────────────── */}
      {selectedAP && (
        <APModal
          ap={selectedAP}
          clients={clients}
          todayStr={todayStr}
          accountManagers={accountManagers}
          isInProgress={!!selectedAP.id && inProgressIds.has(selectedAP.id)}
          onAssign={(amName) => {
            // Always update the modal display optimistically; save to API if we have an id
            setSelectedAP(prev => prev ? { ...prev, assigned_to: amName } : prev);
            if (selectedAP.id) {
              setAssignedOverrides(prev => new Map(prev).set(selectedAP.id!, amName));
              fetch('/api/action-points', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: selectedAP.id, client_id: selectedAP.client_id, assigned_to: amName }),
              }).catch(() => {});
            }
          }}
          onComplete={() => { if (selectedAP.id) handleComplete(selectedAP.id, selectedAP.client_id); }}
          onToggleInProgress={() => { if (selectedAP.id) handleToggleInProgress(selectedAP.id); }}
          onClose={() => setSelectedAP(null)}
        />
      )}
    </div>
  );
}

// ── Row background helper ─────────────────────────────────────────────────────

function RowBg({ totalW, height, todayIdx, dayWidth, weekendIndices }: {
  totalW: number; height: number; todayIdx: number | null; dayWidth: number; weekendIndices: number[];
}) {
  return (
    <div style={{ width: totalW, flexShrink: 0, height, position: 'relative', backgroundImage: `linear-gradient(to right, ${GRID_LINE} 0.5px, transparent 0.5px)`, backgroundSize: `${dayWidth}px 100%` }}>
      {weekendIndices.map(i => <div key={i} style={{ position: 'absolute', left: i * dayWidth, top: 0, bottom: 0, width: dayWidth, background: 'rgba(0,0,0,0.02)', pointerEvents: 'none' }} />)}
      {todayIdx !== null && <div style={{ position: 'absolute', left: (todayIdx + 0.5) * dayWidth - 1.5, top: 0, bottom: 0, width: 3, background: TODAY_C, zIndex: 2, pointerEvents: 'none', boxShadow: `0 0 8px ${TODAY_C}55` }} />}
    </div>
  );
}

// ── AP Detail Modal ───────────────────────────────────────────────────────────

function APModal({ ap, clients, todayStr, accountManagers, isInProgress, onAssign, onComplete, onToggleInProgress, onClose }: {
  ap: SelectedAP;
  clients: GanttClient[];
  todayStr: string;
  accountManagers: AccountManager[];
  isInProgress: boolean;
  onAssign: (amName: string | null) => void;
  onComplete: () => void;
  onToggleInProgress: () => void;
  onClose: () => void;
}) {
  const clientName = clients.find(c => c.id === ap.client_id)?.name ?? ap.client_name ?? '—';
  const col        = apColor(ap.category);
  const due        = timeToDue(ap.due_date, todayStr);
  const status     = apStatus(ap.due_date, todayStr);

  const categoryLabel =
    ap.category === 'HEALTH CHECK' ? 'Health Check' :
    ap.category === 'SET UP'       ? 'Set Up' : 'Ongoing';

  // Compute popover position anchored to the click point, clamped to viewport
  const POP_W = 400, POP_H = 420, OFFSET = 14;
  const vw = typeof window !== 'undefined' ? window.innerWidth  : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  let left = ap.clickX + OFFSET;
  let top  = ap.clickY + OFFSET;
  if (left + POP_W > vw - 12) left = ap.clickX - POP_W - OFFSET;
  if (top  + POP_H > vh - 12) top  = ap.clickY - POP_H - OFFSET;
  left = Math.max(12, left);
  top  = Math.max(12, top);

  const staticRows: Array<{ icon: React.ReactNode; label: string; value: string; valueColor?: string; valueBg?: string }> = [
    { icon: <Layers size={12} />,      label: 'Client',      value: clientName },
    { icon: <Tag size={12} />,         label: 'Channel',     value: ap.channel_label },
    { icon: <Calendar size={12} />,    label: 'Due date',    value: formatDate(ap.due_date) },
    { icon: <Clock size={12} />,       label: 'Time to due', value: due.label, valueColor: due.color },
    { icon: <AlertCircle size={12} />, label: 'Status',      value: status.label, valueColor: status.color, valueBg: status.bg },
  ];

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ position: 'absolute', left, top, width: POP_W, background: '#FDFCF8', borderRadius: 10, border: '0.5px solid #E0DDD5', boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ padding: '14px 18px 10px', borderBottom: '0.5px solid #EAE7E0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: col.bg, color: col.text, border: `1px solid ${col.border}`, flexShrink: 0 }}>
              {categoryLabel}
            </span>
            <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: status.bg, color: status.color, flexShrink: 0 }}>
              {status.label}
            </span>
            <button
              onClick={onClose}
              style={{ marginLeft: 'auto', width: 24, height: 24, border: '0.5px solid #E8E4DC', borderRadius: 5, background: '#F5F3EF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <X size={12} color="#8A8578" />
            </button>
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#1C1917', lineHeight: 1.4, margin: 0 }}>
            {ap.text}
          </p>
        </div>

        {/* Detail rows */}
        <div style={{ padding: '6px 18px 0' }}>
          {staticRows.map(row => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '0.5px solid #F0EDE7' }}>
              <div style={{ width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C0BCB4', flexShrink: 0 }}>
                {row.icon}
              </div>
              <span style={{ fontSize: 11, color: '#9A9590', width: 88, flexShrink: 0 }}>{row.label}</span>
              {row.valueBg ? (
                <span style={{ fontSize: 11, fontWeight: 500, color: row.valueColor, background: row.valueBg, padding: '1px 8px', borderRadius: 20 }}>{row.value}</span>
              ) : (
                <span style={{ fontSize: 11, fontWeight: 500, color: row.valueColor ?? '#1C1917' }}>{row.value}</span>
              )}
            </div>
          ))}

          {/* Assigned to — interactive */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '0.5px solid #F0EDE7' }}>
            <div style={{ width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C0BCB4', flexShrink: 0 }}>
              <User size={12} />
            </div>
            <span style={{ fontSize: 11, color: '#9A9590', width: 88, flexShrink: 0 }}>Assigned to</span>
            <select
              value={ap.assigned_to ?? ''}
              onChange={e => onAssign(e.target.value || null)}
              style={{ flex: 1, fontSize: 11, fontWeight: 500, color: '#1C1917', background: '#F5F3EF', border: '0.5px solid #DDD9D1', borderRadius: 5, padding: '3px 7px', cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}
            >
              <option value=''>Unassigned</option>
              {accountManagers.map(am => (
                <option key={am.id} value={am.name}>{am.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ padding: '10px 18px 14px', display: 'flex', gap: 8 }}>
          {/* In progress toggle */}
          <button
            onClick={onToggleInProgress}
            style={{
              flex: 1, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              border: isInProgress ? '1px solid #4A6580' : '0.5px solid #DDD9D1',
              borderRadius: 6, background: isInProgress ? 'rgba(74,101,128,0.1)' : '#F5F3EF',
              color: isInProgress ? '#4A6580' : '#6C6860', fontSize: 11, fontWeight: 500, cursor: 'pointer',
            }}
          >
            <Loader2 size={12} style={{ opacity: isInProgress ? 1 : 0.5 }} />
            {isInProgress ? 'In progress' : 'Mark in progress'}
          </button>

          {/* Mark done */}
          {ap.id && (
            <button
              onClick={onComplete}
              style={{
                flex: 1, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                border: '1px solid #4A7C59', borderRadius: 6, background: 'rgba(74,124,89,0.08)',
                color: '#4A7C59', fontSize: 11, fontWeight: 500, cursor: 'pointer',
              }}
            >
              <CheckCircle2 size={12} />
              Mark as done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
