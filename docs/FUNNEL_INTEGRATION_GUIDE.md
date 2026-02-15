# Funnel System Integration Guide

## Overview

The funnel system allows you to create flexible, multi-platform conversion funnels that track user journeys across Meta Ads, Google Ads, and Google Analytics 4.

## Architecture

### Database Layer
- **Table**: `media_plan_funnels`
- **Columns**:
  - `id`: UUID primary key
  - `channel_id`: Foreign key to `media_plan_channels`
  - `name`: Funnel name
  - `config`: JSONB storing full funnel configuration
  - `created_at`, `updated_at`: Timestamps

### API Routes

1. **`/api/funnels`**
   - `POST` - Create new funnel
   - `GET ?channelId={id}` - List funnels for a channel

2. **`/api/funnels/[funnelId]`**
   - `GET` - Get single funnel
   - `PUT` - Update funnel
   - `DELETE` - Delete funnel

3. **`/api/funnels/[funnelId]/calculate`**
   - `GET ?startDate={}&endDate={}` - Calculate funnel with live data
   - Fetches from Meta, Google Ads, and GA4 APIs
   - Returns calculated metrics with conversion rates and costs

### Components

#### FunnelChart
Visual display of funnel stages with trapezoid design matching Feijoa style.

**Props**:
```typescript
{
  funnelStages: FunnelStage[];
  totalCost: number;
  dateRange: { startDate: string; endDate: string };
  isLoading?: boolean;
}
```

**Features**:
- Three-column layout per stage (conversion, value, cost)
- Hover tooltips with detailed info
- Responsive design
- CPM calculation for impression stages

#### FunnelBuilderModal
Dialog for creating/editing funnels with drag-and-drop stage reordering.

**Props**:
```typescript
{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: FunnelConfig) => Promise<void>;
  initialConfig?: FunnelConfig | null;
  channelId: string;
}
```

**Features**:
- Template presets (E-commerce, App Install, Lead Gen)
- GA4 event autocomplete with 30-day counts
- Drag-and-drop reordering with @dnd-kit
- Real-time validation
- Dynamic source/metric selection

### Type Definitions

#### FunnelStage
```typescript
{
  id: string;
  name: string;
  displayName: string;
  value: number;
  conversionRate?: number;
  costPerAction?: number;
  source: 'meta' | 'google' | 'ga4';
  metricKey: string;
  eventName?: string; // For GA4 events
}
```

#### FunnelConfig
```typescript
{
  id: string;
  name: string;
  channelId: string;
  stages: FunnelStage[];
  totalCost: number;
  dateRange: { startDate: string; endDate: string };
}
```

## Installation

### Required Dependencies

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities html2canvas
```

### Database Migration

Run the migration:
```bash
supabase migration up
```

Or apply manually:
```sql
-- See: supabase/migrations/20260215_add_funnel_tables.sql
```

## Usage

### 1. Create a Funnel

```typescript
import { FunnelBuilderModal } from '@/components/funnel-builder-modal';

<FunnelBuilderModal
  open={isOpen}
  onOpenChange={setIsOpen}
  onSave={async (config) => {
    await fetch('/api/funnels', {
      method: 'POST',
      body: JSON.stringify({
        channelId: 'channel-uuid',
        name: config.name,
        config
      })
    });
  }}
  channelId="channel-uuid"
/>
```

### 2. Calculate Funnel Metrics

```typescript
const response = await fetch(
  `/api/funnels/${funnelId}/calculate?startDate=2025-02-01&endDate=2025-02-15`
);
const data = await response.json();

if (data.success) {
  const { stages, totalCost, dateRange } = data.funnel;
  // Use stages with calculated values
}
```

### 3. Display Funnel Chart

```typescript
import { FunnelChart } from '@/components/funnel-chart';

<FunnelChart
  funnelStages={calculatedStages}
  totalCost={1500.00}
  dateRange={{ startDate: '2025-02-01', endDate: '2025-02-15' }}
/>
```

### 4. Use the Custom Hook

```typescript
import { useFunnels } from '@/lib/hooks/use-funnels';

