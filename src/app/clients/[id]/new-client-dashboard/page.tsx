'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User, Pencil, Check, X, DollarSign, TrendingUp, TrendingDown, Target, Minus, Download, CheckCircle } from 'lucide-react';
import MediaChannels from '@/components/MediaChannels';
import { MediaPlanGrid, MediaPlanChannel } from '@/components/media-plan-builder/media-plan-grid';
import TodoSection from '@/components/TodoSection';
import { useParams } from 'next/navigation';
import { useEffect, useState, useRef, useMemo } from 'react';
import { getClients, getMediaPlans, getPlanById, updateClient } from '@/lib/db/plans';
import PlanEditForm from '@/components/plan-entry/PlanEditForm';
import AdPlatformConnector from '@/components/AdPlatformConnector';
import { CACChart } from '@/components/ui/cac-chart';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { fetchAnalyticsData, calculateCostPerMetric, SpendDataPoint, CostMetricPoint } from '@/lib/api/analytics-data-integration';
import { subDays, format, differenceInDays, parseISO } from 'date-fns';

interface Client {
  id: string;
  name: string;
  notes?: string | null;
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

// Metric options for cost calculation, grouped by category
const METRIC_GROUPS = [
  {
    label: 'User Metrics',
    metrics: [
      { value: 'activeUsers', label: 'Active Users' },
      { value: 'totalUsers', label: 'Total Users' },
      { value: 'newUsers', label: 'New Users' },
    ],
  },
  {
    label: 'Engagement Metrics',
    metrics: [
      { value: 'sessions', label: 'Sessions' },
      { value: 'engagedSessions', label: 'Engaged Sessions' },
      { value: 'eventCount', label: 'Events' },
      { value: 'bounceRate', label: 'Bounces (inverted)' },
    ],
  },
] as const;

// Flat array of all metric options for iteration
const METRIC_OPTIONS = METRIC_GROUPS.flatMap(group => group.metrics);

// Get singular display name for metric (for title)
function getMetricDisplayName(metricKey: string): string {
  const displayNames: Record<string, string> = {
    activeUsers: 'Active User',
    totalUsers: 'Total User',
    newUsers: 'New User',
    sessions: 'Session',
    engagedSessions: 'Engaged Session',
    eventCount: 'Event',
    bounceRate: 'Bounce',
  };
  return displayNames[metricKey] || metricKey;
}

export default function NewClientDashboard() {
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
  const [analyticsDateRange, setAnalyticsDateRange] = useState(() => {
    const today = new Date();
    const thirtyDaysAgo = subDays(today, 30);
    const startDate = format(thirtyDaysAgo, 'yyyy-MM-dd');
    const endDate = format(today, 'yyyy-MM-dd');
    
    console.log('🗓️ Initializing date range:');
    console.log('  Today:', today);
    console.log('  30 days ago:', thirtyDaysAgo);
    console.log('  Start date formatted:', startDate);
    console.log('  End date formatted:', endDate);
    
    return { startDate, endDate };
  });

  // Calculate summary statistics from cacMetrics with trends
  const summaryStats = useMemo(() => {
    const emptyStats = {
      totalSpend: 0,
      totalMetricValue: 0,
      averageCost: null as number | null,
      spendTrend: null as number | null,
      metricTrend: null as number | null,
      costTrend: null as number | null,
      spendSparkline: [] as number[],
      metricSparkline: [] as number[],
      costSparkline: [] as number[],
    };

    if (!cacMetrics || cacMetrics.length === 0) {
      return emptyStats;
    }

    const totalSpend = cacMetrics.reduce((sum, point) => sum + (point.spend || 0), 0);
    const totalMetricValue = cacMetrics.reduce((sum, point) => sum + (point.metricValue || 0), 0);
    
    // Calculate average cost only from days with valid data
    const daysWithCost = cacMetrics.filter(point => point.dailyCost !== null && point.dailyCost !== undefined);
    const averageCost = daysWithCost.length > 0
      ? daysWithCost.reduce((sum, point) => sum + (point.dailyCost || 0), 0) / daysWithCost.length
      : null;

    // Calculate trends by comparing first half to second half of the period
    const midpoint = Math.floor(cacMetrics.length / 2);
    const firstHalf = cacMetrics.slice(0, midpoint);
    const secondHalf = cacMetrics.slice(midpoint);

    // Spend trend
    const firstHalfSpend = firstHalf.reduce((sum, p) => sum + (p.spend || 0), 0);
    const secondHalfSpend = secondHalf.reduce((sum, p) => sum + (p.spend || 0), 0);
    const spendTrend = firstHalfSpend > 0 
      ? ((secondHalfSpend - firstHalfSpend) / firstHalfSpend) * 100 
      : null;

    // Metric trend
    const firstHalfMetric = firstHalf.reduce((sum, p) => sum + (p.metricValue || 0), 0);
    const secondHalfMetric = secondHalf.reduce((sum, p) => sum + (p.metricValue || 0), 0);
    const metricTrend = firstHalfMetric > 0 
      ? ((secondHalfMetric - firstHalfMetric) / firstHalfMetric) * 100 
      : null;

    // Cost trend (compare average cost of first half vs second half)
    const firstHalfCosts = firstHalf.filter(p => p.dailyCost !== null).map(p => p.dailyCost!);
    const secondHalfCosts = secondHalf.filter(p => p.dailyCost !== null).map(p => p.dailyCost!);
    const firstHalfAvgCost = firstHalfCosts.length > 0 
      ? firstHalfCosts.reduce((a, b) => a + b, 0) / firstHalfCosts.length 
      : null;
    const secondHalfAvgCost = secondHalfCosts.length > 0 
      ? secondHalfCosts.reduce((a, b) => a + b, 0) / secondHalfCosts.length 
      : null;
    const costTrend = firstHalfAvgCost && secondHalfAvgCost 
      ? ((secondHalfAvgCost - firstHalfAvgCost) / firstHalfAvgCost) * 100 
      : null;

    // Generate sparkline data (last 14 points or all if less)
    const sparklineLength = Math.min(14, cacMetrics.length);
    const recentData = cacMetrics.slice(-sparklineLength);
    
    const spendSparkline = recentData.map(p => p.spend || 0);
    const metricSparkline = recentData.map(p => p.metricValue || 0);
    const costSparkline = recentData.map(p => p.dailyCost ?? 0);

    return {
      totalSpend,
      totalMetricValue,
      averageCost,
      spendTrend,
      metricTrend,
      costTrend,
      spendSparkline,
      metricSparkline,
      costSparkline,
    };
  }, [cacMetrics]);

  // Helper to format currency consistently
  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Simple SVG sparkline component
  const Sparkline = ({ data, color, height = 24, width = 60 }: { data: number[]; color: string; height?: number; width?: number }) => {
    if (!data || data.length < 2) return null;
    
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    
    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg width={width} height={height} className="ml-auto">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    );
  };

