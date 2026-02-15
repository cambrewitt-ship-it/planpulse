# Performance Metrics UI Integration Guide

## Overview

This guide explains how to add performance metrics display to your media channel dashboard. The new components provide a comprehensive view of campaign performance with metrics like impressions, clicks, CTR, CPC, and conversions.

## New Components

### 1. `MediaChannelPerformanceMetrics`
**File**: `/src/components/ui/media-channel-performance-metrics.tsx`

Displays performance metrics in a grid of cards with icons and formatted values.

**Features**:
- Aggregates metrics from all timeframes
- Formats large numbers with K/M abbreviations
- Shows platform-specific metrics (Conversions for Google Ads, Reach for Meta Ads)
- Responsive grid layout (2 columns on mobile, 3 on desktop)
- Color-coded icons for each metric

**Props**:
```typescript
interface MediaChannelPerformanceMetricsProps {
  timeFrames: TimeFrame[];
  platformType?: 'meta-ads' | 'google-ads' | 'organic' | 'other';
  selectedMonth?: Date;
}
```

### 2. `MediaChannelPerformanceChart`
**File**: `/src/components/ui/media-channel-performance-chart.tsx`

Dual Y-axis chart showing spend vs performance metrics over time.

**Features**:
- Left Y-axis: Spend (bar chart)
- Right Y-axis: Impressions, Clicks (line charts)
- Platform-specific metrics (Conversions/Reach as dashed lines)
- Interactive tooltip with all metric values
- Color-coded legend
- Responsive container

**Props**:
```typescript
interface MediaChannelPerformanceChartProps {
  timeFrames: TimeFrame[];
  platformType?: 'meta-ads' | 'google-ads' | 'organic' | 'other';
}
```

### 3. `MediaChannelViewToggle`
**File**: `/src/components/ui/media-channel-view-toggle.tsx`

Toggle component to switch between Budget View and Performance View.

**Features**:
- Two-button toggle (Budget View / Performance View)
- Only shows toggle if performance data is available
- Wraps existing budget view and new performance views
- Smooth transitions between views

**Props**:
```typescript
interface MediaChannelViewToggleProps {
  timeFrames: TimeFrame[];
  platformType?: 'meta-ads' | 'google-ads' | 'organic' | 'other';
  selectedMonth?: Date;
  budgetView: React.ReactNode; // Existing budget chart/progress
}
```

## Integration into MediaChannelCard

### Option A: Simple Integration (Below Budget Chart)

Add performance metrics directly below the existing chart:

```tsx
// In MediaChannelCard.tsx

import { MediaChannelPerformanceMetrics } from '@/components/ui/media-channel-performance-metrics';
import { MediaChannelPerformanceChart } from '@/components/ui/media-channel-performance-chart';

// After the budget pacing chart section (around line 1170)
// Add this new section:

{/* Performance Metrics Section */}
{hasConnectedAccount && (
  <div className="mt-6 space-y-4">
    <MediaChannelPerformanceMetrics
      timeFrames={channel.spendData}
      platformType={channel.isMetaAds ? 'meta-ads' : 'google-ads'}
      selectedMonth={selectedMonth}
    />

    <div className="pt-4 border-t border-gray-200">
      <h4 className="text-sm font-semibold text-gray-900 mb-3">
        Performance Trend
      </h4>
      <MediaChannelPerformanceChart
        timeFrames={channel.spendData}
        platformType={channel.isMetaAds ? 'meta-ads' : 'google-ads'}
      />
    </div>
  </div>
)}
```

### Option B: With View Toggle (Recommended)

Replace the budget section with a toggleable view:

```tsx
// In MediaChannelCard.tsx

import { MediaChannelViewToggle } from '@/components/ui/media-channel-view-toggle';

// Replace the entire budget chart section (lines ~922-1169) with:

<MediaChannelViewToggle
  timeFrames={channel.spendData}
  platformType={channel.isMetaAds ? 'meta-ads' : 'google-ads'}
  selectedMonth={selectedMonth}
  budgetView={
    <>
      {/* Move all existing budget view content here */}
      <div className="flex items-center justify-between mb-3 gap-2">
        {/* Month navigation, campaign filter, refresh button */}
      </div>

      {/* Stats Section */}
      <div className="mb-4">
        {/* Current Daily Spend, Net Planned Spend, Actual Spend */}
      </div>

      {/* Progress Bars */}
      <div className="space-y-3 mb-4">
        {/* Month Progress, Spend Progress */}
      </div>

      {/* Budget Chart */}
      <div className="relative">
        <div className="h-[300px]">
          {/* Existing ComposedChart */}
        </div>
      </div>
    </>
  }
/>
```

