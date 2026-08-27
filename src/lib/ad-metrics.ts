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
 * Save Google Ads ad-group/day breakdown rows. Genuine daily time series —
 * upserted like ad_performance_metrics, not delete-then-insert.
 */
export async function saveGoogleAdGroupMetrics(
  userId: string,
  clientId: string,
  rows: Array<{
    accountId: string;
    campaignId: string;
    campaignName: string;
    adGroupId: string;
    adGroupName: string;
    date: string;
    impressions: number;
    clicks: number;
    ctr: number;
    averageCpc: number;
    spend: number;
  }>,
  supabaseClient?: AnySupabase,
) {
  const supabase = supabaseClient ?? await createClient();

  const toInsert = rows.map(r => ({
    user_id: userId,
    client_id: clientId,
    account_id: r.accountId,
    campaign_id: r.campaignId,
    campaign_name: r.campaignName,
    ad_group_id: r.adGroupId,
    ad_group_name: r.adGroupName,
    date: r.date,
    impressions: r.impressions,
    clicks: r.clicks,
    ctr: r.ctr,
    average_cpc: r.averageCpc,
    spend: r.spend,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from('google_ads_ad_group_metrics')
    .upsert(toInsert, { onConflict: 'user_id,client_id,account_id,ad_group_id,date', ignoreDuplicates: false })
    .select();

  if (error) {
    console.error('Error saving Google Ads ad group metrics:', error);
    throw new Error(`Failed to save ad group metrics: ${error.message}`);
  }
  return data;
}

/**
 * Save Google Ads campaign budget snapshot rows. Current-state grain, not a
 * time series — deletes all existing rows for this client/account before
 * inserting, so each sync makes the table exactly reflect "as of last sync"
 * rather than accumulating history.
 */
export async function saveGoogleCampaignBudgets(
  userId: string,
  clientId: string,
  rows: Array<{
    accountId: string;
    campaignId: string;
    campaignName: string;
    budgetId: string;
    dailyBudgetMicros: number;
    explicitlyShared: boolean;
  }>,
  supabaseClient?: AnySupabase,
) {
  const supabase = supabaseClient ?? await createClient();
  const accountIds = [...new Set(rows.map(r => r.accountId))];

  await supabase
    .from('google_ads_campaign_budgets')
    .delete()
    .eq('user_id', userId)
    .eq('client_id', clientId)
    .in('account_id', accountIds);

  const toInsert = rows.map(r => ({
    user_id: userId,
    client_id: clientId,
    account_id: r.accountId,
    campaign_id: r.campaignId,
    campaign_name: r.campaignName,
    budget_id: r.budgetId,
    daily_budget_micros: r.dailyBudgetMicros,
    explicitly_shared: r.explicitlyShared,
    synced_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase.from('google_ads_campaign_budgets').insert(toInsert).select();

  if (error) {
    console.error('Error saving Google Ads campaign budgets:', error);
    throw new Error(`Failed to save campaign budgets: ${error.message}`);
  }
  return data;
}

/**
 * Save Google Ads search impression share rows. Genuine daily time series —
 * upserted like ad_performance_metrics, not delete-then-insert.
 */
export async function saveGoogleSearchImpressionShare(
  userId: string,
  clientId: string,
  rows: Array<{
    accountId: string;
    campaignId: string;
    campaignName: string;
    date: string;
    searchImpressionShare: number | null;
  }>,
  supabaseClient?: AnySupabase,
) {
  const supabase = supabaseClient ?? await createClient();

  const toInsert = rows.map(r => ({
    user_id: userId,
    client_id: clientId,
    account_id: r.accountId,
    campaign_id: r.campaignId,
    campaign_name: r.campaignName,
    date: r.date,
    search_impression_share: r.searchImpressionShare,
  }));

  const { data, error } = await supabase
    .from('google_ads_search_impression_share')
    .upsert(toInsert, { onConflict: 'user_id,client_id,account_id,campaign_id,date', ignoreDuplicates: false })
    .select();

  if (error) {
    console.error('Error saving Google Ads search impression share:', error);
    throw new Error(`Failed to save search impression share: ${error.message}`);
  }
  return data;
}

/**
 * Save Google Ads search term report rows. Period-scoped snapshot, not a
 * time series — deletes all existing rows for this client/account before
 * inserting, so each sync reflects only the last-synced period.
 */
export async function saveGoogleSearchTerms(
  userId: string,
  clientId: string,
  rows: Array<{ accountId: string; campaignId: string; campaignName: string; searchTerm: string; impressions: number; clicks: number; ctr: number }>,
  periodStart: string,
  periodEnd: string,
  supabaseClient?: AnySupabase,
) {
  const supabase = supabaseClient ?? await createClient();
  const accountIds = [...new Set(rows.map(r => r.accountId))];

  await supabase.from('google_ads_search_terms').delete().eq('user_id', userId).eq('client_id', clientId).in('account_id', accountIds);

  const toInsert = rows.map(r => ({
    user_id: userId,
    client_id: clientId,
    account_id: r.accountId,
    campaign_id: r.campaignId,
    campaign_name: r.campaignName,
    search_term: r.searchTerm,
    impressions: r.impressions,
    clicks: r.clicks,
    ctr: r.ctr,
    period_start: periodStart,
    period_end: periodEnd,
    synced_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase.from('google_ads_search_terms').insert(toInsert).select();
  if (error) {
    console.error('Error saving Google Ads search terms:', error);
    throw new Error(`Failed to save search terms: ${error.message}`);
  }
  return data;
}

/**
 * Save Google Ads region breakdown rows. Period-scoped snapshot — same
 * delete-then-insert pattern as saveGoogleSearchTerms.
 */
export async function saveGoogleGeoBreakdown(
  userId: string,
  clientId: string,
  rows: Array<{
    accountId: string; campaignId: string; campaignName: string; regionCriterionId: string; regionName: string | null;
    impressions: number; clicks: number; ctr: number; averageCpc: number;
  }>,
  periodStart: string,
  periodEnd: string,
  supabaseClient?: AnySupabase,
) {
  const supabase = supabaseClient ?? await createClient();
  const accountIds = [...new Set(rows.map(r => r.accountId))];

  await supabase.from('google_ads_geo_breakdown').delete().eq('user_id', userId).eq('client_id', clientId).in('account_id', accountIds);

  const toInsert = rows.map(r => ({
    user_id: userId,
    client_id: clientId,
    account_id: r.accountId,
    campaign_id: r.campaignId,
    campaign_name: r.campaignName,
    region_criterion_id: r.regionCriterionId,
    region_name: r.regionName,
    impressions: r.impressions,
    clicks: r.clicks,
    ctr: r.ctr,
    average_cpc: r.averageCpc,
    period_start: periodStart,
    period_end: periodEnd,
    synced_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase.from('google_ads_geo_breakdown').insert(toInsert).select();
  if (error) {
    console.error('Error saving Google Ads geo breakdown:', error);
    throw new Error(`Failed to save geo breakdown: ${error.message}`);
  }
  return data;
}

/**
 * Save Google Ads device breakdown rows. Period-scoped snapshot — same
 * delete-then-insert pattern as saveGoogleSearchTerms.
 */
export async function saveGoogleDeviceBreakdown(
  userId: string,
  clientId: string,
  rows: Array<{ accountId: string; campaignId: string; campaignName: string; device: string; date: string; impressions: number; clicks: number }>,
  periodStart: string,
  periodEnd: string,
  supabaseClient?: AnySupabase,
) {
  const supabase = supabaseClient ?? await createClient();
  const accountIds = [...new Set(rows.map(r => r.accountId))];

  await supabase.from('google_ads_device_breakdown').delete().eq('user_id', userId).eq('client_id', clientId).in('account_id', accountIds);

  const toInsert = rows.map(r => ({
    user_id: userId,
    client_id: clientId,
    account_id: r.accountId,
    campaign_id: r.campaignId,
    campaign_name: r.campaignName,
    device: r.device,
    date: r.date,
    impressions: r.impressions,
    clicks: r.clicks,
    period_start: periodStart,
    period_end: periodEnd,
    synced_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase.from('google_ads_device_breakdown').insert(toInsert).select();
  if (error) {
    console.error('Error saving Google Ads device breakdown:', error);
    throw new Error(`Failed to save device breakdown: ${error.message}`);
  }
  return data;
}

/**
 * Save Meta ad-level engagement rows. Period-scoped snapshot, not a time
 * series — deletes all existing rows for this client/account before
 * inserting, so each sync reflects only the last-synced period.
 */
export async function saveMetaAdEngagement(
  userId: string,
  clientId: string,
  rows: Array<{
    accountId: string; campaignId: string; campaignName: string; adId: string; adName: string;
    impressions: number; spend: number; engagements: number; actions?: Array<{ action_type: string; value: string }>;
  }>,
  periodStart: string,
  periodEnd: string,
  supabaseClient?: AnySupabase,
) {
  const supabase = supabaseClient ?? await createClient();
  const accountIds = [...new Set(rows.map(r => r.accountId))];

  await supabase.from('meta_ad_engagement').delete().eq('user_id', userId).eq('client_id', clientId).in('account_id', accountIds);

  const toInsert = rows.map(r => ({
    user_id: userId,
    client_id: clientId,
    account_id: r.accountId,
    campaign_id: r.campaignId,
    campaign_name: r.campaignName,
    ad_id: r.adId,
    ad_name: r.adName,
    impressions: r.impressions,
    spend: r.spend,
    engagements: r.engagements,
    actions: r.actions && r.actions.length > 0 ? r.actions : null,
    period_start: periodStart,
    period_end: periodEnd,
    synced_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase.from('meta_ad_engagement').insert(toInsert).select();
  if (error) {
    console.error('Error saving Meta ad engagement:', error);
    throw new Error(`Failed to save ad engagement: ${error.message}`);
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
