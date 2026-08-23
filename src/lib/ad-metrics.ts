/**
 * Helper functions for storing and retrieving ad performance metrics
 */

import { createClient } from '@/lib/supabase/server';
import type { AdPerformanceMetricInsert } from '@/types/database';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

/**
 * Save Google Ads metrics to the database.
 *
 * Accepts an optional Supabase client so callers outside a request context —
 * the 6-hour refresh cron, which has no session and uses a service-role
 * client — can persist metrics too. Defaults to the session-cookie client
 * for existing request-scoped callers.
 */
export async function saveGoogleAdsMetrics(
  userId: string,
  clientId: string | null,
  metrics: Array<{
    customerId: string;
    accountName: string;
    campaignId: string;
    campaignName: string;
    date: string;
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    averageCpc: number;
    conversions: number;
    currency: string;
    conversionActions?: Array<{ action_type: string; value: string }>;
  }>,
  supabaseClient?: AnySupabase,
) {
  const supabase = supabaseClient ?? await createClient();

  const metricsToInsert: AdPerformanceMetricInsert[] = metrics.map(metric => ({
    user_id: userId,
    client_id: clientId,
    platform: 'google-ads',
    account_id: metric.customerId,
    account_name: metric.accountName,
    campaign_id: metric.campaignId,
    campaign_name: metric.campaignName,
    date: metric.date,
    spend: metric.spend,
    currency: metric.currency,
    impressions: metric.impressions,
    clicks: metric.clicks,
    ctr: metric.ctr,
    average_cpc: metric.averageCpc,
    conversions: metric.conversions,
    google_conversion_actions: metric.conversionActions && metric.conversionActions.length > 0 ? metric.conversionActions : null,
    // Meta Ads specific fields are null for Google Ads
    reach: null,
    cpc: null,
    cpm: null,
    frequency: null,
  }));

  const { data, error } = await supabase
    .from('ad_performance_metrics')
    .upsert(metricsToInsert, {
      onConflict: 'user_id,client_id,platform,account_id,campaign_id,date',
      ignoreDuplicates: false, // Update existing records
    })
    .select();

  if (error) {
    console.error('Error saving Google Ads metrics:', error);
    throw new Error(`Failed to save metrics: ${error.message}`);
  }

  return data;
}

/**
 * Save Meta Ads metrics to the database. See saveGoogleAdsMetrics for why
 * an explicit Supabase client can be passed in.
 */
export async function saveMetaAdsMetrics(
  userId: string,
  clientId: string | null,
  metrics: Array<{
    accountId: string;
    accountName: string;
    campaignId: string;
    campaignName: string;
    dateStart: string;
    dateStop: string;
    spend: number;
    impressions: number;
    reach: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
    frequency: number;
    currency: string;
    actions?: Array<{ action_type: string; value: string }>;
  }>,
  supabaseClient?: AnySupabase,
) {
  const supabase = supabaseClient ?? await createClient();

  const metricsToInsert: AdPerformanceMetricInsert[] = metrics.map(metric => {
    const linkClickAction = (metric.actions || []).find(a => a.action_type === 'link_click');
    const linkClicks = linkClickAction ? parseInt(linkClickAction.value, 10) : null;

    return {
      user_id: userId,
      client_id: clientId,
      platform: 'meta-ads',
      account_id: metric.accountId,
      account_name: metric.accountName,
      campaign_id: metric.campaignId,
      campaign_name: metric.campaignName,
      date: metric.dateStart,
      spend: metric.spend,
      currency: metric.currency,
      impressions: metric.impressions,
      clicks: metric.clicks,
      ctr: metric.ctr,
      reach: metric.reach,
      cpc: metric.cpc,
      cpm: metric.cpm,
      frequency: metric.frequency,
      link_clicks: linkClicks,
      meta_actions: metric.actions && metric.actions.length > 0 ? metric.actions : null,
      average_cpc: null,
      conversions: null,
    };
  });

  const { data, error } = await supabase
    .from('ad_performance_metrics')
    .upsert(metricsToInsert, {
      onConflict: 'user_id,client_id,platform,account_id,campaign_id,date',
      ignoreDuplicates: false, // Update existing records
    })
    .select();

  if (error) {
    console.error('Error saving Meta Ads metrics:', error);
    throw new Error(`Failed to save metrics: ${error.message}`);
  }

  return data;
}

