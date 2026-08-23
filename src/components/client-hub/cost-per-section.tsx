'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subDays, differenceInDays, format, parseISO } from 'date-fns';
import { sectionTitleStyle } from './tokens';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { CACChart } from '@/components/ui/cac-chart';
import { getChannelDisplayNameFromPlatform } from '@/lib/utils/channel-pacing';
import {
  calculateCostPerMetric,
  calculateCostPerPlatformMetric,
  extractPlatformEventOptions,
  type SpendDataPoint,
  type GA4DataPoint,
  type CostMetricPoint,
  type MetricSource,
  type PlatformEventOption,
} from '@/lib/api/analytics-data-integration';

export interface CostPerSectionProps {
  clientId: string;
  token?: string;
  editable: boolean;
}

const METRIC_OPTIONS = [
  { value: 'activeUsers', label: 'Active Users' },
  { value: 'totalUsers', label: 'Total Users' },
  { value: 'newUsers', label: 'New Users' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'engagedSessions', label: 'Engaged Sessions' },
  { value: 'eventCount', label: 'Events' },
  { value: 'bounceRate', label: 'Bounces (inverted)' },
];

interface EnhancedSpendPoint extends SpendDataPoint {
  channelId: string;
  channelName: string;
}

function defaultRange() {
  const end = new Date();
  const start = subDays(end, 29);
  return { startDate: format(start, 'yyyy-MM-dd'), endDate: format(end, 'yyyy-MM-dd') };
}

