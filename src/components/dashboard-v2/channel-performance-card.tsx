'use client';

import { useState, useRef, useEffect } from 'react';
import { AlertTriangle, ChevronDown, ExternalLink, FileText } from 'lucide-react';
import InlineActionPoints from './inline-action-points';
import type { ChannelBenchmark, MetricPreset, ClientChannelPreset } from '@/types/database';
import { getChannelLogo } from '@/lib/utils/channel-icons';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
  ReferenceLine,
} from 'recharts';
// Note: Area, ComposedChart used by the spend chart section below

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MetricKey = 'impressions' | 'clicks' | 'ctr' | 'cpc' | 'conversions';
const ALL_METRIC_KEYS: MetricKey[] = ['impressions', 'clicks', 'ctr', 'cpc', 'conversions'];

export interface ChannelCardProps {
  channel: {
    name: string;
    platform: 'meta-ads' | 'google-ads' | string;
    status: 'healthy' | 'attention' | 'excellent';
    currentSpend: number;
    plannedSpend: number;
    pacingPercentage: number;
    metrics: {
      impressions: number;
      clicks: number;
      ctr: number;
      cpc: number;
      conversions: number;
    };
    issues?: string[];
    chartData?: Array<{
      date: string;
      actualSpend: number | null;
      plannedSpend: number;
      projectedSpend?: number | null;
    }>;
    metricsChartData?: Array<{
      date: string;
      impressions: number;
      clicks: number;
      ctr: number;
      cpc: number;
      conversions: number;
    }>;
    isMultiMonth?: boolean;
  };
  selectedMonth?: Date;
  /** When provided (multi-month ranges), skips the single-month filter and enables multi-month axis labels. */
  dateRange?: { startDate: string; endDate: string };
  onAdjust?: () => void;
  onViewReport?: () => void;
  clientId?: string;
  channelStartDate?: Date | null;
  refetchTrigger?: number;
  benchmarks?: ChannelBenchmark[];
  presets?: MetricPreset[];
  clientChannelPresets?: ClientChannelPreset[];
  onPresetSaved?: (updated: ClientChannelPreset) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(value: number, style: 'currency' | 'percent' | 'decimal' = 'decimal', digits = 0): string {
  if (style === 'currency') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  }
  if (style === 'percent') {
    return `${value.toFixed(digits)}%`;
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
}

const STATUS_CONFIG = {
  excellent:  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', bar: '#10b981', label: 'Excellent' },
  healthy:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500',    bar: '#3b82f6', label: 'Healthy'   },
  attention:  { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500',   bar: '#f59e0b', label: 'Attention' },
} as const;

const PLATFORM_COLORS: Record<string, string> = {
  'meta-ads':   '#1877f2',
  'google-ads': '#34a853',
};

const METRIC_CONFIG: Record<MetricKey, {
  label: string;
  shortLabel: string;
  color: string;
  formatValue: (v: number) => string;
  formatAxis: (v: number) => string;
  formatTooltip: (v: number) => string;
}> = {
  impressions: {
    label: 'Impressions',
    shortLabel: 'Impr',
    color: '#6366f1',
    formatValue:   (v) => fmt(v, 'decimal', 0),
    formatAxis:    (v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v)),
    formatTooltip: (v) => fmt(v, 'decimal', 0),
  },
  clicks: {
    label: 'Clicks',
    shortLabel: 'Clicks',
    color: '#3b82f6',
    formatValue:   (v) => fmt(v, 'decimal', 0),
    formatAxis:    (v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v)),
    formatTooltip: (v) => fmt(v, 'decimal', 0),
  },
  ctr: {
    label: 'CTR',
    shortLabel: 'CTR',
    color: '#8b5cf6',
    formatValue:   (v) => fmt(v * 100, 'percent', 2),
    formatAxis:    (v) => `${(v * 100).toFixed(1)}%`,
    formatTooltip: (v) => fmt(v * 100, 'percent', 2),
  },
  cpc: {
    label: 'CPC',
    shortLabel: 'CPC',
    color: '#f59e0b',
    formatValue:   (v) => fmt(v, 'currency', 2),
    formatAxis:    (v) => `$${v.toFixed(2)}`,
    formatTooltip: (v) => fmt(v, 'currency', 2),
  },
  conversions: {
    label: 'Conversions',
    shortLabel: 'Conv',
    color: '#10b981',
    formatValue:   (v) => fmt(v, 'decimal', 0),
    formatAxis:    (v) => String(Math.round(v)),
    formatTooltip: (v) => fmt(v, 'decimal', 0),
  },
};

