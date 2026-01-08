'use client';

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface GA4DataPoint {
  date: string;
  [metric: string]: string | number;
}

interface SpendDataPoint {
  date: string;
  spend: number;
  platform?: string;
  accountName?: string;
  planId?: string;
  planName?: string;
}

interface MediaPlan {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
}

interface UnifiedAnalyticsChartProps {
  ga4Data?: GA4DataPoint[];
  spendData?: SpendDataPoint[];
  startDate: string;
  endDate: string;
  height?: number;
  mediaPlans?: MediaPlan[];
  onAddMetric?: (metric: string) => Promise<void>;
  availableMetrics?: string[];
  selectedMetrics?: string[];
  onMetricsChange?: (metrics: string[]) => void;
  ga4Error?: string;
  ga4ActivationUrl?: string;
}

// Available GA4 metrics with display names
const GA4_METRICS = [
  { key: 'activeUsers', label: 'Active Users', color: '#3b82f6' },
  { key: 'totalUsers', label: 'Total Users', color: '#60a5fa' },
  { key: 'conversions', label: 'Conversions', color: '#10b981' },
  { key: 'sessions', label: 'Sessions', color: '#8b5cf6' },
  { key: 'screenPageViews', label: 'Page Views', color: '#f59e0b' },
  { key: 'eventCount', label: 'Events', color: '#ef4444' },
  { key: 'newUsers', label: 'New Users', color: '#06b6d4' },
  { key: 'engagementRate', label: 'Engagement Rate', color: '#ec4899' },
  { key: 'averageSessionDuration', label: 'Avg Session Duration', color: '#14b8a6' },
  { key: 'bounceRate', label: 'Bounce Rate', color: '#f97316' },
  { key: 'totalRevenue', label: 'Total Revenue', color: '#22c55e' },
  { key: 'purchaseRevenue', label: 'Purchase Revenue', color: '#84cc16' },
  { key: 'transactions', label: 'Transactions', color: '#10b981' },
];

// Spend data colors
const SPEND_COLORS: Record<string, string> = {
  'meta-ads': '#1877f2',
  'google-ads': '#4285f4',
  'default': '#6b7280',
};

