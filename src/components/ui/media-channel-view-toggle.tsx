'use client';

import { useState } from 'react';
import { Button } from './button';
import { DollarSign, TrendingUp } from 'lucide-react';
import { MediaChannelPerformanceMetrics } from './media-channel-performance-metrics';
import { MediaChannelPerformanceChart } from './media-channel-performance-chart';
import { TimeFrame } from '@/lib/types/media-plan';

interface MediaChannelViewToggleProps {
  timeFrames: TimeFrame[];
  platformType?: 'meta-ads' | 'google-ads' | 'organic' | 'other';
  selectedMonth?: Date;
  budgetView: React.ReactNode; // The existing budget chart/progress view
}

type ViewMode = 'budget' | 'performance';

export function MediaChannelViewToggle({
  timeFrames,
  platformType = 'other',
  selectedMonth,
  budgetView,
}: MediaChannelViewToggleProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('budget');

  // Check if we have performance data to show
  const hasPerformanceData = timeFrames.some(
    (tf) => (tf.impressions || 0) > 0 || (tf.clicks || 0) > 0
  );

  return (
    <div className="space-y-4">
      {/* View Toggle Buttons */}
      {hasPerformanceData && (
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={viewMode === 'budget' ? 'default' : 'outline'}
              onClick={() => setViewMode('budget')}
              className="h-8 text-xs"
            >
              <DollarSign className="h-3 w-3 mr-1" />
              Budget View
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'performance' ? 'default' : 'outline'}
              onClick={() => setViewMode('performance')}
              className="h-8 text-xs"
            >
              <TrendingUp className="h-3 w-3 mr-1" />
              Performance View
            </Button>
          </div>
        </div>
      )}

      {/* Content based on view mode */}
      {viewMode === 'budget' ? (
        // Show the existing budget view (passed as children)
        <>{budgetView}</>
      ) : (
        // Show performance view
        <div className="space-y-4">
          {/* Performance Metrics Cards */}
          <MediaChannelPerformanceMetrics
            timeFrames={timeFrames}
            platformType={platformType}
            selectedMonth={selectedMonth}
          />

          {/* Performance Chart */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-3">
              Performance Over Time
            </h4>
            <MediaChannelPerformanceChart
              timeFrames={timeFrames}
              platformType={platformType}
            />
          </div>
        </div>
      )}
    </div>
  );
}
