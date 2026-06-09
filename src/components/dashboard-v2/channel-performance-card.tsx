'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { differenceInDays, parseISO } from 'date-fns';
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

type MetricKey = 'impressions' | 'clicks' | 'ctr' | 'cpc' | 'conversions' | 'conv_events';
const ALL_METRIC_KEYS: MetricKey[] = ['impressions', 'clicks', 'ctr', 'cpc', 'conv_events'];

export interface ChannelCardProps {
  channel: {
    id?: string;
    name: string;
    platform: 'meta-ads' | 'google-ads' | string;
    status: 'healthy' | 'attention' | 'excellent';
    currentSpend: number;
    plannedSpend: number;
    grossPlannedSpend?: number;
    pacingPercentage: number;
    metrics: {
      impressions: number;
      clicks: number;
      ctr: number;
      cpc: number;
      conversions: number;
    };
    format?: string;
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
    campaigns?: Array<{ id: string; name: string }>;
    metaCampaignIds?: string[];
    rawSpendPoints?: any[];
  };
  selectedMonth?: Date;
  /** When provided (multi-month ranges), skips the single-month filter and enables multi-month axis labels. */
  dateRange?: { startDate: string; endDate: string };
  onAdjust?: () => void;
  onViewReport?: () => void;
  onReconnect?: () => void;
  clientId?: string;
  channelStartDate?: Date | null;
  channelFlights?: { startWeek: Date | string; endWeek: Date | string }[];
  refetchTrigger?: number;
  benchmarks?: ChannelBenchmark[];
  presets?: MetricPreset[];
  clientChannelPresets?: ClientChannelPreset[];
  onPresetSaved?: (updated: ClientChannelPreset) => void;
  onCampaignSelectionChange?: (channelKey: string, ids: string[]) => void;
  planView?: 'gross' | 'net';
  headerActions?: React.ReactNode;
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
  conv_events: {
    label: 'Conv. Events',
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
  metrics: ChannelCardProps['channel']['metrics'] & { conv_events?: number }
): number | null {
  switch (metricKey) {
    case 'ctr':         return metrics.ctr * 100;
    case 'cpc':         return metrics.cpc;
    case 'impressions': return metrics.impressions;
    case 'clicks':      return metrics.clicks;
    case 'conversions': return metrics.conversions;
    case 'conv_events': return metrics.conv_events ?? null;
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
      <span className="text-base text-gray-500 truncate flex-1 min-w-0 pr-2">{benchmark.metric_label}</span>
      <div className="flex items-center gap-2 flex-shrink-0">
        {hasReal && (
          <>
            <span className={`text-base font-semibold ${isGood ? 'text-emerald-600' : 'text-red-500'}`}>
              {formatRealValue(realValue, benchmark.unit)}
            </span>
            <span className="text-base text-gray-300">vs</span>
          </>
        )}
        <span className="text-base text-gray-400">
          {formatBenchmarkValue(benchmark.benchmark_value, benchmark.unit)}
        </span>
        {hasReal && (
          <span className={`text-base ${isGood ? 'text-emerald-500' : 'text-red-400'}`}>
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
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-base font-medium border ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Pacing progress bar
// ---------------------------------------------------------------------------

function PacingBar({
  currentSpend,
  plannedSpend,
  plannedLabel,
  status,
}: {
  currentSpend: number;
  plannedSpend: number;
  plannedLabel?: string;
  status: ChannelCardProps['channel']['status'];
}) {
  const spendRatio = plannedSpend > 0 ? (currentSpend / plannedSpend) * 100 : 0;
  const fillPct    = Math.min(100, spendRatio);
  const barColor   = spendRatio > 100 ? '#ef4444' : STATUS_CONFIG[status].bar;
  const displayPct = Math.round(spendRatio);

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-base text-gray-500">
        <span>Pacing</span>
        <span className={displayPct > 100 ? 'text-red-600 font-medium' : displayPct < 85 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}>
          {fmt(displayPct, 'percent', 0)} of target
        </span>
      </div>
      <div className="relative h-2 w-full rounded-full bg-gray-100 overflow-visible">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{ width: `${fillPct}%`, backgroundColor: barColor }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-gray-400"
          style={{ left: 'calc(100% - 1px)' }}
          title="Planned target"
        />
      </div>
      <div className="flex justify-between text-base text-gray-400">
        <span>{fmt(currentSpend, 'currency', 0)} spent</span>
        <span>{fmt(plannedSpend, 'currency', 0)}{plannedLabel ? ` ${plannedLabel}` : ' planned'}</span>
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
  actionTypes,
  selectedActionType,
  onActionTypeChange,
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
  actionTypes?: string[];
  selectedActionType?: string;
  onActionTypeChange?: (type: string) => void;
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

  const [actionOpen, setActionOpen] = useState(false);
  const [actionSearch, setActionSearch] = useState('');
  const actionRef = useRef<HTMLDivElement>(null);
  const actionSearchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!actionOpen) return;
    setActionSearch('');
    setTimeout(() => actionSearchRef.current?.focus(), 0);
    function handleClick(e: MouseEvent) {
      if (actionRef.current && !actionRef.current.contains(e.target as Node)) setActionOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [actionOpen]);

  return (
    <div ref={ref} style={{ flex: 1, minWidth: 60, position: 'relative' }}>
      {/* Label + swap trigger */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 2 }}>
        <span style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>
          {cfg.shortLabel}
        </span>
        {availableSwaps.length > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); setSwapOpen(v => !v); }}
            title="Swap metric"
            style={{
              background: 'none', border: 'none', padding: '0 1px', cursor: 'pointer',
              color: '#d1d5db', fontSize: 11, lineHeight: 1, display: 'flex', alignItems: 'center',
            }}
          >▾</button>
        )}
      </div>

