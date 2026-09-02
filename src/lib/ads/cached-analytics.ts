/**
 * Reads already-synced ad spend / GA4 data straight from the DB cache
 * (ad_performance_metrics, google_analytics_metrics) instead of the live
 * platform APIs. This is the fast path the dashboard uses on every normal
 * load; live data only lands in these tables via the sync functions in
 * google-ads-live.ts / meta-ads-live.ts / ga4-live.ts.
 */

import type { SpendDataPoint, GA4DataPoint } from '@/lib/api/analytics-data-integration';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

const AD_PLATFORMS = ['meta-ads', 'google-ads'];

export async function readCachedSpendData(
  supabase: AnySupabase,
  clientId: string,
  startDate: string,
  endDate: string,
): Promise<SpendDataPoint[]> {
  const { data } = await supabase
    .from('ad_performance_metrics')
    .select('date, platform, account_name, campaign_id, campaign_name, spend, impressions, clicks, ctr, cpc, conversions, reach, frequency, meta_actions, google_conversion_actions')
    .eq('client_id', clientId)
    .in('platform', AD_PLATFORMS)
    .gte('date', startDate)
    .lte('date', endDate)
    // Manual per-channel spend overrides (src/app/api/channels/actual-spend) live in
    // this same table under a synthetic campaign_id — exclude them here, matching
    // every other reader of this table (get-hub-data.ts, perf-series.ts, invoice, etc).
    .not('campaign_id', 'like', 'manual-override-%');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    date: row.date,
    spend: Number(row.spend) || 0,
    platform: row.platform,
    accountName: row.account_name ?? undefined,
    impressions: Number(row.impressions) || 0,
    clicks: Number(row.clicks) || 0,
    ctr: Number(row.ctr) || 0,
    cpc: Number(row.cpc) || 0,
    conversions: Number(row.conversions) || 0,
    campaignId: row.campaign_id ?? '',
    campaignName: row.campaign_name ?? '',
    // Matches the live path (analytics-data-integration.ts fetchSpendData): named
    // per-action-type conversion breakdowns, sourced from meta_actions for Meta and
    // google_conversion_actions (segmented by the account's own conversion action
    // name, e.g. "Submit lead form") for Google. reach/frequency stay Meta-only.
    ...(row.platform === 'meta-ads'
      ? { actions: row.meta_actions ?? [], reach: Number(row.reach) || 0, frequency: Number(row.frequency) || 0 }
      : { actions: row.google_conversion_actions ?? [] }),
  }));
}

export async function readCachedGA4Data(
  supabase: AnySupabase,
  clientId: string,
  startDate: string,
  endDate: string,
): Promise<GA4DataPoint[]> {
  const { data } = await supabase
    .from('google_analytics_metrics')
    .select('date, metric_name, metric_value')
    .eq('client_id', clientId)
    .gte('date', startDate)
    .lte('date', endDate);

  const byDate = new Map<string, GA4DataPoint>();
  for (const row of data ?? []) {
    const point = byDate.get(row.date) ?? { date: row.date };
    (point as Record<string, string | number>)[row.metric_name] = Number(row.metric_value) || 0;
    byDate.set(row.date, point);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function hasCachedRows(
  supabase: AnySupabase,
  table: 'ad_performance_metrics' | 'google_analytics_metrics',
  clientId: string,
  platform: string | null,
  startDate: string,
  endDate: string,
): Promise<boolean> {
  let query = supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('date', startDate)
    .lte('date', endDate);
  if (platform) query = query.eq('platform', platform);
  const { count } = await query;
  return (count ?? 0) > 0;
}
