/**
 * GA4 metric/dimension options for the Client Hub's Engagement Overview
 * (tab-switchable trend, see ga4-engagement-overview.tsx) and Dimension
 * Explorer (see ga4-dimension-explorer.tsx). Scoped to exactly what those two
 * components sync and read — see trend-widget.ts's GA4_METRICS for the
 * separate (and slightly different) list the Trend Builder widget uses.
 */

export interface GA4MetricOption {
  key: string;
  label: string;
  /** How to render this metric's value — mirrors HubMetric['format']. */
  format: 'compact' | 'percent' | 'duration' | 'number';
}

/** Selectable in the Engagement Overview tab bar — all already synced into google_analytics_metrics by ga4-live.ts's default requestedMetrics. */
export const GA4_TREND_METRICS: GA4MetricOption[] = [
  { key: 'activeUsers', label: 'Active users', format: 'compact' },
  { key: 'eventCount', label: 'Event count', format: 'compact' },
  { key: 'conversions', label: 'Key events', format: 'compact' },
  { key: 'newUsers', label: 'New users', format: 'compact' },
  { key: 'totalUsers', label: 'Total users', format: 'compact' },
  { key: 'sessions', label: 'Sessions', format: 'compact' },
  { key: 'engagementRate', label: 'Engagement rate', format: 'percent' },
  { key: 'bounceRate', label: 'Bounce rate', format: 'percent' },
  { key: 'averageSessionDuration', label: 'Avg. session duration', format: 'duration' },
  { key: 'screenPageViews', label: 'Views', format: 'compact' },
];

export function isValidTrendMetric(metric: string): boolean {
  return GA4_TREND_METRICS.some((m) => m.key === metric);
}

export interface GA4DimensionOption {
  /** Value stored in google_analytics_breakdowns.dimension, and the GA4 API dimension name — same string for every dimension here. */
  key: string;
  label: string;
}

/** Selectable in the Dimension Explorer — must match both the DB CHECK constraint (20260906_extend_ga4_breakdowns.sql) and the dimensions syncGA4Breakdowns() actually populates via fetchDailyDimension. */
export const GA4_DIMENSIONS: GA4DimensionOption[] = [
  { key: 'sessionSourceMedium', label: 'Session source / medium' },
  { key: 'channel', label: 'Session default channel group' },
  { key: 'device', label: 'Device category' },
  { key: 'newVsReturning', label: 'New vs. returning' },
];

export const DEFAULT_DIMENSION = 'sessionSourceMedium';

export function isValidDimension(dimension: string): boolean {
  return GA4_DIMENSIONS.some((d) => d.key === dimension);
}