## Metric Formatting

The components use these formatting functions:

### Number Formatting
```typescript
const formatNumber = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '—';

  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`; // 1.5M
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`; // 45.2K
  } else {
    return value.toLocaleString('en-US'); // 123
  }
};
```

### Percentage Formatting
```typescript
const formatPercentage = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '—';
  return `${(value * 100).toFixed(2)}%`; // 5.23%
};
```

### Currency Formatting
```typescript
const formatCurrency = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '—';
  return `$${value.toFixed(2)}`; // $0.25
};
```

## Metric Aggregation

The components automatically aggregate metrics across all timeframes:

```typescript
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

// Then calculate derived metrics
const aggregatedCTR = aggregatedMetrics.impressions > 0
  ? aggregatedMetrics.clicks / aggregatedMetrics.impressions
  : 0;

const aggregatedCPC = aggregatedMetrics.clicks > 0
  ? aggregatedMetrics.spend / aggregatedMetrics.clicks
  : 0;
```

## Styling

### Metric Cards
- White background with gray border
- Hover effect changes border color to metric-specific color
- Icon colored to match metric type
- Large, bold numbers for easy reading

### Chart
- Dual Y-axis (spend on left, metrics on right)
- Color-coded lines/bars:
  - Blue (#2563eb): Spend
  - Purple (#9333ea): Impressions
  - Green (#22c55e): Clicks
  - Orange (#f97316): Conversions (Google Ads)
  - Indigo (#6366f1): Reach (Meta Ads)

### Toggle Buttons
- Active button uses primary color
- Inactive buttons use outline style
- Small icons for visual distinction

## Platform-Specific Display

### Google Ads
Shows:
- Impressions
- Clicks
- CTR
- CPC
- **Conversions** (unique to Google Ads)

### Meta Ads
Shows:
- Impressions
- Clicks
- CTR
- CPC
- **Reach** (unique to Meta Ads)

### Organic/Other
Shows basic metrics when available, with graceful fallback to "No data" message.

## Empty State Handling

All components gracefully handle missing data:

```tsx
if (!hasPerformanceData) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 text-center border border-gray-200">
      <p className="text-sm text-gray-500">
        No performance data available. Sync with your ad platform to see metrics.
      </p>
    </div>
  );
}
```

## Accessibility

- All icons have appropriate `aria-label` attributes
- Color is not the only indicator (also uses text labels)
- Keyboard navigation supported on all interactive elements
- High contrast between text and backgrounds

## Responsive Design

- Grid layout adjusts from 2 columns (mobile) to 3 columns (desktop)
- Chart uses `ResponsiveContainer` for fluid sizing
- Text sizes adjust appropriately for different screen sizes

## Example Integration

Here's a complete example showing how to integrate into an existing page:

```tsx
'use client';

import MediaChannelCard from '@/components/MediaChannelCard';
import { MediaChannelViewToggle } from '@/components/ui/media-channel-view-toggle';

export default function Dashboard() {
  // ... existing state and handlers

  return (
    <div className="space-y-6">
      {channels.map((channel) => (
        <MediaChannelCard
          key={channel.id}
          channel={{
            ...channel,
            // Make sure spendData includes performance metrics
            spendData: channel.spendData.map(tf => ({
              ...tf,
              impressions: tf.impressions || 0,
              clicks: tf.clicks || 0,
              ctr: tf.ctr || 0,
              // ... other metrics
            }))
          }}
        />
      ))}
    </div>
  );
}
```

## Next Steps

1. **Test with Real Data**: Ensure your API returns performance metrics
2. **Verify Aggregation**: Check that weekly/monthly aggregation works correctly
3. **Add Tooltips**: Consider adding help tooltips to explain each metric
4. **Export Functionality**: Add ability to export metrics to CSV/Excel
5. **Comparison Views**: Add period-over-period comparison features

## Related Documentation

- [Metrics Aggregation Guide](./METRICS_AGGREGATION.md) - How metrics are calculated
- [Ad Performance Metrics System](./AD_PERFORMANCE_METRICS.md) - Database schema
- [TimeFrame Interface](../src/lib/types/media-plan.ts) - TypeScript types
