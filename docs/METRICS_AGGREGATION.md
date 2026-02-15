# Metrics Aggregation & Integration Guide

## Overview

The spend data integration layer now fetches and aggregates performance metrics alongside spend data, providing comprehensive campaign performance tracking within timeframes (weeks or months).

## Updated Data Flow

```
Ad Platform APIs (Google Ads / Meta Ads)
    ↓
    └─ Daily metrics with spend + performance data
    ↓
Spend Data Integration Layer
    ↓
    ├─ Filter by account ID
    ├─ Group by timeframe (week/month)
    ├─ Aggregate metrics
    └─ Calculate derived metrics (CTR, CPC, CPM)
    ↓
TimeFrame Objects (with enriched performance data)
    ↓
Media Plan UI (display metrics in dashboard)
```

## TimeFrame Interface (Updated)

```typescript
interface TimeFrame {
  period: string;           // e.g., "Nov 2025"
  planned: number;          // Planned budget
  actual: number;           // Actual spend
  startDate: string;        // ISO date
  endDate: string;          // ISO date

  // Performance metrics (populated when syncing with ad platforms)
  impressions?: number;     // Total impressions
  reach?: number;           // Unique users reached (Meta Ads only)
  clicks?: number;          // Total clicks
  ctr?: number;             // Click-through rate (0.05 = 5%)
  cpc?: number;             // Cost per click
  cpm?: number;             // Cost per 1000 impressions (Meta Ads)
  conversions?: number;     // Total conversions (Google Ads only)
  frequency?: number;       // Avg impressions per person (Meta Ads)
}
```

## Metrics Aggregation Logic

### 1. **Sum Metrics** (Simple Addition)
These metrics are summed across all days in the timeframe:

- **Spend**: `Σ daily_spend`
- **Impressions**: `Σ daily_impressions`
- **Clicks**: `Σ daily_clicks`
- **Conversions** (Google Ads): `Σ daily_conversions`
- **Reach** (Meta Ads): `Σ daily_reach` (note: may include overlap)

### 2. **Recalculated Metrics** (Derived from Aggregated Data)

#### Click-Through Rate (CTR)
```typescript
CTR = total_clicks / total_impressions
```
**Why recalculate?** Daily CTRs can't be averaged - we need total clicks ÷ total impressions.

**Example:**
- Day 1: 100 clicks, 10,000 impressions (1% CTR)
- Day 2: 50 clicks, 5,000 impressions (1% CTR)
- **Week CTR**: 150 / 15,000 = **1%** ✅ (not average of 1% and 1%)

#### Cost Per Click (CPC)
```typescript
CPC = total_spend / total_clicks
```
**Why recalculate?** Daily CPCs weighted by click volume.

**Example:**
- Day 1: $100 spend, 200 clicks ($0.50 CPC)
- Day 2: $200 spend, 200 clicks ($1.00 CPC)
- **Week CPC**: $300 / 400 = **$0.75** ✅ (not average of $0.50 and $1.00)

#### Cost Per Mille/CPM (Meta Ads)
```typescript
CPM = (total_spend / total_impressions) × 1000
```
**Why recalculate?** Same reason as CPC - weighted by impression volume.

#### Frequency (Meta Ads)
```typescript
// During aggregation, we calculate weighted sum:
weighted_frequency_sum = Σ (daily_frequency × daily_impressions)

// Then calculate weighted average:
frequency = weighted_frequency_sum / total_impressions
```
**Why weighted?** Days with more impressions should have more influence on the average.

**Example:**
- Day 1: 1.5 frequency, 1,000 impressions → weight = 1,500
- Day 2: 2.0 frequency, 9,000 impressions → weight = 18,000
- **Week Frequency**: (1,500 + 18,000) / 10,000 = **1.95** ✅

## API Response Mapping

### Google Ads Response → TimeFrame
```typescript
// API returns daily metrics
{
  date: "2026-02-15",
  spend: 125.50,
  impressions: 10000,
  clicks: 500,
  ctr: 0.05,           // Daily CTR (ignored for aggregation)
  averageCpc: 0.25,    // Daily CPC (ignored for aggregation)
  conversions: 25
}

// Aggregated into weekly/monthly TimeFrame
{
  period: "Week 7",
  actual: 878.50,      // Sum of daily spend
  impressions: 70000,  // Sum of daily impressions
  clicks: 3500,        // Sum of daily clicks
  ctr: 0.05,          // Recalculated: 3500 / 70000
  cpc: 0.251,         // Recalculated: 878.50 / 3500
  conversions: 175     // Sum of daily conversions
}
```

