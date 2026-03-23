// src/app/agency-v2/page.tsx
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { format, startOfYear } from 'date-fns';
import type { ClientCardData } from '@/app/api/agency/clients/route';
import type { AgencyClientActionPoints } from '@/app/api/agency/action-points/route';
import { ClientCardCompact } from '@/components/agency/ClientCardCompact';
import { TodayCard } from '@/components/agency/TodayCard';
import { KanbanBoard } from '@/components/agency/KanbanBoard';
import { NotesChecklist } from '@/components/agency/NotesChecklist';
import { CalendarPanel } from '@/components/agency/CalendarPanel';
import { DateRangePicker } from '@/components/ui/date-range-picker';

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
  red: { background: '#F5EDE9', color: '#A0442A', border: '0.5px solid rgba(160,68,42,0.25)', borderRadius: 4 },
  amber: { background: '#F5EDE0', color: '#B07030', border: '0.5px solid rgba(176,112,48,0.25)', borderRadius: 4 },
  blue: { background: '#E8EDF2', color: '#4A6580', border: '0.5px solid rgba(74,101,128,0.25)', borderRadius: 4 },
  green: { background: '#EAF0EB', color: '#4A7C59', border: '0.5px solid rgba(74,124,89,0.25)', borderRadius: 4 },
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
    <div style={{ minHeight: '100vh', background: '#F5F3EF', ...pageFont }}>
      {/* ── Sub-nav (48px) ────────────────────────────────── */}
      <div style={{
        height: 48, background: '#FDFCF8', borderBottom: '0.5px solid #E8E4DC',
        display: 'flex', alignItems: 'center', paddingLeft: 16, paddingRight: 16, gap: 5,
      }}>

        <div style={{ flex: 1 }} />

        {/* Date Range Picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
          />
        </div>

        {/* Refresh button */}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            width: 32, height: 32, borderRadius: 4, border: '0.5px solid #E8E4DC',
            background: '#FDFCF8', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} color="#8A8578" style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* ── Subheader (40px) ──────────────────────────────── */}
      <div style={{
        height: 40, background: '#FDFCF8', borderBottom: '0.5px solid #E8E4DC',
        display: 'flex', alignItems: 'center', paddingLeft: 16, paddingRight: 16, gap: 9,
      }}>
        <span style={{ fontSize: 19, fontWeight: 700, color: '#1C1917', fontFamily: "'Inter', system-ui, sans-serif" }}>Agency Dashboard</span>
        <span style={{ fontSize: 13, color: '#8A8578' }}>{monthLabel}</span>
        <div style={{ width: '0.5px', height: 16, background: '#E8E4DC' }} />
        {/* Briefing chips */}
        <div style={{ display: 'flex', gap: 6, flex: 1, overflowX: 'auto' }}>
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
        <span style={{ fontSize: 12, color: '#B5B0A5', flexShrink: 0 }}>{formatLastRefreshed()}</span>
      </div>

      {/* ── Team member tabs ──────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 4,
        padding: '12px 18px 0', maxWidth: 1440, margin: '0 auto',
      }}>
        {/* "All" tab */}
        {(() => {
          const isActive = amFilter === 'All';
          return (
            <button
              onClick={() => setAmFilter('All')}
              style={{
                padding: '7px 16px',
                borderRadius: '6px 6px 0 0',
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
                borderRadius: '6px 6px 0 0',
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

      {/* ── Main 2-column body ────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 264px',
        gap: 14,
        padding: '0 18px 14px',
        paddingTop: 14,
        maxWidth: 1440,
        margin: '0 auto',
        borderTop: '0.5px solid #E8E4DC',
      }}>
        {/* ── Left column ─────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Today + Notes + Kanban row */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
            <TodayCard clients={filteredClients} today={today} />

            {/* Notes — personal notes, made wider so content isn't cut off */}
            <div
              style={{
                width: 300,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <NotesChecklist filteredClientIds={amFilter === 'All' ? null : filteredIds} />
            </div>

            {/* Kanban container */}
            <div style={{
              flex: 1,
              maxHeight: 600,
              background: '#FDFCF8',
              border: '0.5px solid #E8E4DC',
              borderRadius: 6,
              padding: '15px 17px',
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
                <span style={{
                  fontSize: 11, fontWeight: 400, color: '#B5B0A5',
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                }}>
                  Action Points
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#B5B0A5' }}>
                  {filteredActionPointClients.reduce((sum, c) => sum + c.totalOutstanding, 0)} total
                </span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                <KanbanBoard
                  actionPointClients={filteredActionPointClients}
                  amFilter={amFilter}
                  onActionPointCompleted={() => fetchData(true)}
                  accountManagers={accountManagers}
                />
              </div>
            </div>
          </div>

          {/* Calendar panel */}
          <div style={{
            background: '#FDFCF8',
            border: '0.5px solid #E8E4DC',
            borderRadius: 6,
          }}>
            <CalendarPanel
              clients={filteredClients}
              actionPointClients={filteredActionPointClients}
              filteredClientIds={filteredIds}
              selectedDay={selectedDay}
              onDaySelect={setSelectedDay}
              currentMonth={today}
            />
          </div>

        </div>

        {/* ── Right column ─────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Client list header */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span style={{
              fontSize: 11, fontWeight: 400, color: '#B5B0A5',
              textTransform: 'uppercase', letterSpacing: '0.1em',
            }}>
              Clients ({filteredClients.length})
            </span>
            <div style={{ flex: 1 }} />
            {/* Status dots */}
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

          {/* Scrollable client list */}
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: 8 }}>
            {filteredClients.map((client, idx) => (
              <ClientCardCompact
                key={client.id}
                client={client}
                selected={selectedClientId === client.id}
                onClick={() => setSelectedClientId(client.id)}
                index={idx}
                accountManagers={accountManagers}
              />
            ))}
          </div>

          {/* Add client button */}
          <button style={{
            width: '100%', marginTop: 6, padding: '9px 0',
            border: '0.5px dashed #D5D0C5', borderRadius: 6,
            background: 'transparent', color: '#B5B0A5', fontSize: 13,
            cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif",
          }}>
            + Add Client
          </button>
        </div>
      </div>

      {/* Spin keyframe */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