export function CostPerSection({ clientId, token, editable }: CostPerSectionProps) {
  const [dateRange, setDateRange] = useState(defaultRange);
  const [loading, setLoading] = useState(true);
  const [spendData, setSpendData] = useState<EnhancedSpendPoint[]>([]);
  const [ga4Data, setGa4Data] = useState<GA4DataPoint[]>([]);

  const [selectedMetric, setSelectedMetric] = useState<string>('conversions');
  const [selectedMetricSource, setSelectedMetricSource] = useState<MetricSource>('ga4');
  const [selectedPlatformMetricKey, setSelectedPlatformMetricKey] = useState('clicks');
  const [selectedEventName, setSelectedEventName] = useState<string | null>(null);
  const [availableEventNames, setAvailableEventNames] = useState<Array<{ name: string; count: number }>>([]);
  const [loadingEventNames, setLoadingEventNames] = useState(false);
  const metricSourceInitialisedRef = useRef(false);

  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<string>>(new Set());

  const [previousPeriodMetrics, setPreviousPeriodMetrics] = useState<CostMetricPoint[] | null>(null);
  const [loadingComparison, setLoadingComparison] = useState(false);

  const fetchRange = useCallback(async (startDate: string, endDate: string) => {
    const res = token
      ? await fetch(`/api/hub/${token}/cost-per-metric?start=${startDate}&end=${endDate}`)
      : await fetch(`/api/clients/${clientId}/analytics-data?startDate=${startDate}&endDate=${endDate}`);
    const data = await res.json();
    if (!res.ok || !data.success) return { spendData: [] as SpendDataPoint[], ga4Data: [] as GA4DataPoint[] };
    return { spendData: (data.spendData || []) as SpendDataPoint[], ga4Data: (data.ga4Data || []) as GA4DataPoint[] };
  }, [clientId, token]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchRange(dateRange.startDate, dateRange.endDate);

      const enhanced: EnhancedSpendPoint[] = result.spendData.map(point => ({
        ...point,
        channelId: point.platform && point.accountName ? `${point.platform}_${point.accountName}` : point.platform || 'unknown',
        channelName: getChannelDisplayNameFromPlatform(point.platform),
      }));

      setSpendData(enhanced);
      setGa4Data(result.ga4Data);

      if (!metricSourceInitialisedRef.current && enhanced.length > 0) {
        metricSourceInitialisedRef.current = true;
        const hasMeta = enhanced.some(p => p.platform === 'meta-ads');
        const hasGoogle = enhanced.some(p => p.platform === 'google-ads');
        if (hasMeta) setSelectedMetricSource('meta');
        else if (hasGoogle) setSelectedMetricSource('google');
      }

      setSelectedChannels(prev => {
        if (prev.size > 0) return prev;
        const ids = new Set(enhanced.map(p => p.channelId));
        return ids.size > 0 ? ids : prev;
      });
    } finally {
      setLoading(false);
    }
  }, [fetchRange, dateRange]);

  useEffect(() => { load(); }, [dateRange]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editable || selectedMetricSource !== 'ga4' || selectedMetric !== 'eventCount') return;
    if (availableEventNames.length > 0) return;
    setLoadingEventNames(true);
    fetch('/api/ads/google-analytics/event-names', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.eventNames) {
          setAvailableEventNames(data.eventNames);
          if (!selectedEventName && data.eventNames.length > 0) setSelectedEventName(data.eventNames[0].name);
        }
      })
      .catch(() => setAvailableEventNames([]))
      .finally(() => setLoadingEventNames(false));
  }, [editable, clientId, selectedMetricSource, selectedMetric]); // eslint-disable-line react-hooks/exhaustive-deps

  const availableChannels = useMemo(() => {
    const map = new Map<string, string>();
    spendData.forEach(p => { if (p.channelId && p.channelName) map.set(p.channelId, p.channelName); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [spendData]);

  const availableCampaigns = useMemo(() => {
    const map = new Map<string, { name: string; channelId: string }>();
    spendData.forEach(p => {
      if (p.campaignId && p.campaignName && !map.has(p.campaignId)) {
        map.set(p.campaignId, { name: p.campaignName, channelId: p.channelId });
      }
    });
    return Array.from(map.entries()).map(([id, { name, channelId }]) => ({ id, name, channelId }));
  }, [spendData]);

  const availablePlatformEvents: PlatformEventOption[] = useMemo(() => extractPlatformEventOptions(spendData), [spendData]);

  const availableMetrics = useMemo(() => {
    const set = new Set<string>();
    METRIC_OPTIONS.forEach(m => {
      const hasData = ga4Data.some(point => {
        const value = (point as Record<string, unknown>)[m.value];
        return value !== null && value !== undefined && value !== '' && Number(value) > 0;
      });
      if (hasData) set.add(m.value);
    });
    return set;
  }, [ga4Data]);

  const filteredSpendData = useMemo(() => {
    return spendData.filter(point => {
      if (selectedChannels.size > 0 && point.channelId && !selectedChannels.has(point.channelId)) return false;
      if (selectedCampaignIds.size > 0 && point.campaignId && !selectedCampaignIds.has(point.campaignId)) return false;
      return true;
    });
  }, [spendData, selectedChannels, selectedCampaignIds]);

  const { cacMetrics, cacError, cacErrorDetails } = useMemo(() => {
    const result = selectedMetricSource !== 'ga4'
      ? calculateCostPerPlatformMetric(filteredSpendData, selectedPlatformMetricKey, selectedMetricSource)
      : calculateCostPerMetric(filteredSpendData, ga4Data, selectedMetric);
    return { cacMetrics: result.data, cacError: result.error, cacErrorDetails: result.errorDetails };
  }, [filteredSpendData, ga4Data, selectedMetric, selectedMetricSource, selectedPlatformMetricKey]);

  const handleComparisonToggle = useCallback(async (enabled: boolean) => {
    if (!enabled) { setPreviousPeriodMetrics(null); return; }
    setLoadingComparison(true);
    try {
      const start = parseISO(dateRange.startDate);
      const end = parseISO(dateRange.endDate);
      const periodLength = differenceInDays(end, start);
      const prevEnd = subDays(start, 1);
      const prevStart = subDays(prevEnd, periodLength);
      const result = await fetchRange(format(prevStart, 'yyyy-MM-dd'), format(prevEnd, 'yyyy-MM-dd'));
      const costResult = selectedMetricSource !== 'ga4'
        ? calculateCostPerPlatformMetric(result.spendData, selectedPlatformMetricKey, selectedMetricSource)
        : calculateCostPerMetric(result.spendData, result.ga4Data, selectedMetric);
      setPreviousPeriodMetrics(costResult.error ? null : costResult.data);
    } catch {
      setPreviousPeriodMetrics(null);
    } finally {
      setLoadingComparison(false);
    }
  }, [dateRange, fetchRange, selectedMetric, selectedMetricSource, selectedPlatformMetricKey]);

  const metricOptionsForMode = editable ? METRIC_OPTIONS : METRIC_OPTIONS.filter(m => m.value !== 'eventCount');

  if (!editable && !loading && spendData.length === 0 && ga4Data.length === 0) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Cost per metric</h2>
        <DateRangePicker value={dateRange} onChange={setDateRange} disabled={loading} />
      </div>

      <CACChart
        cacMetrics={cacMetrics}
        previousPeriodMetrics={previousPeriodMetrics}
        height={340}
        isLoading={loading}
        isComparisonLoading={loadingComparison}
        selectedMetric={selectedMetric}
        error={cacError}
        errorDetails={cacErrorDetails}
        onComparisonToggle={handleComparisonToggle}
        availableChannels={availableChannels}
        selectedChannels={selectedChannels}
        onChannelsChange={setSelectedChannels}
        onMetricChange={(m) => {
          setSelectedMetric(m);
          if (m !== 'eventCount') setSelectedEventName(null);
        }}
        availableMetrics={availableMetrics}
        availableEventNames={editable ? availableEventNames : []}
        selectedEventName={editable ? selectedEventName : null}
        onEventNameChange={editable ? setSelectedEventName : undefined}
        loadingEventNames={loadingEventNames}
        metricSource={selectedMetricSource}
        onMetricSourceChange={setSelectedMetricSource}
        availablePlatformEvents={availablePlatformEvents}
        selectedPlatformMetricKey={selectedPlatformMetricKey}
        onPlatformMetricChange={setSelectedPlatformMetricKey}
        availableCampaigns={availableCampaigns}
        selectedCampaignIds={selectedCampaignIds}
        onCampaignIdsChange={setSelectedCampaignIds}
        metricOptions={metricOptionsForMode}
      />
    </div>
  );
}