  // Trend indicator component
  const TrendIndicator = ({ value, invertColors = false }: { value: number | null; invertColors?: boolean }) => {
    if (value === null) return null;
    
    const isPositive = value > 0;
    const isNeutral = Math.abs(value) < 1;
    
    // For cost, lower is better (invertColors = true)
    // For spend/metrics, context dependent
    let colorClass: string;
    if (isNeutral) {
      colorClass = 'text-gray-500';
    } else if (invertColors) {
      // Lower cost is good (green), higher cost is bad (red)
      colorClass = isPositive ? 'text-red-500' : 'text-emerald-500';
    } else {
      // Higher spend/metrics is neutral-to-context-dependent
      colorClass = isPositive ? 'text-emerald-500' : 'text-red-500';
    }

    const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;

    return (
      <div className={`flex items-center gap-1 text-xs font-medium ${colorClass}`}>
        <Icon className="w-3 h-3" />
        <span>{Math.abs(value).toFixed(1)}%</span>
      </div>
    );
  };

  useEffect(() => {
    if (clientId) {
      loadData();
      loadMediaPlanBuilderData();
      loadAnalyticsData(selectedMetric, selectedMetric === 'eventCount' ? selectedEventName : null);
    }
  }, [clientId]);

  // Load event names when eventCount metric is selected
  useEffect(() => {
    if (clientId && selectedMetric === 'eventCount' && availableEventNames.length === 0) {
      loadEventNames();
    }
  }, [clientId, selectedMetric]);

