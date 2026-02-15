# Ad Performance Metrics System

## Overview

The ad performance metrics system provides a comprehensive way to store, track, and analyze performance data from advertising platforms (Google Ads, Meta Ads, etc.).

## Database Schema

### Table: `ad_performance_metrics`

Stores daily performance metrics from advertising platforms with clean separation from budget planning.

#### Columns

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Reference to auth.users (required) |
| `client_id` | UUID | Reference to clients (optional) |
| `platform` | TEXT | Platform identifier: 'google-ads', 'meta-ads' |
| `account_id` | TEXT | Platform-specific account ID |
| `account_name` | TEXT | Human-readable account name |
| `campaign_id` | TEXT | Campaign identifier |
| `campaign_name` | TEXT | Campaign name |
| `date` | DATE | Date of the metrics |
| `spend` | NUMERIC(12,2) | Amount spent in account currency |
| `currency` | TEXT | Currency code (default: USD) |
| `impressions` | BIGINT | Number of impressions |
| `clicks` | BIGINT | Number of clicks |
| `ctr` | NUMERIC(10,6) | Click-through rate (decimal: 0.0523 = 5.23%) |

#### Google Ads Specific Metrics
| Column | Type | Description |
|--------|------|-------------|
| `average_cpc` | NUMERIC(12,6) | Average cost per click (in dollars) |
| `conversions` | NUMERIC(10,2) | Number of conversions |

#### Meta Ads Specific Metrics
| Column | Type | Description |
|--------|------|-------------|
| `reach` | BIGINT | Unique users reached |
| `cpc` | NUMERIC(12,6) | Cost per click (in dollars) |
| `cpm` | NUMERIC(12,6) | Cost per 1000 impressions (in dollars) |
| `frequency` | NUMERIC(10,6) | Average impressions per person |

#### Indexes

The table includes optimized indexes for common query patterns:
- User ID
- Client ID
- Platform
- Account ID
- Campaign ID
- Date
- Composite: (user_id, platform, date)
- Composite: (user_id, platform, account_id, date DESC)

#### Unique Constraint

Metrics are unique per: `(user_id, platform, account_id, campaign_id, date)`

This prevents duplicate metrics and enables upsert operations.

## TypeScript Types

### Database Types

```typescript
import type {
  AdPerformanceMetric,
  AdPerformanceMetricInsert,
  AdPerformanceMetricUpdate
} from '@/types/database';
```

### Helper Functions

Located in `/src/lib/ad-metrics.ts`:

#### `saveGoogleAdsMetrics()`
Saves Google Ads metrics to the database with automatic upsert.

```typescript
await saveGoogleAdsMetrics(userId, clientId, [
  {
    customerId: '123-456-7890',
    accountName: 'My Account',
    campaignId: '987654321',
    campaignName: 'Brand Campaign',
    date: '2026-02-15',
    spend: 125.50,
    impressions: 10000,
    clicks: 500,
    ctr: 0.05,
    averageCpc: 0.25,
    conversions: 25,
    currency: 'USD'
  }
]);
```

#### `saveMetaAdsMetrics()`
Saves Meta Ads metrics to the database with automatic upsert.

```typescript
await saveMetaAdsMetrics(userId, clientId, [
  {
    accountId: 'act_123456789',
    accountName: 'My Meta Account',
    campaignId: '23851234567890123',
    campaignName: 'Social Campaign',
    dateStart: '2026-02-15',
    dateStop: '2026-02-15',
    spend: 200.00,
    impressions: 15000,
    reach: 12000,
    clicks: 600,
    ctr: 0.04,
    cpc: 0.33,
    cpm: 13.33,
    frequency: 1.25,
    currency: 'USD'
  }
]);
```

#### `getAdMetrics()`
Retrieves metrics for a date range.

```typescript
const metrics = await getAdMetrics(
  userId,
  'google-ads',
  '2026-02-01',
  '2026-02-15',
  clientId // optional
);
```

#### `getAggregatedMetricsByCampaign()`
Gets aggregated metrics grouped by campaign.

```typescript
const aggregated = await getAggregatedMetricsByCampaign(
  userId,
  'meta-ads',
  '2026-02-01',
  '2026-02-15',
  clientId // optional
);
```

## API Integration

### Updating API Routes

To automatically save metrics when fetching from platforms, import the helper functions in your API routes:

```typescript
import { saveGoogleAdsMetrics, saveMetaAdsMetrics } from '@/lib/ad-metrics';

// After fetching from Google Ads API
await saveGoogleAdsMetrics(user.id, clientId, allSpendData);

// After fetching from Meta Ads API
await saveMetaAdsMetrics(user.id, clientId, allSpendData);
```

## Migration

Run the migration to create the table:

```bash
# Using Supabase CLI
supabase db push

# Or apply manually in Supabase dashboard
# Upload: supabase/migrations/20260215_add_ad_performance_metrics.sql
```

## Query Examples

### Get all metrics for a campaign
```sql
SELECT *
FROM ad_performance_metrics
WHERE user_id = 'user-uuid'
  AND campaign_id = 'campaign-id'
  AND date >= '2026-02-01'
  AND date <= '2026-02-15'
ORDER BY date DESC;
```

### Get daily spend by platform
```sql
SELECT
  date,
  platform,
  SUM(spend) as total_spend,
  SUM(impressions) as total_impressions,
  SUM(clicks) as total_clicks
FROM ad_performance_metrics
WHERE user_id = 'user-uuid'
  AND date >= '2026-02-01'
  AND date <= '2026-02-15'
GROUP BY date, platform
ORDER BY date DESC;
```

### Get campaign performance summary
```sql
SELECT
  campaign_id,
  campaign_name,
  platform,
  SUM(spend) as total_spend,
  SUM(impressions) as total_impressions,
  SUM(clicks) as total_clicks,
  AVG(ctr) as avg_ctr,
  COUNT(DISTINCT date) as days_active
FROM ad_performance_metrics
WHERE user_id = 'user-uuid'
  AND date >= '2026-02-01'
  AND date <= '2026-02-15'
GROUP BY campaign_id, campaign_name, platform
ORDER BY total_spend DESC;
```

## Best Practices

1. **Upsert Operations**: Always use upsert when saving metrics to handle updates to existing data
2. **Date Ranges**: Query with specific date ranges to leverage indexes
3. **Platform Filtering**: Always include platform when querying for better performance
4. **Null Handling**: Platform-specific fields will be null for other platforms - handle this in queries
5. **Currency**: Always store currency alongside monetary values
6. **Client Association**: Link metrics to clients when possible for better reporting

## Security

Row Level Security (RLS) is enabled with policies ensuring:
- Users can only view their own metrics
- Users can only insert/update/delete their own metrics
- All operations require authentication

## Future Enhancements

Potential improvements:
- Materialized views for common aggregations
- Database functions for complex calculations
- Scheduled jobs to auto-fetch metrics
- Alert system for performance thresholds
- Integration with budget tracking for variance analysis
