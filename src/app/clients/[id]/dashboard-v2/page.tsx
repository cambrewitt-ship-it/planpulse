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
import { MediaPlanGrid, MediaPlanChannel } from '@/components/media-plan-builder/media-plan-grid';
import { useParams } from 'next/navigation';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { getClients, getMediaPlans, getPlanById, updateClient } from '@/lib/db/plans';
import { fetchAnalyticsData, fetchSpendData, calculateCostPerMetric, SpendDataPoint, CostMetricPoint } from '@/lib/api/analytics-data-integration';
import { subDays, addDays, format, differenceInDays, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { FunnelStage, MediaPlanFunnel, FunnelConfig } from '@/lib/types/funnel';
import { calculateHealthScore, type HealthScoreResult } from '@/lib/utils/health-score';
import {
  getPlatformForChannel,
  generateChannelChartData,
  generateChannelChartDataForRange,
  getChannelCategory,
} from '@/lib/utils/channel-pacing';
import OrganicSocialCard from '@/components/dashboard-v2/organic-social-card';
import EdmCard from '@/components/dashboard-v2/edm-card';
import OohCard from '@/components/dashboard-v2/ooh-card';
import type { OrganicSocialActual, EdmActual } from '@/types/database';
import { startOfWeek } from 'date-fns';
import { CACChart } from '@/components/ui/cac-chart';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { FunnelChart } from '@/components/funnel-chart';
import { FunnelBuilderModal } from '@/components/funnel-builder-modal';
import TodoSection from '@/components/TodoSection';
import HeroHealthSection from '@/components/dashboard-v2/hero-health-section';
import ActionItemsSection, { type ActionItem } from '@/components/dashboard-v2/action-items-section';
import ChannelPerformanceCard from '@/components/dashboard-v2/channel-performance-card';

interface Client {
  id: string;
  name: string;
  notes?: string | null;
  logo_url?: string | null;
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

const METRIC_OPTIONS: any = [
  { value: 'activeUsers', label: 'Active Users' },
  { value: 'totalUsers', label: 'Total Users' },
  { value: 'newUsers', label: 'New Users' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'engagedSessions', label: 'Engaged Sessions' },
  { value: 'eventCount', label: 'Events' },
  { value: 'bounceRate', label: 'Bounces (inverted)' },
];

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
  const clientId = params.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [plans, setPlans] = useState<MediaPlan[]>([]);
  const [activePlan, setActivePlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [mediaPlanBuilderChannels, setMediaPlanBuilderChannels] = useState<MediaPlanChannel[]>([]);
  const [commission, setCommission] = useState<number>(0);
  const [isLoadingMediaPlanBuilder, setIsLoadingMediaPlanBuilder] = useState(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);
  const [isEditingClientName, setIsEditingClientName] = useState(false);
  const [editingClientName, setEditingClientName] = useState('');
  const [isSavingClientName, setIsSavingClientName] = useState(false);
  const [isEditingClientNotes, setIsEditingClientNotes] = useState(false);
  const [editingClientNotes, setEditingClientNotes] = useState('');
  const [isSavingClientNotes, setIsSavingClientNotes] = useState(false);
  const [spendData, setSpendData] = useState<SpendDataPoint[]>([]);
  const [ga4Data, setGa4Data] = useState<any[]>([]);
  const [cacMetrics, setCacMetrics] = useState<CostMetricPoint[]>([]);
  const [cacError, setCacError] = useState<string | undefined>();
  const [cacErrorDetails, setCacErrorDetails] = useState<string | undefined>();
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<string>('activeUsers');
  const [availableMetrics, setAvailableMetrics] = useState<Set<string>>(new Set(['activeUsers']));
  const [previousPeriodMetrics, setPreviousPeriodMetrics] = useState<CostMetricPoint[] | null>(null);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [selectedEventName, setSelectedEventName] = useState<string | null>(null);
  const [availableEventNames, setAvailableEventNames] = useState<Array<{ name: string; count: number }>>([]);
  const [loadingEventNames, setLoadingEventNames] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const [availableChannels, setAvailableChannels] = useState<Array<{ id: string; name: string }>>([]);
  const [viewMode, setViewMode] = useState<'overview' | 'funnels' | 'media-plan'>('overview');
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    if (typeof window === 'undefined') return new Date();
    try {
      const saved = localStorage.getItem(`dashboard-v2-selected-month-${params.id}`);
      if (saved) {
        const d = new Date(saved);
        if (!isNaN(d.getTime())) return d;
      }
    } catch {}
    return new Date();
  });
  const [funnels, setFunnels] = useState<MediaPlanFunnel[]>([]);
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [loadingFunnels, setLoadingFunnels] = useState(false);
  const [isFunnelBuilderOpen, setIsFunnelBuilderOpen] = useState(false);
  const [editingFunnel, setEditingFunnel] = useState<MediaPlanFunnel | null>(null);
  const [mediaChannels, setMediaChannels] = useState<any[]>([]);
  const [actionPointsStats, setActionPointsStats] = useState<{ totalAll: number; completedAll: number; trafficLightColor: string; loading: boolean }>({ totalAll: 0, completedAll: 0, trafficLightColor: 'bg-gray-400', loading: true });
  const [allActionPoints, setAllActionPoints] = useState<any[]>([]);
  const [actionPointsRefetchTrigger, setActionPointsRefetchTrigger] = useState(0);
  const [healthScore, setHealthScore] = useState<HealthScoreResult | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  // Spend data scoped to the visible analytics period — fetched independently for channel cards.
  // Must be declared before totalActualSpend so the useMemo below can reference it.
  const [channelMonthSpendData, setChannelMonthSpendData] = useState<SpendDataPoint[]>([]);
  // Non-digital channel actuals
  const [organicSocialActuals, setOrganicSocialActuals] = useState<OrganicSocialActual[]>([]);
  const [edmActuals, setEdmActuals] = useState<EdmActual[]>([]);
  // Derived from channelMonthSpendData — sum of current-month spend across all platforms.
  // Mirrors how new-client-dashboard derives this from MediaChannels' onTotalActualSpendChange.
  const totalActualSpend = useMemo(() => {
    if (!channelMonthSpendData.length) return 0;
    const now = new Date();
    const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
    const monthEnd   = format(endOfMonth(now),   'yyyy-MM-dd');
    return (channelMonthSpendData as any[])
      .filter((p: any) => p.date >= monthStart && p.date <= monthEnd)
      .reduce((sum: number, p: any) => sum + (p.spend ?? 0), 0);
  }, [channelMonthSpendData]);
  const [analyticsDateRange, setAnalyticsDateRange] = useState(() => {
    const today = new Date();
    const thirtyDaysAgo = subDays(today, 30);
    const defaultRange = {
      startDate: format(thirtyDaysAgo, 'yyyy-MM-dd'),
      endDate: format(today, 'yyyy-MM-dd'),
    };
    if (typeof window === 'undefined') return defaultRange;
    try {
      const saved = localStorage.getItem(`dashboard-v2-analytics-range-${params.id}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.startDate && parsed.endDate) return parsed;
      }
    } catch {}
    return defaultRange;
  });

  // Mirror the computed MTD actual spend to the DB so the agency dashboard can
  // show the exact same number without recalculating.
  useEffect(() => {
    if (!clientId || totalActualSpend <= 0) return;
    const timer = setTimeout(() => {
      fetch(`/api/clients/${clientId}/actual-spend`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualSpend: totalActualSpend }),
      }).catch(() => {/* fire-and-forget */});
    }, 2000);
    return () => clearTimeout(timer);
  }, [clientId, totalActualSpend]);

  // Persist analyticsDateRange across refreshes
  useEffect(() => {
    if (typeof window === 'undefined' || !clientId) return;
    try {
      localStorage.setItem(`dashboard-v2-analytics-range-${clientId}`, JSON.stringify(analyticsDateRange));
    } catch {}
  }, [analyticsDateRange, clientId]);

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

  // Fetch spend data specifically for the current analyticsDateRange (used by channel cards)
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    const fetchMonthSpend = async () => {
      try {
        const rangeStart = analyticsDateRange.startDate;
        const rangeEnd   = analyticsDateRange.endDate;

        // Call the spend APIs directly — same approach as MediaChannels.
        // Avoids going through fetchAnalyticsData which also fetches GA4 data;
        // a GA4 failure there would silently swallow the spend result.
        const spendResult = await fetchSpendData(rangeStart, rangeEnd, clientId);

        if (cancelled) return;

        const enhanced = (spendResult.data || []).map((point: any) => ({
          ...point,
          channelId:   point.platform && point.accountName
            ? `${point.platform}_${point.accountName}`
            : point.platform || 'unknown',
          channelName: getChannelDisplayNameFromPlatform(point.platform),
        }));

        setChannelMonthSpendData(enhanced);
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading channel month spend data:', err);
          setChannelMonthSpendData([]);
        }
      }
    };

    fetchMonthSpend();
    return () => { cancelled = true; };
  }, [clientId, analyticsDateRange.startDate, analyticsDateRange.endDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate planned budget for current month from media plan
  const plannedBudget = useMemo(() => {
    if (!mediaPlanBuilderChannels || mediaPlanBuilderChannels.length === 0) {
      return 0;
    }

    const now = new Date();
    let totalBudget = 0;

    mediaPlanBuilderChannels.forEach((channel) => {
      if (channel.flights) {
        channel.flights.forEach((flight) => {
          if (flight.monthlySpend) {
            const paddedMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const unpaddedMonthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
            const spend = flight.monthlySpend[paddedMonthKey] || flight.monthlySpend[unpaddedMonthKey] || 0;
            totalBudget += spend;
          }
        });
      }
    });

    return totalBudget;
  }, [mediaPlanBuilderChannels]);

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
      loadData();
      loadMediaPlanBuilderData();
      loadAnalyticsData(selectedMetric, selectedMetric === 'eventCount' ? selectedEventName : null);
      loadFunnels();
      loadNonDigitalActuals();
    }
  }, [clientId]);

  // Load event names when eventCount metric is selected
  useEffect(() => {
    if (clientId && selectedMetric === 'eventCount' && availableEventNames.length === 0) {
      loadEventNames();
    }
  }, [clientId, selectedMetric]);

  // When a funnel is selected, update the date range to match the funnel's config
  useEffect(() => {
    if (selectedFunnelId && funnels.length > 0) {
      const selectedFunnel = funnels.find(f => f.id === selectedFunnelId);
      if (selectedFunnel?.config?.dateRange) {
        setAnalyticsDateRange({
          startDate: selectedFunnel.config.dateRange.startDate,
          endDate: selectedFunnel.config.dateRange.endDate,
        });
      }
    }
  }, [selectedFunnelId, funnels]);

  // Reload analytics when date range, selected metric, or event name changes
  useEffect(() => {
    if (clientId) {
      const eventName = selectedMetric === 'eventCount' ? selectedEventName : null;
      loadAnalyticsData(selectedMetric, eventName);

      if (selectedFunnelId) {
        calculateFunnel(selectedFunnelId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsDateRange.startDate, analyticsDateRange.endDate, clientId, selectedMetric, selectedEventName]);

  // Recalculate cost metrics when selected channels change
  useEffect(() => {
    if (spendData.length > 0 && ga4Data.length > 0 && availableChannels.length > 0 && selectedChannels.size > 0) {
      const filteredSpendData = spendData.filter((point: any) =>
        point.channelId && selectedChannels.has(point.channelId)
      );

      const costResult = calculateCostPerMetric(filteredSpendData, ga4Data, selectedMetric);

      if (!costResult.error) {
        setCacError(undefined);
        setCacErrorDetails(undefined);
        setCacMetrics(costResult.data);
      } else {
        setCacError(costResult.error);
        setCacErrorDetails(costResult.errorDetails);
        setCacMetrics([]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannels, spendData, ga4Data, selectedMetric]);

  const loadData = async () => {
    try {
      const clients = await getClients();
      const foundClient = clients?.find((c: Client) => c.id === clientId);
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
      }
    } catch (error) {
      console.error('Error loading media plan builder data:', error);
    } finally {
      setIsLoadingMediaPlanBuilder(false);
      isInitialLoadRef.current = false;
    }
  };

  const saveMediaPlanBuilderData = async (channels: MediaPlanChannel[], commission: number) => {
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
        body: JSON.stringify({ channels: serializedChannels, commission }),
      });

      if (!response.ok) {
        console.error('Failed to save media plan builder data:', response.status);
      }
    } catch (error) {
      console.error('Error saving media plan builder data:', error);
    }
  };

  // Auto-save media plan builder data with debouncing
  useEffect(() => {
    if (isInitialLoadRef.current || isLoadingMediaPlanBuilder) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveMediaPlanBuilderData(mediaPlanBuilderChannels, commission);
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [mediaPlanBuilderChannels, commission, clientId, isLoadingMediaPlanBuilder]);

  const loadEventNames = async () => {
    if (!clientId) return;

    setLoadingEventNames(true);
    try {
      const response = await fetch('/api/ads/google-analytics/event-names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.eventNames) {
          setAvailableEventNames(data.eventNames);
          if (!selectedEventName && data.eventNames.length > 0) {
            setSelectedEventName(data.eventNames[0].name);
          }
        }
      } else {
        setAvailableEventNames([]);
      }
    } catch (error) {
      console.error('Error loading event names:', error);
      setAvailableEventNames([]);
    } finally {
      setLoadingEventNames(false);
    }
  };

  const loadAnalyticsData = async (metricKey: string = 'activeUsers', eventName: string | null = null) => {
    if (!clientId) return;

    setLoadingAnalytics(true);
    try {
      const allMetricKeys = METRIC_OPTIONS.map((m: any) => m.value);

      const result = await fetchAnalyticsData({
        startDate: analyticsDateRange.startDate,
        endDate: analyticsDateRange.endDate,
        clientId: clientId,
        includeSpendData: true,
        metrics: allMetricKeys,
        eventName: eventName || undefined,
      });

      const metricsWithData = new Set<string>();
      if (result.ga4Data && result.ga4Data.length > 0) {
        allMetricKeys.forEach((metric: string) => {
          const hasData = result.ga4Data.some((point: any) => {
            const value = point[metric];
            return value !== null && value !== undefined && value !== '' && Number(value) > 0;
          });
          if (hasData) metricsWithData.add(metric);
        });
      }
      setAvailableMetrics(metricsWithData);

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

      setSpendData(enhancedSpendData);
      setGa4Data(result.ga4Data || []);

      const channelMap = new Map<string, string>();
      enhancedSpendData.forEach((point: any) => {
        if (point.channelId && point.channelName) {
          channelMap.set(point.channelId, point.channelName);
        }
      });
      const channels = Array.from(channelMap.entries()).map(([id, name]) => ({ id, name }));
      setAvailableChannels(channels);

      if (selectedChannels.size === 0 && channels.length > 0) {
        setSelectedChannels(new Set(channels.map(ch => ch.id)));
      }

      const filteredSpendData = selectedChannels.size > 0
        ? enhancedSpendData.filter((point: any) => point.channelId && selectedChannels.has(point.channelId))
        : enhancedSpendData;

      const costResult = calculateCostPerMetric(filteredSpendData, result.ga4Data || [], metricKey);

      if (costResult.error) {
        setCacError(costResult.error);
        setCacErrorDetails(costResult.errorDetails);
        setCacMetrics([]);
      } else {
        setCacError(undefined);
        setCacErrorDetails(undefined);
        setCacMetrics(costResult.data);
      }
    } catch (error: any) {
      console.error('Error loading analytics data:', error);
      setCacError('Failed to load analytics data');
      setCacErrorDetails(error.message || 'Unknown error');
      setCacMetrics([]);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const loadPreviousPeriodData = async (enabled: boolean) => {
    if (!enabled) {
      setPreviousPeriodMetrics(null);
      return;
    }
    if (!clientId) return;

    setLoadingComparison(true);
    try {
      const startDate = parseISO(analyticsDateRange.startDate);
      const endDate = parseISO(analyticsDateRange.endDate);
      const periodLength = differenceInDays(endDate, startDate);
      const prevEndDate = subDays(startDate, 1);
      const prevStartDate = subDays(prevEndDate, periodLength);

      const allMetricKeys = METRIC_OPTIONS.map((m: any) => m.value);
      const eventName = selectedMetric === 'eventCount' ? selectedEventName : null;

      const result = await fetchAnalyticsData({
        startDate: format(prevStartDate, 'yyyy-MM-dd'),
        endDate: format(prevEndDate, 'yyyy-MM-dd'),
        clientId: clientId,
        includeSpendData: true,
        metrics: allMetricKeys,
        eventName: eventName || undefined,
      });

      const costResult = calculateCostPerMetric(result.spendData || [], result.ga4Data || [], selectedMetric);
      if (!costResult.error) {
        setPreviousPeriodMetrics(costResult.data);
      } else {
        setPreviousPeriodMetrics(null);
      }
    } catch (error) {
      console.error('Error loading previous period data:', error);
      setPreviousPeriodMetrics(null);
    } finally {
      setLoadingComparison(false);
    }
  };

  const loadFunnels = async () => {
    setLoadingFunnels(true);
    try {
      const channelsResponse = await fetch(`/api/media-plan/channels?clientId=${clientId}`);
      const channelsData = await channelsResponse.json();
      if (channelsData.success && channelsData.channels) {
        setMediaChannels(channelsData.channels);
      }

      const response = await fetch(`/api/funnels?clientId=${clientId}`);
      const data = await response.json();

      if (data.success && data.funnels) {
        setFunnels(data.funnels);
        if (data.funnels.length > 0 && !selectedFunnelId) {
          const firstFunnelId = data.funnels[0].id;
          setSelectedFunnelId(firstFunnelId);
          await calculateFunnel(firstFunnelId);
        }
      }
    } catch (error) {
      console.error('Failed to load funnels:', error);
    } finally {
      setLoadingFunnels(false);
    }
  };

  const calculateFunnel = async (funnelId: string) => {
    setLoadingFunnels(true);
    try {
      const response = await fetch(
        `/api/funnels/${funnelId}/calculate?startDate=${analyticsDateRange.startDate}&endDate=${analyticsDateRange.endDate}`
      );
      const data = await response.json();
      if (data.success && data.stages) {
        setFunnelStages(data.stages);
      }
    } catch (error) {
      console.error('Failed to calculate funnel:', error);
      setFunnelStages([]);
    } finally {
      setLoadingFunnels(false);
    }
  };

  // ── Derived campaign date/day values (shared across memos) ──────────────
  const campaignDates = useMemo(() => {
    if (!mediaPlanBuilderChannels.length) return null;
    const allDates = mediaPlanBuilderChannels.flatMap(ch =>
      ch.flights.flatMap(f => [f.startWeek, f.endWeek])
    ).filter(Boolean) as Date[];
    if (!allDates.length) return null;
    const now = new Date();
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

  // ── Props for HeroHealthSection ─────────────────────────────────────────
  const heroProps = useMemo(() => {
    if (!client || !healthScore || !campaignDates) return null;

    const pacingRatio = campaignDates.plannedSpend > 0
      ? totalActualSpend / campaignDates.plannedSpend
      : 0;
    const pacingPct = pacingRatio * 100;
    const pacingStatus: { percentage: number; variance: number; status: 'ahead' | 'on-track' | 'behind' } = {
      percentage: pacingPct,
      variance: pacingPct - 100,
      status: pacingPct > 110 ? 'ahead' : pacingPct < 90 ? 'behind' : 'on-track',
    };

    const perfScore = healthScore.breakdown.performance.score;
    const performanceStatus = {
      label: perfScore >= 85 ? 'Excellent' : perfScore >= 70 ? 'Good' : perfScore >= 50 ? 'Needs Attention' : 'Poor',
      ctr: 0, // aggregated CTR not available from current state; will be wired when perf data integrated
      status: (perfScore >= 85 ? 'excellent' : perfScore >= 70 ? 'good' : 'needs-attention') as 'excellent' | 'good' | 'needs-attention',
    };

    // We have totals from actionPointsStats; split outstanding evenly into
    // urgent / this-week as a placeholder until individual items are surfaced.
    const outstanding = Math.max(0, actionPointsStats.totalAll - actionPointsStats.completedAll);
    const urgent   = Math.ceil(outstanding * 0.3);
    const thisWeek = outstanding - urgent;

    return {
      client: {
        name: client.name,
        notes: client.notes ?? undefined,
        logo_url: client.logo_url ?? undefined,
      },
      healthScore,
      currentSpend: totalActualSpend,
      totalBudget: campaignDates.totalBudget,
      daysRemaining: campaignDates.daysRemaining,
      actionItemsCount: {
        urgent,
        thisWeek,
        completed: actionPointsStats.completedAll,
      },
      pacingStatus,
      performanceStatus,
    };
  }, [client, healthScore, campaignDates, totalActualSpend, actionPointsStats]);

  // Calculate current week commencing (Monday of current week)
  const currentWeekCommencing = useMemo(() => {
    const today = new Date();
    const monday = startOfWeek(today, { weekStartsOn: 1 });
    return format(monday, 'yyyy-MM-dd');
  }, []);

  // ── Props for ChannelPerformanceCard list ────────────────────────────────
  const channelCards = useMemo(() => {
    if (!mediaPlanBuilderChannels.length) return [];

    const now = new Date();

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

    return mediaPlanBuilderChannels.map(ch => {
      // Detect channel category
      const category = ch.channelCategory || getChannelCategory(ch.channelName);
      
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
      
      // Paid digital - existing logic
      const platform = getPlatformForChannel(ch.channelName);

      const chPlatform = getPlatformForChannel(ch.channelName);
      const keyword    = ch.channelName.toLowerCase().split(' ')[0];

      // ── Chart data: compute first so multi-month totals can be derived ────
      const chartData = isMultiMonth
        ? generateChannelChartDataForRange(ch, analyticsDateRange.startDate, analyticsDateRange.endDate, channelMonthSpendData as any[], commission)
        : generateChannelChartData(ch, selectedMonth, channelMonthSpendData as any[], commission);

      // ── Spend totals ─────────────────────────────────────────────────────
      // Multi-month: read cumulative totals from the final chart data point so
      // the header figures match exactly what the chart is displaying.
      // Single-month: compute as before, scoped to selectedMonth only.
      let currentSpend: number;
      let plannedSpend: number;

      if (isMultiMonth && chartData.length > 0) {
        const lastPoint       = chartData[chartData.length - 1];
        const lastActualPoint = [...chartData].reverse().find(p => p.actualSpend !== null && typeof p.actualSpend === 'number');
        currentSpend = lastActualPoint?.actualSpend ?? 0;
        plannedSpend = lastPoint.plannedSpend;
      } else {
        plannedSpend = ch.flights.reduce((sum, f) => {
          const paddedKey   = format(selectedMonth, 'yyyy-MM');
          const unpaddedKey = `${selectedMonth.getFullYear()}-${selectedMonth.getMonth() + 1}`;
          const raw         = f.monthlySpend[paddedKey] ?? f.monthlySpend[unpaddedKey] ?? 0;
          const afterComm   = commission > 0 ? raw * ((100 - commission) / 100) : raw;
          return sum + afterComm;
        }, 0);

        const monthStartStr = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
        const monthEndStr   = format(endOfMonth(selectedMonth),   'yyyy-MM-dd');
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
      const monthStartStr = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
      const monthEndStr   = format(endOfMonth(selectedMonth),   'yyyy-MM-dd');

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
      const aggregatedCtr    = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
      const aggregatedCpc    = totalClicks > 0 ? currentSpend / totalClicks : 0;

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

      return {
        type: 'paid_digital' as const,
        name:             ch.channelName,
        platform,
        status:           determineStatus(currentSpend, plannedSpend),
        currentSpend,
        plannedSpend,
        pacingPercentage: pacingPct,
        metrics: {
          impressions: totalImpressions,
          clicks:      totalClicks,
          ctr:         aggregatedCtr,
          cpc:         aggregatedCpc,
          conversions: totalConversions,
        },
        issues:          detectIssues(currentSpend, plannedSpend, selectedMonth),
        chartData:       chartData.length > 0 ? chartData : undefined,
        metricsChartData: metricsChartData.length > 0 ? metricsChartData : undefined,
        isMultiMonth,
      };
    });
  }, [mediaPlanBuilderChannels, channelMonthSpendData, selectedMonth, commission, analyticsDateRange.startDate, analyticsDateRange.endDate]);

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

      if (totalBudget === 0) return;

      const now = new Date();
      const allDates = mediaPlanBuilderChannels.flatMap(ch =>
        ch.flights.flatMap(f => [f.startWeek, f.endWeek])
      ).filter(Boolean) as Date[];

      if (allDates.length === 0) return;

      const campaignStart = new Date(Math.min(...allDates.map(d => d.getTime())));
      const campaignEnd   = new Date(Math.max(...allDates.map(d => d.getTime())));

      const totalDays   = Math.max(1, Math.ceil((campaignEnd.getTime() - campaignStart.getTime()) / (1000 * 60 * 60 * 24)));
      const daysElapsed = Math.max(0, Math.ceil((now.getTime() - campaignStart.getTime()) / (1000 * 60 * 60 * 24)));
      const plannedSpend = Math.min(totalBudget, totalBudget * (daysElapsed / totalDays));

      const channelPerformanceScores = mediaPlanBuilderChannels.map(channel => ({
        channelId: channel.channelName,
        score: 75,
        budget: channel.flights.reduce(
          (sum, flight) => sum + Object.values(flight.monthlySpend).reduce((a, b) => a + b, 0),
          0
        ),
      }));

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

      setHealthScore(result);
      setDashboardError(null);
    } catch (err) {
      console.error('Health score calculation failed:', err);
      setDashboardError('Health score could not be calculated. Other data is still available below.');
    }
  }, [mediaPlanBuilderChannels, totalActualSpend, actionPointsStats]);

  // ── Action points data pipeline ─────────────────────────────────────────
  const handleActionPointsUpdate = useCallback((actionPoints: any[]) => {
    setAllActionPoints(actionPoints);
  }, []);

  const determinePriority = (item: any): 'urgent' | 'this-week' | 'completed' => {
    if (item.completed) return 'completed';
    const dueDate = item.due_date ? new Date(item.due_date) : null;
    if (!dueDate) return 'this-week';
    const now = new Date();
    const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilDue <= 2) return 'urgent';
    return 'this-week';
  };

  const actionItemsForSection = useMemo(() => {
    return allActionPoints.map((item: any) => ({
      id: item.id,
      text: item.text,
      completed: item.completed,
      priority: determinePriority(item),
      dueDate: item.due_date ?? undefined,
      channelType: item.channel_type ?? undefined,
      category: item.category as 'SET UP' | 'HEALTH CHECK',
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allActionPoints]);

  const handleToggleActionPoint = async (id: string, completed: boolean) => {
    try {
      await fetch('/api/action-points', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, completed, client_id: clientId }),
      });
      setActionPointsRefetchTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Failed to update action point:', error);
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
    const section = document.getElementById('cost-per-metric-section');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const handleChannelsChange = (channels: MediaPlanChannel[]) => {
    setMediaPlanBuilderChannels(channels);
  };

  const handleCommissionChange = (value: number) => {
    setCommission(value);
  };

  const handleFunnelSaved = async (config: FunnelConfig) => {
    try {
      if (editingFunnel) {
        const response = await fetch(`/api/funnels/${editingFunnel.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelIds: config.channelIds, name: config.name, config }),
        });
        if (!response.ok) throw new Error('Failed to update funnel');
      } else {
        const response = await fetch('/api/funnels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, channelIds: config.channelIds, name: config.name, config }),
        });
        if (!response.ok) throw new Error('Failed to create funnel');
      }
      if (config.dateRange) {
        setAnalyticsDateRange({ startDate: config.dateRange.startDate, endDate: config.dateRange.endDate });
      }
      await loadFunnels();
      if (selectedFunnelId) await calculateFunnel(selectedFunnelId);
    } catch (error) {
      console.error('Error saving funnel:', error);
    } finally {
      setIsFunnelBuilderOpen(false);
      setEditingFunnel(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top nav bar ── */}
      <header className="bg-white border-b px-6 py-3 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
              V2 Preview
            </span>
            <span className="ml-2 text-sm text-gray-500">{client?.name ?? 'Loading…'}</span>
          </div>
          <Link
            href={`/clients/${clientId}/new-client-dashboard`}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Back to Current Dashboard
          </Link>
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
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
            <span className="text-amber-500 mt-0.5">⚠</span>
            {dashboardError}
          </div>
        )}

        {loading ? (
          /* ── Loading skeletons ── */
          <div className="space-y-6">
            {/* Hero skeleton */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
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
            {heroProps ? (
              <HeroHealthSection {...heroProps} />
            ) : (
              /* Edge case: no media plan channels set up yet */
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <p className="text-gray-500 text-sm">
                  No media plan data found. Add channels in the Media Plan Builder to see your health score.
                </p>
              </div>
            )}

            {/* ── View Mode & Date Controls ── */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
              <div className="flex items-center justify-between">
                {/* Left: View Mode Tabs */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setViewMode('overview')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      viewMode === 'overview'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Overview
                  </button>
                  <button
                    onClick={() => setViewMode('funnels')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      viewMode === 'funnels'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Funnels
                  </button>
                  <button
                    onClick={() => setViewMode('media-plan')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      viewMode === 'media-plan'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Media Plan
                  </button>
                </div>
                {/* Right: Date Controls */}
                <div className="flex items-center gap-4">
                  {/* Month Selector for Channel Cards */}
                  {viewMode === 'overview' && (
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-600">Channel View:</label>
                      <input
                        type="month"
                        value={format(selectedMonth, 'yyyy-MM')}
                        onChange={(e) => setSelectedMonth(new Date(e.target.value))}
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                  )}

                  {/* Analytics Date Range */}
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Analytics Period:</label>
                    <DateRangePicker
                      value={analyticsDateRange}
                      onChange={setAnalyticsDateRange}
                      disabled={loadingAnalytics}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Overview: Action Items + Channels + CACChart ── */}
            {viewMode === 'overview' && (
              <>
                <ActionItemsSection
                  actionItems={actionItemsForSection}
                  onToggleComplete={handleToggleActionPoint}
                  onActionClick={handleActionItemAction}
                />

                {channelCards.length > 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h3 className="text-base font-semibold text-gray-900 mb-4">Channel Performance</h3>
                    <div className="space-y-4">
                      {channelCards.map((ch, idx) => {
                        if (ch.type === 'organic_social') {
                          return (
                            <OrganicSocialCard
                              key={`organic-${ch.channel.id}`}
                              channel={ch.channel}
                              clientId={clientId}
                              weekCommencing={currentWeekCommencing}
                              actuals={organicSocialActuals}
                              onRefresh={loadNonDigitalActuals}
                            />
                          );
                        }
                        
                        if (ch.type === 'edm') {
                          return (
                            <EdmCard
                              key={`edm-${ch.channel.id}`}
                              channel={ch.channel}
                              clientId={clientId}
                              actuals={edmActuals}
                            />
                          );
                        }
                        
                        if (ch.type === 'ooh') {
                          return (
                            <OohCard
                              key={`ooh-${ch.channel.id}`}
                              channel={ch.channel}
                              clientId={clientId}
                            />
                          );
                        }
                        
                        // Paid digital - existing card
                        return (
                          <ChannelPerformanceCard
                            key={`paid-${ch.name || idx}`}
                            channel={ch}
                            selectedMonth={selectedMonth}
                            dateRange={ch.isMultiMonth ? analyticsDateRange : undefined}
                            onAdjust={() => handleAdjustChannel(ch.platform)}
                            onViewReport={() => handleViewReport(ch.platform)}
                            clientId={clientId}
                          />
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  !isLoadingMediaPlanBuilder && (
                    <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
                      <p className="text-gray-400 text-sm">No channel data yet — connect an ad platform to see performance.</p>
                    </div>
                  )
                )}

                <div id="cost-per-metric-section" className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-4">Cost Per Metric</h3>
                  {cacMetrics.length === 0 && !loadingAnalytics && !cacError ? (
                    <p className="text-gray-400 text-sm text-center py-8">
                      No cost-per-metric data available. Ensure your GA4 and ad platform connections are active.
                    </p>
                  ) : (
                    <CACChart
                      cacMetrics={cacMetrics}
                      previousPeriodMetrics={previousPeriodMetrics}
                      height={340}
                      isLoading={loadingAnalytics}
                      isComparisonLoading={loadingComparison}
                      selectedMetric={selectedMetric}
                      error={cacError}
                      errorDetails={cacErrorDetails}
                      onComparisonToggle={loadPreviousPeriodData}
                      availableChannels={availableChannels}
                      selectedChannels={selectedChannels}
                      onChannelsChange={setSelectedChannels}
                    />
                  )}
                </div>
              </>
            )}

            {/* ── Funnels view ── */}
            {viewMode === 'funnels' && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                {selectedFunnelId && (
                  <FunnelChart
                    funnelStages={funnelStages}
                    totalCost={totalActualSpend}
                    dateRange={analyticsDateRange}
                    isLoading={loadingFunnels}
                    client={client}
                  />
                )}
                <FunnelBuilderModal
                  isOpen={isFunnelBuilderOpen}
                  onClose={() => {
                    setIsFunnelBuilderOpen(false);
                    setEditingFunnel(null);
                  }}
                  onSave={handleFunnelSaved}
                  initialConfig={editingFunnel?.config as FunnelConfig | undefined}
                  availableChannels={mediaChannels}
                />
              </div>
            )}

            {/* ── Media Plan view ── */}
            {viewMode === 'media-plan' && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <MediaPlanGrid
                  channels={mediaPlanBuilderChannels}
                  onChannelsChange={handleChannelsChange}
                  commission={commission}
                  onCommissionChange={handleCommissionChange}
                />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