export function UnifiedAnalyticsChart({
  ga4Data = [],
  spendData = [],
  startDate,
  endDate,
  height = 400,
  mediaPlans = [],
  onAddMetric,
  availableMetrics = [],
  selectedMetrics: propSelectedMetrics = ['activeUsers', 'conversions'],
  onMetricsChange,
  ga4Error,
  ga4ActivationUrl,
}: UnifiedAnalyticsChartProps) {
  // Use controlled metrics from parent, or fallback to internal state
  const [internalMetrics, setInternalMetrics] = useState<string[]>(propSelectedMetrics);
  const selectedMetrics = onMetricsChange ? propSelectedMetrics : internalMetrics;
  const setSelectedMetrics = onMetricsChange 
    ? (metrics: string[]) => onMetricsChange(metrics)
    : setInternalMetrics;

  const selectedMetricsSet = useMemo(() => new Set(selectedMetrics), [selectedMetrics]);
  
  const [showSpendData, setShowSpendData] = useState(true);
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set());
  const [isAddingMetric, setIsAddingMetric] = useState(false);

  // Get available metrics from GA4 data and props
  const metricsInData = useMemo(() => {
    if (!ga4Data || ga4Data.length === 0) return new Set<string>();
    const firstPoint = ga4Data[0];
    const metrics = new Set<string>();
    Object.keys(firstPoint).forEach(key => {
      if (key !== 'date') {
        metrics.add(key);
      }
    });
    return metrics;
  }, [ga4Data]);

  // Combine metrics from data and available metrics prop
  const allAvailableMetrics = useMemo(() => {
    const combined = new Set(availableMetrics);
    metricsInData.forEach(m => combined.add(m));
    return Array.from(combined);
  }, [availableMetrics, metricsInData]);

  // Get metrics that can be added (not already selected)
  const addableMetrics = useMemo(() => {
    return GA4_METRICS.filter(metric => 
      !selectedMetricsSet.has(metric.key) && 
      (allAvailableMetrics.includes(metric.key) || onAddMetric)
    );
  }, [selectedMetricsSet, allAvailableMetrics, onAddMetric]);

  // Merge GA4 and spend data by date
  const chartData = useMemo(() => {
    console.log('Building chart data:', {
      ga4DataLength: ga4Data.length,
      selectedMetrics,
      ga4DataSample: ga4Data[0],
      ga4DataKeys: ga4Data[0] ? Object.keys(ga4Data[0]) : [],
      spendDataLength: spendData.length,
      spendDataSample: spendData[0],
    });

    const dataMap = new Map<string, any>();

    // First, add GA4 data - this is the primary data source
    if (ga4Data && ga4Data.length > 0) {
      ga4Data.forEach(point => {
        const date = point.date;
        if (!dataMap.has(date)) {
          dataMap.set(date, { date });
        }
        const entry = dataMap.get(date);
        
        // Add ALL metrics from the point, not just selected ones
        // This ensures we have the data even if selection changes
        Object.keys(point).forEach(key => {
          if (key !== 'date' && key !== 'propertyId' && key !== 'propertyName') {
            const value = point[key];
            entry[key] = typeof value === 'string' 
              ? parseFloat(value) || 0 
              : (typeof value === 'number' ? value : 0);
          }
        });
      });
    } else {
      console.warn('No GA4 data available!', {
        ga4Data,
        selectedMetrics,
      });
    }

    // Add spend data (filtered by selected plans if any)
    if (showSpendData) {
      spendData.forEach(point => {
        // Filter by selected plans if any plans are selected
        if (selectedPlanIds.size > 0 && point.planId && !selectedPlanIds.has(point.planId)) {
          return; // Skip this point if it doesn't match selected plans
        }
        
        const date = point.date;
        if (!dataMap.has(date)) {
          dataMap.set(date, { date });
        }
        const entry = dataMap.get(date);
        
        // If a plan is selected, show spend per plan
        if (selectedPlanIds.size > 0 && point.planId) {
          const planSpendKey = `spend_plan_${point.planId}`;
          entry[planSpendKey] = (entry[planSpendKey] || 0) + (point.spend || 0);
        }
        
        // Aggregate spend by platform
        const platform = point.platform || 'default';
        const spendKey = `spend_${platform}`;
        entry[spendKey] = (entry[spendKey] || 0) + (point.spend || 0);
        
        // Also add total spend
        entry.totalSpend = (entry.totalSpend || 0) + (point.spend || 0);
      });
    }

    // Ensure all selected metrics exist in all data points (set to 0 if missing)
    const finalData = Array.from(dataMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(point => {
        // Ensure all selected metrics are present
        selectedMetrics.forEach(metric => {
          if (point[metric] === undefined || point[metric] === null) {
            point[metric] = 0;
          }
        });
        return point;
      });
    
    console.log('Final chart data:', {
      dataPoints: finalData.length,
      samplePoint: finalData[0],
      selectedMetrics,
      metricsInSample: finalData[0] ? Object.keys(finalData[0]).filter(k => 
        k !== 'date' && k !== 'propertyId' && k !== 'propertyName'
      ) : [],
      selectedMetricsInSample: finalData[0] ? selectedMetrics.map(m => ({
        metric: m,
        value: finalData[0][m],
        exists: finalData[0][m] !== undefined
      })) : [],
    });
    
    return finalData;
  }, [ga4Data, spendData, selectedMetrics, showSpendData, selectedPlanIds]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg max-w-xs">
          <p className="font-semibold mb-2">{formatDate(label)}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              <span className="font-medium">{entry.name}:</span>{" "}
              {entry.dataKey?.includes('spend') || entry.dataKey === 'totalSpend'
                ? formatCurrency(entry.value)
                : formatNumber(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const toggleMetric = (metricKey: string) => {
    if (selectedMetricsSet.has(metricKey)) {
      const newMetrics = selectedMetrics.filter(m => m !== metricKey);
      setSelectedMetrics(newMetrics);
    } else {
      const newMetrics = [...selectedMetrics, metricKey];
      setSelectedMetrics(newMetrics);
    }
  };

  const handleAddMetric = async (metricKey: string) => {
    // Check if metric is already selected
    if (selectedMetricsSet.has(metricKey)) {
      return;
    }

    // Check if metric is already in data
    if (metricsInData.has(metricKey)) {
      // Just add it to selected metrics
      const newMetrics = [...selectedMetrics, metricKey];
      setSelectedMetrics(newMetrics);
      return;
    }

    // If not in data and we have a callback, fetch it
    if (onAddMetric) {
      setIsAddingMetric(true);
      try {
        await onAddMetric(metricKey);
        // The parent should update selectedMetrics after fetching
        const newMetrics = [...selectedMetrics, metricKey];
        setSelectedMetrics(newMetrics);
      } catch (error) {
        console.error('Error adding metric:', error);
      } finally {
        setIsAddingMetric(false);
      }
    } else {
      // No callback, just add to selection
      const newMetrics = [...selectedMetrics, metricKey];
      setSelectedMetrics(newMetrics);
    }
  };

  const handleTogglePlan = (planId: string) => {
    const newSelected = new Set(selectedPlanIds);
    if (newSelected.has(planId)) {
      newSelected.delete(planId);
    } else {
      newSelected.add(planId);
    }
    setSelectedPlanIds(newSelected);
  };

  const removeMetric = (metricKey: string) => {
    const newMetrics = selectedMetrics.filter(m => m !== metricKey);
    setSelectedMetrics(newMetrics);
  };

  // Get unique platforms from spend data
  const spendPlatforms = useMemo(() => {
    const platforms = new Set<string>();
    spendData.forEach(point => {
      if (point.platform) {
        platforms.add(point.platform);
      }
    });
    return Array.from(platforms);
  }, [spendData]);

  // Get active media plans
  const activePlans = useMemo(() => {
    return mediaPlans.filter(plan => plan.status?.toLowerCase() === 'active');
  }, [mediaPlans]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Analytics & Spend Overview</CardTitle>
          <div className="flex items-center gap-2">
            {/* + Measure Button */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  disabled={isAddingMetric || addableMetrics.length === 0}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Measure
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 max-h-96 overflow-y-auto">
                <DropdownMenuLabel>Add Metric</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {addableMetrics.length === 0 ? (
                  <DropdownMenuItem disabled>No metrics available</DropdownMenuItem>
                ) : (
                  addableMetrics.map(metric => (
                    <DropdownMenuItem
                      key={metric.key}
                      onClick={() => handleAddMetric(metric.key)}
                      disabled={isAddingMetric}
                    >
                      <span style={{ color: metric.color }}>{metric.label}</span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Selected Metrics */}
        {selectedMetrics.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {selectedMetrics.map(metricKey => {
              const metric = GA4_METRICS.find(m => m.key === metricKey);
              if (!metric) return null;
              return (
                <Badge
                  key={metricKey}
                  variant="secondary"
                  className="flex items-center gap-1"
                  style={{ borderColor: metric.color, color: metric.color }}
                >
                  {metric.label}
                  <button
                    onClick={() => removeMetric(metricKey)}
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}

        {/* Active Media Plans */}
        {activePlans.length > 0 && (
          <div className="flex flex-col gap-2 mt-4">
            <Label className="text-sm font-semibold">Filter by Media Plan</Label>
            <div className="flex flex-wrap gap-2">
              {activePlans.map(plan => (
                <Button
                  key={plan.id}
                  variant={selectedPlanIds.has(plan.id) ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleTogglePlan(plan.id)}
                >
                  {plan.name}
                </Button>
              ))}
              {selectedPlanIds.size > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedPlanIds(new Set())}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Spend Data Toggle */}
        {spendData.length > 0 && (
          <div className="flex items-center space-x-2 mt-4">
            <Checkbox
              id="show-spend"
              checked={showSpendData}
              onCheckedChange={(checked) => setShowSpendData(checked as boolean)}
            />
            <Label htmlFor="show-spend" className="text-sm cursor-pointer">
              Show Spend Data
            </Label>
          </div>
        )}

        {/* Error when GA4 API is not enabled */}
        {ga4Error && ga4Error.includes('not enabled') && (
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm">
            <p className="font-semibold text-red-800 dark:text-red-200 mb-2">Google Analytics Data API Not Enabled</p>
            <p className="text-red-700 dark:text-red-300 mb-3">
              The Google Analytics Data API needs to be enabled in your Google Cloud project before you can fetch GA4 data.
            </p>
            {ga4ActivationUrl && (
              <a
                href={ga4ActivationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
              >
                Enable Google Analytics Data API
              </a>
            )}
            <p className="text-red-600 dark:text-red-400 text-xs mt-3">
              After enabling, wait a few minutes for the changes to propagate, then refresh this page.
            </p>
          </div>
        )}

        {/* Warning when GA4 data is empty (but no specific error) */}
        {!ga4Error && ga4Data.length === 0 && selectedMetrics.length > 0 && (
          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-sm">
            <p className="font-semibold text-yellow-800 dark:text-yellow-200">No GA4 Data Available</p>
            <p className="text-yellow-700 dark:text-yellow-300 mt-1">
              GA4 data is not being returned. Please check:
            </p>
            <ul className="list-disc list-inside mt-2 text-yellow-700 dark:text-yellow-300 text-xs space-y-1">
              <li>Google Analytics is connected and active</li>
              <li>At least one GA4 property is configured</li>
              <li>Check server console logs for API errors</li>
              <li>Verify the date range has data in GA4</li>
            </ul>
          </div>
        )}

        {/* Debug Info - Remove in production */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 p-2 bg-muted rounded text-xs">
            <p><strong>Debug Info:</strong></p>
            <p>GA4 Data Points: {ga4Data.length}</p>
            <p>Chart Data Points: {chartData.length}</p>
            <p>Selected Metrics: {selectedMetrics.join(', ')}</p>
            {ga4Data.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer">View GA4 Sample Data</summary>
                <pre className="mt-2 text-xs overflow-auto max-h-40">
                  {JSON.stringify(ga4Data.slice(0, 3), null, 2)}
                </pre>
              </details>
            )}
            {chartData.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer">View Chart Sample Data</summary>
                <pre className="mt-2 text-xs overflow-auto max-h-40">
                  {JSON.stringify(chartData.slice(0, 3), null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
            <p>No data available for the selected date range</p>
            <p className="text-xs">GA4 Data: {ga4Data.length} points</p>
            <p className="text-xs">Selected Metrics: {selectedMetrics.join(', ')}</p>
            {ga4Data.length > 0 && (
              <div className="text-xs mt-2 p-2 bg-muted rounded">
                <p>Sample data point:</p>
                <pre className="text-xs">{JSON.stringify(ga4Data[0], null, 2)}</pre>
              </div>
            )}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                yAxisId="metrics"
                tickFormatter={formatNumber}
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
              />
              {showSpendData && (
                <YAxis
                  yAxisId="spend"
                  orientation="right"
                  tickFormatter={formatCurrency}
                  className="text-xs"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
              )}
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ paddingTop: "20px" }}
                iconType="line"
              />

              {/* Render GA4 metric bars */}
              {GA4_METRICS.filter(metric => selectedMetricsSet.has(metric.key))
                .map(metric => {
                  // Check if this metric exists in chart data (even if value is 0)
                  const metricExists = chartData.some(point => 
                    point[metric.key] !== undefined && point[metric.key] !== null
                  );
                  
                  if (!metricExists && chartData.length > 0) {
                    console.warn(`Metric ${metric.key} key not found in chart data`, {
                      metric: metric.key,
                      chartDataSample: chartData[0],
                      allKeys: chartData[0] ? Object.keys(chartData[0]) : [],
                    });
                  }
                  
                  return (
                    <Bar
                      key={metric.key}
                      dataKey={metric.key}
                      fill={metric.color}
                      yAxisId="metrics"
                      name={metric.label}
                      radius={[4, 4, 0, 0]}
                    />
                  );
                })}

              {/* Render plan-specific spend lines */}
              {showSpendData && selectedPlanIds.size > 0 && activePlans
                .filter(plan => selectedPlanIds.has(plan.id))
                .map(plan => (
                  <Line
                    key={`plan-${plan.id}`}
                    type="monotone"
                    dataKey={`spend_plan_${plan.id}`}
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    dot={false}
                    yAxisId="spend"
                    name={`Spend: ${plan.name}`}
                  />
                ))}

              {/* Render spend data */}
              {showSpendData && spendPlatforms.map(platform => (
                <Line
                  key={`spend-${platform}`}
                  type="monotone"
                  dataKey={`spend_${platform}`}
                  stroke={SPEND_COLORS[platform] || SPEND_COLORS.default}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  yAxisId="spend"
                  name={`Spend (${platform})`}
                />
              ))}

              {/* Total spend line */}
              {showSpendData && (
                <Line
                  type="monotone"
                  dataKey="totalSpend"
                  stroke="#6b7280"
                  strokeWidth={2}
                  dot={false}
                  yAxisId="spend"
                  name="Total Spend"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

