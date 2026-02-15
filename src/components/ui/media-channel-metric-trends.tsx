'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { TimeFrame } from '@/lib/types/media-plan';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MediaChannelMetricTrendsProps {
  timeFrames: TimeFrame[];
  platformType?: 'meta-ads' | 'google-ads' | 'organic' | 'other';
}

export function MediaChannelMetricTrends({
  timeFrames,
  platformType = 'other',
}: MediaChannelMetricTrendsProps) {
  // Prepare chart data
  const chartData = timeFrames
    .filter((tf) => (tf.impressions || 0) > 0) // Only include timeframes with data
    .map((tf) => ({
      period: tf.period,
      date: tf.startDate,
      ctr: tf.ctr ? tf.ctr * 100 : 0, // Convert to percentage
      cpc: tf.cpc || 0,
      cpm: tf.cpm || 0,
      frequency: tf.frequency || 0,
      conversionRate:
        tf.conversions && tf.clicks
          ? (tf.conversions / tf.clicks) * 100
          : 0,
    }));

  if (chartData.length === 0) {
    return (
      <div className="h-[250px] flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-sm text-gray-500">
          No trend data available
        </p>
      </div>
    );
  }

  // Calculate average values for reference lines
  const avgCTR =
    chartData.reduce((sum, d) => sum + d.ctr, 0) / chartData.length;
  const avgCPC =
    chartData.reduce((sum, d) => sum + d.cpc, 0) / chartData.length;

  // Calculate trend direction (compare first half vs second half)
  const midpoint = Math.floor(chartData.length / 2);
  const firstHalfCTR =
    chartData.slice(0, midpoint).reduce((sum, d) => sum + d.ctr, 0) /
    midpoint;
  const secondHalfCTR =
    chartData
      .slice(midpoint)
      .reduce((sum, d) => sum + d.ctr, 0) /
    (chartData.length - midpoint);
  const ctrTrend = secondHalfCTR - firstHalfCTR;

  const firstHalfCPC =
    chartData.slice(0, midpoint).reduce((sum, d) => sum + d.cpc, 0) /
    midpoint;
  const secondHalfCPC =
    chartData
      .slice(midpoint)
      .reduce((sum, d) => sum + d.cpc, 0) /
    (chartData.length - midpoint);
  const cpcTrend = secondHalfCPC - firstHalfCPC;

  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'MMM d');
    } catch {
      return dateStr;
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold mb-2 text-sm text-gray-900">
            {data.period}
          </p>
          <div className="space-y-1">
            <p className="text-xs text-purple-600">
              <span className="font-medium">CTR:</span> {data.ctr.toFixed(2)}%
            </p>
            <p className="text-xs text-orange-600">
              <span className="font-medium">CPC:</span> ${data.cpc.toFixed(2)}
            </p>
            {platformType === 'meta-ads' && data.cpm > 0 && (
              <p className="text-xs text-blue-600">
                <span className="font-medium">CPM:</span> ${data.cpm.toFixed(2)}
              </p>
            )}
            {platformType === 'google-ads' && data.conversionRate > 0 && (
              <p className="text-xs text-green-600">
                <span className="font-medium">Conv. Rate:</span>{' '}
                {data.conversionRate.toFixed(2)}%
              </p>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  const TrendIndicator = ({ value, label }: { value: number; label: string }) => {
    const Icon =
      value > 0.1
        ? TrendingUp
        : value < -0.1
        ? TrendingDown
        : Minus;
    const color =
      value > 0.1
        ? 'text-green-600'
        : value < -0.1
        ? 'text-red-600'
        : 'text-gray-600';

    return (
      <div className="flex items-center gap-1">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs font-medium text-gray-700">{label}</span>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Trend Indicators */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">Metric Trends</h4>
        <div className="flex gap-4">
          <TrendIndicator
            value={ctrTrend}
            label={`CTR ${ctrTrend > 0 ? '+' : ''}${ctrTrend.toFixed(2)}%`}
          />
          <TrendIndicator
            value={-cpcTrend} // Negative because lower CPC is better
            label={`CPC ${cpcTrend > 0 ? '+' : ''}$${cpcTrend.toFixed(2)}`}
          />
        </div>
      </div>

      {/* Chart */}
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />

            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              stroke="#64748b"
              style={{ fontSize: '11px' }}
            />

            {/* Left Y-axis for CTR (%) */}
            <YAxis
              yAxisId="left"
              stroke="#9333ea"
              style={{ fontSize: '11px' }}
              label={{
                value: 'CTR (%)',
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: '11px', fill: '#9333ea' },
              }}
              tickFormatter={(value) => `${value.toFixed(1)}%`}
            />

            {/* Right Y-axis for CPC ($) */}
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#f97316"
              style={{ fontSize: '11px' }}
              label={{
                value: 'CPC ($)',
                angle: 90,
                position: 'insideRight',
                style: { fontSize: '11px', fill: '#f97316' },
              }}
              tickFormatter={(value) => `$${value.toFixed(2)}`}
            />

            <Tooltip content={<CustomTooltip />} />

            <Legend
              wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }}
              iconType="line"
            />

            {/* Average reference lines */}
            <ReferenceLine
              yAxisId="left"
              y={avgCTR}
              stroke="#9333ea"
              strokeDasharray="5 5"
              strokeOpacity={0.5}
              label={{
                value: `Avg CTR`,
                position: 'insideTopLeft',
                style: { fontSize: '10px', fill: '#9333ea' },
              }}
            />

            <ReferenceLine
              yAxisId="right"
              y={avgCPC}
              stroke="#f97316"
              strokeDasharray="5 5"
              strokeOpacity={0.5}
              label={{
                value: `Avg CPC`,
                position: 'insideTopRight',
                style: { fontSize: '10px', fill: '#f97316' },
              }}
            />

            {/* CTR Line */}
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="ctr"
              stroke="#9333ea"
              strokeWidth={2.5}
              dot={{ fill: '#9333ea', r: 4 }}
              name="CTR (%)"
            />

            {/* CPC Line */}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cpc"
              stroke="#f97316"
              strokeWidth={2.5}
              dot={{ fill: '#f97316', r: 4 }}
              name="CPC ($)"
            />

            {/* Platform-specific lines */}
            {platformType === 'meta-ads' && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cpm"
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ fill: '#3b82f6', r: 3 }}
                name="CPM ($)"
              />
            )}

            {platformType === 'google-ads' && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="conversionRate"
                stroke="#22c55e"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ fill: '#22c55e', r: 3 }}
                name="Conv. Rate (%)"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
