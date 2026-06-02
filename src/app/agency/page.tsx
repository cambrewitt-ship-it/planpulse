// src/app/agency/page.tsx
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, Plus, Maximize2 } from 'lucide-react';
import { format, startOfYear } from 'date-fns';
import type { ClientCardData } from '@/app/api/agency/clients/route';
import { fetchSpendData } from '@/lib/api/analytics-data-integration';
import type { AgencyClientActionPoints } from '@/app/api/agency/action-points/route';
import { ClientCardCompact } from '@/components/agency/ClientCardCompact';
import { TodayCard } from '@/components/agency/TodayCard';
import { AgencyChat, type AgencyChatHandle } from '@/components/agency/AgencyChat';
import { KanbanBoard, type KanbanBoardHandle } from '@/components/agency/KanbanBoard';
import { NotesChecklist } from '@/components/agency/NotesChecklist';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { FullscreenGanttView, type GanttAPMarker } from '@/components/agency/FullscreenGanttView';
import { AgencyTimeline, ZOOM_LEVELS as TIMELINE_ZOOM_LEVELS, DEFAULT_ZOOM as DEFAULT_TIMELINE_ZOOM } from '@/components/agency/AgencyTimeline';

// ── Constants ────────────────────────────────────────────────────────────────
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const AM_TAB_COLORS = [
  { active: '#4A6580', light: 'rgba(74,101,128,0.12)', text: '#fff', inactiveText: '#4A6580' },
  { active: '#B07030', light: 'rgba(176,112,48,0.12)', text: '#fff', inactiveText: '#B07030' },
  { active: '#4A7C59', light: 'rgba(74,124,89,0.12)', text: '#fff', inactiveText: '#4A7C59' },
  { active: '#A0442A', light: 'rgba(160,68,42,0.12)', text: '#fff', inactiveText: '#A0442A' },
  { active: '#7A5C8A', light: 'rgba(122,92,138,0.12)', text: '#fff', inactiveText: '#7A5C8A' },
];

interface AccountManager {
  id: string;
  name: string;
  email: string | null;
}

// ── Briefing helpers ─────────────────────────────────────────────────────────
interface BriefingItem {
  label: string;
  color: 'red' | 'amber' | 'blue' | 'green';
}

function computeBriefing(clients: ClientCardData[], actionPointClients: AgencyClientActionPoints[]): BriefingItem[] {
  const result: BriefingItem[] = [];
  const today = new Date().toISOString().split('T')[0];
  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Overdue action points
  let overdueCount = 0;
  for (const c of actionPointClients) {
    for (const ch of c.channels) {
      for (const ap of ch.actionPoints) {
        if (ap.due_date && ap.due_date < today) overdueCount++;
      }
    }
  }
  if (overdueCount > 0) {
    result.push({ label: `${overdueCount} action point${overdueCount > 1 ? 's' : ''} overdue`, color: 'red' });
  }

  // Pacing
  for (const c of clients) {
    if (c.spendVariancePct !== null && c.spendVariancePct > 15) {
      result.push({ label: `${c.name} overpacing`, color: 'amber' });
    } else if (c.spendVariancePct !== null && c.spendVariancePct < -15) {
      result.push({ label: `${c.name} underpacing`, color: 'amber' });
    }
  }

  // Channel launches within 7 days
  for (const c of clients) {
    for (const ch of c.channels) {
      if (ch.status === 'upcoming' && ch.startDate && ch.startDate >= today && ch.startDate <= in7Days) {
        result.push({ label: `${c.name} – ${ch.channelName} launching soon`, color: 'blue' });
      }
    }
  }

  if (result.length === 0) {
    result.push({ label: 'All clients healthy', color: 'green' });
  }

  return result;
}