function MyComponent() {
  const {
    funnels,
    loading,
    error,
    loadFunnels,
    createFunnel,
    calculateFunnel
  } = useFunnels('channel-uuid');

  useEffect(() => {
    loadFunnels();
  }, [loadFunnels]);

  const handleCalculate = async () => {
    const result = await calculateFunnel(
      funnelId,
      '2025-02-01',
      '2025-02-15'
    );
    
    if (result?.success) {
      // Use result.funnel
    }
  };
}
```

## Data Flow

1. **User Creates Funnel**:
   - Opens FunnelBuilderModal
   - Configures stages (source, metric, event names)
   - Saves to `media_plan_funnels` table

2. **Calculate Funnel**:
   - API route fetches funnel config
   - Determines required data sources
   - Fetches from platforms in parallel:
     - Meta: `/api/ads/meta/fetch-spend`
     - Google: `/api/ads/fetch-spend`
     - GA4 Standard: `/api/ads/google-analytics/fetch-data`
     - GA4 Events: `/api/ads/google-analytics/fetch-data` with `eventNames` param
   - Aggregates metrics across date range
   - Calculates conversion rates and costs
   - Returns computed funnel

3. **Display Results**:
   - FunnelChart renders visual representation
   - Tooltips show detailed metrics
   - Export options (PNG, clipboard)

## GA4 Event Integration

The system supports querying specific GA4 events using the enhanced `/api/ads/google-analytics/fetch-data` endpoint:

```typescript
// Standard metrics query
POST /api/ads/google-analytics/fetch-data
{
  "startDate": "2025-02-01",
  "endDate": "2025-02-15",
  "metrics": ["activeUsers", "conversions"]
}

// Event-specific query
POST /api/ads/google-analytics/fetch-data
{
  "startDate": "2025-02-01",
  "endDate": "2025-02-15",
  "eventNames": ["first_open", "purchase", "add_to_cart"]
}

// Response for events
{
  "success": true,
  "queryType": "events",
  "events": [
    { "name": "first_open", "count": 1250, "users": 980 },
    { "name": "purchase", "count": 45, "users": 42 }
  ]
}
```

## Calculation Logic

The `calculateFunnelMetrics` utility:

1. **Maps stage sources to data**:
   - Meta: impressions, clicks, spend
   - Google: impressions, clicks, spend
   - GA4 Standard: activeUsers, conversions, sessions
   - GA4 Events: custom event counts

2. **Calculates conversion rates**:
   - Rate = (current stage value / previous stage value) × 100

3. **Calculates cost per action**:
   - CPA = total spend / stage value
   - CPM = (spend / impressions) × 1000 (for impression stages)

## Page Structure

The channel dashboard page (`/dashboard/client/[id]/media-plan`) includes:

- **Tabs**: One tab per funnel
- **Controls**: Date range picker, recalculate button
- **Chart**: Visual funnel display
- **Export**: PNG download and clipboard copy
- **Management**: Edit, delete, create buttons

## Security

- ✅ All routes verify user authentication
- ✅ Channel ownership checked before operations
- ✅ RLS-style permission checks
- ✅ Input validation on all requests

## Best Practices

1. **Stage Ordering**: Place stages in user journey order (top to bottom)
2. **Data Sources**: Mix sources appropriately:
   - Top: Ad platform metrics (impressions, clicks)
   - Middle: GA4 engagement (page views, sessions)
   - Bottom: GA4 conversions (purchases, sign-ups)
3. **Date Ranges**: Use consistent ranges across all data sources
4. **Event Naming**: Use GA4's standard event names when possible
5. **Templates**: Start with templates and customize as needed

## Troubleshooting

### "No data available"
- Check ad platform connections are active
- Verify GA4 Data API is enabled
- Ensure date range has actual data
- Check event names exist in GA4

### Calculation fails
- Verify all data sources are connected
- Check API quotas haven't been exceeded
- Review server logs for specific errors

### Events not found
- Event must exist in last 30 days to appear in autocomplete
- Check exact event name spelling in GA4
- Verify GA4 property ID is correct

## Future Enhancements

- [ ] Multi-channel funnel comparison
- [ ] Historical funnel snapshots
- [ ] Scheduled calculation/email reports
- [ ] Funnel goal setting and alerts
- [ ] A/B test funnel variants
- [ ] Attribution modeling integration
