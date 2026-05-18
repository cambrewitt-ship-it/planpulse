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
import { CalendarPanel } from '@/components/agency/CalendarPanel';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { FullscreenGanttView, type GanttAPMarker } from '@/components/agency/FullscreenGanttView';

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
  const [selectedDay, setSelectedDay] = useState<number | null>(() => new Date().getDate());
  
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

        {/* ── Column 1: Today + Clients ────────────────── */}
        <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          <TodayCard clients={filteredClients} today={today} />

          {/* Clients list */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 400, color: '#B5B0A5', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Clients ({filteredClients.length})
              </span>
              <div style={{ flex: 1 }} />
              {dotCounts.red > 0 && (
                <span style={{ fontSize: 11, color: '#A0442A', marginLeft: 5, opacity: 0.6 }}>● {dotCounts.red}</span>
              )}
              {dotCounts.amber > 0 && (
                <span style={{ fontSize: 11, color: '#B07030', marginLeft: 5, opacity: 0.6 }}>● {dotCounts.amber}</span>
              )}
              {dotCounts.green > 0 && (
                <span style={{ fontSize: 11, color: '#4A7C59', marginLeft: 5, opacity: 0.6 }}>● {dotCounts.green}</span>
              )}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
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
            <button style={{
              width: '100%', marginTop: 6, padding: '9px 0', flexShrink: 0,
              border: '0.5px dashed #D5D0C5', borderRadius: 12,
              background: 'transparent', color: '#B5B0A5', fontSize: 13,
              cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif",
            }}>
              + Add Client
            </button>
          </div>
        </div>

        {/* ── Column 2: Chat + Notes ────────────────────── */}
        <div style={{ width: 380, flexShrink: 0, alignSelf: 'stretch', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <AgencyChat ref={chatRef} notesSlot={
            /* Notes — dark spine + files panel + content */
            <div
              style={{
                height: '100%',
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
                          <span style={{ fontSize: 11, color: activeFileId === file.id ? '#FFFFFF' : 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
          } />
        </div>

        {/* ── Column 3: Kanban + Gantt stacked ─────────── */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Kanban container */}
          <div style={{
            background: '#FDFCF8',
            border: '1px solid rgba(232,228,220,0.7)',
            borderRadius: 18,
            padding: '15px 17px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            height: 360,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
              <span style={{
                fontSize: 14, fontWeight: 700, color: '#1C1917',
              }}>
                Action Points
              </span>
              <button
                onClick={() => kanbanRef.current?.startAdding()}
                style={{
                  marginLeft: 8,
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
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
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

          {/* Gantt / Calendar */}
          <div style={{
            background: 'linear-gradient(135deg, #2F3439 0%, #4B5057 100%)',
            border: '1px solid rgba(107,114,128,0.75)',
            borderRadius: 18,
            minWidth: 0,
            boxShadow: '0 4px 24px rgba(0,0,0,0.18), 0 1px 8px rgba(0,0,0,0.12)',
            overflow: 'hidden',
            flex: 1,
            minHeight: 0,
          }}>
            <CalendarPanel
              clients={filteredClients}
              actionPointClients={filteredActionPointClients}
              filteredClientIds={filteredIds}
              selectedDay={selectedDay}
              onDaySelect={setSelectedDay}
              currentMonth={today}
              onOpenTimeline={() => setShowFullscreenGantt(true)}
            />
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
