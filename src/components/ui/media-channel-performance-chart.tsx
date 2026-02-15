'use client';

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { TimeFrame } from '@/lib/types/media-plan';

interface MediaChannelPerformanceChartProps {
  timeFrames: TimeFrame[];
  platformType?: 'meta-ads' | 'google-ads' | 'organic' | 'other';
}

export function MediaChannelPerformanceChart({
  timeFrames,
  platformType = 'other',
}: MediaChannelPerformanceChartProps) {
  // Prepare chart data
  const chartData = timeFrames.map((tf) => ({
    period: tf.period,
    date: tf.startDate,
    spend: tf.actual,
    impressions: tf.impressions || 0,
    clicks: tf.clicks || 0,
    conversions: tf.conversions || 0,
    reach: tf.reach || 0,
  }));

  // Check if we have performance data
  const hasPerformanceData = chartData.some(d => d.impressions > 0 || d.clicks > 0);

  if (!hasPerformanceData) {
    return (
      <div className="h-[300px] flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-sm text-gray-500">
          No performance data available for charting
        </p>
      </div>
    );
  }

  // Format functions
  const formatCurrency = (value: number) => {
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}k`;
    }
    return `$${value.toFixed(0)}`;
  };

  const formatNumber = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toString();
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'MMM d');
    } catch {
      return dateStr;
    }
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold mb-2 text-sm text-gray-900">{data.period}</p>
          <div className="space-y-1">
            <p className="text-xs text-blue-600">
              <span className="font-medium">Spend:</span> ${data.spend.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-purple-600">
              <span className="font-medium">Impressions:</span> {data.impressions.toLocaleString()}
            </p>
            <p className="text-xs text-green-600">
              <span className="font-medium">Clicks:</span> {data.clicks.toLocaleString()}
            </p>
            {platformType === 'google-ads' && data.conversions > 0 && (
              <p className="text-xs text-orange-600">
                <span className="font-medium">Conversions:</span> {data.conversions.toLocaleString()}
              </p>
            )}
            {platformType === 'meta-ads' && data.reach > 0 && (
              <p className="text-xs text-indigo-600">
                <span className="font-medium">Reach:</span> {data.reach.toLocaleString()}
              </p>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 10, right: 60, left: 10, bottom: 25 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />

          {/* X Axis - Date/Period */}
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            stroke="#64748b"
            style={{ fontSize: '12px' }}
          />

          {/* Left Y Axis - Spend */}
          <YAxis
            yAxisId="left"
            tickFormatter={formatCurrency}
            stroke="#2563eb"
            style={{ fontSize: '12px' }}
            label={{
              value: 'Spend',
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: '12px', fill: '#2563eb' },
            }}
          />

          {/* Right Y Axis - Impressions/Clicks */}
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={formatNumber}
            stroke="#9333ea"
            style={{ fontSize: '12px' }}
            label={{
              value: 'Impressions / Clicks',
              angle: 90,
              position: 'insideRight',
              style: { fontSize: '12px', fill: '#9333ea' },
            }}
          />

          <Tooltip content={<CustomTooltip />} />

          <Legend
            wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }}
            iconType="line"
          />

          {/* Spend - Bar chart on left axis */}
          <Bar
            yAxisId="left"
            dataKey="spend"
            fill="#2563eb"
            fillOpacity={0.6}
            name="Spend"
            radius={[4, 4, 0, 0]}
          />

          {/* Impressions - Line on right axis */}
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="impressions"
            stroke="#9333ea"
            strokeWidth={2}
            dot={{ fill: '#9333ea', r: 4 }}
            name="Impressions"
          />

          {/* Clicks - Line on right axis */}
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="clicks"
            stroke="#22c55e"
            strokeWidth={2}
            dot={{ fill: '#22c55e', r: 4 }}
            name="Clicks"
          />

          {/* Platform-specific metrics */}
          {platformType === 'google-ads' && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="conversions"
              stroke="#f97316"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ fill: '#f97316', r: 4 }}
              name="Conversions"
            />
          )}

          {platformType === 'meta-ads' && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="reach"
              stroke="#6366f1"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ fill: '#6366f1', r: 4 }}
              name="Reach"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
