'use client';

import { useState } from 'react';
import { AlertTriangle, Settings, FileText } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  ComposedChart,
  ReferenceLine,
} from 'recharts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

/** Simple inline platform icon using the brand initial */
function PlatformIcon({ platform }: { platform: string }) {
  const color = PLATFORM_COLORS[platform] ?? '#6b7280';
  const initial =
    platform === 'meta-ads' ? 'M'
    : platform === 'google-ads' ? 'G'
    : platform.charAt(0).toUpperCase();

  return (
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-sm font-bold"
      style={{ backgroundColor: color }}
    >
      {initial}
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
  const fillPct  = Math.min(100, pacingPercentage);
  const barColor = pacingPercentage > 100 ? '#ef4444' : STATUS_CONFIG[status].bar;

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
// Metrics grid
// ---------------------------------------------------------------------------

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-400 uppercase tracking-wide leading-none">{label}</span>
      <span className="text-sm font-semibold text-gray-800 leading-none">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ChannelPerformanceCard({ channel, selectedMonth, dateRange, onAdjust, onViewReport }: ChannelCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [chartType, setChartType] = useState<'spend' | 'metrics'>('spend');

  const hasIssues     = (channel.issues?.length ?? 0) > 0;
  const hasChartData  = (channel.chartData?.length ?? 0) > 0;
  const hasMetrics    = (channel.metricsChartData?.length ?? 0) > 0;
  const canExpand     = hasChartData || hasMetrics;

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

  // Then trim to the range where we actually have spend values. This makes the
  // X-axis adjust to the active time period instead of always rendering the
  // full month + padding range.
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

  // Build month labels for the visible range. Each entry includes:
  //  - key: "year-monthIndex" string (e.g. "2026-0")
  //  - month: display name (e.g. "January")
  //  - position: 0–1 centre position along the x-axis (legacy, kept for compat)
  //  - widthPct: fraction of total days this month occupies (for flex layout)
  //  - firstDate: ISO date of the first data point in this month (for ReferenceLine)
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
      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <PlatformIcon platform={channel.platform} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-gray-900 truncate">{channel.name}</h3>
              <StatusBadge status={channel.status} />
            </div>
            <p className="text-xs text-gray-400 mt-0.5 capitalize">
              {channel.platform.replace('-', ' ')}
            </p>
          </div>

          {/* Spend summary */}
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-bold text-gray-900">{fmt(channel.currentSpend, 'currency', 0)}</p>
            <p className="text-xs text-gray-400">of {fmt(channel.plannedSpend, 'currency', 0)}</p>
          </div>
        </div>

        {/* Pacing bar */}
        <div className="mt-3">
          <PacingBar
            pacingPercentage={channel.pacingPercentage}
            currentSpend={channel.currentSpend}
            plannedSpend={channel.plannedSpend}
            status={channel.status}
          />
        </div>
      </div>

      {/* ── Metrics grid ── */}
      <div className="px-4 pb-3 grid grid-cols-5 gap-3 border-t border-gray-50 pt-3">
        <MetricPill label="Impr"  value={fmt(channel.metrics.impressions, 'decimal', 0)} />
        <MetricPill label="Clicks" value={fmt(channel.metrics.clicks, 'decimal', 0)} />
        <MetricPill label="CTR"   value={fmt(channel.metrics.ctr * 100, 'percent', 2)} />
        <MetricPill label="CPC"   value={fmt(channel.metrics.cpc, 'currency', 2)} />
        <MetricPill label="Conv"  value={fmt(channel.metrics.conversions, 'decimal', 0)} />
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

      {/* ── Action bar ── */}
      <div className="flex items-center gap-2 px-4 pb-3 border-t border-gray-50 pt-2">
        {/* View Details / Hide Chart — full-width flex-1 */}
        <button
          onClick={() => setIsExpanded(prev => !prev)}
          disabled={!canExpand}
          className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
            canExpand
              ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
              : 'text-gray-400 bg-gray-50 cursor-not-allowed'
          }`}
        >
          {isExpanded ? '▲ Hide Chart' : '▼ View Details'}
        </button>

        {/* Chart type toggle — only shown when expanded */}
        {isExpanded && (
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setChartType('spend')}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                chartType === 'spend'
                  ? 'bg-white font-medium shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Spend
            </button>
            <button
              onClick={() => setChartType('metrics')}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                chartType === 'metrics'
                  ? 'bg-white font-medium shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Metrics
            </button>
          </div>
        )}

        {onAdjust && (
          <button
            onClick={onAdjust}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Adjust
          </button>
        )}

        {onViewReport && (
          <button
            onClick={onViewReport}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            Report
          </button>
        )}
      </div>

      {/* ── Expandable chart ── */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-4 py-4 bg-gray-50">
          {chartType === 'spend' && (
            <>
              <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">
                Spend vs Planned — {channel.name}
              </p>
              {hasChartData ? (
                <>
                  {/* Chart — fixed height only for the Recharts canvas */}
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
                        {/* Month boundary lines for multi-month ranges */}
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

                  {/* Month labels row — proportional flex under the chart plot area */}
                  {monthLabels.length > 0 && (
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

                  {/* Footer: legend key */}
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
                </>
              ) : (
                <p className="text-xs text-gray-400 text-center py-8">No spend data available for this period.</p>
              )}
            </>
          )}

          {chartType === 'metrics' && (
            <>
              <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">
                Performance Metrics — {channel.name}
              </p>
              {hasMetrics ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={channel.metricsChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => new Date(value).getDate().toString()}
                      />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip labelFormatter={(label) => new Date(label).toLocaleDateString()} />
                      <Legend />
                      <Line type="monotone" dataKey="ctr" stroke="#8b5cf6" name="CTR %" strokeWidth={2} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="cpc" stroke="#f59e0b" name="CPC $" strokeWidth={2} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="conversions" stroke="#10b981" name="Conversions" strokeWidth={2} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-xs text-gray-400 text-center py-8">No metrics data available for this period.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