// Map platform/channel name to benchmark channel_name used in the DB
function inferBenchmarkChannelName(platform: string, channelName: string): string {
  const lower = (platform + ' ' + channelName).toLowerCase();
  if (lower.includes('meta') || lower.includes('facebook')) return 'Meta Ads';
  if (lower.includes('display')) return 'Google Display';
  if (lower.includes('google')) return 'Google Ads';
  return channelName;
}

// Real metric values keyed by metric_key (matches benchmark seed keys)
function getRealValue(
  metricKey: string,
  metrics: ChannelCardProps['channel']['metrics']
): number | null {
  switch (metricKey) {
    case 'ctr':         return metrics.ctr * 100;  // stored as 0-1, benchmark is %
    case 'cpc':         return metrics.cpc;
    case 'impressions': return metrics.impressions;
    case 'clicks':      return metrics.clicks;
    case 'conversions': return metrics.conversions;
    default:            return null;
  }
}

function formatBenchmarkValue(value: number, unit: string): string {
  if (unit === '%')  return `${value}%`;
  if (unit === '$')  return `$${value}`;
  if (unit === 'x')  return `${value}x`;
  return `${value}${unit ? ` ${unit}` : ''}`;
}

function formatRealValue(value: number, unit: string): string {
  if (unit === '%')  return `${value.toFixed(2)}%`;
  if (unit === '$')  return `$${value.toFixed(2)}`;
  if (unit === 'x')  return `${value.toFixed(2)}x`;
  return value >= 1000
    ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
    : `${value}`;
}

function BenchmarkRow({
  benchmark,
  realValue,
}: {
  benchmark: ChannelBenchmark;
  realValue: number | null;
}) {
  const hasReal = realValue !== null && realValue > 0;
  const isGood = hasReal
    ? benchmark.direction === 'higher_is_better'
      ? realValue >= benchmark.benchmark_value
      : realValue <= benchmark.benchmark_value
    : null;

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500 truncate flex-1 min-w-0 pr-2">{benchmark.metric_label}</span>
      <div className="flex items-center gap-2 flex-shrink-0">
        {hasReal && (
          <>
            <span className={`text-xs font-semibold ${isGood ? 'text-emerald-600' : 'text-red-500'}`}>
              {formatRealValue(realValue, benchmark.unit)}
            </span>
            <span className="text-xs text-gray-300">vs</span>
          </>
        )}
        <span className="text-xs text-gray-400">
          {formatBenchmarkValue(benchmark.benchmark_value, benchmark.unit)}
        </span>
        {hasReal && (
          <span className={`text-xs ${isGood ? 'text-emerald-500' : 'text-red-400'}`}>
            {isGood ? '↑' : '↓'}
          </span>
        )}
      </div>
    </div>
  );
}

/** Simple inline platform icon using the brand initial */
function PlatformIcon({ platform }: { platform: string }) {
  // Convert platform to channel name format for logo lookup
  const channelName = platform === 'meta-ads' ? 'Meta Ads'
    : platform === 'google-ads' ? 'Google Ads'
    : platform === 'linkedin-ads' ? 'LinkedIn Ads'
    : platform === 'tiktok-ads' ? 'TikTok Ads'
    : platform === 'instagram-ads' ? 'Instagram Ads'
    : platform;
  
  return (
    <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
      {getChannelLogo(channelName, "w-8 h-8")}
    </div>
  );
}

