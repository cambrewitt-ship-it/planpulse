// src/components/agency/CalendarPanel.tsx
'use client';

import { useState, useMemo } from 'react';
import { Maximize2 } from 'lucide-react';
import type { ClientCardData } from '@/app/api/agency/clients/route';
import type { AgencyClientActionPoints } from '@/app/api/agency/action-points/route';
import {
  GanttCalendar,
  type GanttClient,
  type GanttChannel,
  type GanttHealthCheck,
  type GanttSetupPoint,
  type GanttPointEvent,
} from './GanttCalendar';
import { AgencyCalendar } from './AgencyCalendar';

// ── Colour / initials helpers (mirrors ClientCardCompact) ─────────────────────
const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

function clientColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  return COLORS[Math.abs(hash) % COLORS.length];
}

function clientInitials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

/** Infer paid vs organic from channel name — conservative: anything with
 *  "organic", "social", "seo", "email", "edm", "content" → organic. */
function inferChannelType(channelName: string): 'paid' | 'organic' {
  const lower = channelName.toLowerCase();
  if (/organic|social|seo|email|edm|content/.test(lower)) return 'organic';
  return 'paid';
}

function normalizeChannelLabel(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('meta') || lower.includes('facebook')) return 'Meta Ads';
  if (lower.includes('google')) return 'Google Ads';
  if (lower.includes('linkedin')) return 'LinkedIn Ads';
  if (lower.includes('tiktok')) return 'TikTok Ads';
  return name;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface CalendarPanelProps {
  clients: ClientCardData[];
  actionPointClients: AgencyClientActionPoints[];
  filteredClientIds: string[];
  selectedDay: number | null;
  onDaySelect: (day: number | null) => void;
  currentMonth: Date;
  /** Callback to open the fullscreen Timeline / Gantt overlay. */
  onOpenTimeline?: () => void;
}

