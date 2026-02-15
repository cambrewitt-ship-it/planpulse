# Complete Performance Metrics Integration Guide

## 🎉 Overview

This guide provides step-by-step instructions for integrating the complete performance metrics system into your MediaChannelCard component. The system includes:

- ✅ Performance metrics display (Impressions, Clicks, CTR, CPC, etc.)
- ✅ Dual Y-axis performance charts
- ✅ Metric trend analysis with CTR/CPC trends over time
- ✅ Advanced filtering by metric thresholds
- ✅ CSV/Excel export functionality
- ✅ Inline metrics summary
- ✅ Three-view toggle (Budget / Performance / Trends)

---

## 📦 What Was Created

### Components

1. **MediaChannelPerformanceMetrics** - Grid display of key metrics
2. **MediaChannelPerformanceChart** - Dual Y-axis chart (spend vs metrics)
3. **MediaChannelMetricTrends** - CTR/CPC trend analysis with indicators
4. **MediaChannelMetricsInline** - Compact horizontal metrics display
5. **MediaChannelMetricFilters** - Filter popover with threshold controls
6. **MediaChannelExportButton** - Export dropdown (CSV/Excel/Summary)
7. **MediaChannelEnhancedView** - Master component combining all features
8. **Popover** - Radix UI popover component (utility)

### Utilities

1. **export-metrics.ts** - Export functions (CSV, Excel, Summary Report)

---

## 🚀 Quick Integration (Recommended)

### Step 1: Import the Enhanced View Component

In your `MediaChannelCard.tsx` (around line 13):

```typescript
import { MediaChannelEnhancedView } from '@/components/ui/media-channel-enhanced-view';
```

### Step 2: Replace the Budget Chart Section

Find the "Budget Pacing" section (around line 920-1169) and replace it with:

```tsx
{/* Replace entire budget chart section with enhanced view */}
<MediaChannelEnhancedView
  timeFrames={chartData} // Use the calculated chartData
  platformType={channel.isMetaAds ? 'meta-ads' : 'google-ads'}
  channelName={channel.name}
  selectedMonth={selectedMonth}
  budgetView={
    <>
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-3">
          <h4 className="text-sm font-semibold text-[#0f172a]">Budget Pacing</h4>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleMonthChange(subMonths(selectedMonth, 1))}
              className="h-7 w-7 p-0"
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="text-xs font-medium text-[#0f172a] min-w-[80px] text-center">
              {format(selectedMonth, 'MMM yyyy')}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleMonthChange(addMonths(selectedMonth, 1))}
              className="h-7 w-7 p-0"
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Campaign Filter */}
          {channel.campaigns && channel.campaigns.length > 0 && (
            <Select value={selectedCampaignId} onValueChange={handleCampaignChange}>
              <SelectTrigger className="h-7 text-xs w-[180px]">
                <SelectValue placeholder="All Campaigns" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Campaigns</SelectItem>
                {channel.campaigns.map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {channel.onRefreshSpend && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => channel.onRefreshSpend?.(selectedMonth)}
              disabled={channel.isFetchingSpend}
              className="h-7 text-xs"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${channel.isFetchingSpend ? 'animate-spin' : ''}`} />
              {channel.isFetchingSpend ? 'Refreshing...' : 'Refresh Spend'}
            </Button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {channel.spendError && (
        <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {channel.spendError}
        </div>
      )}

      {/* Stats Section */}
      <div className="mb-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#f8fafc] rounded-lg p-3 border border-[#e2e8f0]">
            <p className="text-xs text-[#64748b] mb-1">Current Daily Spend</p>
            <p className="text-lg font-semibold text-[#0f172a]">
              {hasConnectedAccount && currentDailySpend !== null
                ? `$${currentDailySpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '—'}
            </p>
          </div>
          <div className="bg-[#f8fafc] rounded-lg p-3 border border-[#e2e8f0]">
            <p className="text-xs text-[#64748b] mb-1">Net Planned Spend</p>
            <p className="text-lg font-semibold text-[#0f172a]">
              ${plannedMonthlySpendForChannel.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-[#f8fafc] rounded-lg p-3 border border-[#e2e8f0]">
            <p className="text-xs text-[#64748b] mb-1">Actual Spend</p>
            <p className="text-lg font-semibold text-[#0f172a]">
              {hasConnectedAccount
                ? `$${totalActualSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Progress Bars */}
      <div className="space-y-3 mb-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#64748b]">Month Progress</span>
            <span className="text-xs font-semibold text-[#0f172a]">{monthProgress.toFixed(1)}%</span>
          </div>
          <Progress value={monthProgress} className="h-2" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#64748b]">Spend Progress</span>
            <span className="text-xs font-semibold text-[#0f172a]">
              {hasConnectedAccount ? `${spendProgress.toFixed(1)}%` : '—'}
            </span>
          </div>
          <Progress
            value={spendProgress > 100 ? 100 : spendProgress}
            className={`h-2 ${
              spendProgress > 100
                ? '[&>div]:bg-red-500'
                : '[&>div]:bg-green-500'
            }`}
          />
        </div>
      </div>

      {/* Budget Chart */}
      <div className="relative">
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            {/* Your existing ComposedChart component */}
            <ComposedChart
              data={chartDataWithActualSpendSplit}
              margin={{ top: 10, right: 10, left: 0, bottom: 25 }}
            >
              {/* ... existing chart content ... */}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="absolute left-0 right-[10px] bottom-[-20px] text-center">
          <p className="text-base font-semibold text-[#64748b] tracking-wide">
            {format(selectedMonth, 'MMMM').toUpperCase()}
          </p>
        </div>
      </div>
    </>
  }
