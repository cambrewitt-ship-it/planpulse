'use client';

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Label,
} from "recharts";
import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface CostMetricPoint {
  date: string;
  dailyCost: number | null;
  cost_7d: number | null;
  cost_14d: number | null;
  cost_30d: number | null;
  spend?: number;
  metricValue?: number;
}

interface CostPerMetricChartProps {
  cacMetrics?: CostMetricPoint[] | null;
  previousPeriodMetrics?: CostMetricPoint[] | null;
  height?: number;
  isLoading?: boolean;
  error?: string;
  errorDetails?: string;
  selectedMetric?: string;
  onComparisonToggle?: (enabled: boolean) => void;
  isComparisonLoading?: boolean;
}

// Get singular display name for metric
function getMetricDisplayName(metricKey: string): string {
  const displayNames: Record<string, string> = {
    conversions: 'Conversion',
    activeUsers: 'Active User',
    sessions: 'Session',
    totalUsers: 'Total User',
    eventCount: 'Event',
  };
  return displayNames[metricKey] || metricKey;
}

// Metric configuration with Grafana colors - keys match new property names
const COST_METRICS = [
  { key: 'dailyCost', labelKey: 'daily_cost', color: '#5794F2', type: 'bar' },
  { key: 'cost_7d', labelKey: 'cost_7d', color: '#FF9830', type: 'line' },
  { key: 'cost_14d', labelKey: 'cost_14d', color: '#F2495C', type: 'line' },
  { key: 'cost_30d', labelKey: 'cost_30d', color: '#B877D9', type: 'line' },
] as const;