      {/* Action-type picker for conv_events */}
      {metricKey === 'conv_events' && (
        <div ref={actionRef} style={{ position: 'relative', marginBottom: 3 }}>
          <button
            onClick={(e) => { e.stopPropagation(); setActionOpen(v => !v); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 2,
              background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8,
              padding: '1px 5px', cursor: 'pointer', maxWidth: 110, overflow: 'hidden',
            }}
          >
            <span style={{ fontSize: 12, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 90 }}>
              {selectedActionType ? actionTypeLabel(selectedActionType) : 'Select event'}
            </span>
            <span style={{ color: '#9ca3af', fontSize: 11, flexShrink: 0 }}>▾</span>
          </button>
          {actionOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 40, marginTop: 2,
              background: 'white', border: '1px solid #e5e7eb', borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)', minWidth: 200,
            }}>
              <div style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>
                <input
                  ref={actionSearchRef}
                  value={actionSearch}
                  onChange={e => setActionSearch(e.target.value)}
                  placeholder="Search events..."
                  onClick={e => e.stopPropagation()}
                  style={{
                    width: '100%', border: '1px solid #e5e7eb', borderRadius: 4,
                    padding: '3px 7px', fontSize: 14, outline: 'none', color: '#374151',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                {(() => {
                  const filtered = (actionTypes ?? []).filter(t =>
                    actionTypeLabel(t).toLowerCase().includes(actionSearch.toLowerCase())
                  );
                  if (filtered.length === 0) {
                    return <div style={{ padding: '8px 10px', fontSize: 14, color: '#9ca3af' }}>No events found</div>;
                  }
                  return filtered.map(type => (
                    <button
                      key={type}
                      onClick={() => { onActionTypeChange?.(type); setActionOpen(false); }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '6px 10px', fontSize: 14,
                        color: type === selectedActionType ? '#2563eb' : '#374151',
                        fontWeight: type === selectedActionType ? 600 : 400,
                        background: type === selectedActionType ? '#eff6ff' : 'transparent',
                        border: 'none', cursor: 'pointer',
                      }}
                      onMouseEnter={e => { if (type !== selectedActionType) (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
                      onMouseLeave={e => { if (type !== selectedActionType) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      {actionTypeLabel(type)}
                    </button>
                  ));
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Value */}
      {hasMetrics ? (
        <button
          onClick={onChart}
          style={{
            display: 'block', width: '100%', textAlign: 'left',
            background: isActive ? `${cfg.color}12` : 'transparent',
            border: 'none', borderRadius: 8, padding: '1px 3px', cursor: 'pointer',
            fontSize: 16, fontWeight: 600,
            color: isActive ? cfg.color : '#1f2937',
            transition: 'background 0.15s',
          }}
          title={`View ${cfg.label} over time`}
        >
          {displayValue}
        </button>
      ) : (
        <span style={{ fontSize: 16, fontWeight: 600, color: '#1f2937', display: 'block', padding: '1px 3px' }}>
          {displayValue}
        </span>
      )}

      {/* Benchmark */}
      {benchmark ? (
        <div style={{ fontSize: 12, marginTop: 2, padding: '0 3px', display: 'flex', alignItems: 'center', gap: 2 }}>
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
                padding: '6px 10px', fontSize: 14, color: '#374151',
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

// Human-readable labels for common Meta action types
const ACTION_TYPE_LABELS: Record<string, string> = {
  'lead':                                              'Leads',
  'offsite_conversion.fb_pixel_purchase':              'Purchases',
  'offsite_conversion.fb_pixel_add_to_cart':           'Add to Cart',
  'offsite_conversion.fb_pixel_initiate_checkout':     'Checkout Started',
  'offsite_conversion.fb_pixel_complete_registration': 'Registrations',
  'offsite_conversion.fb_pixel_lead':                  'Pixel Leads',
  'offsite_conversion.fb_pixel_view_content':          'Content Views',
  'offsite_conversion.fb_pixel_search':                'Searches',
  'link_click':                                        'Link Clicks',
  'landing_page_view':                                 'Landing Page Views',
  'post_engagement':                                   'Post Engagement',
  'page_engagement':                                   'Page Engagement',
  'video_view':                                        'Video Views',
  'omni_purchase':                                     'Omni Purchases',
  'omni_add_to_cart':                                  'Omni Add to Cart',
};

function actionTypeLabel(type: string): string {
  return ACTION_TYPE_LABELS[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Helper to normalize channel name to channel_type format
function normalizeChannelType(channelName: string): string {
  return channelName
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Map channel platform + name to the canonical channel_type stored in action_points.
// Uses platform first (already resolved by getPlatformForChannel) so uploaded plans
// with variant names like "-Search", "Paid Search", "SEM" all resolve correctly.
function inferActionPointChannelType(platform: string, channelName: string): string {
  if (platform === 'meta-ads') return 'Meta Ads';
  if (platform === 'google-ads') return 'Google Ads';
  if (platform === 'linkedin-ads') return 'LinkedIn Ads';
  if (platform === 'tiktok-ads') return 'TikTok Ads';
  if (platform === 'snapchat-ads') return 'Snapchat Ads';
  if (platform === 'pinterest-ads') return 'Pinterest Ads';
  if (platform === 'instagram-ads') return 'Instagram Ads';
  return normalizeChannelType(channelName);
}

export default function ChannelPerformanceCard({ channel, selectedMonth, dateRange, onAdjust, onViewReport, onReconnect, clientId, channelStartDate, channelFlights, refetchTrigger, benchmarks, presets, clientChannelPresets, onPresetSaved, onCampaignSelectionChange, planView, headerActions }: ChannelCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [chartType, setChartType] = useState<'spend' | 'metrics'>('spend');
  const [selectedMetrics, setSelectedMetrics] = useState<Set<MetricKey>>(new Set(['impressions']));
  const [presetOpen, setPresetOpen] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const [displayedMetrics, setDisplayedMetrics] = useState<MetricKey[]>(ALL_METRIC_KEYS);
  const NONE_SENTINEL = '__none__';

  const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined' || !clientId) return new Set();
    try {
      const saved = localStorage.getItem(`channel-campaigns-${clientId}-${channel.id ?? channel.name}`);
      if (saved) return new Set(JSON.parse(saved) as string[]);
      // No saved selection — pre-select onboarding campaigns if configured, otherwise "Not set up yet"
      if (channel.metaCampaignIds?.length) {
        return new Set(channel.metaCampaignIds);
      }
      return new Set([NONE_SENTINEL]);
    } catch { return new Set(); }
  });

  const isNoneSelected = selectedCampaignIds.size === 1 && selectedCampaignIds.has(NONE_SENTINEL);

  // Notify parent whenever selection changes so it can recompute the total spend
  useEffect(() => {
    if (!onCampaignSelectionChange) return;
    const channelKey = channel.id ?? channel.name;
    onCampaignSelectionChange(channelKey, [...selectedCampaignIds]);
  // Only fire on actual selection changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCampaignIds]);
  const [campaignDropdownOpen, setCampaignDropdownOpen] = useState(false);
  const [campaignSearch, setCampaignSearch] = useState('');
  const campaignDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!campaignDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (campaignDropdownRef.current && !campaignDropdownRef.current.contains(e.target as Node)) {
        setCampaignDropdownOpen(false);
        setCampaignSearch('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [campaignDropdownOpen]);

  const toggleCampaign = (id: string) => {
    setSelectedCampaignIds(prev => {
      const next = new Set(prev);
      next.delete(NONE_SENTINEL);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (clientId) {
        try { localStorage.setItem(`channel-campaigns-${clientId}-${channel.id ?? channel.name}`, JSON.stringify([...next])); } catch {}
      }
      return next;
    });
  };

  const campaignSubtitle = (() => {
    if (isNoneSelected) return 'NOT SET UP YET';
    const campaigns = channel.campaigns;
    if (!campaigns || campaigns.length === 0) return null;
    const allSelected = selectedCampaignIds.size === 0 || selectedCampaignIds.size === campaigns.length;
    const selected = allSelected ? campaigns : campaigns.filter(c => selectedCampaignIds.has(c.id));
    if (selected.length === 0) return 'ALL CAMPAIGNS';
    if (selected.length === 1) return selected[0].name.toUpperCase();
    return `${selected[0].name.toUpperCase()} + ${selected.length - 1} MORE`;
  })();

  const convEventStorageKey = `conv-event-${clientId ?? ''}-${channel.id ?? channel.name}`;
  const [selectedActionType, setSelectedActionType] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(convEventStorageKey) ?? '';
  });
  const [actionDropdownOpen, setActionDropdownOpen] = useState(false);
  const actionDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!actionDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (actionDropdownRef.current && !actionDropdownRef.current.contains(e.target as Node)) {
        setActionDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [actionDropdownOpen]);

  const handleSetSelectedActionType = (type: string) => {
    setSelectedActionType(type);
    if (typeof window !== 'undefined') {
      localStorage.setItem(convEventStorageKey, type);
    }
  };

  // Names of selected campaigns — used as a fallback when stored campaign IDs don't
  // match the campaign_id values returned by the Meta Insights API (e.g. due to ID
  // format differences between the onboarding flow and the API).
  const selectedCampaignNames = useMemo(() => {
    if (isNoneSelected || selectedCampaignIds.size === 0) return null;
    const names = new Set<string>();
    (channel.campaigns ?? []).forEach(c => {
      if (selectedCampaignIds.has(c.id)) names.add(c.name);
    });
    return names;
  }, [isNoneSelected, selectedCampaignIds, channel.campaigns]);

  // Returns true if a rawSpendPoint belongs to one of the selected campaigns.
  // Checks by campaign ID first; falls back to campaign name when IDs diverge.
  const matchesSelection = useCallback((p: any): boolean => {
    if (selectedCampaignIds.has(p.campaignId)) return true;
    if (selectedCampaignNames && p.campaignName) return selectedCampaignNames.has(p.campaignName);
    return false;
  }, [selectedCampaignIds, selectedCampaignNames]);

  // Returns true if every selected campaign has at least one rawSpendPoint.
  // Checks by ID first; falls back to name for campaigns whose IDs don't match.
  const allSelectedRepresented = useCallback((pts: any[]): boolean => {
    const repIds  = new Set(pts.map((p: any) => p.campaignId).filter(Boolean));
    const repNames = new Set(pts.map((p: any) => p.campaignName).filter(Boolean));
    return [...selectedCampaignIds].every(id => {
      if (repIds.has(id)) return true;
      const campaign = (channel.campaigns ?? []).find(c => c.id === id);
      return campaign ? repNames.has(campaign.name) : false;
    });
  }, [selectedCampaignIds, channel.campaigns]);

  // Derive unique action types from raw spend points
  const availableActionTypes = useMemo(() => {
    if (isNoneSelected) return [];
    const pts = selectedCampaignIds.size === 0
      ? (channel.rawSpendPoints ?? [])
      : (channel.rawSpendPoints ?? []).filter(matchesSelection);
    const seen = new Set<string>();
    pts.forEach((p: any) => {
      (p.actions ?? []).forEach((a: any) => {
        if (a.action_type) seen.add(a.action_type);
      });
    });
    return Array.from(seen).sort();
  }, [selectedCampaignIds, channel.rawSpendPoints, matchesSelection]);

  // Auto-select first action type only when no persisted value exists
  useEffect(() => {
    if (availableActionTypes.length > 0 && !availableActionTypes.includes(selectedActionType)) {
      const persisted = typeof window !== 'undefined' ? localStorage.getItem(convEventStorageKey) : null;
      if (!persisted || !availableActionTypes.includes(persisted)) {
        handleSetSelectedActionType(availableActionTypes[0]);
      }
    }
  }, [availableActionTypes]);

  // Helper: sum action value for a given type across a set of raw points
  const sumActionType = (pts: any[], actionType: string): number =>
    pts.reduce((s: number, p: any) => {
      const found = (p.actions ?? []).find((a: any) => a.action_type === actionType);
      return s + (found ? parseFloat(found.value || '0') : 0);
    }, 0);

  const filteredMetrics = useMemo(() => {
    if (isNoneSelected) return { impressions: 0, clicks: 0, spend: 0, ctr: 0, cpc: 0, conversions: 0, conv_events: 0 };

    if (selectedCampaignIds.size === 0) {
      const allPts = channel.rawSpendPoints ?? [];
      if (!allPts.length) return { ...channel.metrics, spend: channel.currentSpend, conv_events: 0 };
      const impressions = allPts.reduce((s: number, p: any) => s + (p.impressions ?? 0), 0);
      const clicks = allPts.reduce((s: number, p: any) => s + (p.clicks ?? 0), 0);
      const spend = allPts.reduce((s: number, p: any) => s + (p.spend ?? 0), 0);
      const conversions = allPts.reduce((s: number, p: any) => s + (p.conversions ?? 0), 0);
      const conv_events = selectedActionType ? sumActionType(allPts, selectedActionType) : 0;
      return { impressions, clicks, spend, ctr: impressions > 0 ? clicks / impressions : 0, cpc: clicks > 0 ? spend / clicks : 0, conversions, conv_events };
    }

    const pts = (channel.rawSpendPoints ?? []).filter(matchesSelection);

    // If any selected campaign can't be identified in rawSpendPoints (ID+name mismatch),
    // estimate spend by subtraction: total − spend of identifiable non-selected campaigns.
    if (!pts.length || !allSelectedRepresented(pts)) {
      const allPts = channel.rawSpendPoints ?? [];
      if (!allPts.length) return { ...channel.metrics, spend: channel.currentSpend, conv_events: 0 };

      const totalRawSpend = allPts.reduce((s: number, p: any) => s + (p.spend ?? 0), 0);
      const notSelectedSpend = allPts.reduce((s: number, p: any) => {
        if (!p.campaignId && !p.campaignName) return s; // unidentifiable — skip
        if (matchesSelection(p)) return s; // belongs to a selected campaign — skip
        return s + (p.spend ?? 0);
      }, 0);
      const estimatedSpend = Math.max(0, totalRawSpend - notSelectedSpend);

      const impressions = pts.reduce((s: number, p: any) => s + (p.impressions ?? 0), 0);
      const clicks = pts.reduce((s: number, p: any) => s + (p.clicks ?? 0), 0);
      const conversions = pts.reduce((s: number, p: any) => s + (p.conversions ?? 0), 0);
      const conv_events = selectedActionType ? sumActionType(pts, selectedActionType) : 0;

      return {
        impressions,
        clicks,
        spend: estimatedSpend,
        ctr: impressions > 0 ? clicks / impressions : 0,
        cpc: clicks > 0 ? estimatedSpend / clicks : 0,
        conversions,
        conv_events,
      };
    }

    const impressions = pts.reduce((s: number, p: any) => s + (p.impressions ?? 0), 0);
    const clicks = pts.reduce((s: number, p: any) => s + (p.clicks ?? 0), 0);
    const spend = pts.reduce((s: number, p: any) => s + (p.spend ?? 0), 0);
    const conversions = pts.reduce((s: number, p: any) => s + (p.conversions ?? 0), 0);
    const conv_events = selectedActionType ? sumActionType(pts, selectedActionType) : 0;

    return {
      impressions,
      clicks,
      spend,
      ctr: impressions > 0 ? clicks / impressions : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      conversions,
      conv_events,
    };
  }, [selectedCampaignIds, selectedActionType, channel.rawSpendPoints, channel.metrics, matchesSelection, allSelectedRepresented]);

  const filteredMetricsChartData = useMemo(() => {
    if (isNoneSelected) return [];
    const pts = selectedCampaignIds.size === 0
      ? (channel.rawSpendPoints ?? [])
      : (channel.rawSpendPoints ?? []).filter(matchesSelection);

    if (pts.length > 0 && selectedCampaignIds.size > 0 && !allSelectedRepresented(pts)) {
      return channel.metricsChartData;
    }

    if (!pts.length) return channel.metricsChartData;

    const byDate = new Map<string, { impressions: number; clicks: number; spend: number; conversions: number; conv_events: number }>();
    pts.forEach((p: any) => {
      const existing = byDate.get(p.date) ?? { impressions: 0, clicks: 0, spend: 0, conversions: 0, conv_events: 0 };
      const eventVal = selectedActionType
        ? parseFloat((p.actions ?? []).find((a: any) => a.action_type === selectedActionType)?.value || '0')
        : 0;
      byDate.set(p.date, {
        impressions: existing.impressions + (p.impressions ?? 0),
        clicks: existing.clicks + (p.clicks ?? 0),
        spend: existing.spend + (p.spend ?? 0),
        conversions: existing.conversions + (p.conversions ?? 0),
        conv_events: existing.conv_events + eventVal,
      });
    });
    return Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, vals]) => ({
        date,
        impressions: vals.impressions,
        clicks: vals.clicks,
        ctr: vals.impressions > 0 ? vals.clicks / vals.impressions : 0,
        cpc: vals.clicks > 0 ? vals.spend / vals.clicks : 0,
        conversions: vals.conversions,
        conv_events: vals.conv_events,
      }));
  }, [selectedCampaignIds, selectedActionType, channel.rawSpendPoints, channel.metricsChartData, matchesSelection, allSelectedRepresented]);

  // Filtered spend chart data — rebuilds actualSpend from rawSpendPoints when campaigns are selected
  const filteredSpendChartData = useMemo(() => {
    if (isNoneSelected) return (channel.chartData ?? []).map(p => ({ ...p, actualSpend: null }));
    if (selectedCampaignIds.size === 0) return channel.chartData ?? [];
    const allPts = channel.rawSpendPoints ?? [];
    const pts = allPts.filter(matchesSelection);

    // Build a per-date map for the subtraction approach when some selected campaigns
    // can't be matched in rawSpendPoints (ID+name mismatch).
    const useSubtraction = !pts.length || !allSelectedRepresented(pts);

    const spendByDate = new Map<string, number>();

    if (useSubtraction) {
      // Estimate daily spend = total daily − daily spend of identifiable non-selected campaigns
      if (!allPts.length) return channel.chartData ?? [];
      const totalByDate = new Map<string, number>();
      const notSelectedByDate = new Map<string, number>();
      allPts.forEach((p: any) => {
        const d = p.date;
        totalByDate.set(d, (totalByDate.get(d) ?? 0) + (p.spend ?? 0));
        if (p.campaignId || p.campaignName) {
          if (!matchesSelection(p)) {
            notSelectedByDate.set(d, (notSelectedByDate.get(d) ?? 0) + (p.spend ?? 0));
          }
        }
      });
      totalByDate.forEach((total, d) => {
        spendByDate.set(d, Math.max(0, total - (notSelectedByDate.get(d) ?? 0)));
      });
    } else {
      // All selected campaigns are represented — sum directly
      pts.forEach((p: any) => {
        spendByDate.set(p.date, (spendByDate.get(p.date) ?? 0) + (p.spend ?? 0));
      });
    }

    // Determine the range of dates we have actual data for
    const spendDates = [...spendByDate.keys()].sort();
    const firstSpendDate = spendDates[0];
    const lastSpendDate  = spendDates[spendDates.length - 1];

    // Accumulate daily values into a cumulative line (matching how chartData is built)
    let runningTotal = 0;
    return (channel.chartData ?? []).map(point => {
      if (!firstSpendDate || point.date < firstSpendDate) {
        return { ...point, actualSpend: null };
      }
      runningTotal += spendByDate.get(point.date) ?? 0;
      return {
        ...point,
        actualSpend: point.date <= lastSpendDate ? runningTotal : null,
      };
    });
  }, [selectedCampaignIds, channel.rawSpendPoints, channel.chartData, matchesSelection, allSelectedRepresented]);

  // ── Overspend forecast ───────────────────────────────────────────────────────
  // Projects end-of-period spend from current daily burn rate.
  const overspendForecast = useMemo(() => {
    if (isNoneSelected) return null;
    const spend = filteredMetrics.spend;
    const planned = channel.plannedSpend;
    if (!spend || spend <= 0 || !planned || planned <= 0) return null;

    const now = new Date();
    let periodStartStr: string;
    let periodEndStr: string;

    if (dateRange) {
      periodStartStr = dateRange.startDate;
      periodEndStr = dateRange.endDate;
    } else if (selectedMonth) {
      const y = selectedMonth.getFullYear();
      const m = selectedMonth.getMonth();
      const lastDay = new Date(y, m + 1, 0).getDate();
      periodStartStr = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      periodEndStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    } else {
      return null;
    }

    const periodStart = parseISO(periodStartStr);
    const periodEnd = parseISO(periodEndStr);

    if (now > periodEnd) return null;

    const totalDays = Math.max(1, differenceInDays(periodEnd, periodStart) + 1);
    const daysElapsed = Math.max(1, Math.min(totalDays, differenceInDays(now, periodStart) + 1));
    const daysRemaining = Math.max(0, differenceInDays(periodEnd, now));

    if (daysRemaining === 0) return null;

    const dailyBurnRate = spend / daysElapsed;
    const projectedEndSpend = spend + dailyBurnRate * daysRemaining;
    const overspendAmount = projectedEndSpend - planned;
    const overspendPct = (overspendAmount / planned) * 100;

    return { projectedEndSpend, overspendAmount, overspendPct, dailyBurnRate, daysRemaining };
  }, [isNoneSelected, filteredMetrics.spend, channel.plannedSpend, dateRange, selectedMonth]);

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

  const reconnectIssue = channel.issues?.find(i =>
    /reconnect|connection not found/i.test(i)
  ) ?? null;
  const regularIssues = channel.issues?.filter(i =>
    !/reconnect|connection not found/i.test(i)
  ) ?? [];
  const hasIssues     = regularIssues.length > 0 || !!reconnectIssue;
  const hasChartData  = (channel.chartData?.length ?? 0) > 0;
  // hasMetrics is true only when there's at least one day with real data (not all zeros)
  const hasMetrics    = (filteredMetricsChartData ?? []).some(
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
  let baseChartData = filteredSpendChartData;
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

    // Only trim the right side — cut off future dates beyond the last actual data point.
    // Do NOT trim the left: if the selected campaign started mid-period (e.g. Feb in a
    // YTD view), we still want January on the X-axis so the full analytics range is shown.
    if (lastWithActual !== -1) {
      lastIdx = lastWithActual;
    }

    visibleChartData = fullChartData.slice(firstIdx, lastIdx + 1);
    if (visibleChartData.length === 0) {
      visibleChartData = fullChartData;
    }
  }

  // Extend visibleChartData with projected spend points for future dates.
  // The projected line continues from the last actual point to period-end.
  const chartDataWithProjection: Array<typeof visibleChartData[0] & { projectedSpend?: number | null }> = (() => {
    if (!overspendForecast || !visibleChartData.length) {
      return visibleChartData.map(p => ({ ...p, projectedSpend: null as number | null }));
    }

    let lastActualSpend: number | null = null;
    let lastActualDate: string | null = null;

    for (let i = visibleChartData.length - 1; i >= 0; i--) {
      const p = visibleChartData[i];
      if (p.actualSpend !== null && typeof p.actualSpend === 'number') {
        lastActualSpend = p.actualSpend;
        lastActualDate = p.date;
        break;
      }
    }

    if (lastActualSpend === null || !lastActualDate) {
      return visibleChartData.map(p => ({ ...p, projectedSpend: null as number | null }));
    }

    const lastActualMs = parseISO(lastActualDate).getTime();
    const msPerDay = 86400000;

    // Mark the last actual point as the projection anchor; include future points from fullChartData
    const withProjection = visibleChartData.map((p, i) => ({
      ...p,
      projectedSpend: i === visibleChartData.length - 1 && typeof p.actualSpend === 'number'
        ? p.actualSpend
        : null as number | null,
    }));

    // Append future (post-actual) points from the full period data
    const futurePoints = fullChartData
      .filter(p => parseISO(p.date).getTime() > lastActualMs)
      .map(p => {
        const daysAfter = Math.round((parseISO(p.date).getTime() - lastActualMs) / msPerDay);
        return {
          ...p,
          actualSpend: null,
          projectedSpend: lastActualSpend! + overspendForecast.dailyBurnRate * daysAfter,
        };
      });

    return [...withProjection, ...futurePoints];
  })();

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
                  {(channel.platform === 'google-ads' || channel.platform === 'meta-ads' || (channel.campaigns && channel.campaigns.length > 0)) ? (
                    <div ref={campaignDropdownRef} className="relative min-w-0 flex-shrink-0">
                      <button
                        onClick={() => setCampaignDropdownOpen(v => !v)}
                        className="flex flex-col items-start gap-0 text-left min-w-0"
                      >
                        <div className="flex items-center gap-1">
                          <h3 className="text-base font-bold" style={{ color: '#1C1917', fontFamily: "'Inter', system-ui, sans-serif" }}>
                            {channel.name.toUpperCase()}
                            {campaignSubtitle && (
                              <span className="text-gray-500"> — {campaignSubtitle}</span>
                            )}
                          </h3>
                          <ChevronDown className="w-3 h-3 flex-shrink-0 text-gray-400" />
                        </div>
                      </button>
                      {campaignDropdownOpen && (
                        <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[240px] max-w-[320px]">
                          {/* Search */}
                          <div className="px-2 pt-2 pb-1 border-b border-gray-100">
                            <input
                              autoFocus
                              type="text"
                              placeholder="Search campaigns…"
                              value={campaignSearch}
                              onChange={e => setCampaignSearch(e.target.value)}
                              onClick={e => e.stopPropagation()}
                              className="w-full text-base px-2 py-1.5 border border-gray-200 rounded-md outline-none focus:border-blue-400 placeholder-gray-400"
                            />
                          </div>
                          <div className="max-h-56 overflow-y-auto py-1">
                            {/* All Campaigns — hidden when searching */}
                            {!campaignSearch && (
                              <button
                                onClick={() => { setSelectedCampaignIds(new Set()); if (clientId) { try { localStorage.setItem(`channel-campaigns-${clientId}-${channel.id ?? channel.name}`, JSON.stringify([])); } catch {} } }}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 text-base transition-colors border-b border-gray-100 ${!isNoneSelected && selectedCampaignIds.size === 0 ? 'font-semibold text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'}`}
                              >
                                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${!isNoneSelected && selectedCampaignIds.size === 0 ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                                  {!isNoneSelected && selectedCampaignIds.size === 0 && <span className="text-white text-[8px] leading-none">✓</span>}
                                </span>
                                All Campaigns
                              </button>
                            )}
                            {/* Not set up yet — hidden when searching */}
                            {!campaignSearch && (
                              <button
                                onClick={() => {
                                  const next = new Set([NONE_SENTINEL]);
                                  setSelectedCampaignIds(next);
                                  if (clientId) { try { localStorage.setItem(`channel-campaigns-${clientId}-${channel.id ?? channel.name}`, JSON.stringify([...next])); } catch {} }
                                  setCampaignDropdownOpen(false);
                                  setCampaignSearch('');
                                }}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 text-base transition-colors border-b border-gray-100 ${isNoneSelected ? 'font-semibold text-amber-600 bg-amber-50' : 'text-gray-600 hover:bg-gray-50'}`}
                              >
                                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${isNoneSelected ? 'bg-amber-500 border-amber-500' : 'border-gray-300'}`}>
                                  {isNoneSelected && <span className="text-white text-[8px] leading-none">✓</span>}
                                </span>
                                Not set up yet
                              </button>
                            )}
                            {channel.campaigns
                              .filter(c => !campaignSearch || c.name.toLowerCase().includes(campaignSearch.toLowerCase()))
                              .map(c => {
                                const checked = selectedCampaignIds.has(c.id);
                                return (
                                  <button
                                    key={c.id}
                                    onClick={() => toggleCampaign(c.id)}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-base transition-colors hover:bg-gray-50 text-gray-700"
                                  >
                                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                                      {checked && <span className="text-white text-[8px] leading-none">✓</span>}
                                    </span>
                                    <span className="truncate text-left">{c.name}</span>
                                  </button>
                                );
                              })}
                            {campaignSearch && channel.campaigns.filter(c => c.name.toLowerCase().includes(campaignSearch.toLowerCase())).length === 0 && (
                              <p className="px-3 py-2 text-base text-gray-400">No campaigns match</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <h3 className="text-base font-bold truncate" style={{ color: '#1C1917', fontFamily: "'Inter', system-ui, sans-serif" }}>{channel.name}</h3>
                  )}
                </div>
                {channel.format && (
                  <p className="text-base text-gray-500 mt-0.5 uppercase tracking-wide">{channel.format}</p>
                )}
                <p className="text-base text-gray-400 mt-0.5 capitalize">
                  {channel.platform.replace('-', ' ')}
                </p>
              </div>

              {/* Spend summary + manage menu */}
              <div className="row-start-1 col-start-3 flex items-start gap-1 flex-shrink-0">
                <div className="text-right">
                  {(() => {
                    const hasCommission = channel.grossPlannedSpend !== undefined && channel.grossPlannedSpend !== channel.plannedSpend;
                    const displayPlanned = hasCommission && planView === 'gross' ? channel.grossPlannedSpend! : channel.plannedSpend;
                    const label = hasCommission ? (planView === 'gross' ? ' gross' : ' net') : '';
                    return (
                      <>
                        <p className="text-base font-bold text-gray-900">
                          {fmt(filteredMetrics.spend ?? channel.currentSpend, 'currency', 0)}
                        </p>
                        <p className="text-base text-gray-400">
                          of {fmt(displayPlanned, 'currency', 0)}{label}
                        </p>
                      </>
                    );
                  })()}
                </div>
                {headerActions && (
                  <div className="-mt-0.5">{headerActions}</div>
                )}
              </div>

              {/* Pacing bar spans from under logo to under spend */}
              <div className="row-start-2 col-start-1 col-end-4">
                {(() => {
                  const hasCommission = channel.grossPlannedSpend !== undefined && channel.grossPlannedSpend !== channel.plannedSpend;
                  const displayPlanned = hasCommission && planView === 'gross' ? channel.grossPlannedSpend! : channel.plannedSpend;
                  const plannedLabel = hasCommission ? (planView === 'gross' ? 'gross' : 'net') : undefined;
                  return (
                    <PacingBar
                      currentSpend={filteredMetrics.spend ?? channel.currentSpend}
                      plannedSpend={displayPlanned}
                      plannedLabel={plannedLabel}
                      status={channel.status}
                    />
                  );
                })()}
              </div>

              {/* ── Overspend forecast badge ── */}
              {overspendForecast && !isNoneSelected && (
                <div className="row-start-3 col-start-1 col-end-4 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                        <polyline points="1,8 3.5,5 5.5,6.5 9,2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Forecast · {overspendForecast.daysRemaining}d left
                    </span>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-gray-600 font-medium">{fmt(overspendForecast.projectedEndSpend, 'currency', 0)} projected</span>
                      <span className={`font-semibold ${
                        overspendForecast.overspendPct > 10 ? 'text-red-600'
                        : overspendForecast.overspendPct > 0 ? 'text-amber-600'
                        : overspendForecast.overspendPct >= -10 ? 'text-emerald-600'
                        : 'text-amber-600'
                      }`}>
                        {overspendForecast.overspendAmount >= 0 ? '+' : ''}{fmt(Math.abs(overspendForecast.overspendAmount), 'currency', 0)}{' '}
                        ({overspendForecast.overspendPct >= 0 ? '+' : ''}{Math.round(overspendForecast.overspendPct)}%)
                      </span>
                    </div>
                  </div>
                </div>
              )}
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
                  className="flex items-center gap-1 text-base text-gray-500 hover:text-gray-700 transition-colors"
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
                        className={`w-full text-left px-3 py-1.5 text-base hover:bg-gray-50 transition-colors ${p.name === activePresetName ? 'font-medium text-blue-600' : 'text-gray-700'}`}
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
                // 'conversions' slots are remapped to conv_events so they share data and chart toggle
                const effectiveKey: MetricKey = key === 'conversions' ? 'conv_events' : key;
                const rawValue = (filteredMetrics as any)[effectiveKey] ?? 0;
                const displayValue = effectiveKey === 'ctr'
                  ? fmt(rawValue * 100, 'percent', 2)
                  : effectiveKey === 'cpc'
                    ? fmt(rawValue, 'currency', 2)
                    : fmt(rawValue, 'decimal', 0);
                const benchmark = channelBenchmarks.find(b => b.metric_key === effectiveKey);
                const realValue = getRealValue(effectiveKey, filteredMetrics);
                const effectiveDisplayed: string[] = displayedMetrics.map(k => k === 'conversions' ? 'conv_events' : k);
                const availableSwaps = ALL_METRIC_KEYS.filter(k => k !== effectiveKey && !effectiveDisplayed.includes(k));
                return (
                  <MetricSlot
                    key={`${slotIdx}-${effectiveKey}`}
                    metricKey={effectiveKey}
                    displayValue={displayValue}
                    benchmark={benchmark}
                    realValue={realValue}
                    isActive={isMetricsView && selectedMetrics.has(effectiveKey)}
                    hasMetrics={hasMetrics}
                    availableSwaps={availableSwaps}
                    onChart={() => handleMetricClick(effectiveKey)}
                    onSwap={(newKey) => handleSwapMetric(slotIdx, newKey)}
                    actionTypes={effectiveKey === 'conv_events' ? availableActionTypes : undefined}
                    selectedActionType={effectiveKey === 'conv_events' ? selectedActionType : undefined}
                    onActionTypeChange={effectiveKey === 'conv_events' ? handleSetSelectedActionType : undefined}
                  />
                );
              })}
            </div>
          </div>

          {/* ── Connection expired banner ── */}
          {reconnectIssue && (
            <div className="mx-4 mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="text-base text-red-700 font-medium">Connection expired — data unavailable</span>
              </div>
              {onReconnect ? (
                <button
                  onClick={onReconnect}
                  className="flex-shrink-0 text-base font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded-md transition-colors"
                >
                  Reconnect
                </button>
              ) : null}
            </div>
          )}

          {/* ── Issues warning ── */}
          {regularIssues.length > 0 && (
            <div className="mx-4 mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <ul className="space-y-0.5">
                {regularIssues.map((issue, i) => (
                  <li key={i} className="text-base text-amber-700">{issue}</li>
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
                  className={`px-3 py-1 text-base rounded transition-colors ${
                    chartType === 'spend'
                      ? 'bg-white font-medium shadow-sm text-gray-900'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Spend
                </button>
                <button
                  onClick={() => { setChartType('metrics'); if (hasMetrics) setIsExpanded(true); }}
                  className={`px-3 py-1 text-base rounded transition-colors ${
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
                  className="flex items-center gap-1 px-3 py-1.5 text-base font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  Open
                </button>
              )}
              {onViewReport && (
                <button
                  onClick={onViewReport}
                  className="flex items-center gap-1 px-3 py-1.5 text-base font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
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
                            data={chartDataWithProjection}
                            margin={{ top: 10, right: 16, left: 0, bottom: 8 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 14 }}
                              tickMargin={6}
                              tickFormatter={(value) => new Date(value).getDate().toString()}
                              interval={
                                chartDataWithProjection.length > 60 ? 6
                                : chartDataWithProjection.length > 35 ? 4
                                : 0
                              }
                            />
                            <YAxis
                              tick={{ fontSize: 15 }}
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
                              formatter={(value: any, name: string) => {
                                if (name === 'projectedSpend') return [`$${Number(value).toFixed(2)}`, 'Projected'];
                                return [`$${Number(value).toFixed(2)}`, ''];
                              }}
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
                              dot={{ r: chartDataWithProjection.length > 35 ? 0 : 3 }}
                            />
                            {overspendForecast && (
                              <Line
                                type="monotone"
                                dataKey="projectedSpend"
                                stroke={overspendForecast.overspendPct > 10 ? '#dc2626' : overspendForecast.overspendPct > 0 ? '#f97316' : '#10b981'}
                                strokeWidth={2}
                                strokeDasharray="5 3"
                                dot={false}
                                name="projectedSpend"
                                connectNulls={false}
                              />
                            )}
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
                              className="text-base font-semibold text-gray-600 text-center truncate"
                              style={{ width: `${ml.widthPct}%` }}
                            >
                              {ml.month}
                            </span>
                          ))}
                        </div>
                      )}

                      {isExpanded && (
                        <div className="mt-2 flex items-center justify-end">
                          <div className="flex items-center gap-4 text-base text-gray-500">
                            <span className="flex items-center gap-1.5">
                              <span className="w-3 h-0.5 rounded-full bg-emerald-500 inline-block" />
                              Actual Spend
                            </span>
                            <span className="flex items-center gap-1.5">
                              <span className="w-3 h-3 rounded-sm bg-gray-200 border border-gray-400 inline-block" />
                              Planned Spend
                            </span>
                            {overspendForecast && (
                              <span className="flex items-center gap-1.5">
                                <svg width="12" height="4" viewBox="0 0 12 4" aria-hidden="true">
                                  <line x1="0" y1="2" x2="12" y2="2"
                                    stroke={overspendForecast.overspendPct > 10 ? '#dc2626' : overspendForecast.overspendPct > 0 ? '#f97316' : '#10b981'}
                                    strokeWidth="2" strokeDasharray="4 2"
                                  />
                                </svg>
                                Projected
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-base text-gray-400 text-center py-8">No spend data available for this period.</p>
                  )}
                </>
              )}

              {/* ── Metrics chart (only in expanded state) ── */}
              {chartType === 'metrics' && isExpanded && (
                <>
                  <div className="flex items-center gap-1.5 mb-4 flex-wrap">
                    {(Object.keys(METRIC_CONFIG) as MetricKey[]).filter(k => k !== 'conversions').map((key) => {
                      const cfg = METRIC_CONFIG[key];
                      const isActive = selectedMetrics.has(key);
                      return (
                        <button
                          key={key}
                          onClick={() => handleMetricClick(key)}
                          className={`px-2 py-0.5 rounded-full text-base font-medium border transition-all ${
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
                    const dataLen = filteredMetricsChartData?.length ?? 0;

                    return (
                      <>
                        {axisMode === 'hidden' && (
                          <p className="text-base text-gray-400 mb-2 text-right">
                            Relative scale — each line scaled independently
                          </p>
                        )}
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                              data={filteredMetricsChartData}
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
                                tick={{ fontSize: 14 }}
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
                                  tick={{ fontSize: 14 }}
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
                    <p className="text-base text-gray-400 text-center py-8">No metrics data available for this period.</p>
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
                    className="px-4 py-1.5 text-base font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full transition-colors"
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
          <div className="flex-shrink-0 w-64 bg-white flex flex-col self-stretch overflow-hidden">
            <div className="px-4 pt-4 flex-shrink-0">
              <h3 className="text-base font-semibold text-gray-900 mb-3" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>Action Points</h3>
            </div>
            <div className="relative flex-1 min-h-0">
              <div className={`h-full px-4 pb-6 ${isExpanded ? 'overflow-y-auto' : 'overflow-hidden'}`}>
                <InlineActionPoints
                  channelType={inferActionPointChannelType(channel.platform, channel.name)}
                  clientId={clientId}
                  channelStartDate={channelStartDate}
                  channelFlights={channelFlights}
                  maxVisible={3}
                  showBorder={false}
                  showTitle={false}
                  refetchTrigger={refetchTrigger}
                />
              </div>
              {/* Fade at the bottom — always shown to signal more content */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12" style={{ background: 'linear-gradient(to top, white 0%, transparent 100%)' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