function StatusBadge({ status }: { status: ChannelCardProps['channel']['status'] }) {
  const c = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Pacing progress bar
// ---------------------------------------------------------------------------

function PacingBar({
  pacingPercentage,
  currentSpend,
  plannedSpend,
  status,
}: {
  pacingPercentage: number;
  currentSpend: number;
  plannedSpend: number;
  status: ChannelCardProps['channel']['status'];
}) {
  // Calculate fill percentage based on actual spend vs planned spend
  const spendRatio = plannedSpend > 0 ? (currentSpend / plannedSpend) * 100 : 0;
  const fillPct  = Math.min(100, spendRatio);
  const barColor = spendRatio > 100 ? '#ef4444' : STATUS_CONFIG[status].bar;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>Pacing</span>
        <span className={pacingPercentage > 100 ? 'text-red-600 font-medium' : pacingPercentage < 85 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}>
          {fmt(pacingPercentage, 'percent', 0)} of target
        </span>
      </div>
      <div className="relative h-2 w-full rounded-full bg-gray-100 overflow-visible">
        {/* Fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{ width: `${fillPct}%`, backgroundColor: barColor }}
        />
        {/* Target pin at 100% */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-gray-400"
          style={{ left: 'calc(100% - 1px)' }}
          title="Planned target"
        />
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>{fmt(currentSpend, 'currency', 0)} spent</span>
        <span>{fmt(plannedSpend, 'currency', 0)} planned</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetricSlot — metric pill with inline benchmark + swap dropdown
// ---------------------------------------------------------------------------

function MetricSlot({
  metricKey,
  displayValue,
  benchmark,
  realValue,
  isActive,
  hasMetrics,
  availableSwaps,
  onChart,
  onSwap,
}: {
  metricKey: MetricKey;
  displayValue: string;
  benchmark: ChannelBenchmark | undefined;
  realValue: number | null;
  isActive: boolean;
  hasMetrics: boolean;
  availableSwaps: MetricKey[];
  onChart: () => void;
  onSwap: (newKey: MetricKey) => void;
}) {
  const [swapOpen, setSwapOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cfg = METRIC_CONFIG[metricKey];

  const hasReal = realValue !== null && realValue > 0;
  const isGood = benchmark && hasReal
    ? benchmark.direction === 'higher_is_better'
      ? realValue! >= benchmark.benchmark_value
      : realValue! <= benchmark.benchmark_value
    : null;

  // Close swap dropdown on outside click
  useEffect(() => {
    if (!swapOpen) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setSwapOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [swapOpen]);

  return (
    <div ref={ref} style={{ flex: 1, minWidth: 60, position: 'relative' }}>
      {/* Label + swap trigger */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 2 }}>
        <span style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>
          {cfg.shortLabel}
        </span>
        {availableSwaps.length > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); setSwapOpen(v => !v); }}
            title="Swap metric"
            style={{
              background: 'none', border: 'none', padding: '0 1px', cursor: 'pointer',
              color: '#d1d5db', fontSize: 8, lineHeight: 1, display: 'flex', alignItems: 'center',
            }}
          >▾</button>
        )}
      </div>

      {/* Value */}
      {hasMetrics ? (
        <button
          onClick={onChart}
          style={{
            display: 'block', width: '100%', textAlign: 'left',
            background: isActive ? `${cfg.color}12` : 'transparent',
            border: 'none', borderRadius: 4, padding: '1px 3px', cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
            color: isActive ? cfg.color : '#1f2937',
            transition: 'background 0.15s',
          }}
          title={`View ${cfg.label} over time`}
        >
          {displayValue}
        </button>
      ) : (
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', display: 'block', padding: '1px 3px' }}>
          {displayValue}
        </span>
      )}

      {/* Benchmark */}
      {benchmark ? (
        <div style={{ fontSize: 9, marginTop: 2, padding: '0 3px', display: 'flex', alignItems: 'center', gap: 2 }}>
          <span style={{ color: '#d1d5db' }}>bm</span>
          <span style={{ fontWeight: 500, color: isGood === null ? '#9ca3af' : isGood ? '#10b981' : '#ef4444' }}>
            {formatBenchmarkValue(benchmark.benchmark_value, benchmark.unit)}
            {isGood !== null && (isGood ? ' ↑' : ' ↓')}
          </span>
        </div>
      ) : (
        <div style={{ height: 14 }} />
      )}

      {/* Swap dropdown */}
      {swapOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 30,
          background: 'white', border: '1px solid #e5e7eb', borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 110, overflow: 'hidden',
        }}>
          {availableSwaps.map(k => (
            <button
              key={k}
              onClick={() => { onSwap(k); setSwapOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '6px 10px', fontSize: 11, color: '#374151',
                background: 'transparent', border: 'none', cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {METRIC_CONFIG[k].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

// Helper to normalize channel name to channel_type format
function normalizeChannelType(channelName: string): string {
  // Convert to title case: "META ADS" -> "Meta Ads"
  return channelName
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function ChannelPerformanceCard({ channel, selectedMonth, dateRange, onAdjust, onViewReport, clientId, channelStartDate, refetchTrigger, benchmarks, presets, clientChannelPresets, onPresetSaved }: ChannelCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [chartType, setChartType] = useState<'spend' | 'metrics'>('spend');
  const [selectedMetrics, setSelectedMetrics] = useState<Set<MetricKey>>(new Set(['impressions']));
  const [presetOpen, setPresetOpen] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const [displayedMetrics, setDisplayedMetrics] = useState<MetricKey[]>(ALL_METRIC_KEYS);

  // Benchmark / preset derived values
  const benchmarkChannelName = inferBenchmarkChannelName(channel.platform, channel.name);
  const channelBenchmarks = (benchmarks ?? []).filter(b => b.channel_name === benchmarkChannelName);
  const channelPresets = (presets ?? []).filter(p => p.channel_name === benchmarkChannelName);
  const savedPreset = (clientChannelPresets ?? []).find(p => p.channel_name === channel.name);
  const activePresetName = savedPreset?.preset_name ?? (channelPresets[0]?.name ?? null);
  const activePreset = channelPresets.find(p => p.name === activePresetName) ?? channelPresets[0] ?? null;

  const handlePresetSelect = async (presetName: string) => {
    setPresetOpen(false);
    // Filter displayed metrics to those in the preset
    const preset = channelPresets.find(p => p.name === presetName);
    if (preset && preset.metrics.length > 0) {
      const validKeys = preset.metrics.filter(k => (METRIC_CONFIG as any)[k]) as MetricKey[];
      if (validKeys.length > 0) {
        setDisplayedMetrics(validKeys);
        // Keep selectedMetrics in sync
        setSelectedMetrics(prev => {
          const filtered = [...prev].filter(k => validKeys.includes(k));
          return new Set(filtered.length > 0 ? filtered : [validKeys[0]]);
        });
      }
    } else {
      setDisplayedMetrics(ALL_METRIC_KEYS);
    }
    if (!clientId) return;
    setSavingPreset(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/channel-presets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_name: channel.name, preset_name: presetName, custom_metrics: [] }),
      });
      if (res.ok) {
        const { data } = await res.json();
        onPresetSaved?.(data);
      }
    } finally {
      setSavingPreset(false);
    }
  };

  const handleSwapMetric = (slotIdx: number, newKey: MetricKey) => {
    setDisplayedMetrics(prev => prev.map((k, i) => i === slotIdx ? newKey : k));
    // If swapped metric was selected for chart, update selection
    setSelectedMetrics(prev => {
      const oldKey = displayedMetrics[slotIdx];
      if (prev.has(oldKey)) {
        const next = new Set(prev);
        next.delete(oldKey);
        next.add(newKey);
        return next;
      }
      return prev;
    });
  };

  const hasIssues     = (channel.issues?.length ?? 0) > 0;
  const hasChartData  = (channel.chartData?.length ?? 0) > 0;
  // hasMetrics is true only when there's at least one day with real data (not all zeros)
  const hasMetrics    = (channel.metricsChartData ?? []).some(
    p => p.impressions > 0 || p.clicks > 0 || p.conversions > 0
  );
  const canExpand     = hasChartData || hasMetrics;

  const isMetricsView = isExpanded && chartType === 'metrics';

  // Toggle a metric in/out of the selected set; always keep at least one selected.
  // Also expands the card and switches to metrics view on first click.
  const handleMetricClick = (key: MetricKey) => {
    setIsExpanded(true);
    setChartType('metrics');
    setSelectedMetrics(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Derive the visible window of chart data. For single-month mode, restrict
  // to the selectedMonth so the chart doesn't spill into adjacent months.
  // For multi-month mode (dateRange provided), trust the pre-scoped chart data.
  let baseChartData = channel.chartData ?? [];
  if (!dateRange && selectedMonth instanceof Date) {
    const targetMonth = selectedMonth.getMonth();
    const targetYear  = selectedMonth.getFullYear();
    baseChartData = baseChartData.filter((point) => {
      const d = new Date(point.date);
      if (isNaN(d.getTime())) return false;
      return d.getMonth() === targetMonth && d.getFullYear() === targetYear;
    });
  }

  // Then trim to the range where we actually have spend values.
  const fullChartData = baseChartData;
  let visibleChartData = fullChartData;

  if (fullChartData.length > 0) {
    let firstIdx = 0;
    let lastIdx = fullChartData.length - 1;

    const firstWithActual = fullChartData.findIndex(
      (p) => p.actualSpend !== null && typeof p.actualSpend === 'number'
    );
    const lastWithActual = (() => {
      for (let i = fullChartData.length - 1; i >= 0; i--) {
        const p = fullChartData[i];
        if (p.actualSpend !== null && typeof p.actualSpend === 'number') {
          return i;
        }
      }
      return -1;
    })();

    if (firstWithActual !== -1 && lastWithActual !== -1 && firstWithActual <= lastWithActual) {
      firstIdx = firstWithActual;
      lastIdx = lastWithActual;
    }

    visibleChartData = fullChartData.slice(firstIdx, lastIdx + 1);
    if (visibleChartData.length === 0) {
      visibleChartData = fullChartData;
    }
  }

  // Build month labels for the visible range.
  const monthLabels: { key: string; month: string; position: number; widthPct: number; firstDate: string }[] = [];
  if (visibleChartData.length > 0) {
    const spans: Record<string, { startIdx: number; endIdx: number; firstDate: string }> = {};

    visibleChartData.forEach((point, idx) => {
      const d = new Date(point.date);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!spans[key]) {
        spans[key] = { startIdx: idx, endIdx: idx, firstDate: point.date };
      } else {
        spans[key].endIdx = idx;
      }
    });

    const total     = Math.max(1, visibleChartData.length - 1);
    const totalDays = visibleChartData.length;

    Object.entries(spans).forEach(([key, span]) => {
      const [yearStr, monthIndexStr] = key.split('-');
      const year       = Number(yearStr);
      const monthIndex = Number(monthIndexStr);
      const midIdx     = span.startIdx + (span.endIdx - span.startIdx) / 2;
      const position   = total === 0 ? 0.5 : midIdx / total;
      const dayCount   = span.endIdx - span.startIdx + 1;
      const widthPct   = totalDays > 0 ? (dayCount / totalDays) * 100 : 100 / Object.keys(spans).length;
      const monthName  = new Date(year, monthIndex, 1).toLocaleString('en-US', { month: 'long' });
      monthLabels.push({ key, month: monthName, position, widthPct, firstDate: span.firstDate });
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200">
      {/* ── Main layout: Left (Spend/Metrics) + Right (Action Points) ── */}
      <div className="flex">
        {/* ── Left Section: Spend & Metrics ── */}
        <div className={`flex-1 ${clientId ? 'border-r border-gray-200' : ''}`}>
          {/* ── Header + Pacing (aligned under logo → spend) ── */}
          <div className="px-4 pt-4 pb-3">
            <div className="grid grid-cols-[auto,1fr,auto] gap-x-3 gap-y-3 items-start">
              {/* Logo */}
              <div className="row-start-1 col-start-1">
                <PlatformIcon platform={channel.platform} />
              </div>

              {/* Channel name + status */}
              <div className="row-start-1 col-start-2 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold truncate" style={{ color: '#1C1917', fontFamily: "'Inter', system-ui, sans-serif" }}>{channel.name}</h3>
                  <StatusBadge status={channel.status} />
                </div>
                <p className="text-xs text-gray-400 mt-0.5 capitalize">
                  {channel.platform.replace('-', ' ')}
                </p>
              </div>

              {/* Spend summary */}
              <div className="row-start-1 col-start-3 text-right flex-shrink-0">
                <p className="text-sm font-bold text-gray-900">
                  {fmt(channel.currentSpend, 'currency', 0)}
                </p>
                <p className="text-xs text-gray-400">
                  of {fmt(channel.plannedSpend, 'currency', 0)}
                </p>
              </div>

              {/* Pacing bar spans from under logo to under spend */}
              <div className="row-start-2 col-start-1 col-end-4">
                <PacingBar
                  pacingPercentage={channel.pacingPercentage}
                  currentSpend={channel.currentSpend}
                  plannedSpend={channel.plannedSpend}
                  status={channel.status}
                />
              </div>
            </div>
          </div>

          {/* ── Metrics: Preset selector + Metric slots with inline benchmarks ── */}
          <div className="px-4 pb-3 border-t border-gray-50 pt-3">
            {/* Preset selector */}
            {channelPresets.length > 0 && (
              <div className="relative mb-3">
                <button
                  onClick={() => setPresetOpen(v => !v)}
                  disabled={savingPreset}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <span className="font-medium">{activePresetName ?? 'Select preset'}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                {presetOpen && (
                  <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-md py-1 min-w-[140px]">
                    {channelPresets.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handlePresetSelect(p.name)}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${p.name === activePresetName ? 'font-medium text-blue-600' : 'text-gray-700'}`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Metric slots — shown metrics with benchmarks inline */}
            <div style={{ display: 'flex', gap: 4 }}>
              {displayedMetrics.map((key, slotIdx) => {
                const rawValue = channel.metrics[key];
                const displayValue = key === 'ctr'
                  ? fmt(rawValue * 100, 'percent', 2)
                  : key === 'cpc'
                    ? fmt(rawValue, 'currency', 2)
                    : fmt(rawValue, 'decimal', 0);
                const benchmark = channelBenchmarks.find(b => b.metric_key === key);
                const realValue = getRealValue(key, channel.metrics);
                const availableSwaps = ALL_METRIC_KEYS.filter(k => k !== key && !displayedMetrics.includes(k));
                return (
                  <MetricSlot
                    key={`${slotIdx}-${key}`}
                    metricKey={key}
                    displayValue={displayValue}
                    benchmark={benchmark}
                    realValue={realValue}
                    isActive={isMetricsView && selectedMetrics.has(key)}
                    hasMetrics={hasMetrics}
                    availableSwaps={availableSwaps}
                    onChart={() => handleMetricClick(key)}
                    onSwap={(newKey) => handleSwapMetric(slotIdx, newKey)}
                  />
                );
              })}
            </div>
          </div>

          {/* ── Issues warning ── */}
          {hasIssues && (
            <div className="mx-4 mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <ul className="space-y-0.5">
                {channel.issues!.map((issue, i) => (
                  <li key={i} className="text-xs text-amber-700">{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Action bar: Spend/Metrics centred + Adjust/Report right ── */}
          <div className="flex items-center px-4 py-2 border-t border-gray-50 gap-2">
            {/* Left spacer */}
            <div className="flex-1" />

            {/* Spend / Metrics toggle — centred */}
            {canExpand && (
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setChartType('spend')}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    chartType === 'spend'
                      ? 'bg-white font-medium shadow-sm text-gray-900'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Spend
                </button>
                <button
                  onClick={() => { setChartType('metrics'); if (hasMetrics) setIsExpanded(true); }}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    chartType === 'metrics'
                      ? 'bg-white font-medium shadow-sm text-gray-900'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Metrics
                </button>
              </div>
            )}

            {/* Right: Adjust + Report */}
            <div className="flex-1 flex items-center justify-end gap-2">
              {onAdjust && (
                <button
                  onClick={onAdjust}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  Open
                </button>
              )}
              {onViewReport && (
                <button
                  onClick={onViewReport}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <FileText className="w-3 h-3" />
                  Report
                </button>
              )}
            </div>
          </div>

          {/* ── Chart section ── */}
          {canExpand && (
            <div className="border-t border-gray-100">
              <div className="bg-gray-50">
                <div className={`relative${!isExpanded ? ' h-40 overflow-hidden' : ''}`}>
                  <div className="px-4 pt-4 pb-2">
                    {/* ── Spend chart ── */}
              {chartType === 'spend' && (
                <>
                  {hasChartData ? (
                    <>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart
                            data={visibleChartData}
                            margin={{ top: 10, right: 16, left: 0, bottom: 8 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 11 }}
                              tickMargin={6}
                              tickFormatter={(value) => new Date(value).getDate().toString()}
                              interval={
                                visibleChartData.length > 60 ? 6
                                : visibleChartData.length > 35 ? 4
                                : 0
                              }
                            />
                            <YAxis
                              tick={{ fontSize: 12 }}
                              tickFormatter={(value) => `$${value}`}
                              width={56}
                            />
                            <defs>
                              <linearGradient id="actualSpendGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%"   stopColor="#10b981" stopOpacity={0.35} />
                                <stop offset="50%"  stopColor="#10b981" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <Tooltip
                              formatter={(value: any) => [`$${Number(value).toFixed(2)}`, '']}
                              labelFormatter={(label) => new Date(label).toLocaleDateString()}
                            />
                            {monthLabels.length > 1 && monthLabels.slice(1).map(ml => (
                              <ReferenceLine
                                key={ml.key}
                                x={ml.firstDate}
                                stroke="#d1d5db"
                                strokeDasharray="4 2"
                                strokeWidth={1.5}
                              />
                            ))}
                            <Area
                              type="monotone"
                              dataKey="plannedSpend"
                              fill="#d1d5db"
                              stroke="#9ca3af"
                              fillOpacity={0.4}
                              name="Planned Spend"
                            />
                            <Area
                              type="monotone"
                              dataKey="actualSpend"
                              stroke="#10b981"
                              strokeWidth={2}
                              fill="url(#actualSpendGradient)"
                              fillOpacity={1}
                              name="Actual Spend"
                              dot={{ r: visibleChartData.length > 35 ? 0 : 3 }}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>

                      {isExpanded && monthLabels.length > 0 && (
                        <div
                          className="flex mt-1"
                          style={{ paddingLeft: 56, paddingRight: 16 }}
                        >
                          {monthLabels.map(ml => (
                            <span
                              key={ml.key}
                              className="text-xs font-semibold text-gray-600 text-center truncate"
                              style={{ width: `${ml.widthPct}%` }}
                            >
                              {ml.month}
                            </span>
                          ))}
                        </div>
                      )}

                      {isExpanded && (
                        <div className="mt-2 flex items-center justify-end">
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span className="flex items-center gap-1.5">
                              <span className="w-3 h-0.5 rounded-full bg-emerald-500 inline-block" />
                              Actual Spend
                            </span>
                            <span className="flex items-center gap-1.5">
                              <span className="w-3 h-3 rounded-sm bg-gray-200 border border-gray-400 inline-block" />
                              Planned Spend
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-8">No spend data available for this period.</p>
                  )}
                </>
              )}

              {/* ── Metrics chart (only in expanded state) ── */}
              {chartType === 'metrics' && isExpanded && (
                <>
                  <div className="flex items-center gap-1.5 mb-4 flex-wrap">
                    {(Object.keys(METRIC_CONFIG) as MetricKey[]).map((key) => {
                      const cfg = METRIC_CONFIG[key];
                      const isActive = selectedMetrics.has(key);
                      return (
                        <button
                          key={key}
                          onClick={() => handleMetricClick(key)}
                          className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-all ${
                            isActive
                              ? 'text-white border-transparent'
                              : 'text-gray-600 bg-white border-gray-200 hover:border-gray-300'
                          }`}
                          style={isActive ? { backgroundColor: cfg.color, borderColor: cfg.color } : undefined}
                        >
                          {cfg.shortLabel}
                        </button>
                      );
                    })}
                  </div>

                  {hasMetrics ? (() => {
                    const selectedKeys = (Object.keys(METRIC_CONFIG) as MetricKey[]).filter(k => selectedMetrics.has(k));
                    const axisMode: 'single' | 'dual' | 'hidden' =
                      selectedKeys.length === 1 ? 'single'
                      : selectedKeys.length === 2 ? 'dual'
                      : 'hidden';
                    const dataLen = channel.metricsChartData?.length ?? 0;

                    return (
                      <>
                        {axisMode === 'hidden' && (
                          <p className="text-xs text-gray-400 mb-2 text-right">
                            Relative scale — each line scaled independently
                          </p>
                        )}
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                              data={channel.metricsChartData}
                              margin={{ top: 10, right: axisMode === 'dual' ? 64 : 16, left: 0, bottom: 8 }}
                            >
                              <defs>
                                {selectedKeys.map(key => (
                                  <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={METRIC_CONFIG[key].color} stopOpacity={0.18} />
                                    <stop offset="50%" stopColor={METRIC_CONFIG[key].color} stopOpacity={0.06} />
                                    <stop offset="100%" stopColor={METRIC_CONFIG[key].color} stopOpacity={0} />
                                  </linearGradient>
                                ))}
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis
                                dataKey="date"
                                tick={{ fontSize: 11 }}
                                tickMargin={6}
                                tickFormatter={(value: string) => {
                                  const parts = value.split('-');
                                  if (parts.length !== 3) return value;
                                  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                                  const month = monthNames[parseInt(parts[1], 10) - 1] ?? '';
                                  const day   = parseInt(parts[2], 10);
                                  return `${month} ${day}`;
                                }}
                                interval={
                                  dataLen > 60 ? 9
                                  : dataLen > 35 ? 5
                                  : dataLen > 14 ? 2
                                  : 0
                                }
                              />
                              {selectedKeys.map((key, i) => (
                                <YAxis
                                  key={key}
                                  yAxisId={key}
                                  orientation={i === 0 ? 'left' : 'right'}
                                  hide={axisMode === 'hidden'}
                                  tick={{ fontSize: 11 }}
                                  tickFormatter={METRIC_CONFIG[key].formatAxis}
                                  width={axisMode !== 'hidden' ? 60 : 0}
                                  stroke={axisMode === 'dual' ? METRIC_CONFIG[key].color : '#6b7280'}
                                />
                              ))}
                              <Tooltip
                                formatter={(value: any, name: any) => {
                                  const cfg = METRIC_CONFIG[name as MetricKey];
                                  return cfg ? [cfg.formatTooltip(Number(value)), cfg.label] : [value, name];
                                }}
                                labelFormatter={(label: string) => {
                                  const parts = label.split('-');
                                  if (parts.length !== 3) return label;
                                  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                                  const month = monthNames[parseInt(parts[1], 10) - 1] ?? '';
                                  const day   = parseInt(parts[2], 10);
                                  return `${month} ${day}, ${parts[0]}`;
                                }}
                              />
                              {selectedKeys.map(key => (
                                <Area
                                  key={`area-${key}`}
                                  yAxisId={key}
                                  type="monotone"
                                  dataKey={key}
                                  stroke="none"
                                  fill={`url(#grad-${key})`}
                                  dot={false}
                                  activeDot={false}
                                  legendType="none"
                                  tooltipType="none"
                                  name={`__area_${key}`}
                                />
                              ))}
                              {selectedKeys.map(key => (
                                <Line
                                  key={key}
                                  yAxisId={key}
                                  type="monotone"
                                  dataKey={key}
                                  stroke={METRIC_CONFIG[key].color}
                                  strokeWidth={2}
                                  dot={{ r: dataLen > 35 ? 0 : 3, fill: METRIC_CONFIG[key].color }}
                                  activeDot={{ r: 5 }}
                                  name={key}
                                />
                              ))}
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </>
                    );
                  })() : (
                    <p className="text-xs text-gray-400 text-center py-8">No metrics data available for this period.</p>
                  )}
                </>
              )}
                  </div>

                  {/* Gradient fade — only when collapsed */}
                  {!isExpanded && (
                    <div
                      className="absolute inset-x-0 bottom-0 h-20 pointer-events-none"
                      style={{ background: 'linear-gradient(to top, #f9fafb 10%, transparent)' }}
                    />
                  )}
                </div>

                {/* See More / See Less button */}
                <div className="flex justify-center pb-3 pt-1">
                  <button
                    onClick={() => setIsExpanded(prev => !prev)}
                    className="px-4 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full transition-colors"
                  >
                    {isExpanded ? '▲ See Less' : '▼ See More'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right Section: Action Points ── */}
        {clientId && (
          <div className="flex-shrink-0 w-64 bg-white">
            <div className="px-4 pt-4 pb-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>Action Points</h3>
              <InlineActionPoints
                channelType={normalizeChannelType(channel.name)}
                clientId={clientId}
                channelStartDate={channelStartDate}
                maxVisible={3}
                showBorder={false}
                showTitle={false}
                refetchTrigger={refetchTrigger}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
