'use client';

import { TrendingUp, MousePointerClick, Eye, Target, DollarSign, Users } from 'lucide-react';
import { TimeFrame } from '@/lib/types/media-plan';

interface MediaChannelPerformanceMetricsProps {
  timeFrames: TimeFrame[];
  platformType?: 'meta-ads' | 'google-ads' | 'organic' | 'other';
  selectedMonth?: Date;
}

// Helper function to format large numbers with abbreviations
const formatNumber = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '—';

  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  } else {
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
};

// Format percentage
const formatPercentage = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '—';
  return `${(value * 100).toFixed(2)}%`;
};

// Format currency
const formatCurrency = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '—';
  return `$${value.toFixed(2)}`;
};

export function MediaChannelPerformanceMetrics({
  timeFrames,
  platformType = 'other',
  selectedMonth,
}: MediaChannelPerformanceMetricsProps) {
  // Aggregate metrics from all timeframes for the selected period
  const aggregatedMetrics = timeFrames.reduce(
    (acc, tf) => ({
      impressions: (acc.impressions || 0) + (tf.impressions || 0),
      reach: (acc.reach || 0) + (tf.reach || 0),
      clicks: (acc.clicks || 0) + (tf.clicks || 0),
      conversions: (acc.conversions || 0) + (tf.conversions || 0),
      spend: (acc.spend || 0) + (tf.actual || 0),
    }),
    { impressions: 0, reach: 0, clicks: 0, conversions: 0, spend: 0 }
  );

  // Calculate aggregated rates
  const aggregatedCTR =
    aggregatedMetrics.impressions > 0
      ? aggregatedMetrics.clicks / aggregatedMetrics.impressions
      : 0;

  const aggregatedCPC =
    aggregatedMetrics.clicks > 0
      ? aggregatedMetrics.spend / aggregatedMetrics.clicks
      : 0;

  // Check if we have any performance data
  const hasPerformanceData = aggregatedMetrics.impressions > 0;

  if (!hasPerformanceData) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 text-center border border-gray-200">
        <p className="text-sm text-gray-500">
          No performance data available. Sync with your ad platform to see metrics.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-900">Performance Metrics</h4>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {/* Impressions */}
        <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-blue-300 transition-colors">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-medium text-gray-600">Impressions</span>
          </div>
          <p className="text-lg font-bold text-gray-900">
            {formatNumber(aggregatedMetrics.impressions)}
          </p>
        </div>

        {/* Clicks */}
        <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-green-300 transition-colors">
          <div className="flex items-center gap-2 mb-1">
            <MousePointerClick className="h-4 w-4 text-green-600" />
            <span className="text-xs font-medium text-gray-600">Clicks</span>
          </div>
          <p className="text-lg font-bold text-gray-900">
            {formatNumber(aggregatedMetrics.clicks)}
          </p>
        </div>

        {/* CTR */}
        <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-purple-300 transition-colors">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-purple-600" />
            <span className="text-xs font-medium text-gray-600">CTR</span>
          </div>
          <p className="text-lg font-bold text-gray-900">
            {formatPercentage(aggregatedCTR)}
          </p>
        </div>

        {/* CPC */}
        <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-orange-300 transition-colors">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-4 w-4 text-orange-600" />
            <span className="text-xs font-medium text-gray-600">CPC</span>
          </div>
          <p className="text-lg font-bold text-gray-900">
            {formatCurrency(aggregatedCPC)}
          </p>
        </div>

        {/* Platform-specific metrics */}
        {platformType === 'google-ads' && (
          <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-emerald-300 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-medium text-gray-600">Conversions</span>
            </div>
            <p className="text-lg font-bold text-gray-900">
              {formatNumber(aggregatedMetrics.conversions)}
            </p>
          </div>
        )}

        {platformType === 'meta-ads' && (
          <div className="bg-white rounded-lg p-3 border border-gray-200 hover:border-indigo-300 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-indigo-600" />
              <span className="text-xs font-medium text-gray-600">Reach</span>
            </div>
            <p className="text-lg font-bold text-gray-900">
              {formatNumber(aggregatedMetrics.reach)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
