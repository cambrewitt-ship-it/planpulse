'use client';

import { useState } from 'react';
import { Button } from './button';
import { DollarSign, TrendingUp, BarChart3 } from 'lucide-react';
import { TimeFrame } from '@/lib/types/media-plan';
import { MediaChannelPerformanceMetrics } from './media-channel-performance-metrics';
import { MediaChannelPerformanceChart } from './media-channel-performance-chart';
import { MediaChannelMetricTrends } from './media-channel-metric-trends';
import { MediaChannelMetricsInline } from './media-channel-metrics-inline';
import {
  MediaChannelMetricFilters,
  MetricFilters,
  applyMetricFilters,
} from './media-channel-metric-filters';
import { MediaChannelExportButton } from './media-channel-export-button';

interface MediaChannelEnhancedViewProps {
  timeFrames: TimeFrame[];
  platformType?: 'meta-ads' | 'google-ads' | 'organic' | 'other';
  channelName: string;
  selectedMonth?: Date;
  budgetView: React.ReactNode; // The existing budget chart/progress view
  budgetPacingHeader?: React.ReactNode; // Budget Pacing header section (title, date range, campaign filter)
}

type ViewMode = 'budget' | 'performance' | 'trends';

export function MediaChannelEnhancedView({
  timeFrames,
  platformType = 'other',
  channelName,
  selectedMonth,
  budgetView,
  budgetPacingHeader,
}: MediaChannelEnhancedViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('budget');
  const [filters, setFilters] = useState<MetricFilters>({});

  // Check if we have performance data to show
  const hasPerformanceData = timeFrames.some(
    (tf) => (tf.impressions || 0) > 0 || (tf.clicks || 0) > 0
  );

  // Apply filters to timeframes
  const filteredTimeFrames = hasPerformanceData
    ? applyMetricFilters(timeFrames, filters)
    : timeFrames;

  // Count active filters
  const activeFilterCount = Object.keys(filters).filter(
    (key) => filters[key as keyof MetricFilters] !== undefined
  ).length;

  return (
    <div className="space-y-4">
      {/* Budget Pacing Header - shown above buttons when in budget view */}
      {viewMode === 'budget' && budgetPacingHeader && (
        <div className="mb-2">
          {budgetPacingHeader}
        </div>
      )}

      {/* Header with View Toggle and Actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {/* View Toggle Buttons */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={viewMode === 'budget' ? 'default' : 'outline'}
            onClick={() => setViewMode('budget')}
            className="h-8 text-xs"
          >
            <DollarSign className="h-3 w-3 mr-1" />
            Budget
          </Button>

          {hasPerformanceData && (
            <>
              <Button
                size="sm"
                variant={viewMode === 'performance' ? 'default' : 'outline'}
                onClick={() => setViewMode('performance')}
                className="h-8 text-xs"
              >
                <BarChart3 className="h-3 w-3 mr-1" />
                Performance
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'trends' ? 'default' : 'outline'}
                onClick={() => setViewMode('trends')}
                className="h-8 text-xs"
              >
                <TrendingUp className="h-3 w-3 mr-1" />
                Trends
              </Button>
            </>
          )}
        </div>

        {/* Filter and Export Actions */}
        {hasPerformanceData && viewMode !== 'budget' && (
          <div className="flex gap-2">
            <MediaChannelMetricFilters
              filters={filters}
              onFiltersChange={setFilters}
              platformType={platformType}
            />
            <MediaChannelExportButton
              timeFrames={filteredTimeFrames}
              channelName={channelName}
              platformType={platformType}
            />
          </div>
        )}
      </div>

      {/* Filter Summary */}
      {activeFilterCount > 0 && viewMode !== 'budget' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-800">
            <strong>{filteredTimeFrames.length}</strong> of{' '}
            <strong>{timeFrames.length}</strong> periods match your filters
            {filteredTimeFrames.length === 0 && (
              <span className="ml-2 text-blue-600">
                (Try adjusting your filter criteria)
              </span>
            )}
          </p>
        </div>
      )}

      {/* Inline Metrics (Budget View Only) */}
      {viewMode === 'budget' && hasPerformanceData && (
        <MediaChannelMetricsInline
          timeFrames={timeFrames}
          platformType={platformType}
        />
      )}

      {/* Content based on view mode */}
      {viewMode === 'budget' ? (
        // Show the existing budget view
        <>{budgetView}</>
      ) : viewMode === 'performance' ? (
        // Show performance metrics and chart
        <div className="space-y-4">
          {filteredTimeFrames.length > 0 ? (
            <>
              {/* Performance Metrics Cards */}
              <MediaChannelPerformanceMetrics
                timeFrames={filteredTimeFrames}
                platformType={platformType}
                selectedMonth={selectedMonth}
              />

              {/* Performance Chart */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3">
                  Performance Over Time
                </h4>
                <MediaChannelPerformanceChart
                  timeFrames={filteredTimeFrames}
                  platformType={platformType}
                />
              </div>
            </>
          ) : (
            <div className="bg-gray-50 rounded-lg p-8 text-center border border-gray-200">
              <p className="text-sm text-gray-500">
                No data matches your current filters
              </p>
            </div>
          )}
        </div>
      ) : (
        // Show metric trends
        <div className="space-y-4">
          {filteredTimeFrames.length > 0 ? (
            <MediaChannelMetricTrends
              timeFrames={filteredTimeFrames}
              platformType={platformType}
            />
          ) : (
            <div className="bg-gray-50 rounded-lg p-8 text-center border border-gray-200">
              <p className="text-sm text-gray-500">
                No data matches your current filters
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
