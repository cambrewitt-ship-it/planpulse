'use client';

import { Eye, MousePointerClick, TrendingUp, DollarSign, Target, Users } from 'lucide-react';
import { TimeFrame } from '@/lib/types/media-plan';

interface MediaChannelMetricsInlineProps {
  timeFrames: TimeFrame[];
  platformType?: 'meta-ads' | 'google-ads' | 'organic' | 'other';
}

// Helper functions
const formatNumber = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '—';
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
};

const formatPercentage = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '—';
  return `${(value * 100).toFixed(2)}%`;
};

const formatCurrency = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '—';
  return `$${value.toFixed(2)}`;
};

export function MediaChannelMetricsInline({
  timeFrames,
  platformType = 'other',
}: MediaChannelMetricsInlineProps) {
  // Aggregate metrics
  const aggregated = timeFrames.reduce(
    (acc, tf) => ({
      impressions: (acc.impressions || 0) + (tf.impressions || 0),
      reach: (acc.reach || 0) + (tf.reach || 0),
      clicks: (acc.clicks || 0) + (tf.clicks || 0),
      conversions: (acc.conversions || 0) + (tf.conversions || 0),
      spend: (acc.spend || 0) + (tf.actual || 0),
    }),
    { impressions: 0, reach: 0, clicks: 0, conversions: 0, spend: 0 }
  );

  // Calculate derived metrics
  const ctr = aggregated.impressions > 0
    ? aggregated.clicks / aggregated.impressions
    : 0;

  const cpc = aggregated.clicks > 0
    ? aggregated.spend / aggregated.clicks
    : 0;

  // Check if we have data
  const hasData = aggregated.impressions > 0;

  if (!hasData) {
    return null; // Don't show anything if no data
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-3 border border-blue-100">
      <div className="flex items-center justify-between flex-wrap gap-2">
        {/* Impressions */}
        <div className="flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5 text-blue-600" />
          <div className="flex items-baseline gap-1">
            <span className="text-xs font-medium text-gray-600">Impressions:</span>
            <span className="text-sm font-bold text-gray-900">
              {formatNumber(aggregated.impressions)}
            </span>
          </div>
        </div>

        {/* Clicks */}
        <div className="flex items-center gap-1.5">
          <MousePointerClick className="h-3.5 w-3.5 text-green-600" />
          <div className="flex items-baseline gap-1">
            <span className="text-xs font-medium text-gray-600">Clicks:</span>
            <span className="text-sm font-bold text-gray-900">
              {formatNumber(aggregated.clicks)}
            </span>
          </div>
        </div>

        {/* CTR */}
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-purple-600" />
          <div className="flex items-baseline gap-1">
            <span className="text-xs font-medium text-gray-600">CTR:</span>
            <span className="text-sm font-bold text-gray-900">
              {formatPercentage(ctr)}
            </span>
          </div>
        </div>

        {/* CPC */}
        <div className="flex items-center gap-1.5">
          <DollarSign className="h-3.5 w-3.5 text-orange-600" />
          <div className="flex items-baseline gap-1">
            <span className="text-xs font-medium text-gray-600">CPC:</span>
            <span className="text-sm font-bold text-gray-900">
              {formatCurrency(cpc)}
            </span>
          </div>
        </div>

        {/* Platform-specific: Conversions (Google Ads) */}
        {platformType === 'google-ads' && aggregated.conversions > 0 && (
          <div className="flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-emerald-600" />
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-medium text-gray-600">Conversions:</span>
              <span className="text-sm font-bold text-gray-900">
                {formatNumber(aggregated.conversions)}
              </span>
            </div>
          </div>
        )}

        {/* Platform-specific: Reach (Meta Ads) */}
        {platformType === 'meta-ads' && aggregated.reach > 0 && (
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-indigo-600" />
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-medium text-gray-600">Reach:</span>
              <span className="text-sm font-bold text-gray-900">
                {formatNumber(aggregated.reach)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