export function CalendarPanel({
  clients,
  actionPointClients,
  filteredClientIds,
  selectedDay,
  onDaySelect,
  currentMonth,
  onOpenTimeline,
}: CalendarPanelProps) {
  const [view, setView] = useState<'gantt' | 'month'>('gantt');
  const monthLabel = `${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;

  // ── Derive GanttClient[] from ClientCardData[] ──────────────────────────────
  const ganttClients = useMemo<GanttClient[]>(() =>
    clients.map(c => ({
      id: c.id,
      name: c.name,
      initials: clientInitials(c.name),
      color: clientColor(c.id),
    })),
    [clients]
  );

  // ── Derive GanttChannel[] from ClientCardData[].channels ───────────────────
  const ganttChannels = useMemo<GanttChannel[]>(() => {
    const result: GanttChannel[] = [];
    for (const client of clients) {
      for (const ch of client.channels ?? []) {
        result.push({
          id: `${client.id}:${ch.channelName}`,
          client_id: client.id,
          label: ch.channelName,
          start_date: ch.startDate,
          end_date: ch.endDate,
          type: inferChannelType(ch.channelName),
        });
      }
    }
    return result;
  }, [clients]);

  // ── Derive point events (start / end) from channel dates ──────────────────
  const ganttPointEvents = useMemo<GanttPointEvent[]>(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth() + 1;
    const result: GanttPointEvent[] = [];

    for (const ch of ganttChannels) {
      if (ch.start_date) {
        const parts = ch.start_date.split('-');
        if (parts.length === 3) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          const d = parseInt(parts[2], 10);
          if (y === year && m === month) {
            result.push({ client_id: ch.client_id, day: d, type: 'start', label: ch.label });
          }
        }
      }
      if (ch.end_date) {
        const parts = ch.end_date.split('-');
        if (parts.length === 3) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          const d = parseInt(parts[2], 10);
          if (y === year && m === month) {
            result.push({ client_id: ch.client_id, day: d, type: 'end', label: ch.label });
          }
        }
      }
    }
    return result;
  }, [ganttChannels, currentMonth]);

  // ── Health checks — generated across the full continuous range ────────────
  const ganttHealthChecks = useMemo<GanttHealthCheck[]>(() => {
    const result: GanttHealthCheck[] = [];
    const nowMs = Date.now();
    const cutoffMs = nowMs + 2 * 365 * 24 * 60 * 60 * 1000; // 2 years ahead

    const channelDateMap = new Map<string, { start: string | null; end: string | null }>();
    for (const ch of ganttChannels) {
      channelDateMap.set(`${ch.client_id}:${normalizeChannelLabel(ch.label)}`, {
        start: ch.start_date,
        end: ch.end_date,
      });
    }

    for (const clientGroup of actionPointClients) {
      for (const channelGroup of clientGroup.channels) {
        for (const ap of channelGroup.actionPoints) {
          if (ap.category !== 'HEALTH CHECK' || !ap.frequency) continue;

          const intervalDays =
            ap.frequency === 'weekly' ? 7 :
            ap.frequency === 'fortnightly' ? 14 :
            ap.frequency === 'monthly' ? 30 : 0;
          if (!intervalDays) continue;

          const dates = channelDateMap.get(
            `${clientGroup.clientId}:${normalizeChannelLabel(channelGroup.channelType)}`
          );
          if (!dates || !dates.start) continue;

          const startParts = dates.start.split('-').map(Number);
          if (startParts.length !== 3) continue;
          const startMs = Date.UTC(startParts[0], startParts[1] - 1, startParts[2]);
          const endMs = dates.end
            ? (() => { const p = dates.end!.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); })()
            : cutoffMs;
          const intervalMs = intervalDays * 24 * 60 * 60 * 1000;

          // Generate all occurrences across the full range
          for (let n = 1; n <= 500; n++) {
            const occMs = startMs + n * intervalMs;
            if (occMs > endMs || occMs > cutoffMs) break;
            const occ = new Date(occMs);
            const occYear = occ.getUTCFullYear();
            const occMonth = occ.getUTCMonth() + 1;
            const dueStr = `${occYear}-${String(occMonth).padStart(2, '0')}-${String(occ.getUTCDate()).padStart(2, '0')}`;
            result.push({
              client_id: clientGroup.clientId,
              channel_label: channelGroup.channelType,
              due_date: dueStr,
            });
          }
        }
      }
    }
    return result;
  }, [actionPointClients, ganttChannels]);

  // ── Set Up action points — from real actionPointClients data ───────────────
  const ganttSetupPoints = useMemo<GanttSetupPoint[]>(() => {
    const result: GanttSetupPoint[] = [];
    for (const clientGroup of actionPointClients) {
      for (const channelGroup of clientGroup.channels) {
        for (const ap of channelGroup.actionPoints) {
          if (ap.category === 'SET UP' && ap.due_date) {
            result.push({
              client_id: clientGroup.clientId,
              channel_label: channelGroup.channelType,
              due_date: ap.due_date,
            });
          }
        }
      }
    }
    return result;
  }, [actionPointClients]);

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        background: '#E5E0D8',
        borderRadius: '6px 6px 0 0',
        padding: '8px 16px',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#1C1917', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {view === 'gantt' ? 'Timeline' : `Calendar — ${monthLabel}`}
        </span>
        <div style={{ flex: 1 }} />
        {/* Timeline (fullscreen) button */}
        {onOpenTimeline && (
          <button
            onClick={onOpenTimeline}
            title="Open fullscreen Timeline"
            style={{
              height: 22, padding: '0 8px', border: 'none',
              background: 'transparent',
              color: 'rgba(0,0,0,0.45)',
              fontSize: 11, fontWeight: 400,
              cursor: 'pointer',
              fontFamily: "'DM Sans', system-ui, sans-serif",
              display: 'flex', alignItems: 'center', gap: 4,
              borderBottom: '1px solid transparent',
              borderRadius: 0,
              marginRight: 6,
            }}
          >
            <Maximize2 size={11} />
            Timeline
          </button>
        )}
        {/* Divider */}
        {onOpenTimeline && (
          <div style={{ width: '0.5px', height: 14, background: 'rgba(0,0,0,0.15)', alignSelf: 'center', marginRight: 6 }} />
        )}
        {(['gantt', 'month'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              height: 22, padding: '0 8px', border: 'none',
              background: 'transparent',
              color: view === v ? '#1C1917' : 'rgba(0,0,0,0.45)',
              fontSize: 11, fontWeight: view === v ? 600 : 400,
              cursor: 'pointer',
              fontFamily: "'DM Sans', system-ui, sans-serif",
              borderBottom: view === v ? '1px solid rgba(0,0,0,0.5)' : '1px solid transparent',
              borderRadius: 0,
            }}
          >
            {v === 'gantt' ? 'Gantt' : 'Month'}
          </button>
        ))}
      </div>
      <div style={{ padding: '12px 16px', background: '#E5E0D8' }}>

      {view === 'gantt' ? (
        <GanttCalendar
          clients={ganttClients}
          channels={ganttChannels}
          healthChecks={ganttHealthChecks}
          setupPoints={ganttSetupPoints}
          pointEvents={ganttPointEvents}
          filteredClientIds={filteredClientIds}
          selectedDay={selectedDay}
          onDaySelect={onDaySelect}
          currentMonth={currentMonth}
        />
      ) : (
        <AgencyCalendar clients={clients.map(c => ({ id: c.id, name: c.name }))} />
      )}
      </div>
    </div>
  );
}