  // Reload analytics when date range, selected metric, or event name changes
  useEffect(() => {
    if (clientId) {
      const eventName = selectedMetric === 'eventCount' ? selectedEventName : null;
      loadAnalyticsData(selectedMetric, eventName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsDateRange.startDate, analyticsDateRange.endDate, clientId, selectedMetric, selectedEventName]);

  const loadData = async () => {
    try {
      // Load client
      const clients = await getClients();
      const foundClient = clients?.find((c: Client) => c.id === clientId);
      setClient(foundClient || null);

      // Debug logging for GA4 property ID
      console.log('🔍 Client GA4 Property ID:', (foundClient as any)?.google_analytics_property_id);
      console.log('🔍 Full client object:', foundClient);

      // Load plans for this client
      const clientPlans = await getMediaPlans(clientId);
      setPlans(clientPlans || []);

      // Find active plan and load its full data
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

  const handleEditPlan = async (planId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoadingPlan(true);
    try {
      const planData = await getPlanById(planId);
      setEditingPlan(planData);
    } catch (error) {
      console.error('Error loading plan:', error);
      alert('Error loading plan. Please try again.');
    } finally {
      setLoadingPlan(false);
    }
  };

  const handleClosePlanEdit = () => {
    setEditingPlan(null);
  };

  const handlePlanSaved = () => {
    loadData(); // Reload plans after save
  };

  const handleStartEditClientName = () => {
    if (client) {
      setEditingClientName(client.name);
      setIsEditingClientName(true);
    }
  };

  const handleSaveClientName = async () => {
    if (!client || !editingClientName.trim()) {
      return;
    }

    try {
      setIsSavingClientName(true);
      await updateClient(client.id, editingClientName.trim(), client.notes || null);
      setClient({ ...client, name: editingClientName.trim() });
      setIsEditingClientName(false);
    } catch (error) {
      console.error('Error updating client name:', error);
      alert('Failed to update client name. Please try again.');
    } finally {
      setIsSavingClientName(false);
    }
  };

  const handleCancelEditClientName = () => {
    setIsEditingClientName(false);
    setEditingClientName('');
  };

  const handleStartEditClientNotes = () => {
    if (client) {
      setEditingClientNotes(client.notes || '');
      setIsEditingClientNotes(true);
    }
  };

  const handleSaveClientNotes = async () => {
    if (!client) {
      return;
    }

    try {
      setIsSavingClientNotes(true);
      await updateClient(client.id, client.name, editingClientNotes.trim() || null);
      setClient({ ...client, notes: editingClientNotes.trim() || null });
      setIsEditingClientNotes(false);
    } catch (error) {
      console.error('Error updating client notes:', error);
      alert('Failed to update client notes. Please try again.');
    } finally {
      setIsSavingClientNotes(false);
    }
  };

  const handleCancelEditClientNotes = () => {
    setIsEditingClientNotes(false);
    setEditingClientNotes('');
  };

  // Load media plan builder data from the API
  const loadMediaPlanBuilderData = async () => {
    if (!clientId) return;
    
    setIsLoadingMediaPlanBuilder(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/media-plan-builder`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to load media plan builder data:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        // If there's an error, just start with empty state
        return;
      }
      const result = await response.json();
      
      if (result.data) {
        console.log('Loaded media plan builder data:', {
          channelsCount: result.data.channels?.length || 0,
          commission: result.data.commission,
          channels: result.data.channels
        });
        
        // Ensure flights have proper Date objects
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
      // If there's an error, just start with empty state
    } finally {
      setIsLoadingMediaPlanBuilder(false);
      isInitialLoadRef.current = false;
    }
  };

  // Save media plan builder data to the API
  const saveMediaPlanBuilderData = async (channels: MediaPlanChannel[], commission: number) => {
    if (!clientId || isInitialLoadRef.current) return;
    
    try {
      // Serialize dates to ISO strings before sending
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channels: serializedChannels,
          commission,
        }),
      });
      
      if (!response.ok) {
        let errorData: any = {};
        let responseText = '';
        try {
          responseText = await response.clone().text();
          if (responseText) {
            errorData = JSON.parse(responseText);
          }
        } catch (e) {
          // Response is not JSON
          errorData = { rawResponse: responseText || 'Empty response' };
        }
        
        console.error('Failed to save media plan builder data:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          responseText: responseText.substring(0, 500), // First 500 chars
          url: `/api/clients/${clientId}/media-plan-builder`,
          headers: Object.fromEntries(response.headers.entries())
        });
        // Don't throw - just log the error so auto-save doesn't break the UI
        return;
      }
      
      console.log('Media plan builder data saved successfully');
    } catch (error) {
      console.error('Error saving media plan builder data:', error);
    }
  };

  // Auto-save media plan builder data with debouncing
  useEffect(() => {
    // Skip auto-save on initial load
    if (isInitialLoadRef.current || isLoadingMediaPlanBuilder) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout to save after 1 second of no changes
    saveTimeoutRef.current = setTimeout(() => {
      saveMediaPlanBuilderData(mediaPlanBuilderChannels, commission);
    }, 1000);

    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [mediaPlanBuilderChannels, commission, clientId, isLoadingMediaPlanBuilder]);

  // Wrapper to update channels and trigger auto-save
  const handleChannelsChange = (channels: MediaPlanChannel[]) => {
    setMediaPlanBuilderChannels(channels);
  };

  // Wrapper to update commission and trigger auto-save
  const handleCommissionChange = (value: number) => {
    setCommission(value);
  };

  // Fetch available event names from GA4
  const loadEventNames = async () => {
    if (!clientId) return;
    
    setLoadingEventNames(true);
    try {
      const response = await fetch('/api/ads/google-analytics/event-names', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clientId }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.eventNames) {
          console.log('📊 Event names loaded:', data.eventNames.length);
          setAvailableEventNames(data.eventNames);
          // Auto-select the first event if none selected
          if (!selectedEventName && data.eventNames.length > 0) {
            setSelectedEventName(data.eventNames[0].name);
          }
        }
      } else {
        console.error('Failed to load event names:', response.status);
        setAvailableEventNames([]);
      }
    } catch (error) {
      console.error('Error loading event names:', error);
      setAvailableEventNames([]);
    } finally {
      setLoadingEventNames(false);
    }
  };

  // Load analytics data (GA4 + Spend) for cost per metric calculation
  const loadAnalyticsData = async (metricKey: string = 'activeUsers', eventName: string | null = null) => {
    if (!clientId) return;
    
    setLoadingAnalytics(true);
    try {
      // Fetch all metrics to check availability
      const allMetricKeys = METRIC_OPTIONS.map(m => m.value);

      // Note: The API route will automatically fetch the property_id from google_analytics_accounts
      // based on the user's active connection, so we don't need to pass it explicitly
      const result = await fetchAnalyticsData({
        startDate: analyticsDateRange.startDate,
        endDate: analyticsDateRange.endDate,
        clientId: clientId,
        // propertyId will be fetched by the API route from google_analytics_accounts
        includeSpendData: true,
        metrics: allMetricKeys,
        eventName: eventName || undefined,
      });

      console.log('📊 Cost Per Metric Analytics data result:', {
        ga4DataLength: result.ga4Data?.length || 0,
        spendDataLength: result.spendData?.length || 0,
        metricKey,
        errors: result.errors,
      });

      // Check which metrics have non-null values in the GA4 data
      const metricsWithData = new Set<string>();
      if (result.ga4Data && result.ga4Data.length > 0) {
        allMetricKeys.forEach(metric => {
          const hasData = result.ga4Data.some(point => {
            const value = point[metric];
            return value !== null && value !== undefined && value !== '' && Number(value) > 0;
          });
          if (hasData) {
            metricsWithData.add(metric);
          }
        });
      }

      console.log('📊 Available metrics:', Array.from(metricsWithData));
      setAvailableMetrics(metricsWithData);

      // NOTE: Removed automatic fallback for debugging
      // Allow user to select any metric - chart will show Data Quality Notice if no data
      // If you need to re-enable fallback logic, uncomment the block below:
      /*
      let effectiveMetricKey = metricKey;
      if (!metricsWithData.has(metricKey)) {
        if (metricsWithData.has('activeUsers')) {
          effectiveMetricKey = 'activeUsers';
        } else if (metricsWithData.size > 0) {
          effectiveMetricKey = Array.from(metricsWithData)[0];
        }
        if (effectiveMetricKey !== metricKey) {
          console.log(`📊 Selected metric "${metricKey}" not available, defaulting to "${effectiveMetricKey}"`);
          setSelectedMetric(effectiveMetricKey);
        }
      }
      */
      
      // Use the selected metric as-is, even if no data available
      const effectiveMetricKey = metricKey;
      
      // Enhance spend data with plan information
      const enhancedSpendData = (result.spendData || []).map(point => {
        const matchingPlan = plans.find(plan => {
          if (plan.status?.toLowerCase() !== 'active') return false;
          const planStart = new Date(plan.start_date);
          const planEnd = new Date(plan.end_date);
          const pointDate = new Date(point.date);
          return pointDate >= planStart && pointDate <= planEnd;
        });
        
        return {
          ...point,
          planId: matchingPlan?.id,
          planName: matchingPlan?.name,
        };
      });
      
      setSpendData(enhancedSpendData);

      // Calculate cost per metric from spend and GA4 data
      const costResult = calculateCostPerMetric(enhancedSpendData, result.ga4Data || [], effectiveMetricKey);
      
      if (costResult.error) {
        console.error('Cost calculation error:', costResult.error, costResult.errorDetails);
        setCacError(costResult.error);
        setCacErrorDetails(costResult.errorDetails);
        setCacMetrics([]);
      } else {
        setCacError(undefined);
        setCacErrorDetails(undefined);
        setCacMetrics(costResult.data);
      }

      if (result.errors && result.errors.length > 0) {
        console.warn('Analytics data loading warnings:', result.errors);
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

  // Load previous period data for comparison
  const loadPreviousPeriodData = async (enabled: boolean) => {
    if (!enabled) {
      setPreviousPeriodMetrics(null);
      return;
    }

    if (!clientId) return;

    setLoadingComparison(true);
    try {
      // Calculate previous period date range (same length as current)
      const startDate = parseISO(analyticsDateRange.startDate);
      const endDate = parseISO(analyticsDateRange.endDate);
      const periodLength = differenceInDays(endDate, startDate);
      
      const prevEndDate = subDays(startDate, 1);
      const prevStartDate = subDays(prevEndDate, periodLength);

      const allMetricKeys = METRIC_OPTIONS.map(m => m.value);

      const eventName = selectedMetric === 'eventCount' ? selectedEventName : null;

      const result = await fetchAnalyticsData({
        startDate: format(prevStartDate, 'yyyy-MM-dd'),
        endDate: format(prevEndDate, 'yyyy-MM-dd'),
        clientId: clientId,
        includeSpendData: true,
        metrics: allMetricKeys,
        eventName: eventName || undefined,
      });

      console.log('📊 Previous Period Analytics data result:', {
        ga4DataLength: result.ga4Data?.length || 0,
        spendDataLength: result.spendData?.length || 0,
        prevStartDate: format(prevStartDate, 'yyyy-MM-dd'),
        prevEndDate: format(prevEndDate, 'yyyy-MM-dd'),
      });

      // Enhance spend data
      const enhancedSpendData = (result.spendData || []).map(point => ({
        ...point,
      }));

      // Calculate cost per metric for previous period
      const costResult = calculateCostPerMetric(enhancedSpendData, result.ga4Data || [], selectedMetric);
      
      if (!costResult.error) {
        setPreviousPeriodMetrics(costResult.data);
      } else {
        console.warn('Previous period calculation error:', costResult.error);
        setPreviousPeriodMetrics(null);
      }
    } catch (error: any) {
      console.error('Error loading previous period data:', error);
      setPreviousPeriodMetrics(null);
    } finally {
      setLoadingComparison(false);
    }
  };

  // Export chart data as CSV
  const exportToCSV = () => {
    if (!cacMetrics || cacMetrics.length === 0) {
      setExportToast('No data to export');
      setTimeout(() => setExportToast(null), 3000);
      return;
    }

    // Get metric display name for headers and filename
    const metricLabel = METRIC_OPTIONS.find(m => m.value === selectedMetric)?.label || selectedMetric;
    const metricDisplayName = getMetricDisplayName(selectedMetric);

    // Create CSV headers
    const headers = [
      'Date',
      'Spend ($)',
      metricLabel,
      `Cost Per ${metricDisplayName} ($)`,
      '7-Day Avg ($)',
      '14-Day Avg ($)',
      '30-Day Avg ($)',
    ];

    // Create CSV rows
    const rows = cacMetrics.map(point => [
      point.date,
      point.spend?.toFixed(2) ?? '',
      point.metricValue ?? '',
      point.dailyCost?.toFixed(2) ?? '',
      point.cost_7d?.toFixed(2) ?? '',
      point.cost_14d?.toFixed(2) ?? '',
      point.cost_30d?.toFixed(2) ?? '',
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Generate filename: cost-per-{metricName}-{clientName}-{dateRange}.csv
    const clientName = (client?.name || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const dateRange = `${analyticsDateRange.startDate}-to-${analyticsDateRange.endDate}`;
    const filename = `cost-per-${selectedMetric.toLowerCase()}-${clientName}-${dateRange}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Show success toast
    setExportToast(`Exported ${cacMetrics.length} rows to ${filename}`);
    setTimeout(() => setExportToast(null), 4000);
  };

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-[#f8fafc] font-sans flex items-center justify-center">
        <p className="text-[#64748b]">Loading...</p>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-[#f8fafc] font-sans">
      <div className="container mx-auto max-w-7xl px-4 py-8">
        {/* Header Section */}
        <header role="banner" aria-label="Client dashboard header">
          <Card className="bg-white shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 ease-in-out">
            <CardContent className="py-6">
              <div className="flex items-start gap-4">
                  {/* Circular Avatar */}
                  <div 
                    className="flex-shrink-0 w-14 h-14 rounded-full bg-[#e2e8f0] flex items-center justify-center"
                    role="img"
                    aria-label="Client avatar placeholder"
                  >
                    <User className="w-8 h-8 text-[#64748b]" />
                  </div>
                  
                  {/* Client Info */}
                  <div className="flex-1">
                    {isEditingClientName ? (
                      <div className="flex items-center gap-2 h-14">
                        <Input
                          value={editingClientName}
                          onChange={(e) => setEditingClientName(e.target.value)}
                          className="text-3xl font-bold h-auto py-1 px-2"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveClientName();
                            } else if (e.key === 'Escape') {
                              handleCancelEditClientName();
                            }
                          }}
                          disabled={isSavingClientName}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={handleSaveClientName}
                          disabled={isSavingClientName || !editingClientName.trim()}
                          className="h-8 w-8"
                        >
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={handleCancelEditClientName}
                          disabled={isSavingClientName}
                          className="h-8 w-8"
                        >
                          <X className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 group h-14">
                        <h1 className="text-3xl font-bold text-[#0f172a] leading-none">
                          {client?.name || 'Client Name'}
                        </h1>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={handleStartEditClientName}
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Edit client name"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    {isEditingClientNotes ? (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          value={editingClientNotes}
                          onChange={(e) => setEditingClientNotes(e.target.value)}
                          placeholder="Add notes about this client..."
                          className="text-sm md:text-base min-h-[80px]"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              handleCancelEditClientNotes();
                            }
                          }}
                          disabled={isSavingClientNotes}
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleSaveClientNotes}
                            disabled={isSavingClientNotes}
                            className="h-7 text-xs"
                          >
                            <Check className="h-3 w-3 mr-1 text-green-600" />
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleCancelEditClientNotes}
                            disabled={isSavingClientNotes}
                            className="h-7 text-xs"
                          >
                            <X className="h-3 w-3 mr-1 text-red-600" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 group/notes">
                        {client?.notes && (
                          <p className="text-[#64748b] text-sm md:text-base whitespace-pre-wrap">
                            {client.notes}
                          </p>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={handleStartEditClientNotes}
                          className="h-6 w-6 mt-1 opacity-0 group-hover/notes:opacity-100 transition-opacity"
                          title="Edit notes"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
            </CardContent>
          </Card>
        </header>

        {/* Media Plan Builder Section */}
        <section className="mt-8" aria-label="Media plan builder">
            <Card className="bg-white shadow-md">
              <CardContent className="p-6">
                <h2 className="text-xl font-semibold text-[#0f172a] mb-4">Media Plan Builder</h2>
                {isLoadingMediaPlanBuilder ? (
                  <div className="flex items-center justify-center py-8">
                    <p className="text-[#64748b]">Loading media plan builder...</p>
                  </div>
                ) : (
                  <MediaPlanGrid 
                    channels={mediaPlanBuilderChannels}
                    onChannelsChange={handleChannelsChange}
                    commission={commission}
                    onCommissionChange={handleCommissionChange}
                  />
                )}
              </CardContent>
            </Card>
          </section>

        {/* To Do Section */}
        <TodoSection mediaPlanBuilderChannels={mediaPlanBuilderChannels} />

        {/* Media Channels Section */}
        <section className="mt-8" aria-label="Media channels budget pacing">
          <MediaChannels 
            activePlan={activePlan} 
            clientId={clientId}
            mediaPlanBuilderChannels={mediaPlanBuilderChannels}
            commission={commission}
          />
        </section>

        {/* Customer Acquisition Cost (CAC) Overview Section */}
        <section className="mt-8" aria-label="Customer acquisition cost overview">
          <div className="mb-4 flex items-center justify-between flex-wrap gap-4">
            <h2 className="text-xl font-semibold text-[#0f172a]">Cost Per {selectedMetric === 'eventCount' && selectedEventName ? selectedEventName : getMetricDisplayName(selectedMetric)} Overview</h2>
            <div className="flex items-center gap-3">
              <Select 
                value={selectedMetric} 
                onValueChange={(value) => {
                  // Allow all metrics to be selected regardless of data availability
                  // The chart will show a Data Quality Notice if no data exists
                  setSelectedMetric(value);
                  // Reset event name when switching away from eventCount
                  if (value !== 'eventCount') {
                    setSelectedEventName(null);
                  }
                }}
              >
                <SelectTrigger className="w-[200px] h-9 text-sm">
                  <SelectValue placeholder="Select metric" />
                </SelectTrigger>
                <SelectContent>
                  {METRIC_GROUPS.map((group) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 py-1.5">
                        {group.label}
                      </SelectLabel>
                      {group.metrics.map((option) => {
                        const isAvailable = availableMetrics.has(option.value);
                        return (
                          <SelectItem 
                            key={option.value} 
                            value={option.value}
                            // Removed disabled={!isAvailable} to allow all metrics to be selectable
                            className={!isAvailable ? 'text-gray-500' : ''}
                          >
                            <div className="flex items-center justify-between w-full gap-2">
                              <span>{option.label}</span>
                              {!isAvailable && (
                                <span className="text-xs text-amber-500 italic">No data</span>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {/* Event Name Selector - shown when eventCount is selected */}
              {selectedMetric === 'eventCount' && (
                <Select 
                  value={selectedEventName || ''} 
                  onValueChange={(value) => setSelectedEventName(value)}
                  disabled={loadingEventNames}
                >
                  <SelectTrigger className="w-[200px] h-9 text-sm">
                    <SelectValue placeholder={loadingEventNames ? "Loading events..." : "Select event"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableEventNames.length === 0 && !loadingEventNames ? (
                      <SelectItem value="_none" disabled>
                        No events found
                      </SelectItem>
                    ) : (
                      availableEventNames.map((event) => (
                        <SelectItem key={event.name} value={event.name}>
                          <div className="flex items-center justify-between w-full gap-2">
                            <span className="truncate">{event.name}</span>
                            <span className="text-xs text-gray-400">({event.count.toLocaleString()})</span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
              <DateRangePicker
                value={analyticsDateRange}
                onChange={setAnalyticsDateRange}
                disabled={loadingAnalytics}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={exportToCSV}
                disabled={loadingAnalytics || !cacMetrics || cacMetrics.length === 0}
                className="h-9 px-3 gap-2"
              >
                <Download className="w-4 h-4" />
                Export
              </Button>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Total Spend Card */}
            <Card className="bg-white shadow-md hover:shadow-lg transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <DollarSign className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 font-medium">Total Spend</p>
                      <p className="text-xl font-bold text-[#0f172a]">
          {loadingAnalytics ? (
                          <span className="inline-block w-20 h-6 bg-gray-200 animate-pulse rounded" />
                        ) : (
                          formatCurrency(summaryStats.totalSpend)
                        )}
                      </p>
                      {!loadingAnalytics && (
                        <TrendIndicator value={summaryStats.spendTrend} />
                      )}
                    </div>
                  </div>
                  {!loadingAnalytics && summaryStats.spendSparkline.length > 1 && (
                    <Sparkline data={summaryStats.spendSparkline} color="#10b981" />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Total Metric Value Card */}
            <Card className="bg-white shadow-md hover:shadow-lg transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Target className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 font-medium">Total {METRIC_OPTIONS.find(m => m.value === selectedMetric)?.label || 'Metric'}</p>
                      <p className="text-xl font-bold text-[#0f172a]">
                        {loadingAnalytics ? (
                          <span className="inline-block w-16 h-6 bg-gray-200 animate-pulse rounded" />
                        ) : (
                          new Intl.NumberFormat('en-US').format(summaryStats.totalMetricValue)
                        )}
                      </p>
                      {!loadingAnalytics && (
                        <TrendIndicator value={summaryStats.metricTrend} />
                      )}
                    </div>
                  </div>
                  {!loadingAnalytics && summaryStats.metricSparkline.length > 1 && (
                    <Sparkline data={summaryStats.metricSparkline} color="#3b82f6" />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Average Cost Per Metric Card */}
            <Card className="bg-white shadow-md hover:shadow-lg transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <TrendingUp className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 font-medium">Avg Cost Per {getMetricDisplayName(selectedMetric)}</p>
                      <p className="text-xl font-bold text-[#0f172a]">
                        {loadingAnalytics ? (
                          <span className="inline-block w-20 h-6 bg-gray-200 animate-pulse rounded" />
                        ) : summaryStats.averageCost !== null ? (
                          formatCurrency(summaryStats.averageCost)
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </p>
                      {!loadingAnalytics && (
                        <TrendIndicator value={summaryStats.costTrend} invertColors />
                      )}
                    </div>
                  </div>
                  {!loadingAnalytics && summaryStats.costSparkline.length > 1 && (
                    <Sparkline data={summaryStats.costSparkline} color="#8b5cf6" />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <CACChart 
            cacMetrics={cacMetrics} 
            previousPeriodMetrics={previousPeriodMetrics}
            height={400} 
            isLoading={loadingAnalytics}
            isComparisonLoading={loadingComparison}
            selectedMetric={selectedMetric}
            error={cacError}
            errorDetails={cacErrorDetails}
            onComparisonToggle={loadPreviousPeriodData}
          />
        </section>

        {/* Ad Platform Connections Section */}
        <section className="mt-8" aria-label="Ad platform connections">
          <AdPlatformConnector clientId={clientId} />
        </section>
      </div>

      {/* Edit Plan Modal */}
      {editingPlan && (
        <PlanEditForm
          plan={editingPlan}
          onClose={handleClosePlanEdit}
          onSave={handlePlanSaved}
          onDelete={handlePlanSaved}
        />
      )}

      {/* Export Toast Notification */}
      {exportToast && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-md">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{exportToast}</p>
            <button 
              onClick={() => setExportToast(null)}
              className="ml-auto text-emerald-200 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