/>
```

---

## 🎨 Features Breakdown

### 1. Three-View Toggle

**Budget View** (Default):
- Shows existing budget pacing chart
- Displays inline metrics summary at the top
- Month navigation and campaign filtering

**Performance View**:
- Grid of performance metric cards
- Dual Y-axis chart (spend vs impressions/clicks)
- Platform-specific metrics (Conversions/Reach)

**Trends View**:
- CTR and CPC trend lines with averages
- Trend indicators (up/down/stable)
- Period-over-period comparison

### 2. Metric Filtering

Users can filter timeframes by:
- **CTR Range**: Min/Max click-through rate (%)
- **CPC Range**: Min/Max cost per click ($)
- **Impressions**: Min/Max impression count
- **Clicks**: Min/Max click count
- **Conversions**: Min/Max (Google Ads only)

Active filters show a badge count and filter summary.

### 3. Export Functionality

Three export options:
- **CSV**: Standard comma-separated values
- **Excel**: CSV with UTF-8 BOM for Excel compatibility
- **Summary Report**: Text file with aggregated statistics + detailed data

Exported files include all timeframe data with:
- Budget info (Planned, Actual, Variance)
- Performance metrics (Impressions, Clicks, CTR, CPC)
- Platform-specific metrics (Conversions/Reach)
- Calculated fields (Variance %, Conversion Rate %)

---

## 📊 Metric Formatting Reference

| Metric | Format | Example |
|--------|--------|---------|
| Impressions | K/M abbreviations | 45.2K, 1.5M |
| Clicks | K/M abbreviations | 1.2K |
| CTR | Percentage (2 decimals) | 5.23% |
| CPC | Currency (2 decimals) | $0.25 |
| CPM | Currency (2 decimals) | $13.33 |
| Conversions | Integer | 125 |
| Frequency | Decimal (2 places) | 1.25 |

---

## 🔧 Advanced Customization

### Custom Metric Thresholds

Add default filters for your channels:

```tsx
const [filters, setFilters] = useState<MetricFilters>({
  minCTR: 1.0, // Minimum 1% CTR
  maxCPC: 2.0, // Maximum $2 CPC
});
```

### Custom Export Options

Customize the export filename or add custom fields:

```typescript
// In export-metrics.ts, customize the filename format
const filename = `${channelName}_${platform}_${startDate}_${endDate}.csv`;
```

### Custom Chart Colors

Update colors in any chart component:

```tsx
// In MediaChannelPerformanceChart.tsx
const CUSTOM_COLORS = {
  spend: '#your-brand-color',
  impressions: '#another-color',
  // ...
};
```

---

## 🧪 Testing Checklist

- [ ] Budget view displays correctly
- [ ] Performance metrics show aggregated values
- [ ] Trend chart displays with reference lines
- [ ] Filters work and update counts
- [ ] CSV export downloads with correct data
- [ ] Excel export opens in Excel without errors
- [ ] Summary report includes all sections
- [ ] Platform-specific metrics show correctly (Google vs Meta)
- [ ] Empty states display when no data
- [ ] Responsive design works on mobile/tablet

---

## 🐛 Troubleshooting

### Charts Not Displaying

**Issue**: Chart shows empty or "No data" message
**Solution**: Ensure `timeFrames` have `impressions` or `clicks` values > 0

```typescript
// Verify data structure
console.log('TimeFrames:', timeFrames.map(tf => ({
  period: tf.period,
  impressions: tf.impressions,
  clicks: tf.clicks
})));
```

### Export Button Disabled

**Issue**: Export button is grayed out
**Solution**: Ensure `timeFrames` array is not empty

```typescript
console.log('TimeFrames length:', timeFrames.length);
```

### Filters Not Working

**Issue**: Filters don't reduce the displayed data
**Solution**: Check `applyMetricFilters` is being called correctly

```typescript
const filteredTimeFrames = applyMetricFilters(timeFrames, filters);
console.log('Filtered count:', filteredTimeFrames.length);
```

### Platform-Specific Metrics Missing

**Issue**: Conversions (Google) or Reach (Meta) not showing
**Solution**: Verify `platformType` prop is set correctly

```typescript
// Ensure platformType matches your data source
platformType={channel.isMetaAds ? 'meta-ads' : 'google-ads'}
```

---

## 📚 Related Documentation

- [Metrics Aggregation](./METRICS_AGGREGATION.md) - How metrics are calculated
- [Performance Metrics UI](./PERFORMANCE_METRICS_UI.md) - Individual component docs
- [Ad Performance Metrics System](./AD_PERFORMANCE_METRICS.md) - Database schema
- [API Integration](./API_INTEGRATION.md) - Fetching data from ad platforms

---

## 🎯 Next Steps

1. **Integrate into MediaChannelCard** - Follow Step 1 & 2 above
2. **Test with Real Data** - Verify all metrics display correctly
3. **Customize Colors** - Match your brand theme (optional)
4. **Add Tooltips** - Help users understand each metric (optional)
5. **Set Up Automated Exports** - Schedule daily/weekly exports (optional)

---

## 💡 Pro Tips

- Use **Trends view** to identify performance patterns over time
- Set **CTR filters** to highlight high-performing periods
- Export **Summary Report** for stakeholder presentations
- Monitor **trend indicators** for early warning signs
- Use **inline metrics** in Budget view for quick overview

---

## ✅ Completion Checklist

- [ ] All components created and imported
- [ ] MediaChannelEnhancedView integrated into MediaChannelCard
- [ ] Budget view preserves existing functionality
- [ ] Performance view shows metrics correctly
- [ ] Trends view displays with indicators
- [ ] Filters work and show correct counts
- [ ] Export functions download files successfully
- [ ] Platform-specific metrics display based on type
- [ ] Responsive design tested on multiple screen sizes
- [ ] Documentation reviewed and understood

---

**Congratulations!** 🎉 Your performance metrics system is now fully integrated and ready to provide comprehensive campaign insights!