export interface DemographicRow {
  accountId: string;
  date: string;
  /**
   * Meta reports age×gender jointly ('age_gender', value e.g. '25-34|female')
   * plus 'country'. Google's age_range_view/gender_view resources report age
   * and gender as separate breakdowns ('age'/'gender'), and Google has no
   * country breakdown wired up in v1 — get-demographics.ts collapses all of
   * these into unified age/gender/country views for the chart.
   */
  breakdownType: 'age_gender' | 'age' | 'gender' | 'country';
  breakdownValue: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach?: number | null;
  conversions?: number | null;
}

/**
 * Save Meta Ads audience demographic breakdown rows (age×gender, country).
 */
export async function saveMetaDemographics(
  userId: string,
  clientId: string | null,
  rows: DemographicRow[]
) {
  const supabase = await createClient();

  const toInsert = rows.map(r => ({
    user_id: userId,
    client_id: clientId,
    platform: 'meta-ads',
    account_id: r.accountId,
    date: r.date,
    breakdown_type: r.breakdownType,
    breakdown_value: r.breakdownValue,
    spend: r.spend,
    impressions: r.impressions,
    clicks: r.clicks,
    reach: r.reach ?? null,
    conversions: null,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from('client_ad_demographics')
    .upsert(toInsert, {
      onConflict: 'user_id,client_id,platform,account_id,date,breakdown_type,breakdown_value',
      ignoreDuplicates: false,
    })
    .select();

  if (error) {
    console.error('Error saving Meta demographics:', error);
    throw new Error(`Failed to save demographics: ${error.message}`);
  }

  return data;
}

/**
 * Save Google Ads audience demographic breakdown rows (age×gender, country).
 */
export async function saveGoogleDemographics(
  userId: string,
  clientId: string | null,
  rows: DemographicRow[]
) {
  const supabase = await createClient();

  const toInsert = rows.map(r => ({
    user_id: userId,
    client_id: clientId,
    platform: 'google-ads',
    account_id: r.accountId,
    date: r.date,
    breakdown_type: r.breakdownType,
    breakdown_value: r.breakdownValue,
    spend: r.spend,
    impressions: r.impressions,
    clicks: r.clicks,
    reach: null,
    conversions: r.conversions ?? null,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from('client_ad_demographics')
    .upsert(toInsert, {
      onConflict: 'user_id,client_id,platform,account_id,date,breakdown_type,breakdown_value',
      ignoreDuplicates: false,
    })
    .select();

  if (error) {
    console.error('Error saving Google demographics:', error);
    throw new Error(`Failed to save demographics: ${error.message}`);
  }

  return data;
}

/**
 * Get ad performance metrics for a user/client within a date range
 */
export async function getAdMetrics(
  userId: string,
  platform: 'google-ads' | 'meta-ads',
  startDate: string,
  endDate: string,
  clientId?: string | null
) {
  const supabase = await createClient();

  let query = supabase
    .from('ad_performance_metrics')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', platform)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });

  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching ad metrics:', error);
    throw new Error(`Failed to fetch metrics: ${error.message}`);
  }

  return data;
}

/**
 * Get aggregated metrics by campaign
 */
export async function getAggregatedMetricsByCampaign(
  userId: string,
  platform: 'google-ads' | 'meta-ads',
  startDate: string,
  endDate: string,
  clientId?: string | null
) {
  const supabase = await createClient();

  // This would typically use a database view or RPC for aggregation
  // For now, fetch and aggregate in memory
  const metrics = await getAdMetrics(userId, platform, startDate, endDate, clientId);

  // Group by campaign
  const aggregated = metrics.reduce((acc, metric) => {
    const key = `${metric.account_id}-${metric.campaign_id}`;

    if (!acc[key]) {
      acc[key] = {
        accountId: metric.account_id,
        accountName: metric.account_name,
        campaignId: metric.campaign_id,
        campaignName: metric.campaign_name,
        platform: metric.platform,
        totalSpend: 0,
        totalImpressions: 0,
        totalClicks: 0,
        totalConversions: 0,
        totalReach: 0,
        currency: metric.currency,
        dateRange: { start: startDate, end: endDate },
      };
    }

    acc[key].totalSpend += metric.spend;
    acc[key].totalImpressions += metric.impressions || 0;
    acc[key].totalClicks += metric.clicks || 0;
    acc[key].totalConversions += metric.conversions || 0;
    acc[key].totalReach += metric.reach || 0;

    return acc;
  }, {} as Record<string, any>);

  return Object.values(aggregated);
}
