/**
 * Shared config/constants for the Client Hub trend builder, used by the
 * authenticated config route, the authenticated series route, and the
 * public token-gated series route.
 */

export interface TrendWidgetConfig {
  metricA: string;
  platformA: string;
  /** Named conversion event (Meta action_type or Google conversion action name) to filter to, when metricA is 'conversions' and platformA is a single platform. */
  eventA: string | null;
  metricB: string;
  platformB: string;
  eventB: string | null;
  chartType: 'dual_line' | 'line_bar';
  period: '30d' | '90d' | '6m';
}

export const DEFAULT_TREND_WIDGET: TrendWidgetConfig = {
  metricA: 'spend', platformA: 'all', eventA: null,
  metricB: 'clicks', platformB: 'all', eventB: null,
  chartType: 'dual_line', period: '30d',
};

export const VALID_METRICS = ['spend', 'impressions', 'clicks', 'reach', 'ctr', 'cpc', 'cpm', 'frequency', 'conversions'];
export const VALID_PLATFORMS = ['all', 'meta-ads', 'google-ads'];
export const VALID_CHART_TYPES = ['dual_line', 'line_bar'];
export const VALID_PERIODS = ['30d', '90d', '6m'];
export const PERIOD_DAYS: Record<string, number> = { '30d': 30, '90d': 90, '6m': 182 };

export function platformsFor(platform: string): string[] {
  return platform === 'all' || !platform ? [] : [platform];
}