const CHIP_STYLES: Record<string, React.CSSProperties> = {
  red: { background: '#F5EDE9', color: '#A0442A', border: '0.5px solid rgba(160,68,42,0.25)', borderRadius: 8 },
  amber: { background: '#F5EDE0', color: '#B07030', border: '0.5px solid rgba(176,112,48,0.25)', borderRadius: 8 },
  blue: { background: '#E8EDF2', color: '#4A6580', border: '0.5px solid rgba(74,101,128,0.25)', borderRadius: 8 },
  green: { background: '#EAF0EB', color: '#4A7C59', border: '0.5px solid rgba(74,124,89,0.25)', borderRadius: 8 },
};

// ── Main page ────────────────────────────────────────────────────────────────
export default function AgencyDashboard() {
  const [clients, setClients] = useState<ClientCardData[]>([]);
  const [actionPointClients, setActionPointClients] = useState<AgencyClientActionPoints[]>([]);
  const [accountManagers, setAccountManagers] = useState<AccountManager[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [amFilter, setAmFilter] = useState('All');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // Date range state - default to YTD (Jan 1 - now)
  const [dateRange, setDateRange] = useState<{ startDate: string; endDate: string }>(() => {
    const today = new Date();
    const yearStart = startOfYear(today);
    return {
      startDate: format(yearStart, 'yyyy-MM-dd'),
      endDate: format(today, 'yyyy-MM-dd'),
    };
  });

  const [showFullscreenGantt, setShowFullscreenGantt] = useState(false);

  // ── Notes file management ─────────────────────────────────────────────────
  const [noteFiles, setNoteFiles] = useState<{ id: string; name: string }[]>(() => {
    try {
      const stored = localStorage.getItem('note_files_agency');
      if (stored) return JSON.parse(stored);
    } catch {}
    return [{ id: 'default', name: 'General' }];
  });
  const [activeFileId, setActiveFileId]   = useState<string>('default');
  const [showFilesMenu, setShowFilesMenu] = useState(false);
  const [newFileName, setNewFileName]     = useState('');

  const saveNoteFiles = (files: { id: string; name: string }[]) => {
    setNoteFiles(files);
    try { localStorage.setItem('note_files_agency', JSON.stringify(files)); } catch {}
  };
  const addNoteFile = () => {
    const name = newFileName.trim() || 'New File';
    const id   = `file-${Date.now()}`;
    const updated = [...noteFiles, { id, name }];
    saveNoteFiles(updated);
    setActiveFileId(id);
    setNewFileName('');
    setShowFilesMenu(false);
  };
  const deleteNoteFile = (id: string) => {
    const updated = noteFiles.filter(f => f.id !== id);
    const next    = updated.length > 0 ? updated : [{ id: 'default', name: 'General' }];
    saveNoteFiles(next);
    if (activeFileId === id) setActiveFileId(next[0].id);
  };

  const kanbanRef = useRef<KanbanBoardHandle>(null);
  const chatRef = useRef<AgencyChatHandle>(null);
  const [kanbanView, setKanbanView] = useState<'kanban' | 'list' | 'gantt'>('kanban');
  const [activeCardTab, setActiveCardTab] = useState<'clients' | 'todo' | 'timeline'>('timeline');
  const [timelineZoom, setTimelineZoom] = useState(DEFAULT_TIMELINE_ZOOM);
  const [timelineSort, setTimelineSort] = useState<'default' | 'ending-soon' | 'starting-soon'>('ending-soon');
  const today = useMemo(() => new Date(), []);
  const monthLabel = `${MONTH_NAMES[today.getMonth()]} ${today.getFullYear()}`;

  const fetchAccountManagers = useCallback(async () => {
    try {
      const response = await fetch('/api/account-managers');
      if (response.ok) {
        const data = await response.json();
        setAccountManagers(data.accountManagers || []);
      }
    } catch (err) {
      console.error('Error fetching account managers:', err);
    }
  }, []);

  const fetchData = useCallback(async (showRefreshing = false) => {
    try {
      showRefreshing ? setRefreshing(true) : setLoading(true);

      // Build query params with date range
      const clientsParams = new URLSearchParams({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });

      const [clientsRes, apRes] = await Promise.all([
        fetch(`/api/agency/clients?${clientsParams.toString()}`),
        fetch('/api/agency/action-points'),
      ]);

      const clientsData = clientsRes.ok ? await clientsRes.json() : { clients: [] };
      const apData = apRes.ok ? await apRes.json() : { clients: [] };

      const fetchedClients: ClientCardData[] = clientsData.clients || [];
      setClients(fetchedClients);
      setActionPointClients(apData.clients || []);
      setLastRefreshed(new Date());

      if (fetchedClients.length > 0) {
        setSelectedClientId(prev => prev ?? fetchedClients[0].id);
      }
    } catch (err) {
      console.error('Error fetching agency data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchAccountManagers();
  }, [fetchAccountManagers]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(() => fetchData(true), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Background spend sync: for clients with $0 actual spend, fetch their spend
  // from the ad platforms and cache it so future loads show the correct figure.
  const syncedClientIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (loading) return;
    const needsSync = clients.filter(c => c.actualSpend === 0 && !syncedClientIds.current.has(c.id));
    if (needsSync.length === 0) return;

    (async () => {
      for (const client of needsSync) {
        syncedClientIds.current.add(client.id);
        try {
          const result = await fetchSpendData(dateRange.startDate, dateRange.endDate, client.id);
          if (!result.data?.length) continue;

          // Collect the linked campaign IDs for this client (from all channels)
          const campaignIds = new Set<string>(
            client.channels.flatMap(ch => (ch as any).campaignIds ?? [])
          );

          // Sum spend, respecting campaign filter when IDs are available
          let total = 0;
          for (const point of result.data) {
            if (campaignIds.size > 0 && point.campaignId && !campaignIds.has(point.campaignId)) continue;
            total += point.spend ?? 0;
          }
          if (total <= 0) continue;

          // Persist so future agency-page loads use the cached value directly
          void fetch(`/api/clients/${client.id}/actual-spend`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actualSpend: total, dateRange }),
          });

          // Update the card in place — no full refresh needed
          setClients(prev => prev.map(c => {
            if (c.id !== client.id) return c;
            const spendVariancePct = c.plannedBudget > 0
              ? ((total - c.plannedBudget) / c.plannedBudget) * 100
              : null;
            return { ...c, actualSpend: total, spendVariancePct };
          }));
        } catch {
          // Non-fatal — best-effort sync
        }
      }
    })();
  // Run once after initial load; dateRange is intentionally omitted so changing
  // the date picker doesn't re-trigger (fetchData already handles that).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, clients]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData(false);
  };

  // Filtered clients by account manager
  const filteredClients = useMemo(
    () => amFilter === 'All' ? clients : clients.filter(c => c.account_manager === amFilter),
    [clients, amFilter]
  );
  const filteredIds = useMemo(() => filteredClients.map(c => c.id), [filteredClients]);

  // Filtered action points — when an AM is selected, show only APs assigned to them
  const filteredActionPointClients = useMemo(() => {
    if (amFilter === 'All') return actionPointClients;
    return actionPointClients
      .map(c => ({
        ...c,
        channels: c.channels.map(ch => ({
          ...ch,
          actionPoints: ch.actionPoints.filter(ap => ap.assigned_to === amFilter),
        })).filter(ch => ch.actionPoints.length > 0),
      }))
      .filter(c => c.channels.length > 0)
      .map(c => ({
        ...c,
        totalOutstanding: c.channels.reduce((sum, ch) => sum + ch.actionPoints.length, 0),
      }));
  }, [actionPointClients, amFilter]);

  // Health dot counts
  const dotCounts = useMemo(() => ({
    red: filteredClients.filter(c => c.health?.status === 'red').length,
    amber: filteredClients.filter(c => c.health?.status === 'amber').length,
    green: filteredClients.filter(c => !c.health || c.health.status === 'green').length,
  }), [filteredClients]);

  const briefingItems = useMemo(() => computeBriefing(filteredClients, filteredActionPointClients), [filteredClients, filteredActionPointClients]);

  // Fullscreen Gantt data derivation
  const ganttClients = useMemo(() =>
    filteredClients.map(c => {
      let hash = 0;
      for (let i = 0; i < c.id.length; i++) hash = (hash * 31 + c.id.charCodeAt(i)) & 0xffffffff;
      const COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6'];
      return {
        id: c.id, name: c.name,
        initials: c.name.split(' ').map((w: string) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase(),
        color: COLORS[Math.abs(hash) % COLORS.length],
        logo_url: c.logo_url ?? null,
      };
    }),
    [filteredClients]
  );

  const ganttChannels = useMemo(() =>
    filteredClients.flatMap(c =>
      (c.channels ?? []).map((ch: { channelName: string; startDate: string | null; endDate: string | null }) => ({
        id: `${c.id}:${ch.channelName}`,
        client_id: c.id,
        label: ch.channelName,
        start_date: ch.startDate,
        end_date: ch.endDate,
        type: (/organic|social|seo|email|edm|content/.test(ch.channelName.toLowerCase()) ? 'organic' : 'paid') as 'paid' | 'organic',
      }))
    ),
    [filteredClients]
  );

  const sortedGanttClients = useMemo(() => {
    if (timelineSort === 'default') return ganttClients;
    const todayStr = new Date().toISOString().split('T')[0];

    const nearestDate = (clientId: string): string | null => {
      const clientChannels = ganttChannels.filter(ch => ch.client_id === clientId);
      const dates = clientChannels
        .map(ch => timelineSort === 'ending-soon' ? ch.end_date : ch.start_date)
        .filter((d): d is string => !!d);
      if (dates.length === 0) return null;
      if (timelineSort === 'ending-soon') {
        // Nearest future end date, fallback to most recent past
        const future = dates.filter(d => d >= todayStr).sort();
        return future.length > 0 ? future[0] : dates.sort().at(-1)!;
      } else {
        // Nearest future start date
        const future = dates.filter(d => d >= todayStr).sort();
        return future.length > 0 ? future[0] : dates.sort().at(-1)!;
      }
    };

    return [...ganttClients].sort((a, b) => {
      const da = nearestDate(a.id);
      const db = nearestDate(b.id);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da < db ? -1 : da > db ? 1 : 0;
    });
  }, [ganttClients, ganttChannels, timelineSort]);

  const ganttAPMarkers = useMemo<GanttAPMarker[]>(() =>
    filteredActionPointClients.flatMap(c =>
      c.channels.flatMap(ch =>
        ch.actionPoints.map(ap => ({
          client_id: c.clientId,
          client_name: c.clientName,
          channel_label: ch.channelType,
          text: ap.text,
          category: ap.category,
          due_date: ap.due_date ?? null,
          frequency: ap.frequency,
          assigned_to: ap.assigned_to ?? null,
          id: ap.id,
        }))
      )
    ),
    [filteredActionPointClients]
  );

  const formatLastRefreshed = () => {
    if (!lastRefreshed) return 'Updated just now';
    const diffMs = Date.now() - lastRefreshed.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Updated just now';
    if (diffMins === 1) return 'Updated 1 minute ago';
    if (diffMins < 60) return `Updated ${diffMins} minutes ago`;
    return `Updated ${Math.floor(diffMins / 60)} hours ago`;
  };

  const pageFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };
  const serifFont: React.CSSProperties = { fontFamily: "'DM Serif Display', Georgia, serif" };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F3EF', display: 'flex', alignItems: 'center', justifyContent: 'center', ...pageFont }}>
        <div style={{ textAlign: 'center', color: '#8A8578', fontSize: 15 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F5F3EF', ...pageFont }}>
      {/* ── Subheader ──────────────────────────────────────── */}
      <div style={{
        height: 48, flexShrink: 0, background: '#FDFCF8', borderBottom: '0.5px solid #E8E4DC',
        display: 'flex', alignItems: 'center', paddingLeft: 16, paddingRight: 16, gap: 9,
        overflow: 'hidden',
      }}>
        <span style={{ fontSize: 19, fontWeight: 700, color: '#1C1917', fontFamily: "'Inter', system-ui, sans-serif", flexShrink: 0 }}>Agency Dashboard</span>
        {/* Refresh button */}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            width: 28, height: 28, borderRadius: 12, border: '0.5px solid #E8E4DC',
            background: '#FDFCF8', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          <RefreshCw size={13} color="#8A8578" style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
        </button>
        <span style={{ fontSize: 13, color: '#8A8578', flexShrink: 0 }}>{monthLabel}</span>
        <div style={{ width: '0.5px', height: 16, background: '#F5F3EF', flexShrink: 0 }} />
        {/* Briefing chips — scrollable with right fade */}
        <div style={{ position: 'relative', flex: 1, overflow: 'hidden', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {briefingItems.map((item, i) => (
              <span key={i} style={{
                fontSize: 12, fontWeight: 400, padding: '3px 12px',
                whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6,
                ...CHIP_STYLES[item.color],
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
                  background: item.color === 'red' ? '#A0442A' : item.color === 'amber' ? '#B07030' : item.color === 'green' ? '#4A7C59' : '#4A6580',
                }} />
                {item.label}
              </span>
            ))}
          </div>
          {/* Fade out on the right */}
          <div style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, width: 40, pointerEvents: 'none',
            background: 'linear-gradient(to right, transparent, #FDFCF8)',
          }} />
        </div>
        {/* Date Range Picker */}
        <div style={{ flexShrink: 0 }}>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
        <span style={{ fontSize: 12, color: '#B5B0A5', flexShrink: 0 }}>{formatLastRefreshed()}</span>
        <button
          onClick={() => setShowFullscreenGantt(true)}
          style={{
            height: 28, padding: '0 10px',
            border: '0.5px solid #D5D0C5', borderRadius: 12,
            background: '#FDFCF8', color: '#4A6580',
            fontSize: 12, fontWeight: 500, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: "'DM Sans', system-ui, sans-serif", flexShrink: 0,
          }}
        >
          <Maximize2 size={12} />
          Timeline
        </button>
      </div>

      {/* ── Team member tabs ──────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 4,
        padding: '12px 18px 0', maxWidth: 1440, margin: '0 auto',
        flexShrink: 0,
      }}>
        {/* "All" tab */}
        {(() => {
          const isActive = amFilter === 'All';
          return (
            <button
              onClick={() => setAmFilter('All')}
              style={{
                padding: '7px 16px',
                borderRadius: '12px 12px 0 0',
                border: `0.5px solid ${isActive ? '#D5D0C5' : 'transparent'}`,
                borderBottom: isActive ? `0.5px solid #F5F3EF` : '0.5px solid #E8E4DC',
                background: isActive ? '#F5F3EF' : '#FDFCF8',
                color: isActive ? '#1C1917' : '#8A8578',
                fontSize: 13, fontWeight: isActive ? 600 : 400,
                cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif",
                transition: 'all 0.15s',
              }}
            >All</button>
          );
        })()}
        {accountManagers.map((am, idx) => {
          const palette = AM_TAB_COLORS[idx % AM_TAB_COLORS.length];
          const isActive = amFilter === am.name;
          return (
            <button
              key={am.id}
              onClick={() => setAmFilter(am.name)}
              style={{
                padding: '7px 16px',
                borderRadius: '12px 12px 0 0',
                border: `0.5px solid ${isActive ? palette.active : 'transparent'}`,
                borderBottom: isActive ? `0.5px solid #F5F3EF` : `0.5px solid ${palette.active}22`,
                background: isActive ? palette.active : palette.light,
                color: isActive ? palette.text : palette.inactiveText,
                fontSize: 13, fontWeight: isActive ? 600 : 500,
                cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif",
                transition: 'all 0.15s',
              }}
            >{am.name}</button>
          );
        })}
      </div>

      {/* ── Main body ─────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 12,
        padding: '14px 18px 14px',
        maxWidth: 1440,
        margin: '0 auto',
        borderTop: '0.5px solid #E8E4DC',
        alignItems: 'stretch',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        width: '100%',
        boxSizing: 'border-box',
      }}>

        {/* ── Column 1: Today + Notes ──────────────────── */}
        <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          <TodayCard clients={filteredClients} today={today} />

          {/* Notes — dark spine + files panel + content */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'row',
              position: 'relative',
              borderRadius: 18,
              overflow: 'hidden',
              border: '0.5px solid #C8C4BC',
            }}
          >
            {/* Dark textured left spine */}
            <div style={{
              width: 36, flexShrink: 0,
              background: '#1C1917',
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px)',
              backgroundSize: '5px 5px',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              paddingTop: 10, gap: 10, position: 'relative', zIndex: 2,
            }}>
              <button
                onClick={() => setShowFilesMenu(v => !v)}
                title="Files"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}
              >
                {[0, 1, 2].map(i => (
                  <span key={i} style={{ width: 14, height: 1.5, background: showFilesMenu ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)', display: 'block', borderRadius: 1, transition: 'background 0.15s' }} />
                ))}
              </button>
              <span style={{
                fontSize: 11, fontWeight: 700, color: '#FFFFFF',
                textTransform: 'uppercase', letterSpacing: '0.13em',
                writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                marginTop: 2, maxHeight: 120, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {noteFiles.find(f => f.id === activeFileId)?.name ?? 'Notes'}
              </span>
            </div>

            {/* Files slide-out panel */}
            {showFilesMenu && (
              <div style={{
                position: 'absolute', top: 0, left: 36, width: 160, height: '100%',
                background: '#2C2925', zIndex: 10,
                display: 'flex', flexDirection: 'column',
                boxShadow: '2px 0 8px rgba(0,0,0,0.25)',
              }}>
                <div style={{ padding: '10px 12px 8px', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Files</div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                  {noteFiles.map(file => (
                    <div
                      key={file.id}
                      onClick={() => { setActiveFileId(file.id); setShowFilesMenu(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '7px 12px', cursor: 'pointer',
                        background: activeFileId === file.id ? 'rgba(255,255,255,0.09)' : 'transparent',
                        transition: 'background 0.1s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <svg width="10" height="12" viewBox="0 0 10 12" fill="none" style={{ flexShrink: 0 }}>
                          <rect x="0.5" y="0.5" width="9" height="11" rx="1.5" stroke={activeFileId === file.id ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)'} strokeWidth="0.8" fill="none"/>
                          <path d="M2.5 4h5M2.5 6h5M2.5 8h3" stroke={activeFileId === file.id ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.18)'} strokeWidth="0.7" strokeLinecap="round"/>
                        </svg>
                        <span style={{ fontSize: 13, color: activeFileId === file.id ? '#FFFFFF' : 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {file.name}
                        </span>
                      </div>
                      {noteFiles.length > 1 && (
                        <button
                          onClick={e => { e.stopPropagation(); deleteNoteFile(file.id); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', fontSize: 13, padding: 0, lineHeight: 1, flexShrink: 0 }}
                        >×</button>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ padding: '8px 12px', borderTop: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', gap: 4 }}>
                  <input
                    value={newFileName}
                    onChange={e => setNewFileName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addNoteFile()}
                    placeholder="New file…"
                    style={{
                      flex: 1, fontSize: 10,
                      background: 'rgba(255,255,255,0.06)',
                      border: '0.5px solid rgba(255,255,255,0.12)',
                      borderRadius: 3, color: '#fff',
                      padding: '3px 6px', outline: 'none',
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                    }}
                  />
                  <button
                    onClick={addNoteFile}
                    style={{
                      background: 'rgba(255,255,255,0.1)', border: 'none',
                      borderRadius: 3, color: '#fff', fontSize: 15,
                      width: 22, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >+</button>
                </div>
              </div>
            )}

            {/* Notes content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <NotesChecklist activeClientId={`agency:${activeFileId}`} />
            </div>
          </div>
        </div>

        {/* ── Column 2: AI Chat (full height) ──────────── */}
        <div style={{ width: 380, flexShrink: 0, alignSelf: 'stretch', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <AgencyChat ref={chatRef} />
        </div>

        {/* ── Column 3: Kanban + Gantt stacked ─────────── */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Tabbed card: Clients / To Do */}
          <div style={{
            background: '#FDFCF8',
            border: '1px solid rgba(232,228,220,0.7)',
            borderRadius: 18,
            padding: 0,
            boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            flex: 1,
          }}>
            {/* ── Tab bar ── */}
            <div style={{ display: 'flex', flexShrink: 0, borderBottom: '1.5px solid #E8E4DC', position: 'relative' }}>
              {(['clients', 'todo', 'timeline'] as const).map(tab => {
                const isActive = activeCardTab === tab;
                const label = tab === 'clients' ? 'Clients' : tab === 'todo' ? 'To Do' : 'Timeline';
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveCardTab(tab)}
                    style={{
                      flex: 1,
                      padding: isActive ? '12px 0 13.5px' : '14px 0 10px',
                      fontSize: 18,
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? '#1C1917' : '#FFFFFF',
                      background: isActive ? '#FDFCF8' : '#3D3A36',
                      border: 'none',
                      borderBottom: isActive ? '1.5px solid #FDFCF8' : '1.5px solid transparent',
                      marginBottom: isActive ? -1.5 : 0,
                      cursor: 'pointer',
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      transition: 'all 0.15s',
                      letterSpacing: isActive ? '-0.01em' : 0,
                      position: 'relative',
                      zIndex: isActive ? 2 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    {label}
                    {tab === 'timeline' && isActive && (
                      <span
                        style={{ display: 'flex', alignItems: 'center', gap: 3 }}
                        onClick={e => e.stopPropagation()}
                      >
                        <span
                          role="button"
                          onClick={() => setTimelineZoom(z => Math.max(z - 1, 0))}
                          style={{
                            width: 16, height: 16, borderRadius: 3,
                            border: '1px solid #D8D4CC',
                            background: timelineZoom === 0 ? '#F0EDE8' : '#FDFCF8',
                            color: timelineZoom === 0 ? '#C0BBB4' : '#6B6560',
                            cursor: timelineZoom === 0 ? 'default' : 'pointer',
                            fontSize: 12, lineHeight: 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                            userSelect: 'none',
                          }}
                        >−</span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: '#8A8578',
                          minWidth: 32, textAlign: 'center',
                          fontFamily: "'DM Sans', system-ui, sans-serif",
                          letterSpacing: '0.03em',
                        }}>
                          {TIMELINE_ZOOM_LEVELS[timelineZoom].label}
                        </span>
                        <span
                          role="button"
                          onClick={() => setTimelineZoom(z => Math.min(z + 1, TIMELINE_ZOOM_LEVELS.length - 1))}
                          style={{
                            width: 16, height: 16, borderRadius: 3,
                            border: '1px solid #D8D4CC',
                            background: timelineZoom === TIMELINE_ZOOM_LEVELS.length - 1 ? '#F0EDE8' : '#FDFCF8',
                            color: timelineZoom === TIMELINE_ZOOM_LEVELS.length - 1 ? '#C0BBB4' : '#6B6560',
                            cursor: timelineZoom === TIMELINE_ZOOM_LEVELS.length - 1 ? 'default' : 'pointer',
                            fontSize: 12, lineHeight: 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                            userSelect: 'none',
                          }}
                        >+</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Timeline sort bar (shown only when timeline tab active) ── */}
            {activeCardTab === 'timeline' && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 10px', flexShrink: 0,
                borderBottom: '1px solid #E8E4DC',
                background: '#F7F5F0',
              }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#B5B0A5', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 2, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                  Sort
                </span>
                {([
                  { key: 'default',      label: 'Default'       },
                  { key: 'ending-soon',  label: 'Ending soon'   },
                  { key: 'starting-soon',label: 'Starting soon' },
                ] as const).map(opt => {
                  const active = timelineSort === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setTimelineSort(opt.key)}
                      style={{
                        fontSize: 10, fontWeight: active ? 700 : 500,
                        color: active ? '#FDFCF8' : '#6B6560',
                        background: active ? '#1C1917' : '#ECEAE4',
                        border: 'none', borderRadius: 6,
                        padding: '3px 9px', cursor: 'pointer',
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                        transition: 'all 0.12s',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Tab: Clients ── */}
            {activeCardTab === 'clients' && (
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '8px 10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 8, rowGap: 0 }}>
                  {filteredClients.map((client, idx) => (
                    <ClientCardCompact
                      key={client.id}
                      client={client}
                      selected={selectedClientId === client.id}
                      onClick={() => setSelectedClientId(client.id)}
                      index={idx}
                      accountManagers={accountManagers}
                      variant="agency"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Tab: Timeline ── */}
            {activeCardTab === 'timeline' && (
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <AgencyTimeline
                  clients={sortedGanttClients}
                  channels={ganttChannels}
                  actionPointMarkers={ganttAPMarkers}
                  zoomIdx={timelineZoom}
                  onZoomChange={setTimelineZoom}
                />
              </div>
            )}

            {/* ── Tab: To Do (Action Points) ── */}
            {activeCardTab === 'todo' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '10px 17px 0', marginBottom: 10, flexShrink: 0 }}>
                  <button
                    onClick={() => kanbanRef.current?.startAdding()}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 3,
                      fontSize: 10, color: '#FFFFFF',
                      background: '#1C1917', border: 'none',
                      borderRadius: 12, padding: '3px 8px', cursor: 'pointer',
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                    }}
                  >
                    <Plus size={9} />
                    Add action point
                  </button>
                  <div style={{ marginLeft: 8, display: 'flex', border: '0.5px solid #E8E4DC', borderRadius: 10, overflow: 'hidden' }}>
                    {(['kanban', 'list', 'gantt'] as const).map(v => (
                      <button
                        key={v}
                        onClick={() => setKanbanView(v)}
                        style={{
                          fontSize: 10, padding: '3px 8px', cursor: 'pointer',
                          fontFamily: "'DM Sans', system-ui, sans-serif", fontWeight: 500,
                          color: kanbanView === v ? '#4A6580' : '#B5B0A5',
                          background: kanbanView === v ? 'rgba(74,101,128,0.08)' : 'transparent',
                          border: 'none', borderLeft: v === 'kanban' ? 'none' : '0.5px solid #E8E4DC',
                          textTransform: 'capitalize',
                        }}
                      >{v}</button>
                    ))}
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: '#B5B0A5' }}>
                    {filteredActionPointClients.reduce((sum, c) => sum + c.totalOutstanding, 0)} total
                  </span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '0 17px 12px' }}>
                  <KanbanBoard
                    key={kanbanView}
                    ref={kanbanRef}
                    actionPointClients={filteredActionPointClients}
                    amFilter={amFilter}
                    onActionPointCompleted={() => fetchData(true)}
                    accountManagers={accountManagers}
                    view={kanbanView}
                    onAskAI={(prompt) => chatRef.current?.sendMessage(prompt)}
                    clients={clients.map(c => ({ id: c.id, name: c.name }))}
                    onAccountManagerCreated={fetchAccountManagers}
                  />
                </div>
              </div>
            )}
          </div>

        </div>


      </div>

      {/* Spin keyframe */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* Fullscreen Gantt overlay */}
      {showFullscreenGantt && (
        <FullscreenGanttView
          clients={ganttClients}
          channels={ganttChannels}
          actionPointMarkers={ganttAPMarkers}
          filteredClientIds={filteredIds}
          onClose={() => setShowFullscreenGantt(false)}
        />
      )}
    </div>
  );
}
