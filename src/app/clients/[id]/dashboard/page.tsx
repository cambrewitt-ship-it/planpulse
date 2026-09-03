/**
 * Dashboard V2 — Experimental redesign of the client dashboard.
 *
 * DATA SOURCES: Identical to the current dashboard (new-client-dashboard).
 * All DB calls, API fetches, and state management are copied verbatim so both
 * dashboards always display the same numbers.
 *
 * NEW IN V2:
 * - Health score calculation (src/lib/utils/health-score.ts)
 * - HeroHealthSection: client identity + health ring + 4 quick-metric cards
 * - ChannelPerformanceCard: per-channel pacing, metrics, expandable spend chart
 * - ActionItemsSection: priority-grouped action items with expand/collapse
 * - Skeleton loading states for all sections
 * - Error boundary with graceful fallback UI
 *
 * SWITCHING BETWEEN VERSIONS:
 * - Current dashboard → V2: "Preview New Dashboard →" button in the header
 * - V2 → Current dashboard: "← Back to Current Dashboard" link in the V2 header
 */

'use client';

import Link from 'next/link';
import { ChevronDown, ChevronLeft, ChevronRight, Eye, X } from 'lucide-react';
import { MediaPlanChannel, MediaPlanCampaignLine } from '@/components/legacy-plan-builder/media-plan-grid';
import { UploadWizard } from '@/components/sandbox/upload-wizard';
import { PlanGrid } from '@/components/sandbox/plan-grid';
import type { SandboxPlan, Week, PlanRow, Flight } from '@/components/sandbox/types';
import { FLIGHT_COLORS } from '@/components/sandbox/types';
import { createBlankSandboxPlan } from '@/lib/media-plan/sandbox-sync';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { getClientById, getMediaPlans, getPlanById, updateClient, updateClientLogoUrl } from '@/lib/db/plans';
import { fetchCachedAnalyticsData, SpendDataPoint } from '@/lib/api/analytics-data-integration';
import { addDays, format, parseISO } from 'date-fns';
import { calculateHealthScore, type HealthScoreResult } from '@/lib/utils/health-score';
import { calculatePerformanceHealth, type PerformanceHealthResult } from '@/lib/calculate-performance-health';
import {
  getPlatformForChannel,
  generateChannelChartData,
  generateChannelChartDataForRange,
  getChannelCategory,
  getWeekMonthKey,
  getWeekAlignedMonthRange,
} from '@/lib/utils/channel-pacing';
import OrganicSocialCard from '@/components/dashboard-v2/organic-social-card';
import EdmCard from '@/components/dashboard-v2/edm-card';
import OohCard from '@/components/dashboard-v2/ooh-card';
import OtherChannelCard from '@/components/dashboard-v2/other-channel-card';
import DisplayNativeCard from '@/components/dashboard-v2/display-native-card';
import type { OrganicSocialActual, EdmActual, ChannelBenchmark, MetricPreset, ClientChannelPreset } from '@/types/database';
import { startOfWeek } from 'date-fns';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import TodoSection from '@/components/TodoSection';
import AdPlatformConnector from '@/components/AdPlatformConnector';
import HeroHealthSection from '@/components/dashboard-v2/hero-health-section';
import { NotesChecklist } from '@/components/agency/NotesChecklist';
import ClientActionPointsList from '@/components/dashboard-v2/client-action-points-list';
import ChannelPerformanceCard from '@/components/dashboard-v2/channel-performance-card';
import { ChannelManageMenu } from '@/components/dashboard-v2/channel-manage-menu';
import dynamic from 'next/dynamic';
const InvoiceModal = dynamic(() => import('@/components/dashboard-v2/invoice-modal').then(m => m.InvoiceModal), { ssr: false });
const ReportBuilderModal = dynamic(() => import('@/components/dashboard-v2/report-builder-modal').then(m => m.ReportBuilderModal), { ssr: false });
import { type GanttClient, type GanttChannel } from '@/components/agency/GanttCalendar';
import { FullscreenGanttView, type GanttAPMarker } from '@/components/agency/FullscreenGanttView';
import { ClientIntelTab } from '@/components/dashboard-v2/client-intel-tab';
import ClientChatPanel from '@/components/dashboard-v2/client-chat-panel';
import MediaPlanChatPanel from '@/components/dashboard-v2/media-plan-chat-panel';
import { nzToday, nzDateKeyOffset, nzStartOfMonth, nzStartOfYear, formatNZ } from '@/lib/timezone';

/** Local-midnight Date for "today" as it falls on the NZ calendar. */
function nzTodayLocalMidnight(): Date {
  const [y, m, d] = nzToday().split('-').map(Number);
  return new Date(y, m - 1, d);
}

interface Client {
  id: string;
  name: string;
  notes?: string | null;
  logo_url?: string | null;
  account_manager?: string | null;
}

interface MediaPlan {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  total_budget: number;
  status: string;
  channels?: any[];
}

const GANTT_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

const VIEW_MODE_ORDER = ['overview', 'media-plan', 'client-hub'] as const;
const VIEW_MODE_COLORS: Record<typeof VIEW_MODE_ORDER[number], string> = {
  overview: '#2f3a56',
  'media-plan': '#35586b',
  'client-hub': '#5B6B80',
};

function ganttClientColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  return GANTT_COLORS[Math.abs(hash) % GANTT_COLORS.length];
}

function ganttClientInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function inferGanttChannelType(channelName: string): 'paid' | 'organic' {
  const lower = channelName.toLowerCase();
  if (/organic|social|seo|email|edm|content/.test(lower)) return 'organic';
  return 'paid';
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

function getChannelDisplayNameFromPlatform(platform?: string): string {
  if (!platform) return 'Unknown Channel';
  const lower = platform.toLowerCase();
  if (lower.includes('meta') || lower.includes('facebook')) return 'Meta Ads';
  if (lower.includes('google')) return 'Google Search';
  if (lower.includes('linkedin')) return 'LinkedIn Ads';
  if (lower.includes('tiktok')) return 'TikTok Ads';
  return platform;
}

export default function DashboardV2() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [plans, setPlans] = useState<MediaPlan[]>([]);
  const [activePlan, setActivePlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [mediaPlanBuilderChannels, setMediaPlanBuilderChannels] = useState<MediaPlanChannel[]>([]);
  const [commission, setCommission] = useState<number>(0);
  const [planView, setPlanView] = useState<'gross' | 'net'>('gross');
  const [isLoadingMediaPlanBuilder, setIsLoadingMediaPlanBuilder] = useState(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);
  const [isEditingClientName, setIsEditingClientName] = useState(false);
  const [editingClientName, setEditingClientName] = useState('');
  const [isSavingClientName, setIsSavingClientName] = useState(false);
  const [isEditingClientNotes, setIsEditingClientNotes] = useState(false);
  const [editingClientNotes, setEditingClientNotes] = useState('');
  const [notesCollapsed, setNotesCollapsed] = useState(false);
  const [hiddenChannelCards, setHiddenChannelCards] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const saved = localStorage.getItem(`hidden-channel-cards-${params.id}`);
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set();
  });

  const toggleChannelCardHidden = (cardKey: string) => {
    setHiddenChannelCards(prev => {
      const next = new Set(prev);
      if (next.has(cardKey)) next.delete(cardKey);
      else next.add(cardKey);
      try { localStorage.setItem(`hidden-channel-cards-${clientId}`, JSON.stringify([...next])); } catch {}
      return next;
    });
  };
  // Quick filter for Channel Performance: 'all' shows every card (default), 'digital'
  // shows only paid digital-advertising cards (Meta/Google/LinkedIn/TikTok/etc).
  const [channelFilterMode, setChannelFilterMode] = useState<'all' | 'digital'>(() => {
    if (typeof window === 'undefined') return 'all';
    try {
      const saved = localStorage.getItem(`channel-filter-mode-${params.id}`);
      if (saved === 'digital') return 'digital';
    } catch {}
    return 'all';
  });
  const handleChannelFilterModeChange = (mode: 'all' | 'digital') => {
    setChannelFilterMode(mode);
    try { localStorage.setItem(`channel-filter-mode-${clientId}`, mode); } catch {}
  };
  const [hiddenChannelsSectionExpanded, setHiddenChannelsSectionExpanded] = useState(false);
  const [notesActiveTab, setNotesActiveTab] = useState<'notes' | 'todo'>('todo');
  const [noteFiles, setNoteFiles] = useState<{ id: string; name: string }[]>([{ id: 'default', name: 'General' }]);
  const [activeFileId, setActiveFileId] = useState<string>('default');
  const [showFilesMenu, setShowFilesMenu] = useState(false);
  const [showTodoMenu, setShowTodoMenu] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [isSavingClientNotes, setIsSavingClientNotes] = useState(false);
  const [isSavingAccountManager, setIsSavingAccountManager] = useState(false);
  const [accountManagers, setAccountManagers] = useState<Array<{ id: string; name: string; email: string | null }>>([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'overview' | 'media-plan' | 'client-hub'>(() => {
    return searchParams.get('view') === 'media-plan' ? 'media-plan' : 'overview';
  });
  const [adminNeedsConfig, setAdminNeedsConfig] = useState(false);
  // Bumped only when the Media Plan Editor agent injects a plan (not on the grid's
  // own edits) — PlanGrid only reads its `plan` prop on mount, so an external write
  // needs a remount (via `key`) to actually show up in the grid.
  const [externalPlanRevision, setExternalPlanRevision] = useState(0);
  // One-shot prefill from the /agency "Edit Media Plan" launcher — the starter
  // text is stashed in sessionStorage (not the URL) to avoid encoding/length limits.
  const [mediaPlanChatPrefill, setMediaPlanChatPrefill] = useState<string | null>(null);
  // Whether the Media Plan Editor chat panel is open alongside the grid — starts
  // closed so the grid gets full width; the "AI Planner Agent" button (or any
  // hand-off that wants the agent's attention, like a prefill or screenshot) opens it.
  const [mediaPlanChatOpen, setMediaPlanChatOpen] = useState(false);
  useEffect(() => {
    if (searchParams.get('mpPrefill') !== '1') return;
    try {
      const stashed = sessionStorage.getItem('planpulse_mp_agent_prefill');
      sessionStorage.removeItem('planpulse_mp_agent_prefill');
      if (stashed) {
        setMediaPlanChatPrefill(stashed);
        setMediaPlanChatOpen(true);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Screenshot picked from the Upload Wizard's "AI Agent Planner" entry point,
  // handed off to the Media Plan Editor chat panel to auto-run once it mounts.
  const [pendingAgentScreenshot, setPendingAgentScreenshot] = useState<{ base64: string; mimeType: string; preview: string; name: string } | null>(null);
  // Excel file attached via the chat panel — opens the Upload Wizard as a modal
  // (pre-loaded with this file) since the wizard is otherwise only mounted when
  // there's no plan yet, but the chat panel is available even once a plan exists.
  const [pendingExcelFile, setPendingExcelFile] = useState<File | null>(null);

  // Eagerly check if any connected platform is missing saved accounts
  useEffect(() => {
    if (!clientId) return;
    const check = async () => {
      try {
        const statusRes = await fetch(`/api/connections/status?clientId=${clientId}`);
        if (!statusRes.ok) return;
        const { connections } = await statusRes.json();
        if (!Array.isArray(connections)) return;

        const active = new Set(
          connections
            .filter((c: { platform: string; status: string }) => c.status === 'active')
            .map((c: { platform: string }) => c.platform === 'meta-ads' ? 'facebook' : c.platform)
        );

        const checks = await Promise.all([
          active.has('google-ads')
            ? fetch('/api/ads/google-ads/get-accounts').then(r => r.ok ? r.json() : { accounts: [] })
            : Promise.resolve({ accounts: ['placeholder'] }),
          active.has('facebook')
            ? fetch(`/api/ads/meta/get-accounts?clientId=${clientId}`).then(r => r.ok ? r.json() : { accounts: [] })
            : Promise.resolve({ accounts: ['placeholder'] }),
          active.has('google-analytics')
            ? fetch('/api/ads/google-analytics/get-accounts').then(r => r.ok ? r.json() : { accounts: [] })
            : Promise.resolve({ accounts: ['placeholder'] }),
        ]);

        const needed =
          (active.has('google-ads') && (checks[0].accounts ?? []).length === 0) ||
          (active.has('facebook') && (checks[1].accounts ?? []).length === 0) ||
          (active.has('google-analytics') && (checks[2].accounts ?? []).length === 0);

        setAdminNeedsConfig(needed);
      } catch {
        // silently ignore — badge is non-critical
      }
    };
    check();
  }, [clientId]);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [ganttSelectedDay, setGanttSelectedDay] = useState<number | null>(null);
  const [showFullscreenGantt, setShowFullscreenGantt] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    if (typeof window === 'undefined') return nzTodayLocalMidnight();
    try {
      const saved = localStorage.getItem(`dashboard-v2-selected-month-${params.id}`);
      if (saved) {
        const d = new Date(saved);
        if (!isNaN(d.getTime())) return d;
      }
    } catch {}
    return nzTodayLocalMidnight();
  });
  const [actionPointsStats, setActionPointsStats] = useState<{ totalAll: number; completedAll: number; trafficLightColor: string; loading: boolean }>({ totalAll: 0, completedAll: 0, trafficLightColor: 'bg-gray-400', loading: true });
  const [allActionPoints, setAllActionPoints] = useState<any[]>([]);
  const [actionPointsRefetchTrigger, setActionPointsRefetchTrigger] = useState(0);
  // Ad-hoc TODO tasks for this client — fetched independently of allActionPoints
  // (which only ever holds SET UP/HEALTH CHECK checklist templates). This is
  // what actually powers the client dashboard's To Do panel.
  const [todoActionPoints, setTodoActionPoints] = useState<any[]>([]);
  const [healthScore, setHealthScore] = useState<HealthScoreResult | null>(null);
  const [healthScoreReady, setHealthScoreReady] = useState(false);
  const [perfHealthResult, setPerfHealthResult] = useState<PerformanceHealthResult | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  // Spend data scoped to the visible analytics period — fetched independently for channel cards.
  const [channelMonthSpendData, setChannelMonthSpendData] = useState<SpendDataPoint[]>([]);
  const [isLoadingSpend, setIsLoadingSpend] = useState(true);
  const [spendApiErrors, setSpendApiErrors] = useState<string[]>([]);
  // Spend data scoped to the media plan's own timeline (start → today) — feeds
  // the hero card's Spend bar, independent of the Channel Performance Timeframe picker.
  const [planToDateSpendData, setPlanToDateSpendData] = useState<SpendDataPoint[]>([]);
  // Non-digital channel actuals
  const [organicSocialActuals, setOrganicSocialActuals] = useState<OrganicSocialActual[]>([]);
  const [edmActuals, setEdmActuals] = useState<EdmActual[]>([]);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  // Sandbox-style media plan (per-client). Persisted to Supabase so it syncs
  // across every logged-in device; localStorage is kept only as an instant-paint
  // cache for the initial render and an offline fallback.
  const [clientSandboxPlan, setClientSandboxPlan] = useState<SandboxPlan | null>(null);
  const [sandboxPlanHydrated, setSandboxPlanHydrated] = useState(false);
  const [sandboxPlanSaveError, setSandboxPlanSaveError] = useState<string | null>(null);
  // Tracks when the user explicitly cleared the plan via "Upload new" so the reverse
  // sync from DB channels doesn't immediately re-populate it before they can upload.
  const sandboxPlanExplicitlyClearedRef = useRef(false);
  // Layers the client's own logo/name onto the plan so the PDF export's header
  // can show it — kept separate from clientSandboxPlan itself so saves/onPlanChange
  // round-trips don't have to carry client branding fields back and forth.
  const clientSandboxPlanForGrid = useMemo(() => {
    if (!clientSandboxPlan) return clientSandboxPlan;
    return { ...clientSandboxPlan, clientLogoUrl: client?.logo_url ?? undefined, clientName: client?.name };
  }, [clientSandboxPlan, client?.logo_url, client?.name]);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [allMetaCampaigns, setAllMetaCampaigns] = useState<Array<{ id: string; name: string }>>([]);
  const [allGoogleAdsCampaigns, setAllGoogleAdsCampaigns] = useState<Array<{ id: string; name: string }>>([]);
  const [healthWeights, setHealthWeights] = useState<{ pacing: number; actions: number; perf: number }>(() => {
    if (typeof window === 'undefined') return { pacing: 44, actions: 28, perf: 28 };
    try {
      const saved = localStorage.getItem(`health-weights-${params.id}`);
      return saved ? JSON.parse(saved) : { pacing: 44, actions: 28, perf: 28 };
    } catch { return { pacing: 44, actions: 28, perf: 28 }; }
  });
  const [invoiceHistory, setInvoiceHistory] = useState<Array<{ id: string; dateRange: { startDate: string; endDate: string }; generatedAt: string }>>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem(`invoice-history-${params.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [analyticsDateRange, setAnalyticsDateRange] = useState(() => ({
    startDate: nzStartOfMonth(),
    endDate: nzToday(),
  }));
  // Timeframe for the hero Spend / Plan Timeline cards — set via the settings
  // wheel on the CPA graph, independent of the Channel Performance / Results timeframe.
  const [heroDateRange, setHeroDateRange] = useState(() => ({
    startDate: nzStartOfYear(),
    endDate: nzToday(),
  }));
  const [allBenchmarks, setAllBenchmarks] = useState<ChannelBenchmark[]>([]);
  const [allPresets, setAllPresets] = useState<MetricPreset[]>([]);
  const [clientChannelPresets, setClientChannelPresets] = useState<ClientChannelPreset[]>([]);
  // Campaign selections lifted from ChannelPerformanceCard: channelKey → selected IDs
  // Empty array = All Campaigns; ['__none__'] = Not set up yet
  const [channelCampaignSelections, setChannelCampaignSelections] = useState<Record<string, string[]>>({});
  // ── Derived campaign date/day values (shared across memos) ──────────────
  const campaignDates = useMemo(() => {
    if (!mediaPlanBuilderChannels.length) return null;
    const allDates = mediaPlanBuilderChannels.flatMap(ch =>
      ch.flights.flatMap(f => [f.startWeek, f.endWeek])
    ).filter(Boolean) as Date[];
    if (!allDates.length) return null;
    const now = nzTodayLocalMidnight();
    const start = new Date(Math.min(...allDates.map(d => d.getTime())));
    const end   = new Date(Math.max(...allDates.map(d => d.getTime())));
    const totalDays   = Math.max(1, Math.ceil((end.getTime()   - start.getTime()) / 86400000));
    const daysElapsed = Math.max(0, Math.ceil((now.getTime()   - start.getTime()) / 86400000));
    const daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime())   / 86400000));
    const totalBudget = mediaPlanBuilderChannels.reduce((sum, ch) =>
      sum + ch.flights.reduce((s, f) =>
        s + Object.values(f.monthlySpend).reduce((a, b) => a + b, 0), 0), 0);
    const plannedSpend = totalBudget > 0
      ? Math.min(totalBudget, totalBudget * (daysElapsed / totalDays))
      : 0;
    return { start, end, totalDays, daysElapsed, daysRemaining, totalBudget, plannedSpend };
  }, [mediaPlanBuilderChannels]);

  // ── Total actual spend: plan-to-date (the media plan's own start → today,
  // same flight-block timeline the Plan Timeline bar uses), NOT the Channel
  // Performance section's selectable Timeframe. Sourced from planToDateSpendData,
  // which is fetched independently of analyticsDateRange — see loadPlanToDateSpendData.
  // Still respects per-channel campaign filters / hidden cards.
  const totalActualSpend = useMemo(() => {
    if (!planToDateSpendData.length || !campaignDates) return 0;
    const rangeStart = campaignDates.start.toISOString().slice(0, 10);
    const todayStr = nzToday();
    const campaignEndStr = campaignDates.end.toISOString().slice(0, 10);
    const rangeEnd = campaignEndStr < todayStr ? campaignEndStr : todayStr;

    const paidChannels = mediaPlanBuilderChannels.filter(ch => {
      const cat = (ch as any).channelCategory || getChannelCategory(ch.channelName);
      return cat === 'paid_digital';
    });

    if (paidChannels.length === 0) {
      return (planToDateSpendData as any[])
        .filter((p: any) => p.date >= rangeStart && p.date <= rangeEnd)
        .reduce((sum: number, p: any) => sum + (p.spend ?? 0), 0);
    }

    let total = 0;
    for (const ch of paidChannels) {
      const channelKey = String((ch as any).id ?? ch.channelName);
      const platform = getPlatformForChannel(ch.channelName);

      // Skip channels whose card is hidden — their spend (or lack of it)
      // shouldn't count toward total client spend. Meta/Google cards can fan
      // out into one card per campaign line, so only skip when every line is hidden.
      const isHidden = platform === 'meta-ads' || platform === 'google-ads'
        ? (() => {
            const lines: MediaPlanCampaignLine[] = (ch as any).campaignLines ?? [];
            return lines.length > 1
              ? lines.every(line => hiddenChannelCards.has(`paid-${channelKey}::${line.id}`))
              : hiddenChannelCards.has(`paid-${channelKey}`);
          })()
        : hiddenChannelCards.has(`other-${channelKey}`);
      if (isHidden) continue;

      const selectedIds = channelCampaignSelections[channelKey];
      const isNone = selectedIds?.length === 1 && selectedIds[0] === '__none__';
      if (isNone) continue;

      const keyword = ch.channelName.toLowerCase().split(' ')[0];

      const chPoints = (planToDateSpendData as any[]).filter((p: any) => {
        if (!p.date || p.date < rangeStart || p.date > rangeEnd) return false;
        const matchesPlatform = (p.platform && p.platform === platform) ||
                                 (p.channelName && p.channelName.toLowerCase().includes(keyword));
        if (!matchesPlatform) return false;
        if (!selectedIds || selectedIds.length === 0) return true;
        return selectedIds.includes(p.campaignId);
      });

      total += chPoints.reduce((s: number, p: any) => s + (p.spend ?? 0), 0);
    }
    // Add manual actual spend from non-digital channels (exclude fee rows and hidden cards)
    const nonDigitalTotal = mediaPlanBuilderChannels
      .filter(ch => {
        const cat = (ch as any).channelCategory || getChannelCategory(ch.channelName);
        if (cat === 'paid_digital' || cat === 'fee') return false;
        const prefix = cat === 'organic_social' ? 'organic'
          : cat === 'edm' ? 'edm'
          : cat === 'ooh' ? 'ooh'
          : cat === 'display_native' ? 'display-native'
          : 'other';
        if (hiddenChannelCards.has(`${prefix}-${(ch as any).id}`)) return false;
        if (channelFilterMode === 'digital') return false; // non-digital cards hidden by the quick filter
        return true;
      })
      .reduce((sum, ch) => sum + ((ch as any).manualActualSpend ?? 0), 0);

    return total + nonDigitalTotal;
  }, [planToDateSpendData, campaignDates, mediaPlanBuilderChannels, channelCampaignSelections, hiddenChannelCards, channelFilterMode]);

  // Fetch account managers
  useEffect(() => {
    const fetchAccountManagers = async () => {
      try {
        const response = await fetch('/api/account-managers');
        if (response.ok) {
          const data = await response.json();
          setAccountManagers(data.accountManagers || []);
        }
      } catch (err) {
        console.error('Error fetching account managers:', err);
      }
    };
    fetchAccountManagers();
  }, []);

  // Fetch benchmarks, presets, and client channel presets for benchmark comparison
  useEffect(() => {
    const fetchBenchmarkData = async () => {
      try {
        const [benchmarksRes, presetsRes] = await Promise.all([
          fetch('/api/benchmarks'),
          fetch('/api/benchmarks/presets'),
        ]);
        if (benchmarksRes.ok) {
          const { data } = await benchmarksRes.json();
          setAllBenchmarks(data ?? []);
        }
        if (presetsRes.ok) {
          const { data } = await presetsRes.json();
          setAllPresets(data ?? []);
        }
      } catch (err) {
        console.error('Error fetching benchmark data:', err);
      }
    };
    fetchBenchmarkData();
  }, []);

  useEffect(() => {
    if (!clientId) return;
    const fetchClientPresets = async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}/channel-presets`);
        if (res.ok) {
          const { data } = await res.json();
          setClientChannelPresets(data ?? []);
        }
      } catch (err) {
        console.error('Error fetching client channel presets:', err);
      }
    };
    fetchClientPresets();
  }, [clientId]);

  // Mirror the computed MTD actual spend to the DB so the agency dashboard can
  // show the exact same number without recalculating.
  useEffect(() => {
    if (!clientId || totalActualSpend <= 0) return;
    const timer = setTimeout(() => {
      fetch(`/api/clients/${clientId}/actual-spend`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualSpend: totalActualSpend, dateRange: heroDateRange }),
      }).catch(() => {/* fire-and-forget */});
    }, 2000);
    return () => clearTimeout(timer);
  }, [clientId, totalActualSpend]);

  // Note: analyticsDateRange defaults to this month (1st – today) on each load

  // Optimistically hydrate from the local cache first so the grid paints
  // instantly; loadMediaPlanBuilderData() below overwrites this with the
  // server copy once it arrives, which is the source of truth across devices.
  useEffect(() => {
    if (!clientId) return;
    try {
      const raw = localStorage.getItem(`planpulse_sandbox_plan_${clientId}`);
      if (raw) setClientSandboxPlan(JSON.parse(raw));
    } catch {}
    setSandboxPlanHydrated(true);
  }, [clientId]);

  const handleClientPlanChange = (updated: SandboxPlan) => {
    sandboxPlanExplicitlyClearedRef.current = false;
    // clientLogoUrl/clientName are re-derived live from `client` on every render
    // (see clientSandboxPlanForGrid) — drop them here so they never get baked
    // into the persisted plan JSON and go stale.
    const core: SandboxPlan = { ...updated, clientLogoUrl: undefined, clientName: undefined };
    setClientSandboxPlan(core);
    try { localStorage.setItem(`planpulse_sandbox_plan_${clientId}`, JSON.stringify(core)); } catch {}
  };

  const handleClientPlanLoaded = (loaded: SandboxPlan) => {
    handleClientPlanChange(loaded);
    setExternalPlanRevision(v => v + 1);
  };

  // Used by the Media Plan Editor chat panel: PlanGrid only reads its `plan` prop
  // on mount, so an agent-driven write needs a remount (via the externalPlanRevision
  // key) to actually show up live — unlike the grid's own edits, which flow back
  // through onPlanChange without ever needing to remount.
  const handleAgentPlanApplied = (plan: SandboxPlan) => {
    handleClientPlanChange(plan);
    setExternalPlanRevision(v => v + 1);
  };

  // "Upload a screenshot of your Media Plan" on the empty-plan screen — starts a
  // blank plan (same shape as "Start from scratch") so the grid + chat panel mount,
  // then hands the image to the chat panel to auto-run the vision extraction.
  const handleScreenshotSelectedFromWizard = (image: { base64: string; mimeType: string; preview: string; name: string }) => {
    handleClientPlanLoaded(createBlankSandboxPlan());
    setPendingAgentScreenshot(image);
    setMediaPlanChatOpen(true);
  };

  // Excel file attached via the chat panel's attachment button — open the
  // Upload Wizard as a modal, pre-loaded with the file, since the chat panel
  // can't parse spreadsheets itself.
  const handleExcelFileSelectedFromChat = (file: File) => {
    setPendingExcelFile(file);
  };

  const handleClientPlanUpload = () => {
    sandboxPlanExplicitlyClearedRef.current = true;
    setClientSandboxPlan(null);
    try { localStorage.removeItem(`planpulse_sandbox_plan_${clientId}`); } catch {}
  };

  // Sync sandbox plan → MediaPlanChannel whenever the sandbox plan changes.
  // Only skip if channels with flights came from the API (non-sandbox IDs),
  // so we don't clobber real ad-platform data.
  useEffect(() => {
    if (!sandboxPlanHydrated || isLoadingMediaPlanBuilder) return;
    if (!clientSandboxPlan?.rows?.length) return;

    const hasApiFlights = mediaPlanBuilderChannels.some(
      ch => (ch.flights?.length ?? 0) > 0 && !String(ch.id ?? '').startsWith('sandbox-')
    );
    if (hasApiFlights) return;

    const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
    const channelMap = new Map<string, { subType?: string; isOrganic: boolean; flightMap: Map<string, any> }>();
    // channelName -> lineKey -> per-line (unmerged) flights + display name.
    // lineKey = row.flightGroupId ?? row.id — rows sharing a flightGroupId are
    // funnel-stage splits of ONE budget line (see api/sandbox/parse) and must
    // collapse into a single line, not one line per row.
    const lineMap = new Map<string, Map<string, { name?: string; flightMap: Map<string, any> }>>();

    for (const row of clientSandboxPlan.rows) {
      const key = row.channel?.trim();
      if (!key) continue;
      if (!channelMap.has(key)) channelMap.set(key, { subType: row.detail?.trim() || undefined, isOrganic: false, flightMap: new Map() });
      // Propagate isOrganic — any row for this channel being organic makes the whole channel organic
      if (row.isOrganic) channelMap.get(key)!.isOrganic = true;
      if (row.isMasterRow === false) continue;
      for (const f of (row.flights ?? [])) {
        if (f.startWeek && f.endWeek && !channelMap.get(key)!.flightMap.has(f.id)) {
          channelMap.get(key)!.flightMap.set(f.id, f);
        }
      }

      const lineKey = row.flightGroupId ?? row.id;
      if (!lineMap.has(key)) lineMap.set(key, new Map());
      const channelLines = lineMap.get(key)!;
      if (!channelLines.has(lineKey)) {
        channelLines.set(lineKey, { name: row.detail?.trim() || row.audience?.trim() || row.funnel?.trim() || undefined, flightMap: new Map() });
      }
      for (const f of (row.flights ?? [])) {
        if (f.startWeek && f.endWeek && !channelLines.get(lineKey)!.flightMap.has(f.id)) {
          channelLines.get(lineKey)!.flightMap.set(f.id, f);
        }
      }
    }

    const buildMediaFlights = (flightMap: Map<string, any>) =>
      Array.from(flightMap.values())
        .filter((f: any) => f.startWeek && f.endWeek)
        .map((sbFlight: any) => {
          const startDate = new Date(sbFlight.startWeek);
          const endDate = new Date(sbFlight.endWeek);
          const numWeeks = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_WEEK) + 1);
          const weeklyBudget = sbFlight.budget / numWeeks;
          const monthlySpend: Record<string, number> = {};
          let week = new Date(startDate);
          while (week <= endDate) {
            const monthKey = getWeekMonthKey(week);
            monthlySpend[monthKey] = (monthlySpend[monthKey] ?? 0) + weeklyBudget;
            week = new Date(week.getTime() + MS_PER_WEEK);
          }
          return { id: `sb-${sbFlight.id}`, startWeek: startDate, endWeek: endDate, monthlySpend, color: sbFlight.color, weeklyBudget };
        });

    const converted: MediaPlanChannel[] = Array.from(channelMap.entries()).map(([channelName, { subType, isOrganic, flightMap }]) => {
      const mediaFlights = buildMediaFlights(flightMap);

      const totalBudget = mediaFlights.reduce((sum: number, f: any) =>
        sum + Object.values(f.monthlySpend as Record<string, number>).reduce((a, b) => a + b, 0), 0);

      // Carry forward previously-saved per-line campaign linkage so re-running
      // this sync (e.g. after an AI chat edit) doesn't wipe out saved links.
      const prevChannel = mediaPlanBuilderChannels.find(c => c.channelName === channelName);
      const prevLinesById = new Map((prevChannel?.campaignLines ?? []).map(l => [l.id, l]));
      const linesForChannel = lineMap.get(channelName);
      const campaignLines: MediaPlanCampaignLine[] = linesForChannel
        ? Array.from(linesForChannel.entries()).map(([lineKey, { name, flightMap: lFlightMap }]) => {
            const lineId = `${channelName}::${lineKey}`;
            const prevLine = prevLinesById.get(lineId);
            return {
              id: lineId,
              name,
              flights: buildMediaFlights(lFlightMap),
              metaCampaignId: prevLine?.metaCampaignId,
              metaCampaignName: prevLine?.metaCampaignName,
              metaCampaignIds: prevLine?.metaCampaignIds,
              metaCampaignNames: prevLine?.metaCampaignNames,
              googleCampaignId: prevLine?.googleCampaignId,
              googleCampaignName: prevLine?.googleCampaignName,
              googleCampaignIds: prevLine?.googleCampaignIds,
              googleCampaignNames: prevLine?.googleCampaignNames,
            };
          })
        : [];

      return {
        id: `sandbox-${channelName.replace(/\s+/g, '-').toLowerCase()}`,
        channelName,
        channelSubType: subType,
        format: '',
        percentOfInvestment: 0,
        totalBudget,
        flights: mediaFlights,
        ...(isOrganic ? { channelCategory: 'organic_social' } : {}),
        ...(campaignLines.length > 0 ? { campaignLines } : {}),
      };
    });

    if (converted.length > 0) {
      setMediaPlanBuilderChannels(converted);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandboxPlanHydrated, isLoadingMediaPlanBuilder, clientSandboxPlan]);

  // Reverse sync: when localStorage has no sandbox plan but DB has channels with flights,
  // convert the DB data into SandboxPlan format so the media-plan view shows existing data
  // instead of the upload wizard.
  useEffect(() => {
    if (!sandboxPlanHydrated || isLoadingMediaPlanBuilder) return;
    if (clientSandboxPlan !== null) return;
    if (sandboxPlanExplicitlyClearedRef.current) return;

    const channelsWithFlights = mediaPlanBuilderChannels.filter(
      ch => (ch.flights?.length ?? 0) > 0
    );
    if (!channelsWithFlights.length) return;

    const toMon = (d: Date): Date => {
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const out = new Date(d);
      out.setDate(d.getDate() + diff);
      out.setHours(0, 0, 0, 0);
      return out;
    };
    const isoDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const weekLbl = (d: Date) => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${d.getDate()}-${months[d.getMonth()]}`;
    };
    const monthLbl = (d: Date) =>
      ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getMonth()];

    const allTimes: number[] = [];
    for (const ch of channelsWithFlights) {
      for (const f of ch.flights) {
        if (f.startWeek) allTimes.push(new Date(f.startWeek).getTime());
        if (f.endWeek) allTimes.push(new Date(f.endWeek).getTime());
      }
    }
    if (!allTimes.length) return;

    const planStart = toMon(new Date(Math.min(...allTimes)));
    const planEnd = toMon(new Date(Math.max(...allTimes)));

    const weeks: Week[] = [];
    const cur = new Date(planStart);
    while (cur <= planEnd) {
      const thu = new Date(cur.getTime() + 3 * 86400000);
      weeks.push({ weekStart: isoDate(cur), label: weekLbl(cur), month: monthLbl(thu), year: cur.getFullYear() });
      cur.setDate(cur.getDate() + 7);
    }

    const rows: PlanRow[] = channelsWithFlights.map((ch, chIdx) => {
      const isOrganic = ch.channelCategory === 'organic_social';
      const flights: Flight[] = ch.flights.map((f, fIdx) => {
        const budget = f.monthlySpend && Object.keys(f.monthlySpend).length > 0
          ? Object.values(f.monthlySpend).reduce((a: number, b: number) => a + b, 0)
          : f.weeklyBudget * Math.max(1, Math.round((new Date(f.endWeek).getTime() - new Date(f.startWeek).getTime()) / (7 * 86400000)) + 1);
        return {
          id: `db-${f.id || `${chIdx}-${fIdx}`}`,
          startWeek: isoDate(toMon(new Date(f.startWeek))),
          endWeek: isoDate(toMon(new Date(f.endWeek))),
          budget: Math.round(budget),
          color: (f as any).color || FLIGHT_COLORS[chIdx % FLIGHT_COLORS.length],
        };
      });
      return {
        id: `db-row-${ch.id || chIdx}`,
        funnel: '',
        channel: ch.channelName,
        detail: ch.channelSubType || '',
        audience: '',
        flights,
        isMasterRow: true,
        isOrganic,
      };
    });

    handleClientPlanChange({
      id: `db-plan-${clientId}`,
      title: 'Media Plan',
      asAtLabel: '',
      weeks,
      rows,
      updatedAt: new Date().toISOString(),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandboxPlanHydrated, isLoadingMediaPlanBuilder, clientSandboxPlan, mediaPlanBuilderChannels]);

  // Load note files from localStorage
  useEffect(() => {
    if (!clientId) return;
    try {
      const saved = localStorage.getItem(`note_files_${clientId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setNoteFiles(parsed);
          setActiveFileId(parsed[0].id);
        }
      }
    } catch {}
  }, [clientId]);

  const saveNoteFiles = (files: { id: string; name: string }[]) => {
    setNoteFiles(files);
    try { localStorage.setItem(`note_files_${clientId}`, JSON.stringify(files)); } catch {}
  };

  const addNoteFile = () => {
    const name = newFileName.trim() || 'New File';
    const id = `file-${Date.now()}`;
    const updated = [...noteFiles, { id, name }];
    saveNoteFiles(updated);
    setActiveFileId(id);
    setNewFileName('');
    setShowFilesMenu(false);
  };

  const deleteNoteFile = (id: string) => {
    const updated = noteFiles.filter(f => f.id !== id);
    const next = updated.length > 0 ? updated : [{ id: 'default', name: 'General' }];
    saveNoteFiles(next);
    if (activeFileId === id) setActiveFileId(next[0].id);
  };

  // Persist selectedMonth across refreshes
  useEffect(() => {
    if (typeof window === 'undefined' || !clientId) return;
    try {
      localStorage.setItem(`dashboard-v2-selected-month-${clientId}`, selectedMonth.toISOString());
    } catch {}
  }, [selectedMonth, clientId]);

  // Keep the "Channel View" month in sync with the analytics date range so that
  // changing the main date picker also shifts the month used by channel cards.
  useEffect(() => {
    if (!analyticsDateRange.startDate) return;
    const parsed = parseISO(analyticsDateRange.startDate);
    if (isNaN(parsed.getTime())) return;
    // Snap to first day of month for the month input control
    const monthAnchor = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
    // Avoid unnecessary re-renders if month is already the same
    if (
      selectedMonth.getFullYear() === monthAnchor.getFullYear() &&
      selectedMonth.getMonth() === monthAnchor.getMonth()
    ) {
      return;
    }
    setSelectedMonth(monthAnchor);
  }, [analyticsDateRange.startDate, selectedMonth]);

  // Fetch this client's ad-hoc TODO tasks — independent of allActionPoints
  // (SET UP/HEALTH CHECK templates), so the To Do panel actually shows them.
  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/action-points?category=TODO&client_id=${clientId}`)
      .then(r => r.ok ? r.json() : { data: [] })
      .then(({ data }) => setTodoActionPoints(Array.isArray(data) ? data : []))
      .catch(() => setTodoActionPoints([]));
  }, [clientId, actionPointsRefetchTrigger]);

  // Fetch all Meta campaigns (not limited to spend data) so the campaign
  // filter dropdown in each channel card shows the full account campaign list.
  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/ads/meta/campaigns?clientId=${clientId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.campaigns) {
          setAllMetaCampaigns(data.campaigns.map((c: any) => ({ id: c.id, name: c.name })));
        }
      })
      .catch(() => {});
  }, [clientId]);

  // Fetch all Google Ads campaigns from saved metrics so the campaign dropdown
  // appears on Google Ads cards regardless of the current analytics date range.
  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/ads/google-ads/campaigns?clientId=${clientId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.campaigns) {
          setAllGoogleAdsCampaigns(data.campaigns.map((c: any) => ({ id: c.id, name: c.name })));
        }
      })
      .catch(() => {});
  }, [clientId]);

  // Calculate planned budget prorated to the selected date range
  const plannedBudget = useMemo(() => {
    if (!mediaPlanBuilderChannels || mediaPlanBuilderChannels.length === 0) return 0;
    if (!analyticsDateRange?.startDate || !analyticsDateRange?.endDate) return 0;

    // Parse date parts to avoid UTC timezone offset issues
    const [startY, startM, startD] = analyticsDateRange.startDate.split('-').map(Number);
    const [endY, endM, endD] = analyticsDateRange.endDate.split('-').map(Number);

    let totalBudget = 0;
    let year = startY;
    let month = startM; // 1-based

    while (year < endY || (year === endY && month <= endM)) {
      const daysInMonth = new Date(year, month, 0).getDate();
      const monthStart = (year === startY && month === startM) ? startD : 1;
      const monthEnd   = (year === endY   && month === endM)   ? endD   : daysInMonth;
      const fraction   = (monthEnd - monthStart + 1) / daysInMonth;

      const paddedKey   = `${year}-${String(month).padStart(2, '0')}`;
      const unpaddedKey = `${year}-${month}`;

      mediaPlanBuilderChannels.forEach((channel) => {
        const cat = (channel as any).channelCategory || getChannelCategory(channel.channelName);
        if (cat === 'fee') return;
        channel.flights?.forEach((flight) => {
          if (flight.monthlySpend) {
            const spend = flight.monthlySpend[paddedKey] ?? flight.monthlySpend[unpaddedKey] ?? 0;
            totalBudget += Number(spend) * fraction;
          }
        });
      });

      month++;
      if (month > 12) { month = 1; year++; }
    }

    return totalBudget;
  }, [mediaPlanBuilderChannels, analyticsDateRange.startDate, analyticsDateRange.endDate]);

  const handleActionPointsChange = () => {
    setActionPointsRefetchTrigger(prev => prev + 1);
  };

  // Fetch non-digital channel actuals
  const loadNonDigitalActuals = async () => {
    if (!clientId) return;
    
    try {
      // Fetch organic social actuals
      const organicResponse = await fetch(`/api/clients/${clientId}/organic-social-actuals`);
      if (organicResponse.ok) {
        const organicData = await organicResponse.json();
        setOrganicSocialActuals(organicData.data || []);
      }
      
      // Fetch EDM actuals
      const edmResponse = await fetch(`/api/clients/${clientId}/edm-actuals`);
      if (edmResponse.ok) {
        const edmData = await edmResponse.json();
        setEdmActuals(edmData.data || []);
      }
    } catch (error) {
      console.error('Error loading non-digital actuals:', error);
    }
  };

  useEffect(() => {
    if (clientId) {
      Promise.all([
        loadData(),
        loadMediaPlanBuilderData(),
        loadNonDigitalActuals(),
      ]);
    }
  }, [clientId]);

  // Reload analytics when date range changes.
  useEffect(() => {
    if (clientId) {
      loadAnalyticsData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsDateRange.startDate, analyticsDateRange.endDate, clientId]);

  // Reload the hero card's plan-to-date spend whenever the media plan's own
  // timeline changes (e.g. finishes loading, or a flight is added/edited).
  useEffect(() => {
    if (clientId && campaignDates) {
      loadPlanToDateSpendData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, campaignDates?.start?.getTime(), campaignDates?.end?.getTime()]);

  const loadData = async () => {
    try {
      const foundClient = await getClientById(clientId);
      setClient(foundClient || null);

      const clientPlans = await getMediaPlans(clientId);
      setPlans(clientPlans || []);

      const activePlanData = clientPlans?.find((p: MediaPlan) => p.status?.toLowerCase() === 'active');
      if (activePlanData) {
        const fullPlanData = await getPlanById(activePlanData.id);
        setActivePlan(fullPlanData);
      } else {
        setActivePlan(null);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMediaPlanBuilderData = async () => {
    if (!clientId) return;

    setIsLoadingMediaPlanBuilder(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/media-plan-builder`);
      if (!response.ok) {
        return;
      }
      const result = await response.json();

      if (result.data) {
        const processedChannels = (result.data.channels || []).map((channel: any) => ({
          ...channel,
          flights: (channel.flights || []).map((flight: any) => ({
            ...flight,
            startWeek: flight.startWeek ? new Date(flight.startWeek) : new Date(),
            endWeek: flight.endWeek ? new Date(flight.endWeek) : new Date(),
          })),
        }));

        setMediaPlanBuilderChannels(processedChannels);
        setCommission(result.data.commission || 0);

        // Server copy of the full media-plan grid wins over whatever's cached
        // locally — this is what makes edits made on one computer show up on
        // another. If the server has never seen a sandbox plan yet (e.g. this
        // client's plan predates server-side sync), keep the local cache.
        if (result.data.sandboxPlan) {
          sandboxPlanExplicitlyClearedRef.current = false;
          setClientSandboxPlan(result.data.sandboxPlan);
          try {
            localStorage.setItem(`planpulse_sandbox_plan_${clientId}`, JSON.stringify(result.data.sandboxPlan));
          } catch {}
        }

        // Pre-populate localStorage with campaign selections from onboarding so
        // channel cards initialize with the right campaigns on first load.
        if (typeof window !== 'undefined' && clientId) {
          processedChannels.forEach((ch: any) => {
            const key = `channel-campaigns-${clientId}-${ch.id ?? ch.channelName}`;
            if (localStorage.getItem(key)) return; // already set by user — don't override
            const ids: string[] = ch.metaCampaignIds?.length
              ? ch.metaCampaignIds
              : ch.metaCampaignId ? [ch.metaCampaignId] : [];
            if (ids.length > 0) {
              try { localStorage.setItem(key, JSON.stringify(ids)); } catch {}
            }
          });
        }
      }
    } catch (error) {
      console.error('Error loading media plan builder data:', error);
    } finally {
      setIsLoadingMediaPlanBuilder(false);
      isInitialLoadRef.current = false;
    }
  };

  const saveMediaPlanBuilderData = async (channels: MediaPlanChannel[], commission: number, sandboxPlan?: SandboxPlan | null) => {
    if (!clientId || isInitialLoadRef.current) return;

    try {
      const serializedChannels = channels.map(channel => ({
        ...channel,
        flights: (channel.flights || []).map((flight: any) => ({
          ...flight,
          startWeek: flight.startWeek instanceof Date
            ? flight.startWeek.toISOString()
            : (typeof flight.startWeek === 'string' ? flight.startWeek : new Date().toISOString()),
          endWeek: flight.endWeek instanceof Date
            ? flight.endWeek.toISOString()
            : (typeof flight.endWeek === 'string' ? flight.endWeek : new Date().toISOString()),
        })),
      }));

      const response = await fetch(`/api/clients/${clientId}/media-plan-builder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: serializedChannels, commission, sandboxPlan }),
      });

      if (!response.ok) {
        console.error('Failed to save media plan builder data:', response.status);
        if (sandboxPlan !== undefined) {
          setSandboxPlanSaveError('Could not sync this plan to your other devices — check your connection.');
        }
      } else if (sandboxPlan !== undefined) {
        setSandboxPlanSaveError(null);
      }
    } catch (error) {
      console.error('Error saving media plan builder data:', error);
      if (sandboxPlan !== undefined) {
        setSandboxPlanSaveError('Could not sync this plan to your other devices — check your connection.');
      }
    }
  };

  // Auto-save media plan builder data (channels + sandbox grid) with debouncing
  useEffect(() => {
    if (isInitialLoadRef.current || isLoadingMediaPlanBuilder || !sandboxPlanHydrated) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveMediaPlanBuilderData(mediaPlanBuilderChannels, commission, clientSandboxPlan);
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [mediaPlanBuilderChannels, commission, clientSandboxPlan, clientId, isLoadingMediaPlanBuilder, sandboxPlanHydrated]);

  const loadAnalyticsData = async (force: boolean = false) => {
    if (!clientId) return;

    setLoadingAnalytics(true);
    setIsLoadingSpend(true);
    try {
      const result = await fetchCachedAnalyticsData(clientId, {
        startDate: analyticsDateRange.startDate,
        endDate: analyticsDateRange.endDate,
        force,
      });

      const enhancedSpendData = (result.spendData || []).map((point: any) => {
        const matchingPlan = plans.find(plan => {
          if (plan.status?.toLowerCase() !== 'active') return false;
          const planStart = new Date(plan.start_date);
          const planEnd = new Date(plan.end_date);
          const pointDate = new Date(point.date);
          return pointDate >= planStart && pointDate <= planEnd;
        });

        const channelId = point.platform && point.accountName
          ? `${point.platform}_${point.accountName}`
          : point.platform || 'unknown';
        const channelName = getChannelDisplayNameFromPlatform(point.platform);

        return { ...point, planId: matchingPlan?.id, planName: matchingPlan?.name, channelId, channelName };
      });

      setChannelMonthSpendData(enhancedSpendData);
      setIsLoadingSpend(false);
      setSpendApiErrors((result as any).errors?.filter((e: string) => !e.startsWith('GA4')) ?? []);
    } catch (error: any) {
      console.error('Error loading analytics data:', error);
      setIsLoadingSpend(false);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  // Fetches spend data bounded to the media plan's own timeline (start → today),
  // independent of analyticsDateRange (the Channel Performance Timeframe picker).
  // Feeds totalActualSpend, which drives the hero card's Spend bar.
  const loadPlanToDateSpendData = async (force: boolean = false) => {
    if (!clientId || !campaignDates) return;

    const todayStr = nzToday();
    const campaignEndStr = campaignDates.end.toISOString().slice(0, 10);
    try {
      const result = await fetchCachedAnalyticsData(clientId, {
        startDate: campaignDates.start.toISOString().slice(0, 10),
        endDate: campaignEndStr < todayStr ? campaignEndStr : todayStr,
        force,
      });

      const enhancedSpendData = (result.spendData || []).map((point: any) => ({
        ...point,
        channelName: getChannelDisplayNameFromPlatform(point.platform),
      }));

      setPlanToDateSpendData(enhancedSpendData);
    } catch (error) {
      console.error('Error loading plan-to-date spend data:', error);
    }
  };

  // Force-refreshes GA4 + all connected ad platforms for this client, bypassing
  // the 6-hour cache — the "Refresh Data" button next to the timeframe picker.
  // Resets each platform's staleness clock so the cron skips it for 6h.
  const handleRefreshData = async () => {
    if (isRefreshingData) return;
    setIsRefreshingData(true);
    try {
      await Promise.all([loadAnalyticsData(true), loadPlanToDateSpendData(true)]);
    } finally {
      setIsRefreshingData(false);
    }
  };

  // ── Gantt data for hero card (single client, all channels) ──────────────
  const ganttClients = useMemo<GanttClient[]>(() => {
    if (!client) return [];
    return [
      {
        id: client.id,
        name: client.name,
        initials: ganttClientInitials(client.name),
        color: ganttClientColor(client.id),
      },
    ];
  }, [client]);

  const ganttChannels = useMemo<GanttChannel[]>(() => {
    if (!clientId || !mediaPlanBuilderChannels.length) return [];

    const toDateStr = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const result: GanttChannel[] = [];

    for (const ch of mediaPlanBuilderChannels) {
      const flights = ch.flights || [];
      if (!flights.length) continue;

      const startMs = Math.min(
        ...flights
          .map((f: any) => (f.startWeek ? new Date(f.startWeek).getTime() : NaN))
          .filter((v: number) => !Number.isNaN(v)),
      );
      const endMs = Math.max(
        ...flights
          .map((f: any) => (f.endWeek ? new Date(f.endWeek).getTime() : NaN))
          .filter((v: number) => !Number.isNaN(v)),
      );

      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;

      const start = new Date(startMs);
      const end = new Date(endMs);

      result.push({
        id: String(ch.id ?? ch.channelName),
        client_id: clientId,
        label: ch.channelName,
        start_date: toDateStr(start),
        end_date: toDateStr(end),
        type: inferGanttChannelType(ch.channelName),
      });
    }

    return result;
  }, [clientId, mediaPlanBuilderChannels]);

  // Height for the notes/todo panel (and the matching Ask AI card) — grows with the Gantt but never shrinks below 360
  const notesPanelHeight = useMemo(() => {
    if (!ganttChannels.length) return 360;
    const GANTT_HEADER_H = 46; // 18px month row + 28px day row
    const GANTT_ROW_H = 42;    // per-channel row height in GanttCalendar
    const GANTT_WRAPPER_PADDING_V = 16; // py-2 on the wrapper div
    return Math.max(360, GANTT_HEADER_H + ganttChannels.length * GANTT_ROW_H + GANTT_WRAPPER_PADDING_V);
  }, [ganttChannels.length]);

  // AP markers derived from allActionPoints for fullscreen Gantt
  const ganttAPMarkers = useMemo<GanttAPMarker[]>(() =>
    allActionPoints
      .filter((ap: any) => ap.channel_type && !ap.completed)
      .map((ap: any) => {
        let effectiveDueDate: string | null = ap.due_date ?? null;
        if (!effectiveDueDate && ap.category === 'SET UP' && ap.days_before_live_due != null) {
          const matchedChannel = ganttChannels.find(
            ch => ch.label.toLowerCase().trim() === (ap.channel_type ?? '').toLowerCase().trim() ||
                  ch.label.toLowerCase().includes((ap.channel_type ?? '').toLowerCase()) ||
                  (ap.channel_type ?? '').toLowerCase().includes(ch.label.toLowerCase())
          );
          const refDate = matchedChannel?.start_date
            ? new Date(matchedChannel.start_date)
            : (campaignDates?.start ?? null);
          if (refDate) {
            const d = new Date(refDate);
            d.setDate(d.getDate() - (ap.days_before_live_due as number));
            effectiveDueDate = d.toISOString().slice(0, 10);
          }
        }
        return {
          client_id: clientId,
          channel_label: ap.channel_type,
          text: ap.text || '',
          category: ap.category || 'ONGOING',
          due_date: effectiveDueDate,
          frequency: ap.frequency ?? null,
          id: ap.id,
        };
      }),
    [allActionPoints, clientId, campaignDates, ganttChannels]
  );

  // Compute an effective due_date for an action point for use in the Gantt timeline.
  // SET UP: campaign_start - days_before_live_due; HEALTH CHECK: next occurrence from channel start.
  const computeGanttDueDate = useCallback((ap: any): string | null => {
    if (ap.due_date) return ap.due_date;

    if (ap.category === 'SET UP' && ap.days_before_live_due != null) {
      const matchedChannel = ganttChannels.find(
        ch => ch.label.toLowerCase().trim() === (ap.channel_type ?? '').toLowerCase().trim() ||
              ch.label.toLowerCase().includes((ap.channel_type ?? '').toLowerCase()) ||
              (ap.channel_type ?? '').toLowerCase().includes(ch.label.toLowerCase())
      );
      const refDate = matchedChannel?.start_date
        ? new Date(matchedChannel.start_date)
        : (campaignDates?.start ?? null);
      if (!refDate) return null;
      const d = new Date(refDate);
      d.setDate(d.getDate() - (ap.days_before_live_due as number));
      return d.toISOString().slice(0, 10);
    }

    if (ap.category === 'HEALTH CHECK' && ap.frequency) {
      const intervalDays =
        ap.frequency === 'weekly' ? 7 :
        ap.frequency === 'fortnightly' ? 14 :
        ap.frequency === 'monthly' ? 30 : 0;
      if (!intervalDays) return null;

      // Use matching channel's start_date, falling back to campaign start
      const matchedChannel = ganttChannels.find(
        ch => ch.label.toLowerCase().trim() === (ap.channel_type ?? '').toLowerCase().trim() ||
              ch.label.toLowerCase().includes((ap.channel_type ?? '').toLowerCase()) ||
              (ap.channel_type ?? '').toLowerCase().includes(ch.label.toLowerCase())
      );
      const refDateStr = matchedChannel?.start_date ?? (campaignDates?.start ? campaignDates.start.toISOString().slice(0, 10) : null);
      if (!refDateStr) return null;

      const startMs = new Date(refDateStr).getTime();
      const todayStart = nzTodayLocalMidnight();
      const todayMs = todayStart.getTime();
      const intervalMs = intervalDays * 86400000;

      // Find next future occurrence
      for (let n = 1; n <= 730; n++) {
        const occMs = startMs + n * intervalMs;
        if (occMs >= todayMs) {
          return new Date(occMs).toISOString().slice(0, 10);
        }
      }
      return todayStart.toISOString().slice(0, 10);
    }

    return null;
  }, [campaignDates, ganttChannels]);

  // ── Account Manager handler ──────────────────────────────────────────────
  const handleAccountManagerChange = useCallback(async (accountManager: string | null) => {
    if (!clientId) return;
    setIsSavingAccountManager(true);
    try {
      const response = await fetch(`/api/agency/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_manager: accountManager }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to update account manager:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
        });
        throw new Error(errorData.error || `Failed to update account manager: ${response.statusText}`);
      }
      const data = await response.json();
      if (data.data && client) {
        setClient({ ...client, account_manager: data.data.account_manager });
      }
    } catch (error) {
      console.error('Error updating account manager:', error);
      // Optionally show a toast/notification to the user
    } finally {
      setIsSavingAccountManager(false);
    }
  }, [clientId, client]);

  // ── Logo upload handler ──────────────────────────────────────────────────
  const handleLogoUpload = useCallback(async (file: File) => {
    if (!clientId) return;
    setIsUploadingLogo(true);
    setLogoUploadError(null);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch(`/api/clients/${clientId}/upload-logo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: base64, contentType: file.type || 'image/png', ext }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(error || 'Upload failed');
      }
      const { url } = await res.json();
      await updateClientLogoUrl(clientId, url).catch(() => {});
      if (client) setClient({ ...client, logo_url: url });
    } catch (err) {
      setLogoUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploadingLogo(false);
    }
  }, [clientId, client]);

  // ── Client name edit/save handler ────────────────────────────────────────
  const handleStartEditClientName = useCallback(() => {
    setEditingClientName(client?.name ?? '');
    setIsEditingClientName(true);
  }, [client]);

  const handleCancelEditClientName = useCallback(() => {
    setIsEditingClientName(false);
    setEditingClientName('');
  }, []);

  const handleSaveClientName = useCallback(async () => {
    if (!clientId) return;
    const trimmed = editingClientName.trim();
    if (!trimmed || trimmed === client?.name) {
      setIsEditingClientName(false);
      return;
    }
    setIsSavingClientName(true);
    try {
      const updated = await updateClient(clientId, trimmed);
      if (client) setClient({ ...client, name: updated?.name ?? trimmed });
      setIsEditingClientName(false);
    } catch (err) {
      console.error('Failed to update client name:', err);
    } finally {
      setIsSavingClientName(false);
    }
  }, [clientId, client, editingClientName]);

  // ── Adjusted health score with custom weights ────────────────────────────
  const adjustedHealthScore = useMemo(() => {
    if (!healthScore) return null;
    const total = healthWeights.pacing + healthWeights.actions + healthWeights.perf;
    const wp = total > 0 ? healthWeights.pacing / total : 4 / 9;
    const wa = total > 0 ? healthWeights.actions / total : 2.5 / 9;
    const wf = total > 0 ? healthWeights.perf / total : 2.5 / 9;
    const overallScore = Math.round(
      healthScore.breakdown.budgetPacing.score * wp +
      healthScore.breakdown.actionCompletion.score * wa +
      healthScore.breakdown.performance.score * wf
    );
    const status = overallScore >= 80 ? 'healthy' : overallScore >= 60 ? 'caution' : 'at-risk';
    const statusColor = overallScore >= 80 ? 'green' : overallScore >= 60 ? 'amber' : 'red';
    return { ...healthScore, overallScore, status: status as 'healthy' | 'caution' | 'at-risk', statusColor: statusColor as 'green' | 'amber' | 'red' };
  }, [healthScore, healthWeights]);

  // ── Props for HeroHealthSection ─────────────────────────────────────────
  const heroProps = useMemo(() => {
    if (!client || !adjustedHealthScore || !campaignDates) return null;

    // Plan-to-date pacing: compare actual spend against the linear day-elapsed
    // expected spend for the full campaign, never the Channel Performance
    // section's selected analytics window.
    const pacingRatio = campaignDates.plannedSpend > 0
      ? totalActualSpend / campaignDates.plannedSpend
      : 0;
    const pacingPct = pacingRatio * 100;
    const pacingStatus: { percentage: number; variance: number; status: 'ahead' | 'on-track' | 'behind' } = {
      percentage: pacingPct,
      variance: pacingPct - 100,
      status: pacingPct > 110 ? 'ahead' : pacingPct < 90 ? 'behind' : 'on-track',
    };

    const performanceStatus = perfHealthResult && perfHealthResult.total > 0
      ? {
          label: perfHealthResult.status === 'good' ? 'Good'
               : perfHealthResult.status === 'caution' ? 'Caution'
               : 'At Risk',
          ctr: 0,
          status: (perfHealthResult.status === 'good' ? 'good' : 'needs-attention') as 'excellent' | 'good' | 'needs-attention',
        }
      : {
          label: 'No Data',
          ctr: 0,
          status: 'needs-attention' as 'excellent' | 'good' | 'needs-attention',
        };

    // We have totals from actionPointsStats; split outstanding evenly into
    // urgent / this-week as a placeholder until individual items are surfaced.
    const outstanding = Math.max(0, actionPointsStats.totalAll - actionPointsStats.completedAll);
    const urgent   = Math.ceil(outstanding * 0.3);
    const thisWeek = outstanding - urgent;

    const completionPercentage = Math.max(
      0,
      Math.min(100, (campaignDates.daysElapsed / campaignDates.totalDays) * 100),
    );
    const now = nzTodayLocalMidnight().getTime();
    const daysUntilStart = campaignDates.start.getTime() > now
      ? Math.ceil((campaignDates.start.getTime() - now) / 86400000)
      : 0;

    return {
      clientId,
      client: {
        name: client.name,
        // Intentionally omit notes from V2 hero so the legacy "Master Client Notes"
        // area is visually replaced by the new Kanban action points card.
        logo_url: client.logo_url ?? undefined,
        account_manager: client.account_manager ?? undefined,
      },
      healthScore: adjustedHealthScore,
      currentSpend: totalActualSpend,
      totalBudget: campaignDates.totalBudget,
      daysRemaining: campaignDates.daysRemaining,
      completionPercentage,
      daysUntilStart,
      actionItemsCount: {
        urgent,
        thisWeek,
        completed: actionPointsStats.completedAll,
      },
      pacingStatus,
      performanceStatus,
      planStart: campaignDates.start.toISOString().slice(0, 10),
      planEnd: campaignDates.end.toISOString().slice(0, 10),
      // Date range backing the Spend figures above: plan start → today (or the
      // plan's end date, if it already finished) — same timeline as Plan Timeline,
      // NOT the Channel Performance section's Timeframe picker.
      spendDateRange: {
        startDate: campaignDates.start.toISOString().slice(0, 10),
        endDate: (() => {
          const todayStr = nzToday();
          const campaignEndStr = campaignDates.end.toISOString().slice(0, 10);
          return campaignEndStr < todayStr ? campaignEndStr : todayStr;
        })(),
      },
      isLoadingScore: !healthScoreReady,
      onAccountManagerChange: handleAccountManagerChange,
      isSavingAccountManager,
      accountManagers,
      heroDateRange,
      onHeroDateRangeChange: setHeroDateRange,
    };
  }, [client, clientId, adjustedHealthScore, campaignDates, totalActualSpend, actionPointsStats, handleAccountManagerChange, isSavingAccountManager, accountManagers, perfHealthResult, heroDateRange]);

  // Calculate current week commencing (Monday of current week)
  const currentWeekCommencing = useMemo(() => {
    const today = nzTodayLocalMidnight();
    const monday = startOfWeek(today, { weekStartsOn: 1 });
    return format(monday, 'yyyy-MM-dd');
  }, []);

  // ── Props for ChannelPerformanceCard list ────────────────────────────────
  function channelSortOrder(card: { type: string; platform?: string; name?: string }): number {
    if (card.type === 'paid_digital') {
      if (card.platform === 'meta-ads') return 0;
      if (card.platform === 'google-ads') return 1;
      return 2;
    }
    if (card.type === 'display_native') return 3;
    if (card.type === 'edm') return 4;
    if (card.type === 'ooh') return 5;
    if (card.type === 'other') return 6;
    if (card.type === 'organic_social') return 7;
    return 8;
  }

  const channelCards = useMemo(() => {
    if (!mediaPlanBuilderChannels.length) return [];

    const now = nzTodayLocalMidnight();

    // Detect whether the analytics range spans more than one calendar month.
    const rangeStart   = parseISO(analyticsDateRange.startDate);
    const rangeEnd     = parseISO(analyticsDateRange.endDate);
    const isMultiMonth =
      rangeStart.getMonth() !== rangeEnd.getMonth() ||
      rangeStart.getFullYear() !== rangeEnd.getFullYear();

    const determineStatus = (current: number, planned: number): 'excellent' | 'healthy' | 'attention' => {
      if (planned === 0) return 'attention';
      const ratio = current / planned;
      if (ratio >= 0.95 && ratio <= 1.05) return 'healthy';
      if (ratio > 1.05) return 'excellent';
      return 'attention';
    };

    const detectIssues = (current: number, planned: number, month: Date): string[] => {
      const issues: string[] = [];
      if (month.getMonth() !== now.getMonth() || month.getFullYear() !== now.getFullYear()) return issues;
      if (planned === 0) return issues;
      const dayOfMonth   = now.getDate();
      const daysInMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const expectedSoFar = planned * (dayOfMonth / daysInMonth);
      if (current < expectedSoFar * 0.5)  issues.push('Spend significantly below target — campaign may not be active');
      else if (current < expectedSoFar * 0.8) issues.push('Spending behind pace — review campaign settings');
      else if (current > expectedSoFar * 1.3) issues.push('Spending ahead of schedule — monitor daily spend');
      return issues;
    };

    const buildPaidDigitalCard = (
      ch: any,
      platform: 'meta-ads' | 'google-ads',
      line: MediaPlanCampaignLine | undefined,
      useLineIdentity: boolean,
    ): any => {
      const chPlatform = platform;
      const keyword    = ch.channelName.toLowerCase().split(' ')[0];
      const flightsForCalc = line?.flights ?? ch.flights;
      const chartSourceChannel = line ? { ...ch, flights: flightsForCalc } : ch;

      // ── Chart data: compute first so multi-month totals can be derived ────
      // Planned-spend line should only be discounted by commission when the
      // Net view is selected; the actual-spend line is never commission-adjusted.
      const chartCommission = planView === 'net' ? commission : 0;
      const chartData = isMultiMonth
        ? generateChannelChartDataForRange(chartSourceChannel, analyticsDateRange.startDate, analyticsDateRange.endDate, channelMonthSpendData as any[], chartCommission)
        : generateChannelChartData(chartSourceChannel, selectedMonth, channelMonthSpendData as any[], chartCommission);

      // ── Spend totals ─────────────────────────────────────────────────────
      // Multi-month: read cumulative totals from the final chart data point so
      // the header figures match exactly what the chart is displaying.
      // Single-month: compute as before, scoped to selectedMonth only.
      let currentSpend: number;
      let plannedSpend: number;

      let grossPlannedSpend: number;

      if (isMultiMonth && chartData.length > 0) {
        // Header/pacing-bar totals must reflect the real commission regardless
        // of which view the graph itself is currently rendering — reuse chartData
        // when it was already built with the real commission, otherwise recompute.
        const summaryChartData = chartCommission === commission
          ? chartData
          : generateChannelChartDataForRange(chartSourceChannel, analyticsDateRange.startDate, analyticsDateRange.endDate, channelMonthSpendData as any[], commission);
        const lastPoint       = summaryChartData[summaryChartData.length - 1];
        const lastActualPoint = [...summaryChartData].reverse().find(p => p.actualSpend !== null && typeof p.actualSpend === 'number');
        currentSpend = lastActualPoint?.actualSpend ?? 0;
        plannedSpend = lastPoint.plannedSpend;
        grossPlannedSpend = commission > 0 ? plannedSpend * 100 / (100 - commission) : plannedSpend;
      } else {
        const paddedKey   = format(selectedMonth, 'yyyy-MM');
        const unpaddedKey = `${selectedMonth.getFullYear()}-${selectedMonth.getMonth() + 1}`;
        grossPlannedSpend = flightsForCalc.reduce((sum, f) => {
          const raw = f.monthlySpend[paddedKey] ?? f.monthlySpend[unpaddedKey] ?? 0;
          return sum + raw;
        }, 0);
        plannedSpend = commission > 0 ? grossPlannedSpend * ((100 - commission) / 100) : grossPlannedSpend;

        const { start: monthStartWc, end: monthEndWc } = getWeekAlignedMonthRange(selectedMonth);
        const monthStartStr = format(monthStartWc, 'yyyy-MM-dd');
        const monthEndStr   = format(monthEndWc,   'yyyy-MM-dd');
        const chSpendPoints = (channelMonthSpendData as any[]).filter(p => {
          if (!p.date || p.date < monthStartStr || p.date > monthEndStr) return false;
          if (p.platform && p.platform === chPlatform) return true;
          if (p.channelName && p.channelName.toLowerCase().includes(keyword)) return true;
          return false;
        });
        currentSpend = chSpendPoints.reduce((s: number, p: any) => s + (p.spend ?? 0), 0);
      }

      const pacingPct = plannedSpend > 0 ? (currentSpend / plannedSpend) * 100 : 0;

      // ── Aggregate performance metrics from spend data ─────────────────────
      const rangeStartStr = analyticsDateRange.startDate;
      const rangeEndStr   = analyticsDateRange.endDate;
      const { start: metricMonthStartWc, end: metricMonthEndWc } = getWeekAlignedMonthRange(selectedMonth);
      const monthStartStr = format(metricMonthStartWc, 'yyyy-MM-dd');
      const monthEndStr   = format(metricMonthEndWc,   'yyyy-MM-dd');

      const chMetricPoints = (channelMonthSpendData as any[]).filter(p => {
        if (!p.date) return false;
        const dateInRange = isMultiMonth
          ? p.date >= rangeStartStr && p.date <= rangeEndStr
          : p.date >= monthStartStr && p.date <= monthEndStr;
        if (!dateInRange) return false;
        if (p.platform && p.platform === chPlatform) return true;
        if (p.channelName && p.channelName.toLowerCase().includes(keyword)) return true;
        return false;
      });

      const totalImpressions = chMetricPoints.reduce((s: number, p: any) => s + (p.impressions ?? 0), 0);
      const totalClicks      = chMetricPoints.reduce((s: number, p: any) => s + (p.clicks ?? 0), 0);
      const totalConversions = chMetricPoints.reduce((s: number, p: any) => s + (p.conversions ?? 0), 0);
      // Reach/frequency are Meta-only — chMetricPoints from other platforms simply lack these fields.
      const totalReach       = chMetricPoints.reduce((s: number, p: any) => s + (p.reach ?? 0), 0);
      const aggregatedCtr    = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
      const aggregatedCpc    = totalClicks > 0 ? currentSpend / totalClicks : 0;
      const aggregatedFrequency = totalReach > 0 ? totalImpressions / totalReach : 0;

      // ── Per-day metrics chart data (full range, zero-filled) ─────────────────
      const metricsByDate = new Map<string, { impressions: number; clicks: number; spend: number; conversions: number }>();
      chMetricPoints.forEach((p: any) => {
        const existing = metricsByDate.get(p.date) ?? { impressions: 0, clicks: 0, spend: 0, conversions: 0 };
        metricsByDate.set(p.date, {
          impressions: existing.impressions + (p.impressions ?? 0),
          clicks:      existing.clicks      + (p.clicks      ?? 0),
          spend:       existing.spend       + (p.spend        ?? 0),
          conversions: existing.conversions + (p.conversions  ?? 0),
        });
      });
      // Fill every day in the range so the X axis always spans the full period,
      // even when the ad platform returns no rows for inactive days.
      const chartRangeStart = isMultiMonth ? rangeStartStr : monthStartStr;
      const chartRangeEnd   = isMultiMonth ? rangeEndStr   : monthEndStr;
      const metricsChartData: Array<{ date: string; impressions: number; clicks: number; ctr: number; cpc: number; conversions: number }> = [];
      let cursor = parseISO(chartRangeStart);
      const rangeEndDate = parseISO(chartRangeEnd);
      while (cursor <= rangeEndDate) {
        const dateStr = format(cursor, 'yyyy-MM-dd');
        const vals = metricsByDate.get(dateStr);
        metricsChartData.push({
          date:        dateStr,
          impressions: vals?.impressions ?? 0,
          clicks:      vals?.clicks      ?? 0,
          ctr:         vals && vals.impressions > 0 ? vals.clicks / vals.impressions : 0,
          cpc:         vals && vals.clicks > 0 ? vals.spend / vals.clicks : 0,
          conversions: vals?.conversions ?? 0,
        });
        cursor = addDays(cursor, 1);
      }

      // ── Per-line campaign linkage — falls back to the channel-level Meta
      // fields when no line is given (0/1-line channels, backward compatible).
      const linkedCampaignIds: string[] = (() => {
        if (platform === 'meta-ads') {
          if (line) return line.metaCampaignIds?.length ? line.metaCampaignIds : (line.metaCampaignId ? [line.metaCampaignId] : []);
          const chIds: string[] = (ch as any).metaCampaignIds ?? [];
          return chIds.length ? chIds : ((ch as any).metaCampaignId ? [(ch as any).metaCampaignId] : []);
        }
        if (platform === 'google-ads' && line) {
          return line.googleCampaignIds?.length ? line.googleCampaignIds : (line.googleCampaignId ? [line.googleCampaignId] : []);
        }
        return [];
      })();

      const cardId   = useLineIdentity && line ? `${ch.id}::${line.id}` : String(ch.id ?? ch.channelName);
      const cardName = useLineIdentity && line?.name ? `${ch.channelName} — ${line.name}` : ch.channelName;

      return {
        type: 'paid_digital' as const,
        id:               cardId,
        name:             cardName,
        format:           ch.format || undefined,
        platform,
        status:           determineStatus(currentSpend, plannedSpend),
        currentSpend,
        plannedSpend,
        grossPlannedSpend: commission > 0 ? grossPlannedSpend : undefined,
        pacingPercentage: pacingPct,
        metrics: {
          impressions: totalImpressions,
          clicks:      totalClicks,
          ctr:         aggregatedCtr,
          cpc:         aggregatedCpc,
          conversions: totalConversions,
          reach:       totalReach,
          frequency:   aggregatedFrequency,
        },
        issues: (() => {
          const base = detectIssues(currentSpend, plannedSpend, selectedMonth);
          // Surface any platform-level API errors (e.g. expired token)
          const platformPrefix = platform === 'meta-ads' ? 'Meta Ads' : platform === 'google-ads' ? 'Google Ads' : null;
          if (platformPrefix) {
            const platformErrors = spendApiErrors
              .filter(e => e.startsWith(platformPrefix))
              .map(e => {
                // "Platform (AccountName): message" → "message"
                const parenMatch = e.match(/\): (.+)$/);
                if (parenMatch) return parenMatch[1];
                // "Platform: message" → "message"
                const colonIdx = e.indexOf(': ');
                return colonIdx !== -1 ? e.slice(colonIdx + 2) : e;
              });
            if (platformErrors.length > 0) base.push(...platformErrors);
          }
          return base;
        })(),
        chartData:       chartData.length > 0 ? chartData : undefined,
        metricsChartData: metricsChartData.length > 0 ? metricsChartData : undefined,
        isMultiMonth,
        campaigns: (() => {
          const seen = new Map<string, string>();
          const placeholderIds = new Set<string>();
          // Seed with linked campaigns so they always appear, even before
          // spend data has been synced for the first time.
          linkedCampaignIds.forEach((id: string) => {
            if (id) { seen.set(id, id); placeholderIds.add(id); }
          });
          // Merge in any additional campaigns found in actual spend data.
          chMetricPoints.forEach((p: any) => {
            if (p.campaignId && p.campaignName && (!seen.has(p.campaignId) || placeholderIds.has(p.campaignId))) {
              seen.set(p.campaignId, p.campaignName);
              placeholderIds.delete(p.campaignId);
            }
          });
          // Merge in ALL campaigns from the account (matches what onboarding shows).
          if (chPlatform === 'meta-ads') {
            allMetaCampaigns.forEach(c => {
              if (!seen.has(c.id) || placeholderIds.has(c.id)) { seen.set(c.id, c.name); placeholderIds.delete(c.id); }
            });
          }
          if (chPlatform === 'google-ads') {
            allGoogleAdsCampaigns.forEach(c => {
              if (!seen.has(c.id) || placeholderIds.has(c.id)) { seen.set(c.id, c.name); placeholderIds.delete(c.id); }
            });
          }
          return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
        })(),
        metaCampaignIds: platform === 'meta-ads' ? linkedCampaignIds : ((ch as any).metaCampaignIds ?? []),
        linkedCampaignIds,
        rawSpendPoints: chMetricPoints,
        channelFlights: flightsForCalc,
        // Raw (undecorated) name pieces so the card can compose a short title
        // itself instead of parsing them back out of `name`.
        channelBaseName: ch.channelName,
        lineName: line?.name,
      };
    };

    return (mediaPlanBuilderChannels as any[]).flatMap((ch: any): any => {
      // Detect channel category
      const category = ch.channelCategory || getChannelCategory(ch.channelName);

      // Skip fee channels entirely — no card should be shown
      if (category === 'fee') return [];

      // Return special card data for non-digital channels
      if (category === 'organic_social') {
        return {
          type: 'organic_social' as const,
          channel: ch,
        };
      }
      
      if (category === 'edm') {
        return {
          type: 'edm' as const,
          channel: ch,
        };
      }
      
      if (category === 'ooh') {
        return {
          type: 'ooh' as const,
          channel: ch,
        };
      }

      if (category === 'display_native') {
        return {
          type: 'display_native' as const,
          channel: ch,
        };
      }

      if (category === 'other') {
        return {
          type: 'other' as const,
          channel: ch,
        };
      }

      // Only Meta and Google get the full ChannelPerformanceCard with spend pacing graphs.
      // All other paid digital channels (LinkedIn, TikTok, etc.) use OtherChannelCard.
      const platform = getPlatformForChannel(ch.channelName);
      if (platform !== 'meta-ads' && platform !== 'google-ads') {
        return [{
          type: 'other' as const,
          channel: ch,
        }];
      }

      // Paid digital (Meta / Google): fan out into one card per campaign line
      // when the channel has more than one (e.g. two "Google Ads" rows for two
      // different campaigns). A single line (or none, for channels synced
      // before per-line tracking existed) renders as one channel-level card
      // with backward-compatible id/name so existing localStorage-persisted
      // campaign selections keep working.
      const lines: MediaPlanCampaignLine[] = ch.campaignLines ?? [];
      if (lines.length > 1) {
        return lines.map((line) => buildPaidDigitalCard(ch, platform as 'meta-ads' | 'google-ads', line, true));
      }
      return buildPaidDigitalCard(ch, platform as 'meta-ads' | 'google-ads', lines[0], false);
    }).sort((a, b) => channelSortOrder(a) - channelSortOrder(b));
  }, [mediaPlanBuilderChannels, channelMonthSpendData, spendApiErrors, selectedMonth, commission, planView, analyticsDateRange.startDate, analyticsDateRange.endDate, allMetaCampaigns, allGoogleAdsCampaigns]);

  // Stable per-card key used for DOM ids (scroll-to-channel), the manage
  // menu's "Hide card" action, and the hidden-channel-cards localStorage set.
  // Paid-digital cards key off their own `id` (raw channel id, `::lineId`
  // suffixed when fanned out per campaign line) rather than array index, so
  // the same key can be recomputed from raw channel data when excluding
  // hidden channels' spend from totalActualSpend.
  const getChannelCardKey = useCallback((ch: any, _idx: number): string => {
    if (ch.type === 'organic_social') return `organic-${ch.channel.id}`;
    if (ch.type === 'edm') return `edm-${ch.channel.id}`;
    if (ch.type === 'ooh') return `ooh-${ch.channel.id}`;
    if (ch.type === 'display_native') return `display-native-${ch.channel.id}`;
    if (ch.type === 'other') return `other-${ch.channel.id}`;
    return `paid-${ch.id}`;
  }, []);

  // A card is hidden either because the user explicitly hid it, or because
  // the "Digital Ads Only" quick filter is active and this card isn't a paid
  // digital-advertising channel.
  const isCardDigitalAdvertising = useCallback((ch: any): boolean => {
    if (ch.type === 'paid_digital') return true;
    if (ch.type === 'other') {
      const cat = ch.channel?.channelCategory || getChannelCategory(ch.channel?.channelName ?? '');
      return cat === 'paid_digital';
    }
    return false;
  }, []);

  const isChannelCardHidden = useCallback((ch: any, idx: number): boolean => {
    if (hiddenChannelCards.has(getChannelCardKey(ch, idx))) return true;
    if (channelFilterMode === 'digital' && !isCardDigitalAdvertising(ch)) return true;
    return false;
  }, [hiddenChannelCards, channelFilterMode, getChannelCardKey, isCardDigitalAdvertising]);

  const liveChannels = useMemo(() =>
    channelCards.map((ch: any, idx: number) => {
      const id = `channel-card-${getChannelCardKey(ch, idx)}`;
      if (ch.type === 'organic_social') return { id, name: ch.channel.channelName ?? 'Organic Social', type: ch.type, hasSpend: false };
      if (ch.type === 'edm') return { id, name: ch.channel.channelName ?? 'EDM', type: ch.type, hasSpend: false };
      if (ch.type === 'ooh') return { id, name: ch.channel.channelName ?? 'OOH', type: ch.type, hasSpend: false };
      if (ch.type === 'display_native') return { id, name: ch.channel.channelName ?? 'Display & Native', type: ch.type, hasSpend: false };
      if (ch.type === 'other') return { id, name: ch.channel.channelName ?? 'Other', type: ch.type, hasSpend: (ch.currentSpend ?? 0) > 0 };
      return { id, name: ch.name, type: ch.type, platform: ch.platform, hasSpend: (ch.currentSpend ?? 0) > 0 };
    })
  , [channelCards, getChannelCardKey]);

  const handleChannelClick = useCallback((channelId: string) => {
    if (viewMode !== 'overview') {
      setViewMode('overview');
      setTimeout(() => {
        document.getElementById(channelId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    } else {
      document.getElementById(channelId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [viewMode]);

  // ── Calculate health score whenever the relevant inputs change ────────────
  useEffect(() => {
    if (!mediaPlanBuilderChannels.length || !actionPointsStats) return;

    try {
      const totalBudget = mediaPlanBuilderChannels.reduce((sum, channel) => {
        const channelTotal = channel.flights.reduce((flightSum, flight) => {
          return flightSum + Object.values(flight.monthlySpend).reduce((a, b) => a + b, 0);
        }, 0);
        return sum + channelTotal;
      }, 0);

      const now = nzTodayLocalMidnight();
      const allDates = mediaPlanBuilderChannels.flatMap(ch =>
        ch.flights.flatMap(f => [f.startWeek, f.endWeek])
      ).filter(Boolean) as Date[];

      if (allDates.length === 0) return;

      const campaignStart = new Date(Math.min(...allDates.map(d => d.getTime())));
      const campaignEnd   = new Date(Math.max(...allDates.map(d => d.getTime())));

      const totalDays   = Math.max(1, Math.ceil((campaignEnd.getTime() - campaignStart.getTime()) / (1000 * 60 * 60 * 24)));
      const daysElapsed = Math.max(0, Math.ceil((now.getTime() - campaignStart.getTime()) / (1000 * 60 * 60 * 24)));
      // Plan-to-date expected spend: linear day-elapsed interpolation over the
      // full campaign, independent of the Channel Performance section's
      // selected analytics window (analyticsDateRange / plannedBudget).
      const plannedSpend = Math.min(totalBudget, totalBudget * (daysElapsed / totalDays));

      // Compute benchmark-based performance score
      const paidCards = (channelCards as Array<{ type: string; name?: string; platform?: string; metrics?: { impressions: number; clicks: number; ctr: number; cpc: number; conversions: number } }>)
        .filter(ch => ch.type === 'paid_digital' && ch.name && ch.metrics)
        .map(ch => ({ name: ch.name!, platform: ch.platform ?? '', metrics: ch.metrics! }));

      const perfHealth = calculatePerformanceHealth(paidCards, allBenchmarks, allPresets, clientChannelPresets);
      setPerfHealthResult(perfHealth);

      const channelPerformanceScores = [{ channelId: 'benchmark-aggregate', score: perfHealth.score, budget: 1 }];

      const result = calculateHealthScore(
        totalActualSpend,
        plannedSpend,
        totalBudget,
        daysElapsed,
        totalDays,
        actionPointsStats.completedAll || 0,
        actionPointsStats.totalAll || 0,
        channelPerformanceScores,
      );

      // Override the performance details with benchmark met/total
      result.breakdown.performance.details = perfHealth.total > 0
        ? `${perfHealth.met} of ${perfHealth.total} benchmarks met`
        : 'No benchmark data available';

      setHealthScore(result);
      if (!isLoadingSpend && !actionPointsStats.loading) {
        setHealthScoreReady(true);
      }
      setDashboardError(null);
    } catch (err) {
      console.error('Health score calculation failed:', err);
      setDashboardError('Health score could not be calculated. Other data is still available below.');
    }
  }, [mediaPlanBuilderChannels, totalActualSpend, actionPointsStats, channelCards, allBenchmarks, allPresets, clientChannelPresets, isLoadingSpend]);

  // ── Action points data pipeline ─────────────────────────────────────────
  const handleActionPointsUpdate = useCallback((actionPoints: any[]) => {
    setAllActionPoints(actionPoints);
  }, []);

  // The client dashboard's To Do panel shows only ad-hoc TODO tasks —
  // SET UP/HEALTH CHECK templates live in the per-channel health-check
  // checklist instead (see ChannelHealthBadge / ChannelHealthCheckModal).
  // TODOs already carry their own due_date, so no enrichment is needed.
  // TODOs are always stamped channel_type: 'General' in the DB — not
  // meaningful information, so drop it rather than show a "General" tag.
  const enrichedActionPoints = useMemo(
    () => todoActionPoints.map((ap: any) => ({ ...ap, channel_type: undefined })),
    [todoActionPoints]
  );

  // TODO completion is written directly to action_points.completed (no
  // client_id) — matching KanbanBoard's convention — so the agency To Do
  // feed and this panel never disagree about a TODO's completion state.
  const handleToggleTodo = async (id: string, completed: boolean) => {
    try {
      await fetch('/api/action-points', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, completed }),
      });
      setTodoActionPoints(prev => prev.map(ap => ap.id === id ? { ...ap, completed } : ap));
    } catch (error) {
      console.error('Failed to update TODO:', error);
    }
  };

  const handleActionItemAction = (id: string, actionType: string) => {
    // Future: navigate or open modal based on actionType
    console.log('Action item action:', id, actionType);
  };

  const handleAdjustChannel = useCallback((platform: string) => {
    const platformUrls: Record<string, string> = {
      'meta-ads':    'https://business.facebook.com/adsmanager',
      'google-ads':  'https://ads.google.com',
      'linkedin-ads':'https://www.linkedin.com/campaignmanager',
      'tiktok-ads':  'https://ads.tiktok.com',
    };
    const url = platformUrls[platform];
    if (url) {
      window.open(url, '_blank');
    }
  }, []);

  const handleViewReport = useCallback((_platform: string) => {
    router.push(`/clients/${clientId}/hub#section-costPerMetric`);
  }, [router, clientId]);

  const handleReconnectPlatform = useCallback(() => {
    setViewMode('client-hub');
    setTimeout(() => {
      const section = document.getElementById('platform-connections-section');
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, []);

  // Called by ChannelPerformanceCard whenever the user changes campaign selection
  const handleCampaignSelectionChange = useCallback((channelKey: string, ids: string[]) => {
    setChannelCampaignSelections(prev => ({ ...prev, [channelKey]: ids }));
  }, []);

  // Initialise channelCampaignSelections from localStorage when channelCards first loads
  useEffect(() => {
    if (!clientId || !channelCards.length) return;
    const initial: Record<string, string[]> = {};
    channelCards.forEach((card: any) => {
      if (card.type !== 'paid_digital') return;
      const key = card.id ?? card.name;
      try {
        const saved = localStorage.getItem(`channel-campaigns-${clientId}-${key}`);
        if (saved) {
          initial[key] = JSON.parse(saved);
        } else {
          const ch = mediaPlanBuilderChannels.find(c => String(c.id ?? c.channelName) === key);
          const ids: string[] = (ch as any)?.metaCampaignIds?.length
            ? (ch as any).metaCampaignIds
            : (ch as any)?.metaCampaignId ? [(ch as any).metaCampaignId] : [];
          initial[key] = ids.length > 0 ? ids : [];
        }
      } catch { initial[key] = []; }
    });
    setChannelCampaignSelections(initial);
  // Run once when channelCards are first populated
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, channelCards.length > 0]);

  const handleChannelsChange = (channels: MediaPlanChannel[]) => {
    setMediaPlanBuilderChannels(channels);
  };

  const handleUpdateChannel = (channelId: string, updates: Partial<MediaPlanChannel>) => {
    setMediaPlanBuilderChannels(prev =>
      prev.map(ch => ch.id === channelId ? { ...ch, ...updates } : ch)
    );
  };

  const handleAIActionComplete = useCallback((tool: string) => {
    if (tool === 'complete_action_point') {
      setActionPointsRefetchTrigger(prev => prev + 1);
    } else if (['update_media_plan_budget', 'update_media_plan_flight', 'update_manual_spend', 'toggle_ooh_checklist'].includes(tool)) {
      loadMediaPlanBuilderData();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Same as handleAIActionComplete, but for the Media Plan Editor chat panel: that
  // panel sits next to a *mounted* PlanGrid, which — unlike the Overview tab — won't
  // pick up a fresh clientSandboxPlan on its own, so this also bumps the remount key.
  const handleMediaPlanAgentAction = useCallback(async (tool: string) => {
    if (!['update_media_plan_budget', 'update_media_plan_flight', 'set_media_plan_channels'].includes(tool)) return;
    await loadMediaPlanBuilderData();
    setExternalPlanRevision(v => v + 1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteChannel = (channelId: string) => {
    const filtered = mediaPlanBuilderChannels.filter(ch => ch.id !== channelId);
    setMediaPlanBuilderChannels(filtered);
    // Save immediately — don't rely on the debounced auto-save, which the user
    // can race by refreshing the page before the 1-second timeout fires.
    saveMediaPlanBuilderData(filtered, commission);
  };

  const handleCommissionChange = (value: number) => {
    setCommission(value);
  };

  const pageFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };
  const serifFont: React.CSSProperties = { fontFamily: "'DM Serif Display', Georgia, serif" };

  return (
    <div className="min-h-screen" style={{ background: '#F5F3EF', ...pageFont }}>
      {/* ── Top nav bar ── */}
      <header className="sticky top-0 z-10 px-6 py-3" style={{ background: '#FDFCF8', borderBottom: '0.5px solid #E8E4DC' }}>
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Link href="/agency" className="flex items-center gap-1 text-sm font-medium px-2 py-1 rounded" style={{ color: '#8A8578', border: '0.5px solid #E8E4DC', background: 'transparent' }}>
            ← Back
          </Link>
          <span className="text-base font-medium" style={{ color: '#1C1917' }}>{client?.name ?? 'Loading…'}</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Hidden TodoSection — fetches action points data and surfaces it via callback */}
        <div className="hidden">
          <TodoSection
            mediaPlanBuilderChannels={mediaPlanBuilderChannels}
            clientId={clientId}
            embedded={true}
            onStatsUpdate={setActionPointsStats}
            onActionPointsChange={handleActionPointsChange}
            actionPointsRefetchTrigger={actionPointsRefetchTrigger}
            totalActualSpend={totalActualSpend}
            plannedBudget={plannedBudget}
            onActionPointsDataUpdate={handleActionPointsUpdate}
          />
        </div>

        {/* ── Error banner ── */}
        {dashboardError && (
          <div className="rounded-lg px-4 py-3 text-base flex items-start gap-2" style={{ background: '#F5EDE0', border: '0.5px solid rgba(176,112,48,0.25)', color: '#B07030', borderRadius: 12 }}>
            <span className="mt-0.5">⚠</span>
            {dashboardError}
          </div>
        )}

        {(loading || isLoadingMediaPlanBuilder) ? (
          /* ── Loading skeletons ── */
          <div className="space-y-6">
            {/* Hero skeleton */}
            <div className="rounded-lg p-6 animate-pulse" style={{ background: '#FDFCF8', border: '0.5px solid #E8E4DC', borderRadius: 6 }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-gray-200" />
                  <div className="space-y-2">
                    <div className="h-6 w-40 bg-gray-200 rounded" />
                    <div className="h-3 w-24 bg-gray-100 rounded" />
                  </div>
                </div>
                <div className="w-24 h-24 rounded-full bg-gray-200" />
              </div>
              <div className="grid grid-cols-4 gap-3 mt-6">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-20 bg-gray-100 rounded-xl" />
                ))}
              </div>
            </div>
            {/* Channel cards skeleton */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 animate-pulse">
              <div className="h-4 w-40 bg-gray-200 rounded" />
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-24 bg-gray-100 rounded-xl" />
              ))}
            </div>
            {/* Chart skeleton */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
              <div className="h-4 w-32 bg-gray-200 rounded mb-4" />
              <div className="h-64 bg-gray-100 rounded-xl" />
            </div>
          </div>
        ) : (
          <>
            {/* ── Hero: health score + quick metrics ── */}
            <div data-tour-id="client-hero">
            {(
              loadingAnalytics ? (
                <div className="bg-white rounded-xl border border-gray-200 px-7 py-6 animate-pulse">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-full bg-gray-200 flex-shrink-0" />
                    <div className="flex-1 space-y-3">
                      <div className="h-7 w-48 bg-gray-200 rounded" />
                      <div className="h-3 w-32 bg-gray-100 rounded" />
                      <div className="flex items-center gap-6 mt-3">
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-16 bg-gray-100 rounded" />
                          <div className="h-7 w-28 bg-gray-200 rounded" />
                          <div className="h-2 w-full bg-gray-100 rounded-full" />
                        </div>
                        <div className="w-28 h-28 rounded-full bg-gray-100 flex-shrink-0" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : heroProps ? (
                <HeroHealthSection {...heroProps} liveChannels={liveChannels} onChannelClick={handleChannelClick} onConnect={() => setViewMode('client-hub')} onLogoUpload={handleLogoUpload} isUploadingLogo={isUploadingLogo} />
              ) : (
                /* Edge case: no media plan channels set up yet */
                <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                  <p className="text-gray-500 text-base">
                    No media plan data found. Add channels in the Media Plan Builder to see your health score.
                  </p>
                </div>
              )
            )}
            </div>

            {/* ── Global View Mode & Date Controls (same card as the content below) ── */}
            <div className="mb-6">
              {/* Tab row — sits above the card (not inside it), so the tab tops rise above the card's top edge like folder tabs */}
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                {VIEW_MODE_ORDER.map((tab, idx) => {
                  const isActive = viewMode === tab;
                  const label = tab === 'overview' ? 'Overview' : tab === 'media-plan' ? 'Media Plan' : 'Client Hub';
                  return (
                    <button
                      key={tab}
                      data-tour-id={tab === 'overview' ? 'client-overview-tab' : tab === 'media-plan' ? 'client-media-plan-tab' : 'client-hub-tab'}
                      onClick={() => setViewMode(tab)}
                      style={{
                        position: 'relative',
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: isActive ? '18px 32px 20px' : '13px 26px 15px',
                        fontSize: isActive ? 20 : 16,
                        fontWeight: isActive ? 700 : 600,
                        color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.65)',
                        background: VIEW_MODE_COLORS[tab],
                        border: 'none',
                        borderRadius: isActive ? '16px 16px 0 0' : '13px 13px 0 0',
                        // Each tab's right edge overlaps the next tab's left edge — consistent
                        // left-to-right shingle, independent of which tab is active.
                        marginLeft: idx > 0 ? -14 : 0,
                        cursor: 'pointer',
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                        transition: 'all 0.15s',
                        letterSpacing: isActive ? '-0.01em' : 0,
                        // Active tab jumps above both neighbors so its overlapped edges read as "in front".
                        zIndex: isActive ? VIEW_MODE_ORDER.length + 1 : VIEW_MODE_ORDER.length - idx,
                        boxShadow: isActive ? '0 -4px 12px rgba(0,0,0,.15)' : 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {tab === 'client-hub' && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3.12A2.5 2.5 0 0 1 9.5 2Z"/>
                          <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3.12A2.5 2.5 0 0 0 14.5 2Z"/>
                        </svg>
                      )}
                      {label}
                      {tab === 'client-hub' && adminNeedsConfig && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-white text-[9px] font-bold leading-none">!</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {/* Right-aligned shortcuts — same row as the view-mode tabs */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Link
                  href={`/clients/${clientId}/hub`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-tour-id="client-portal-share"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '12px 20px', borderRadius: 14, border: '0.5px solid #1E3A8A',
                    background: '#1E3A8A', color: '#FFFFFF',
                    fontSize: 18, fontWeight: 700, cursor: 'pointer',
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    textDecoration: 'none',
                    boxShadow: '0 4px 12px rgba(30, 58, 138, 0.35)',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  Client Performance Portal
                </Link>
                <button
                  onClick={() => setShowFullscreenGantt(true)}
                  data-tour-id="client-timeline"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 12, border: '0.5px solid #D5D0C5',
                    background: '#FDFCF8', color: '#4A6580',
                    fontSize: 16, fontWeight: 500, cursor: 'pointer',
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                    <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                  </svg>
                  Timeline
                </button>
              </div>
              </div>
              {/* Card — begins right at the tabs' bottom edge; the strip's own top corners are rounded to match so nothing needs clipping */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                {/* Connecting strip — ties the tabs to the panel below in the active tab's color */}
                <div style={{ height: 8, background: VIEW_MODE_COLORS[viewMode], borderRadius: '7px 7px 0 0' }} />
                <div className="p-4">

            {/* ── Overview: Notes + Action Points + Channels ── */}
            {viewMode === 'overview' && (
              <>
                {/* Top row: [Notes + To Do combined card] | Gantt */}
                <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
                  {/* Combined Notes + To Do card */}
                  <div style={{
                    flex: 1,
                    minWidth: 0,
                    height: notesPanelHeight,
                    minHeight: 240,
                    overflow: 'hidden',
                    display: 'flex',
                    borderRadius: 12,
                    transition: 'width 0.2s ease',
                    position: 'relative',
                    ...(notesCollapsed ? { width: 48, flexShrink: 0, flex: 'none' } : {}),
                  }}>
                    {notesCollapsed ? (
                      /* Collapsed pill */
                      <div
                        onClick={() => setNotesCollapsed(false)}
                        style={{
                          height: '100%', width: '100%',
                          background: '#1C1917',
                          borderRadius: 12,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                        }}
                        title="Expand"
                      >
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                          {notesActiveTab === 'notes' ? 'Notes' : 'To Do'}
                        </span>
                        <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }}>›</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', width: '100%', height: '100%', position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
                        {/* Spine wrapper — fixed 88px, both spines animate inside with peek strip between them.
                            zIndex raised above the content area so the active spine can extend past its own
                            88px column and sit flush against the (now offset) active content panel. */}
                        <div style={{ width: 44, flexShrink: 0, position: 'relative', height: '100%', zIndex: 3 }}>
                          {/* Notes spine */}
                          <div
                            onClick={() => { setNotesActiveTab('notes'); setShowFilesMenu(false); setShowTodoMenu(false); }}
                            style={{
                              position: 'absolute',
                              top: notesActiveTab === 'notes' ? 0 : 18,
                              bottom: notesActiveTab === 'notes' ? 16 : 0,
                              left: notesActiveTab === 'notes' ? 52 : 8,
                              transition: 'left 0.28s cubic-bezier(0.4, 0, 0.2, 1), top 0.28s cubic-bezier(0.4, 0, 0.2, 1), bottom 0.28s cubic-bezier(0.4, 0, 0.2, 1), background 0.15s, opacity 0.28s',
                              filter: notesActiveTab === 'notes' ? 'none' : 'brightness(0.55)',
                              width: 36,
                              background: notesActiveTab === 'notes' ? '#1C1917' : '#2A2622',
                              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px)',
                              backgroundSize: '5px 5px',
                              display: 'flex', flexDirection: 'column', alignItems: 'center',
                              paddingTop: 10, gap: 8,
                              zIndex: notesActiveTab === 'notes' ? 2 : 0,
                              cursor: notesActiveTab === 'notes' ? 'default' : 'pointer',
                              borderRadius: notesActiveTab === 'notes' ? '12px 0 0 12px' : '8px 0 0 8px',
                            }}
                          >
                            <button
                              onClick={e => { e.stopPropagation(); setNotesActiveTab('notes'); setShowFilesMenu(v => !v); setShowTodoMenu(false); }}
                              title="Files"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center', flexShrink: 0 }}
                            >
                              {[0,1,2].map(i => (
                                <span key={i} style={{ width: 14, height: 1.5, background: showFilesMenu && notesActiveTab === 'notes' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)', display: 'block', borderRadius: 1, transition: 'background 0.15s' }} />
                              ))}
                            </button>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.13em', writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap', marginTop: 2 }}>Notes</span>
                            {notesActiveTab === 'notes' && (
                              <button onClick={e => { e.stopPropagation(); setNotesCollapsed(true); }} title="Collapse" style={{ marginTop: 'auto', marginBottom: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 18, lineHeight: 1, padding: 2 }}>‹</button>
                            )}
                          </div>

                          {/* To Do spine */}
                          <div
                            onClick={() => { setNotesActiveTab('todo'); setShowFilesMenu(false); setShowTodoMenu(false); }}
                            style={{
                              position: 'absolute',
                              top: notesActiveTab === 'todo' ? 0 : 18,
                              bottom: notesActiveTab === 'todo' ? 16 : 0,
                              left: notesActiveTab === 'todo' ? 52 : 8,
                              transition: 'left 0.28s cubic-bezier(0.4, 0, 0.2, 1), top 0.28s cubic-bezier(0.4, 0, 0.2, 1), bottom 0.28s cubic-bezier(0.4, 0, 0.2, 1), background 0.15s, opacity 0.28s',
                              filter: notesActiveTab === 'todo' ? 'none' : 'brightness(0.55)',
                              width: 36,
                              background: notesActiveTab === 'todo' ? '#4A2220' : '#361918',
                              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
                              backgroundSize: '5px 5px',
                              display: 'flex', flexDirection: 'column', alignItems: 'center',
                              paddingTop: 10, gap: 8,
                              zIndex: notesActiveTab === 'todo' ? 2 : 0,
                              cursor: notesActiveTab === 'todo' ? 'default' : 'pointer',
                              borderRadius: notesActiveTab === 'todo' ? '12px 0 0 12px' : '8px 0 0 8px',
                            }}
                          >
                            <button
                              onClick={e => { e.stopPropagation(); setNotesActiveTab('todo'); setShowTodoMenu(v => !v); setShowFilesMenu(false); }}
                              title="Options"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center', flexShrink: 0 }}
                            >
                              {[0,1,2].map(i => (
                                <span key={i} style={{ width: 14, height: 1.5, background: showTodoMenu && notesActiveTab === 'todo' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)', display: 'block', borderRadius: 1, transition: 'background 0.15s' }} />
                              ))}
                            </button>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.13em', writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap', marginTop: 2 }}>To Do</span>
                            {notesActiveTab === 'todo' && (
                              <button onClick={e => { e.stopPropagation(); setNotesCollapsed(true); }} title="Collapse" style={{ marginTop: 'auto', marginBottom: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 18, lineHeight: 1, padding: 2 }}>‹</button>
                            )}
                          </div>
                        </div>{/* end spine wrapper */}

                        {/* Files slide-out panel — only when Notes tab active */}
                        {notesActiveTab === 'notes' && showFilesMenu && (
                          <div style={{
                            position: 'absolute', top: 0, left: 48, width: 160, height: '100%',
                            background: '#2C2925', zIndex: 10,
                            display: 'flex', flexDirection: 'column',
                            boxShadow: '2px 0 8px rgba(0,0,0,0.25)',
                          }}>
                            <div style={{ padding: '10px 12px 8px', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Files</div>
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
                                    <span style={{ fontSize: 14, color: activeFileId === file.id ? '#FFFFFF' : 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {file.name}
                                    </span>
                                  </div>
                                  {noteFiles.length > 1 && (
                                    <button
                                      onClick={e => { e.stopPropagation(); deleteNoteFile(file.id); }}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', fontSize: 16, padding: 0, lineHeight: 1, flexShrink: 0 }}
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
                                  flex: 1, fontSize: 13,
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
                                  borderRadius: 3, color: '#fff', fontSize: 17,
                                  width: 22, cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                              >+</button>
                            </div>
                          </div>
                        )}

                        {/* To Do slide-out menu */}
                        {notesActiveTab === 'todo' && showTodoMenu && (
                          <div style={{
                            position: 'absolute', top: 0, left: 48, width: 160, height: '100%',
                            background: '#2C1715', zIndex: 10,
                            display: 'flex', flexDirection: 'column',
                            boxShadow: '2px 0 8px rgba(0,0,0,0.25)',
                          }}>
                            <div style={{ padding: '10px 12px 8px', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Options</div>
                            </div>
                            <div style={{ flex: 1, padding: '8px 0' }}>
                              {(['Priority', 'Channel'] as const).map(label => (
                                <div key={label} style={{ padding: '7px 12px', fontSize: 14, color: 'rgba(255,255,255,0.6)', cursor: 'default' }}>
                                  {label}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Content area — two equal-sized panels offset diagonally: selected sits up-and-right,
                            deselected sits down-and-left, mirroring the spine's own offset. */}
                        <div style={{ flex: 1, position: 'relative', minWidth: 0, height: '100%' }}>
                          {/* Back (deselected) panel — inset from top + right, muted, non-interactive peek */}
                          <div style={{ position: 'absolute', top: 18, right: 32, bottom: 0, left: 0, overflow: 'hidden', borderRadius: '0 12px 12px 0', filter: 'brightness(0.88) saturate(0.9)', pointerEvents: 'none', zIndex: 0 }}>
                            {notesActiveTab === 'notes' ? (
                              <ClientActionPointsList
                                actionPoints={enrichedActionPoints}
                                onToggle={handleToggleTodo}
                              />
                            ) : (
                              <NotesChecklist activeClientId={`${clientId}:${activeFileId}`} />
                            )}
                          </div>

                          {/* Front (selected) panel — inset from bottom + left, flush to top + right.
                              32px reveals the deselected panel's own red margin rule in the peek, so it
                              reads as a second card rather than blank padding. */}
                          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 16, left: 32, overflow: 'hidden', borderRadius: 12, boxShadow: '0 10px 22px -8px rgba(0,0,0,0.28)', zIndex: 1 }}>
                            {notesActiveTab === 'notes' ? (
                              <NotesChecklist activeClientId={`${clientId}:${activeFileId}`} />
                            ) : (
                              <ClientActionPointsList
                                actionPoints={enrichedActionPoints}
                                onToggle={handleToggleTodo}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>{/* end combined card */}

                  {/* Right: Ask AI card — height locked to the Notes/To Do card's height */}
                  <div style={{ flex: '0 0 60%', minWidth: 0, height: notesPanelHeight, display: 'flex', flexDirection: 'column' }}>
                    <ClientChatPanel
                      height={notesPanelHeight}
                      clientId={clientId ?? ''}
                      clientName={client?.name ?? ''}
                      onActionComplete={handleAIActionComplete}
                    />
                  </div>
                </div>{/* end top row */}

                {adminNeedsConfig && (
                  <div className="flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                    <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-orange-500 text-white text-[9px] font-bold leading-none">!</span>
                    <div>
                      <span className="font-medium">A connected ad platform is missing an account selection.</span>{' '}
                      Channel Performance data may be incomplete until this is finished. Go to{' '}
                      <button
                        type="button"
                        onClick={() => setViewMode('client-hub')}
                        className="font-medium underline underline-offset-2 hover:text-orange-900"
                      >
                        Client Hub → Platform Connections
                      </button>{' '}
                      to select the account.
                    </div>
                  </div>
                )}

                {/* Timeframe — applies to Channel Performance below */}
                <div className="flex items-center justify-end gap-2 mt-6">
                  <button
                    type="button"
                    onClick={handleRefreshData}
                    disabled={isRefreshingData || loadingAnalytics}
                    className="text-sm text-gray-500 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed underline underline-offset-2"
                    title="Refresh GA4 + ad spend data now (normally refreshes automatically every 6 hours)"
                  >
                    {isRefreshingData ? 'Refreshing…' : 'Refresh Data'}
                  </button>
                  <span className="text-sm text-gray-500">Timeframe:</span>
                  <DateRangePicker
                    value={analyticsDateRange}
                    onChange={setAnalyticsDateRange}
                    disabled={loadingAnalytics}
                  />
                </div>

                {loadingAnalytics ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
                    <div className="h-4 w-40 bg-gray-200 rounded mb-4" />
                    <div className="space-y-4">
                      {[...Array(2)].map((_, i) => (
                        <div key={i} className="rounded-xl border border-gray-100 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-lg bg-gray-200" />
                              <div className="space-y-1.5">
                                <div className="h-4 w-28 bg-gray-200 rounded" />
                                <div className="h-3 w-16 bg-gray-100 rounded" />
                              </div>
                            </div>
                            <div className="h-6 w-16 bg-gray-100 rounded" />
                          </div>
                          <div className="h-2 w-full bg-gray-100 rounded-full" />
                          <div className="grid grid-cols-4 gap-2">
                            {[...Array(4)].map((_, j) => (
                              <div key={j} className="h-12 bg-gray-100 rounded-lg" />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : channelCards.length > 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold" style={{ color: '#1C1917', fontFamily: "'Inter', system-ui, sans-serif" }}>Channel Performance</h3>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center rounded-full border border-gray-200 overflow-hidden text-sm">
                          <button
                            onClick={() => handleChannelFilterModeChange('all')}
                            className={`px-3 py-1 transition-colors ${channelFilterMode === 'all' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:text-gray-700'}`}
                          >
                            All Channels
                          </button>
                          <button
                            onClick={() => handleChannelFilterModeChange('digital')}
                            className={`px-3 py-1 transition-colors ${channelFilterMode === 'digital' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:text-gray-700'}`}
                          >
                            Digital Ads Only
                          </button>
                        </div>
                        {commission > 0 && (
                          <div className="flex items-center rounded-full border border-gray-200 overflow-hidden text-sm">
                            <button
                              onClick={() => setPlanView('gross')}
                              className={`px-3 py-1 transition-colors ${planView === 'gross' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:text-gray-700'}`}
                            >
                              Gross
                            </button>
                            <button
                              onClick={() => setPlanView('net')}
                              className={`px-3 py-1 transition-colors ${planView === 'net' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:text-gray-700'}`}
                            >
                              Net
                            </button>
                          </div>
                        )}
                        <label className="text-sm text-gray-500 font-medium whitespace-nowrap">Commission</label>
                        <div className="relative flex items-center">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={commission || ''}
                            onChange={e => handleCommissionChange(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                            placeholder="0"
                            className="w-16 text-right text-sm border border-gray-200 rounded-md px-2 py-1 pr-5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                          />
                          <span className="absolute right-2 text-sm text-gray-400 pointer-events-none">%</span>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      {channelCards.map((ch, idx) => {
                        // Helper: find the raw MediaPlanChannel for the manage menu
                        const rawChannel = ch.type === 'paid_digital'
                          ? mediaPlanBuilderChannels.find((mbCh: any) => String(mbCh.id ?? mbCh.channelName) === ch.id)
                          : (ch as any).channel as MediaPlanChannel | undefined;

                        const cardKey = getChannelCardKey(ch, idx);

                        const manageMenu = rawChannel ? (
                          <ChannelManageMenu
                            channel={rawChannel}
                            onUpdate={handleUpdateChannel}
                            onDelete={handleDeleteChannel}
                            onHide={() => toggleChannelCardHidden(cardKey)}
                          />
                        ) : null;

                        // Hidden cards (manually hidden, or filtered out by the
                        // "Digital Ads Only" quick filter) are collapsed to a
                        // small strip and moved below the visible cards.
                        if (isChannelCardHidden(ch, idx)) {
                          return null;
                        }

                        if (ch.type === 'organic_social') {
                          return (
                            <div key={cardKey} id={`channel-card-${cardKey}`}>
                              <OrganicSocialCard
                                channel={ch.channel}
                                clientId={clientId}
                                weekCommencing={currentWeekCommencing}
                                actuals={organicSocialActuals}
                                onRefresh={loadNonDigitalActuals}
                                onUpdateChannel={handleUpdateChannel}
                                headerActions={manageMenu}
                              />
                            </div>
                          );
                        }

                        if (ch.type === 'edm') {
                          return (
                            <div key={cardKey} id={`channel-card-${cardKey}`}>
                              <EdmCard
                                channel={ch.channel}
                                clientId={clientId}
                                actuals={edmActuals}
                                onUpdateChannel={handleUpdateChannel}
                                headerActions={manageMenu}
                              />
                            </div>
                          );
                        }

                        if (ch.type === 'ooh') {
                          return (
                            <div key={cardKey} id={`channel-card-${cardKey}`}>
                              <OohCard
                                channel={ch.channel}
                                clientId={clientId}
                                onUpdateChannel={handleUpdateChannel}
                                headerActions={manageMenu}
                              />
                            </div>
                          );
                        }

                        if (ch.type === 'display_native') {
                          return (
                            <div key={cardKey} id={`channel-card-${cardKey}`}>
                              <DisplayNativeCard
                                channel={ch.channel}
                                clientId={clientId}
                                onUpdateChannel={handleUpdateChannel}
                                headerActions={manageMenu}
                              />
                            </div>
                          );
                        }

                        if (ch.type === 'other') {
                          const channelData = mediaPlanBuilderChannels.find(
                            (mbCh: any) => mbCh.channelName?.toLowerCase().trim() === ch.channel.channelName?.toLowerCase().trim()
                          );
                          const earliestStart = channelData?.flights?.length > 0
                            ? new Date(Math.min(...channelData.flights.map((f: any) => new Date(f.startWeek).getTime())))
                            : null;
                          return (
                            <div key={cardKey} id={`channel-card-${cardKey}`}>
                              <OtherChannelCard
                                channel={ch.channel}
                                clientId={clientId}
                                channelStartDate={earliestStart}
                                refetchTrigger={actionPointsRefetchTrigger}
                                onUpdateChannel={handleUpdateChannel}
                                headerActions={manageMenu}
                              />
                            </div>
                          );
                        }

                        // Paid digital - existing card
                        // Cards fanned out per campaign line carry their own `channelFlights`
                        // (step 3); fall back to the whole-channel lookup for single-card channels.
                        const normalizeChannelName = (name: string) => name.toLowerCase().trim();
                        const channelData = mediaPlanBuilderChannels.find(
                          (mbCh: any) => normalizeChannelName(mbCh.channelName) === normalizeChannelName(ch.name)
                        );
                        const cardFlights = ch.channelFlights ?? channelData?.flights ?? [];
                        const earliestStartDate = cardFlights.length > 0
                          ? new Date(Math.min(...cardFlights.map((f: any) => new Date(f.startWeek).getTime())))
                          : null;

                        return (
                          <div key={cardKey} id={`channel-card-${cardKey}`}>
                            <ChannelPerformanceCard
                              channel={ch}
                              selectedMonth={selectedMonth}
                              dateRange={ch.isMultiMonth ? analyticsDateRange : undefined}
                              onAdjust={() => handleAdjustChannel(ch.platform)}
                              onViewReport={() => handleViewReport(ch.platform)}
                              onReconnect={handleReconnectPlatform}
                              clientId={clientId}
                              planView={planView}
                              channelStartDate={earliestStartDate}
                              channelFlights={cardFlights}
                              refetchTrigger={actionPointsRefetchTrigger}
                              benchmarks={allBenchmarks}
                              presets={allPresets}
                              clientChannelPresets={clientChannelPresets}
                              onPresetSaved={(updated) => setClientChannelPresets(prev => {
                                const idx2 = prev.findIndex(p => p.client_id === updated.client_id && p.channel_name === updated.channel_name);
                                return idx2 >= 0
                                  ? prev.map((p, i) => i === idx2 ? updated : p)
                                  : [...prev, updated];
                              })}
                              onCampaignSelectionChange={handleCampaignSelectionChange}
                              headerActions={manageMenu}
                            />
                          </div>
                        );
                      })}

                      {/* ── Hidden channels summary: collapsed strips, always at the bottom ── */}
                      {(() => {
                        const hiddenCards = channelCards.filter((ch, idx) => isChannelCardHidden(ch, idx));
                        if (hiddenCards.length === 0) return null;
                        return (
                          <div className="pt-2">
                            <button
                              onClick={() => setHiddenChannelsSectionExpanded(v => !v)}
                              className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 hover:text-gray-600 transition-colors"
                            >
                              <ChevronDown size={13} className={`transition-transform ${hiddenChannelsSectionExpanded ? '' : '-rotate-90'}`} />
                              {hiddenCards.length} channel{hiddenCards.length === 1 ? '' : 's'} hidden
                            </button>
                            {hiddenChannelsSectionExpanded && (
                              <div className="space-y-2 mt-2">
                                {channelCards.map((ch, idx) => {
                                  const cardKey = getChannelCardKey(ch, idx);
                                  // Only manually-hidden cards get an individual restore button —
                                  // cards hidden by the quick filter come back as soon as it's cleared.
                                  if (!hiddenChannelCards.has(cardKey)) return null;
                                  const cardLabel = ch.type === 'paid_digital' ? ch.name : (ch as any).channel.channelName;
                                  return (
                                    <div
                                      key={cardKey}
                                      className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5"
                                    >
                                      <span className="text-sm font-medium text-gray-400">{cardLabel}</span>
                                      <button
                                        onClick={() => toggleChannelCardHidden(cardKey)}
                                        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
                                      >
                                        <Eye size={13} />
                                        Show card
                                      </button>
                                    </div>
                                  );
                                })}
                                {channelFilterMode === 'digital' && (
                                  <p className="text-xs text-gray-400 px-1">
                                    Non-digital channels are hidden by the &quot;Digital Ads Only&quot; filter — switch to &quot;All Channels&quot; to show them.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  !isLoadingMediaPlanBuilder && (
                    <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
                      <p className="text-gray-400 text-base">No channel data yet — connect an ad platform to see performance.</p>
                    </div>
                  )
                )}
              </>
            )}

            {/* ── Media Plan view ── */}
            {viewMode === 'media-plan' && sandboxPlanHydrated && (
              // Container height drives the grid — outerStyle overrides h-screen so the
              // inner scroll area reaches exactly the container bottom (totals visible).
              // The Media Plan Editor chat panel is always mounted here (even when
              // collapsed, via `display: none`) so its conversation survives toggling —
              // only its layout width/visibility changes with mediaPlanChatOpen.
              <div style={{ height: 'calc(100vh - 180px)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sandboxPlanSaveError && (
                  <div style={{
                    flexShrink: 0, padding: '8px 14px', borderRadius: 10,
                    background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C',
                    fontSize: 13, fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}>
                    {sandboxPlanSaveError}
                  </div>
                )}
                <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 0 }}>
                  <div style={{
                    flex: '0 0 32%', minWidth: 280, maxWidth: 420, marginRight: 12,
                    display: mediaPlanChatOpen ? 'flex' : 'none', flexDirection: 'column',
                  }}>
                    <MediaPlanChatPanel
                      clientId={clientId}
                      clientName={client?.name || ''}
                      currentPlan={clientSandboxPlan}
                      onPlanApplied={handleAgentPlanApplied}
                      onWriteAction={handleMediaPlanAgentAction}
                      starterMessage={mediaPlanChatPrefill}
                      onStarterConsumed={() => setMediaPlanChatPrefill(null)}
                      autoAttachImage={pendingAgentScreenshot}
                      onAutoAttachConsumed={() => setPendingAgentScreenshot(null)}
                      onExcelFileSelected={handleExcelFileSelectedFromChat}
                      height="100%"
                    />
                  </div>

                  {/* Arrow toggle — sits on the chat panel's right edge; same button
                      expands/collapses depending on mediaPlanChatOpen. Collapsed state
                      carries a text label so it's an obvious call-to-action, not just
                      a bare icon. */}
                  <div style={{ flexShrink: 0, marginRight: 12, display: 'flex', alignItems: 'center' }}>
                    <button
                      onClick={() => setMediaPlanChatOpen(v => !v)}
                      title={mediaPlanChatOpen ? 'Collapse AI Planner Agent' : 'Open AI Planner Agent'}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        width: mediaPlanChatOpen ? 20 : 'auto',
                        height: 48, padding: mediaPlanChatOpen ? 0 : '0 14px',
                        borderRadius: 8, whiteSpace: 'nowrap',
                        border: '0.5px solid #D5D0C5', background: '#FDFCF8',
                        color: '#1C1917', cursor: 'pointer',
                        fontSize: 13, fontWeight: 500, fontFamily: "'DM Sans', system-ui, sans-serif",
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                      }}
                    >
                      {mediaPlanChatOpen ? (
                        <ChevronLeft className="w-4 h-4" />
                      ) : (
                        <>
                          <ChevronRight className="w-4 h-4" />
                          Open AI Planner Agent
                        </>
                      )}
                    </button>
                  </div>

                  <div style={{ flex: '1 1 auto', minWidth: 0, borderRadius: 12, border: '1px solid rgba(232,228,220,0.7)', boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)', overflow: clientSandboxPlan ? 'hidden' : 'auto' }}>
                    {clientSandboxPlanForGrid ? (
                      <PlanGrid
                        key={externalPlanRevision}
                        plan={clientSandboxPlanForGrid}
                        onPlanChange={handleClientPlanChange}
                        onUpload={handleClientPlanUpload}
                        outerStyle={{ height: '100%' }}
                        showUploadNew={false}
                      />
                    ) : (
                      <UploadWizard onPlanLoaded={handleClientPlanLoaded} onScreenshotSelected={handleScreenshotSelectedFromWizard} />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Excel file attached via the chat panel — the wizard is normally only
                mounted when there's no plan yet, so once a plan exists we surface it
                as a modal instead, pre-loaded with the file. */}
            {pendingExcelFile && (
              <div
                style={{
                  position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(28,25,23,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
                }}
                onClick={() => setPendingExcelFile(null)}
              >
                <div
                  style={{
                    position: 'relative', width: '100%', maxWidth: 900, maxHeight: '90vh', overflowY: 'auto',
                    borderRadius: 16, background: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    onClick={() => setPendingExcelFile(null)}
                    title="Close"
                    style={{
                      position: 'absolute', top: 14, right: 14, zIndex: 1, width: 30, height: 30,
                      borderRadius: '50%', border: '1px solid #E5E1D8', background: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5C5450',
                    }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <UploadWizard
                    initialFile={pendingExcelFile}
                    onPlanLoaded={(plan) => { handleClientPlanLoaded(plan); setPendingExcelFile(null); }}
                  />
                </div>
              </div>
            )}

            {/* ── Client Hub view (Admin + Client Intel) ── */}
            {viewMode === 'client-hub' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Invoices section */}
                <div style={{ background: '#FDFCF8', border: '1px solid rgba(232,228,220,0.7)', borderRadius: 18, boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)', padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <span style={{ fontSize: 16, fontWeight: 500, color: '#1C1917', fontFamily: "'DM Sans', system-ui, sans-serif" }}>Invoices</span>
                    <button
                      onClick={() => setIsInvoiceModalOpen(true)}
                      style={{
                        height: 30, padding: '0 12px', borderRadius: 12,
                        border: '0.5px solid #D5D0C5', background: '#FDFCF8',
                        color: '#1C1917', fontSize: 15, fontWeight: 500,
                        cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif",
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      + New Invoice
                    </button>
                  </div>
                  {invoiceHistory.length === 0 ? (
                    <p style={{ fontSize: 16, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>No invoices generated yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {invoiceHistory.map((inv) => {
                        const start = inv.dateRange.startDate;
                        const end = inv.dateRange.endDate;
                        const label = `${start} → ${end}`;
                        const generated = formatNZ(new Date(inv.generatedAt), { day: 'numeric', month: 'short', year: 'numeric' }, 'en-US');
                        return (
                          <div key={inv.id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '9px 12px', borderRadius: 10, border: '0.5px solid #E8E4DC',
                            background: '#FAFAF8', fontFamily: "'DM Sans', system-ui, sans-serif",
                          }}>
                            <span style={{ fontSize: 16, color: '#1C1917', fontWeight: 500 }}>{label}</span>
                            <span style={{ fontSize: 14, color: '#B5B0A5' }}>Generated {generated}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Reports section */}
                <div style={{ background: '#FDFCF8', border: '1px solid rgba(232,228,220,0.7)', borderRadius: 18, boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)', padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 500, color: '#1C1917', fontFamily: "'DM Sans', system-ui, sans-serif" }}>Performance Reports</span>
                    <button
                      onClick={() => setIsReportModalOpen(true)}
                      style={{
                        height: 30, padding: '0 12px', borderRadius: 12,
                        border: '0.5px solid #D5D0C5', background: '#FDFCF8',
                        color: '#1C1917', fontSize: 15, fontWeight: 500,
                        cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif",
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      + Generate Report
                    </button>
                  </div>
                  <p style={{ fontSize: 15, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                    Generate a branded PDF with spend, channel performance, and action points.
                  </p>
                </div>

                {/* Client Logo & Name */}
                <div style={{ background: '#FDFCF8', border: '1px solid rgba(232,228,220,0.7)', borderRadius: 18, boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)', padding: '20px 24px' }}>
                  <div style={{ marginBottom: 16 }}>
                    <span style={{ fontSize: 16, fontWeight: 500, color: '#1C1917', fontFamily: "'DM Sans', system-ui, sans-serif" }}>Client Logo & Name</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {client?.logo_url ? (
                      <img src={client.logo_url} alt="Client logo" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '0.5px solid #E8E4DC' }} />
                    ) : (
                      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F0EDE8', border: '0.5px solid #E8E4DC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 25, fontWeight: 700, color: '#B5B0A5' }}>{client?.name?.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <button
                        onClick={() => logoInputRef.current?.click()}
                        disabled={isUploadingLogo}
                        style={{
                          height: 30, padding: '0 12px', borderRadius: 12,
                          border: '0.5px solid #D5D0C5', background: '#FDFCF8',
                          color: '#1C1917', fontSize: 15, fontWeight: 500,
                          cursor: isUploadingLogo ? 'not-allowed' : 'pointer',
                          fontFamily: "'DM Sans', system-ui, sans-serif",
                          opacity: isUploadingLogo ? 0.6 : 1,
                        }}
                      >
                        {isUploadingLogo ? 'Uploading...' : client?.logo_url ? 'Replace Logo' : 'Upload Logo'}
                      </button>
                      {client?.logo_url && (
                        <span style={{ fontSize: 14, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>Logo uploaded</span>
                      )}
                      <span style={{ fontSize: 13, color: '#DC2626', fontFamily: "'DM Sans', system-ui, sans-serif" }}>Only 1:1 (square) images are accepted.</span>
                      {logoUploadError && (
                        <span style={{ fontSize: 14, color: '#A0442A', fontFamily: "'DM Sans', system-ui, sans-serif" }}>{logoUploadError}</span>
                      )}
                    </div>

                    <div style={{ width: 1, alignSelf: 'stretch', background: '#E8E4DC', margin: '0 4px' }} />

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: '#B5B0A5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>Client Name</span>
                      {isEditingClientName ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="text"
                            value={editingClientName}
                            onChange={(e) => setEditingClientName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveClientName();
                              if (e.key === 'Escape') handleCancelEditClientName();
                            }}
                            autoFocus
                            disabled={isSavingClientName}
                            style={{
                              height: 34, padding: '0 10px', borderRadius: 10,
                              border: '0.5px solid #D5D0C5', background: '#FFFFFF',
                              color: '#1C1917', fontSize: 15, fontFamily: "'DM Sans', system-ui, sans-serif",
                              flex: 1, minWidth: 0, outline: 'none',
                            }}
                          />
                          <button
                            onClick={handleSaveClientName}
                            disabled={isSavingClientName || !editingClientName.trim()}
                            style={{
                              height: 34, padding: '0 12px', borderRadius: 10,
                              border: 'none', background: '#1C1917',
                              color: '#FDFCF8', fontSize: 14, fontWeight: 500,
                              cursor: isSavingClientName ? 'not-allowed' : 'pointer',
                              fontFamily: "'DM Sans', system-ui, sans-serif",
                              opacity: isSavingClientName || !editingClientName.trim() ? 0.6 : 1,
                            }}
                          >
                            {isSavingClientName ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={handleCancelEditClientName}
                            disabled={isSavingClientName}
                            style={{
                              height: 34, padding: '0 12px', borderRadius: 10,
                              border: '0.5px solid #D5D0C5', background: '#FDFCF8',
                              color: '#1C1917', fontSize: 14, fontWeight: 500,
                              cursor: isSavingClientName ? 'not-allowed' : 'pointer',
                              fontFamily: "'DM Sans', system-ui, sans-serif",
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 17, fontWeight: 600, color: '#1C1917', fontFamily: "'DM Sans', system-ui, sans-serif" }}>{client?.name ?? '—'}</span>
                          <button
                            onClick={handleStartEditClientName}
                            style={{
                              height: 28, padding: '0 10px', borderRadius: 10,
                              border: '0.5px solid #D5D0C5', background: '#FDFCF8',
                              color: '#1C1917', fontSize: 13, fontWeight: 500,
                              cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif",
                            }}
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoUpload(file);
                      e.target.value = '';
                    }}
                  />
                </div>

                {/* Ad Platform Connections */}
                <div id="platform-connections-section" className="rounded-lg p-6" style={{ background: '#FDFCF8', border: '1px solid rgba(232,228,220,0.7)', borderRadius: 18, boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)' }}>
                  <AdPlatformConnector clientId={clientId} onConfigNeeded={setAdminNeedsConfig} />
                </div>

                <ClientIntelTab clientId={clientId} />

                {/* Danger Zone */}
                <div style={{ background: '#FDF7F5', border: '1px solid rgba(160,68,42,0.2)', borderRadius: 18, boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 6px rgba(0,0,0,0.04)', padding: '20px 24px' }}>
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: '#A0442A', fontFamily: "'DM Sans', system-ui, sans-serif" }}>Danger Zone</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 10, border: '0.5px solid rgba(160,68,42,0.15)', background: '#FDFCF8' }}>
                    <div>
                      <p style={{ fontSize: 16, fontWeight: 500, color: '#1C1917', fontFamily: "'DM Sans', system-ui, sans-serif", margin: 0 }}>Delete this client</p>
                      <p style={{ fontSize: 15, color: '#8A8578', fontFamily: "'DM Sans', system-ui, sans-serif", margin: '2px 0 0' }}>Permanently remove this client and all associated data. This cannot be undone.</p>
                    </div>
                    {deleteConfirm ? (
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 16 }}>
                        <button
                          onClick={async () => {
                            setDeleting(true);
                            try {
                              const res = await fetch(`/api/clients/${clientId}`, { method: 'DELETE' });
                              if (!res.ok) throw new Error(await res.text());
                              router.push('/dashboard');
                            } catch {
                              setDeleting(false);
                              setDeleteConfirm(false);
                              alert('Failed to delete client. Please try again.');
                            }
                          }}
                          disabled={deleting}
                          style={{
                            height: 30, padding: '0 14px', borderRadius: 12,
                            border: 'none', background: '#A0442A',
                            color: '#fff', fontSize: 15, fontWeight: 500,
                            cursor: deleting ? 'not-allowed' : 'pointer',
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                            opacity: deleting ? 0.6 : 1,
                          }}
                        >
                          {deleting ? 'Deleting…' : 'Yes, delete'}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(false)}
                          disabled={deleting}
                          style={{
                            height: 30, padding: '0 14px', borderRadius: 12,
                            border: '0.5px solid #D5D0C5', background: '#FDFCF8',
                            color: '#1C1917', fontSize: 15, fontWeight: 500,
                            cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(true)}
                        style={{
                          height: 30, padding: '0 12px', borderRadius: 12, flexShrink: 0, marginLeft: 16,
                          border: '0.5px solid #F5C5B8', background: '#FDF2EF',
                          color: '#A0442A', fontSize: 15, fontWeight: 500,
                          cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif",
                        }}
                      >
                        Delete Client
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

                </div>
              </div>
            </div>

          </>
        )}
      </main>

      {/* Invoice Modal */}
      {client && (
        <InvoiceModal
          isOpen={isInvoiceModalOpen}
          onClose={() => setIsInvoiceModalOpen(false)}
          clientId={clientId}
          clientName={client.name}
          onGenerated={(inv) => {
            const record = { id: crypto.randomUUID(), ...inv };
            const updated = [record, ...invoiceHistory];
            setInvoiceHistory(updated);
            try { localStorage.setItem(`invoice-history-${clientId}`, JSON.stringify(updated)); } catch {}
          }}
        />
      )}

      {/* Report Builder Modal */}
      {client && (
        <ReportBuilderModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          clientId={clientId}
          clientName={client.name}
        />
      )}

      {/* Fullscreen Gantt overlay */}
      {showFullscreenGantt && (
        <FullscreenGanttView
          clients={ganttClients}
          channels={ganttChannels}
          actionPointMarkers={ganttAPMarkers}
          filteredClientIds={ganttClients.map(c => c.id)}
          onClose={() => setShowFullscreenGantt(false)}
          onActionPointCompleted={() => setActionPointsRefetchTrigger(prev => prev + 1)}
        />
      )}
    </div>
  );
}