export function CostPerMetricChart({ 
  cacMetrics, 
  previousPeriodMetrics,
  height = 350, 
  isLoading = false, 
  error, 
  errorDetails, 
  selectedMetric = 'conversions',
  onComparisonToggle,
  isComparisonLoading = false,
}: CostPerMetricChartProps) {
  // State for comparison mode
  const [showComparison, setShowComparison] = useState(false);

  // Get dynamic display name for the selected metric
  const metricDisplayName = getMetricDisplayName(selectedMetric);

  // Handle comparison toggle
  const handleComparisonToggle = (enabled: boolean) => {
    setShowComparison(enabled);
    onComparisonToggle?.(enabled);
  };

  // Generate dynamic labels based on selected metric
  const getMetricLabel = (baseLabel: string, isPrevious = false) => {
    const prefix = isPrevious ? 'Prev ' : '';
    const labelMap: Record<string, string> = {
      'daily_cost': `${prefix}Daily Cost Per ${metricDisplayName}`,
      'cost_7d': `${prefix}7-Day Avg`,
      'cost_14d': `${prefix}14-Day Avg`,
      'cost_30d': `${prefix}30-Day Avg`,
    };
    return labelMap[baseLabel] || baseLabel;
  };
  // Format date for display (MMM DD format like "Dec 09")
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const month = date.toLocaleDateString("en-US", { month: "short" });
    const day = date.getDate().toString().padStart(2, '0');
    return `${month} ${day}`;
  };

  // Format currency
  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Merge current and previous period data for chart display
  const chartData = useMemo(() => {
    if (!cacMetrics || cacMetrics.length === 0) return [];

    if (!showComparison || !previousPeriodMetrics || previousPeriodMetrics.length === 0) {
      return cacMetrics;
    }

    // Merge data: align by index (day 1 of current with day 1 of previous)
    return cacMetrics.map((current, index) => {
      const previous = previousPeriodMetrics[index];
      return {
        ...current,
        prev_dailyCost: previous?.dailyCost ?? null,
        prev_cost_7d: previous?.cost_7d ?? null,
        prev_cost_14d: previous?.cost_14d ?? null,
        prev_cost_30d: previous?.cost_30d ?? null,
        prev_spend: previous?.spend ?? null,
        prev_metricValue: previous?.metricValue ?? null,
        prev_date: previous?.date ?? null,
      };
    });
  }, [cacMetrics, previousPeriodMetrics, showComparison]);

  // Calculate stats for Grafana-style legend
  const metricStats = useMemo(() => {
    const stats: Record<string, { last: number | null; min: number | null; max: number | null }> = {};

    if (!cacMetrics || cacMetrics.length === 0) {
      COST_METRICS.forEach(metric => {
        stats[metric.key] = { last: null, min: null, max: null };
      });
      return stats;
    }

    COST_METRICS.forEach(metric => {
      const values = cacMetrics
        .map(point => point[metric.key as keyof CostMetricPoint] as number | null)
        .filter((v): v is number => v !== null && v !== undefined && !isNaN(v));

      if (values.length > 0) {
        stats[metric.key] = {
          last: values[values.length - 1],
          min: Math.min(...values),
          max: Math.max(...values),
        };
      } else {
        stats[metric.key] = { last: null, min: null, max: null };
      }
    });

    return stats;
  }, [cacMetrics]);

  // Calculate stats for previous period
  const prevMetricStats = useMemo(() => {
    const stats: Record<string, { last: number | null; min: number | null; max: number | null }> = {};

    if (!previousPeriodMetrics || previousPeriodMetrics.length === 0) {
      COST_METRICS.forEach(metric => {
        stats[metric.key] = { last: null, min: null, max: null };
      });
      return stats;
    }

    COST_METRICS.forEach(metric => {
      const values = previousPeriodMetrics
        .map(point => point[metric.key as keyof CostMetricPoint] as number | null)
        .filter((v): v is number => v !== null && v !== undefined && !isNaN(v));

      if (values.length > 0) {
        stats[metric.key] = {
          last: values[values.length - 1],
          min: Math.min(...values),
          max: Math.max(...values),
        };
      } else {
        stats[metric.key] = { last: null, min: null, max: null };
      }
    });

    return stats;
  }, [previousPeriodMetrics]);

  // Calculate period-over-period change
  const calculateChange = (current: number | null, previous: number | null) => {
    if (current === null || previous === null || previous === 0) return null;
    return ((current - previous) / previous) * 100;
  };

  // Check for consecutive days with zero metric values
  const dataQualityWarning = useMemo(() => {
    if (!cacMetrics || cacMetrics.length === 0) return null;

    let maxConsecutiveZero = 0;
    let currentStreak = 0;
    let totalZeroDays = 0;

    cacMetrics.forEach(point => {
      if (point.metricValue === 0 || point.dailyCost === null) {
        currentStreak++;
        totalZeroDays++;
        maxConsecutiveZero = Math.max(maxConsecutiveZero, currentStreak);
      } else {
        currentStreak = 0;
      }
    });

    // Show warning if 3+ consecutive days with zero metric values
    if (maxConsecutiveZero >= 3) {
      const metricNamePlural = `${metricDisplayName.toLowerCase()}s`;
      
      // Different warning messages based on severity
      if (maxConsecutiveZero >= 7) {
        return {
          title: 'Data Quality Notice',
          message: `${maxConsecutiveZero} consecutive days with zero ${metricNamePlural} detected`,
          detail: `Insufficient ${metricDisplayName.toLowerCase()} data for these dates. Check your Google Analytics configuration.`,
          severity: 'high' as const,
        };
      } else {
        return {
          title: 'Data Quality Notice',
          message: `${maxConsecutiveZero} consecutive days with zero ${metricNamePlural} detected`,
          detail: 'Cost cannot be calculated for these periods.',
          severity: 'medium' as const,
        };
      }
    }
    return null;
  }, [cacMetrics, metricDisplayName]);

  // Count days with null cost (no metric value)
  const nullCostDays = useMemo(() => {
    if (!cacMetrics || cacMetrics.length === 0) return 0;
    return cacMetrics.filter(point => point.dailyCost === null).length;
  }, [cacMetrics]);

  // Custom tooltip with comparison support
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      // Find the original data point to show metric info
      const dataPoint = chartData?.find(p => p.date === label) as any;
      const hasNoMetricValue = dataPoint?.metricValue === 0;

      // Separate current and previous period entries
      const currentEntries = payload.filter((e: any) => !e.dataKey?.startsWith('prev_'));
      const previousEntries = payload.filter((e: any) => e.dataKey?.startsWith('prev_'));

      return (
        <div className="bg-white dark:bg-gray-800 p-4 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-w-sm">
          <p className="font-semibold mb-2 text-gray-900 dark:text-gray-100">{formatDate(label)}</p>
          {hasNoMetricValue && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-2 italic">
              No {metricDisplayName.toLowerCase()}s recorded
            </p>
          )}
          
          {/* Current period values */}
          <div className="space-y-1">
            {currentEntries.map((entry: any, index: number) => {
              const prevEntry = previousEntries.find((p: any) => p.dataKey === `prev_${entry.dataKey}`);
              const change = prevEntry ? calculateChange(entry.value, prevEntry.value) : null;
              
              return (
                <div key={index} className="flex items-center justify-between gap-4">
                  <span className="text-sm" style={{ color: entry.color }}>
                    <span className="font-medium">{getMetricLabel(entry.name)}:</span>{" "}
                    {entry.value === null ? 'N/A' : formatCurrency(entry.value)}
                  </span>
                  {change !== null && (
                    <span className={`text-xs font-medium flex items-center gap-0.5 ${
                      change < 0 ? 'text-emerald-500' : change > 0 ? 'text-red-500' : 'text-gray-500'
                    }`}>
                      {change < 0 ? <TrendingDown className="w-3 h-3" /> : change > 0 ? <TrendingUp className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                      {Math.abs(change).toFixed(1)}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Previous period label */}
          {showComparison && previousEntries.length > 0 && dataPoint?.prev_date && (
            <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-400 mb-1">Previous Period ({formatDate(dataPoint.prev_date)})</p>
              {previousEntries.map((entry: any, index: number) => (
                <p key={index} className="text-xs text-gray-500" style={{ opacity: 0.7 }}>
                  {getMetricLabel(entry.name.replace('prev_', ''), true)}: {entry.value === null ? 'N/A' : formatCurrency(entry.value)}
                </p>
              ))}
            </div>
          )}

          {/* Spend and metric details */}
          {dataPoint && (
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>Spend: {formatCurrency(dataPoint.spend ?? 0)}</span>
                {showComparison && dataPoint.prev_spend !== null && (
                  <span className="text-gray-400">Prev: {formatCurrency(dataPoint.prev_spend)}</span>
                )}
              </div>
              <div className="flex justify-between">
                <span>{metricDisplayName}s: {dataPoint.metricValue ?? 0}</span>
                {showComparison && dataPoint.prev_metricValue !== null && (
                  <span className="text-gray-400">Prev: {dataPoint.prev_metricValue}</span>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Cost Per {metricDisplayName}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="animate-pulse">
            {/* Chart skeleton */}
            <div className="h-[350px] bg-gray-100 dark:bg-gray-800 rounded-lg mb-4 flex items-end justify-around px-4 pb-8">
              {Array.from({ length: 15 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-gray-200 dark:bg-gray-700 rounded-t"
                  style={{
                    width: '20px',
                    height: `${Math.random() * 60 + 20}%`,
                  }}
                />
              ))}
            </div>
            {/* Legend skeleton */}
            <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex justify-between">
                    <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
                    <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
                    <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
                    <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Cost Per {metricDisplayName}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500 dark:text-red-400" />
            </div>
            <p className="text-red-600 dark:text-red-400 font-medium mb-1">{error}</p>
            {errorDetails && (
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
                {errorDetails}
              </p>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
              Try refreshing the page or adjusting the date range. If the problem persists, check the browser console for more details.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty/null state
  if (!cacMetrics || cacMetrics.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Cost Per {metricDisplayName}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">No data available for selected date range</p>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Connect ad platforms and ensure {metricDisplayName.toLowerCase()}s are being tracked in Google Analytics.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle>Cost Per {metricDisplayName}</CardTitle>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showComparison}
              onChange={(e) => handleComparisonToggle(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              disabled={isComparisonLoading}
            />
            <span className="text-gray-600 dark:text-gray-400">
              {isComparisonLoading ? 'Loading...' : 'Compare with previous period'}
            </span>
          </label>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Warning banner for zero metric values */}
        {dataQualityWarning && (
          <div className={`mb-4 p-3 rounded-lg flex items-start gap-2 ${
            dataQualityWarning.severity === 'high' 
              ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' 
              : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
          }`}>
            <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
              dataQualityWarning.severity === 'high'
                ? 'text-red-600 dark:text-red-400'
                : 'text-amber-600 dark:text-amber-400'
            }`} />
            <div className="text-sm">
              <p className={`font-medium ${
                dataQualityWarning.severity === 'high'
                  ? 'text-red-800 dark:text-red-200'
                  : 'text-amber-800 dark:text-amber-200'
              }`}>{dataQualityWarning.title}</p>
              <p className={`text-xs mt-0.5 ${
                dataQualityWarning.severity === 'high'
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-amber-700 dark:text-amber-300'
              }`}>{dataQualityWarning.message}</p>
              <p className={`text-xs mt-1 ${
                dataQualityWarning.severity === 'high'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}>{dataQualityWarning.detail}</p>
            </div>
          </div>
        )}

        {/* Info about null cost days */}
        {nullCostDays > 0 && !dataQualityWarning && (
          <div className="mb-4 p-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-600 dark:text-gray-400">
            <span className="font-medium">{nullCostDays}</span> day(s) with no {metricDisplayName.toLowerCase()}s (cost not calculable)
          </div>
        )}

        {/* Chart */}
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="#e5e7eb" 
              strokeOpacity={0.4}
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              axisLine={{ stroke: "#e5e7eb", strokeOpacity: 0.5 }}
              tickLine={{ stroke: "#e5e7eb", strokeOpacity: 0.5 }}
              dy={10}
            />
            <YAxis
              tickFormatter={(value) => `$${value.toFixed(0)}`}
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              axisLine={{ stroke: "#e5e7eb", strokeOpacity: 0.5 }}
              tickLine={{ stroke: "#e5e7eb", strokeOpacity: 0.5 }}
              dx={-5}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Previous period bars (shown first, behind current) */}
            {showComparison && previousPeriodMetrics && (
              <Bar
                dataKey="prev_dailyCost"
                fill="#5794F2"
                name="prev_daily_cost"
                radius={[2, 2, 0, 0]}
                fillOpacity={0.2}
              />
            )}

            {/* Daily Cost as bars */}
            <Bar
              dataKey="dailyCost"
              fill="#5794F2"
              name="daily_cost"
              radius={[2, 2, 0, 0]}
              fillOpacity={0.6}
            />

            {/* Previous period 7-day moving average */}
            {showComparison && previousPeriodMetrics && (
              <Line
                type="monotone"
                dataKey="prev_cost_7d"
                stroke="#FF9830"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                strokeOpacity={0.5}
                dot={false}
                name="prev_cost_7d"
                connectNulls
              />
            )}

            {/* 7-day moving average */}
            <Line
              type="monotone"
              dataKey="cost_7d"
              stroke="#FF9830"
              strokeWidth={2}
              dot={false}
              name="cost_7d"
              connectNulls
            />

            {/* Previous period 14-day moving average */}
            {showComparison && previousPeriodMetrics && (
              <Line
                type="monotone"
                dataKey="prev_cost_14d"
                stroke="#F2495C"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                strokeOpacity={0.5}
                dot={false}
                name="prev_cost_14d"
                connectNulls
              />
            )}

            {/* 14-day moving average */}
            <Line
              type="monotone"
              dataKey="cost_14d"
              stroke="#F2495C"
              strokeWidth={2}
              dot={false}
              name="cost_14d"
              connectNulls
            />

            {/* Previous period 30-day moving average */}
            {showComparison && previousPeriodMetrics && (
              <Line
                type="monotone"
                dataKey="prev_cost_30d"
                stroke="#B877D9"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                strokeOpacity={0.5}
                dot={false}
                name="prev_cost_30d"
                connectNulls
              />
            )}

            {/* 30-day moving average */}
            <Line
              type="monotone"
              dataKey="cost_30d"
              stroke="#B877D9"
              strokeWidth={2}
              dot={false}
              name="cost_30d"
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Grafana-style Legend Table (below chart) */}
        <div className="mt-4 overflow-x-auto border-t border-gray-100 dark:border-gray-800 pt-4">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left py-1 px-2 font-medium text-[#FF7383] text-xs">Name</th>
                <th className="text-right py-1 px-2 font-medium text-[#73BF69] text-xs">Last *</th>
                {showComparison && <th className="text-right py-1 px-2 font-medium text-gray-400 text-xs">Prev</th>}
                {showComparison && <th className="text-right py-1 px-2 font-medium text-gray-400 text-xs">Change</th>}
                <th className="text-right py-1 px-2 font-medium text-[#5794F2] text-xs">Min</th>
                <th className="text-right py-1 px-2 font-medium text-[#FADE2A] text-xs">Max</th>
              </tr>
            </thead>
            <tbody>
              {COST_METRICS.map(metric => {
                const stats = metricStats[metric.key];
                const prevStats = prevMetricStats[metric.key];
                const change = calculateChange(stats?.last ?? null, prevStats?.last ?? null);
                
                return (
                  <tr key={metric.key}>
                    <td className="py-1 px-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-0.5 rounded-full"
                          style={{ backgroundColor: metric.color }}
                        />
                        <span className="text-xs" style={{ color: metric.color }}>
                          {getMetricLabel(metric.labelKey)}
                        </span>
                      </div>
                    </td>
                    <td className="text-right py-1 px-2 font-mono text-xs text-gray-700 dark:text-gray-300">
                      {formatCurrency(stats?.last ?? null)}
                    </td>
                    {showComparison && (
                      <td className="text-right py-1 px-2 font-mono text-xs text-gray-400">
                        {formatCurrency(prevStats?.last ?? null)}
                      </td>
                    )}
                    {showComparison && (
                      <td className="text-right py-1 px-2 font-mono text-xs">
                        {change !== null ? (
                          <span className={`flex items-center justify-end gap-0.5 ${
                            change < 0 ? 'text-emerald-500' : change > 0 ? 'text-red-500' : 'text-gray-500'
                          }`}>
                            {change < 0 ? <TrendingDown className="w-3 h-3" /> : change > 0 ? <TrendingUp className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                            {Math.abs(change).toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    )}
                    <td className="text-right py-1 px-2 font-mono text-xs text-[#5794F2]">
                      {formatCurrency(stats?.min ?? null)}
                    </td>
                    <td className="text-right py-1 px-2 font-mono text-xs text-[#FADE2A]">
                      {formatCurrency(stats?.max ?? null)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          {/* Legend for comparison mode */}
          {showComparison && previousPeriodMetrics && previousPeriodMetrics.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 bg-purple-500 rounded" />
                <span>Current Period</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 bg-purple-500 rounded opacity-50" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 2px, currentColor 2px, currentColor 4px)' }} />
                <span>Previous Period (dashed)</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Legacy alias for backward compatibility
export const CACChart = CostPerMetricChart;