### Meta Ads Response → TimeFrame
```typescript
// API returns daily metrics
{
  dateStart: "2026-02-15",
  spend: 200.00,
  impressions: 15000,
  reach: 12000,
  clicks: 600,
  ctr: 0.04,          // Daily CTR (ignored)
  cpc: 0.33,          // Daily CPC (ignored)
  cpm: 13.33,         // Daily CPM (ignored)
  frequency: 1.25
}

// Aggregated into weekly/monthly TimeFrame
{
  period: "Week 7",
  actual: 1400.00,    // Sum of daily spend
  impressions: 105000, // Sum of daily impressions
  reach: 84000,       // Sum of daily reach
  clicks: 4200,       // Sum of daily clicks
  ctr: 0.04,          // Recalculated: 4200 / 105000
  cpc: 0.33,          // Recalculated: 1400 / 4200
  cpm: 13.33,         // Recalculated: (1400 / 105000) × 1000
  frequency: 1.25     // Weighted average of daily frequencies
}
```

## Usage Example

### Fetching Enriched Data

```typescript
import { fetchChannelSpendData } from '@/lib/api/spend-data-integration';

// Fetch spend + performance metrics for a channel
const result = await fetchChannelSpendData(
  channel,
  '2026-02-01',
  '2026-02-28'
);

if (result.success && result.updatedTimeFrames) {
  // TimeFrames now include performance metrics
  result.updatedTimeFrames.forEach(tf => {
    console.log(`${tf.period}:`);
    console.log(`  Spend: $${tf.actual}`);
    console.log(`  Impressions: ${tf.impressions}`);
    console.log(`  Clicks: ${tf.clicks}`);
    console.log(`  CTR: ${(tf.ctr * 100).toFixed(2)}%`);
    console.log(`  CPC: $${tf.cpc?.toFixed(2)}`);

    // Platform-specific metrics
    if (tf.conversions !== undefined) {
      console.log(`  Conversions: ${tf.conversions}`);
    }
    if (tf.reach !== undefined) {
      console.log(`  Reach: ${tf.reach}`);
    }
  });
}
```

### Displaying in UI

```tsx
function TimeFrameMetrics({ timeFrame }: { timeFrame: TimeFrame }) {
  return (
    <div>
      <h3>{timeFrame.period}</h3>
      <div>Spend: ${timeFrame.actual.toFixed(2)}</div>

      {/* Show metrics if available */}
      {timeFrame.impressions !== undefined && (
        <>
          <div>Impressions: {timeFrame.impressions.toLocaleString()}</div>
          <div>Clicks: {timeFrame.clicks?.toLocaleString()}</div>
          <div>CTR: {((timeFrame.ctr || 0) * 100).toFixed(2)}%</div>
          <div>CPC: ${(timeFrame.cpc || 0).toFixed(2)}</div>

          {/* Google Ads specific */}
          {timeFrame.conversions !== undefined && (
            <div>Conversions: {timeFrame.conversions}</div>
          )}

          {/* Meta Ads specific */}
          {timeFrame.reach !== undefined && (
            <>
              <div>Reach: {timeFrame.reach.toLocaleString()}</div>
              <div>Frequency: {timeFrame.frequency?.toFixed(2)}</div>
              <div>CPM: ${(timeFrame.cpm || 0).toFixed(2)}</div>
            </>
          )}
        </>
      )}
    </div>
  );
}
```

## Performance Considerations

### Aggregation Efficiency
- Single pass through data points
- O(n × m) complexity where:
  - n = number of data points
  - m = number of timeframes (typically small: 4-12)
- Maps used for O(1) lookups

### Memory Usage
- Metrics stored per timeframe (not per day)
- ~200 bytes per timeframe with all metrics
- For 12 months: ~2.4 KB total

## Validation & Edge Cases

### Division by Zero
All derived metrics check for zero denominators:
```typescript
const ctr = impressions > 0 ? clicks / impressions : 0;
const cpc = clicks > 0 ? spend / clicks : 0;
const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
```

### Missing Data
- Optional fields use `undefined` when not applicable
- Platform-specific metrics only added for relevant platforms
- Zero values used for missing numeric fields in aggregation

### Timeframe Matching
- Uses `date-fns` `isWithinInterval` for accurate date range matching
- Handles month/week boundaries correctly
- Supports both inclusive and exclusive date ranges

## Future Enhancements

1. **Database Storage**: Save aggregated metrics to avoid re-calculation
2. **Caching**: Cache aggregated timeframes for faster UI updates
3. **Real-time Updates**: WebSocket for live metric updates
4. **Comparison Views**: Compare periods (week-over-week, month-over-month)
5. **Forecasting**: Predict end-of-period metrics based on current performance
6. **Alerts**: Notify when metrics exceed/drop below thresholds

## Related Documentation

- [Ad Performance Metrics System](./AD_PERFORMANCE_METRICS.md) - Database schema and storage
- [API Integration Guide](./API_INTEGRATION.md) - Fetching data from ad platforms
- Media Plan Types - TypeScript interfaces and types
