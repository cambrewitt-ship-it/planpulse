/**
 * On-demand Google Ads "Performance" report extras — ad group breakdown,
 * current campaign budget split, and search impression share. Deliberately
 * kept separate from src/lib/ads/google-ads-live.ts: that file's campaign
 * GAQL query runs for every connected client every 6 hours via the refresh
 * cron, and adding fields here would inflate that always-on call for data
 * only this on-demand report needs. Triggered by a manual "Sync performance
 * data" button in the Client Hub (see fetch-performance-extras/route.ts),
 * mirroring the existing fetch-demographics.ts pattern.
 */

import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';
import { saveGoogleAdGroupMetrics, saveGoogleCampaignBudgets, saveGoogleSearchImpressionShare } from '@/lib/ad-metrics';
import { generateInsightNarrative } from '@/lib/client-hub/generate-insight';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export interface AdGroupMetricRow {
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
}

export interface CampaignBudgetRow {
  accountId: string;
  campaignId: string;
  campaignName: string;
  budgetId: string;
  dailyBudgetMicros: number;
  explicitlyShared: boolean;
}

export interface SearchImpressionShareRow {
  accountId: string;
  campaignId: string;
  campaignName: string;
  date: string;
  searchImpressionShare: number | null;
}

interface GoogleAdsAccountRow {
  customer_id: string;
  account_name: string | null;
  manager_customer_id: string | null;
}

interface AdGroupGaqlResult {
  campaign?: { id?: string | number; name?: string };
  adGroup?: { id?: string | number; name?: string };
  segments?: { date?: string };
  metrics?: { impressions?: string; clicks?: string; ctr?: string; averageCpc?: number; costMicros?: number };
}

interface CampaignBudgetGaqlResult {
  campaign?: { id?: string | number; name?: string };
  campaignBudget?: { id?: string | number; amountMicros?: string | number; explicitlyShared?: boolean };
}

interface SearchImpressionShareGaqlResult {
  campaign?: { id?: string | number; name?: string };
  segments?: { date?: string };
  metrics?: { searchImpressionShare?: number };
}

function gaqlHeaders(accessToken: string, loginCustomerId: string | null): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
    'Content-Type': 'application/json',
    ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}),
  };
}

async function runGaql<T>(cleanCustomerId: string, headers: Record<string, string>, query: string): Promise<T[]> {
  const res = await fetch(
    `https://googleads.googleapis.com/v25/customers/${cleanCustomerId}/googleAds:search`,
    { method: 'POST', headers, body: JSON.stringify({ query }) },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Ads API error ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  return Array.isArray(json.results) ? json.results : [];
}

/** Mirrors fetchGoogleAdsAccounts in google-ads-live.ts — same client-then-legacy-fallback resolution. */
async function resolveAccounts(supabase: AnySupabase, userId: string, clientId: string, connectionId: string): Promise<GoogleAdsAccountRow[]> {
  let { data } = await supabase
    .from('google_ads_accounts')
    .select('customer_id, account_name, manager_customer_id')
    .eq('user_id', userId).eq('client_id', clientId).eq('is_active', true);

  if (!data || data.length === 0) {
    ({ data } = await supabase
      .from('google_ads_accounts')
      .select('customer_id, account_name, manager_customer_id')
      .eq('user_id', userId).eq('connection_id', connectionId).is('client_id', null).eq('is_active', true));
  }
  return (data || []) as GoogleAdsAccountRow[];
}

export async function fetchGoogleAdGroupBreakdown(
  cleanCustomerId: string, loginCustomerId: string | null, accessToken: string, startDate: string, endDate: string,
): Promise<AdGroupMetricRow[]> {
  const query = `
    SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, segments.date,
           metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.cost_micros
    FROM ad_group
    WHERE segments.date >= '${startDate}' AND segments.date <= '${endDate}'
  `;
  const results = await runGaql<AdGroupGaqlResult>(cleanCustomerId, gaqlHeaders(accessToken, loginCustomerId), query);
  return results.map(r => ({
    accountId: cleanCustomerId,
    campaignId: r.campaign?.id?.toString() ?? '',
    campaignName: r.campaign?.name ?? '',
    adGroupId: r.adGroup?.id?.toString() ?? '',
    adGroupName: r.adGroup?.name ?? '',
    date: r.segments?.date ?? startDate,
    impressions: parseInt(r.metrics?.impressions ?? '0', 10),
    clicks: parseInt(r.metrics?.clicks ?? '0', 10),
    ctr: parseFloat(r.metrics?.ctr ?? '0'),
    averageCpc: (r.metrics?.averageCpc ?? 0) / 1_000_000,
    spend: (r.metrics?.costMicros ?? 0) / 1_000_000,
  }));
}

/**
 * Budgets have no direct campaign field of their own (a budget can be shared
 * across campaigns), so this queries FROM campaign — the standard Google Ads
 * API pattern for "campaign with its budget" — rather than FROM
 * campaign_budget directly.
 */
export async function fetchGoogleCampaignBudgets(
  cleanCustomerId: string, loginCustomerId: string | null, accessToken: string,
): Promise<CampaignBudgetRow[]> {
  const query = `
    SELECT campaign.id, campaign.name, campaign_budget.id, campaign_budget.amount_micros, campaign_budget.explicitly_shared
    FROM campaign
    WHERE campaign.status = 'ENABLED'
  `;
  const results = await runGaql<CampaignBudgetGaqlResult>(cleanCustomerId, gaqlHeaders(accessToken, loginCustomerId), query);
  return results.map(r => ({
    accountId: cleanCustomerId,
    campaignId: r.campaign?.id?.toString() ?? '',
    campaignName: r.campaign?.name ?? '',
    budgetId: r.campaignBudget?.id?.toString() ?? '',
    dailyBudgetMicros: Number(r.campaignBudget?.amountMicros ?? 0),
    explicitlyShared: !!r.campaignBudget?.explicitlyShared,
  }));
}

export async function fetchGoogleSearchImpressionShare(
  cleanCustomerId: string, loginCustomerId: string | null, accessToken: string, startDate: string, endDate: string,
): Promise<SearchImpressionShareRow[]> {
  const query = `
    SELECT campaign.id, campaign.name, segments.date, metrics.search_impression_share
    FROM campaign
    WHERE segments.date >= '${startDate}' AND segments.date <= '${endDate}'
  `;
  const results = await runGaql<SearchImpressionShareGaqlResult>(cleanCustomerId, gaqlHeaders(accessToken, loginCustomerId), query);
  return results.map(r => ({
    accountId: cleanCustomerId,
    campaignId: r.campaign?.id?.toString() ?? '',
    campaignName: r.campaign?.name ?? '',
    date: r.segments?.date ?? startDate,
    searchImpressionShare: r.metrics?.searchImpressionShare != null ? Number(r.metrics.searchImpressionShare) * 100 : null,
  }));
}

export interface SyncPerformanceExtrasResult {
  success: boolean;
  rowsSaved: number;
  accountsProcessed: number;
  error?: string;
  errors?: Array<{ customerId: string; error: string }>;
}

export async function syncGoogleAdsPerformanceExtras(params: {
  supabase: AnySupabase;
  nango: Nango;
  userId: string;
  clientId: string;
  clientName: string;
  connectionId: string;
  startDate: string;
  endDate: string;
}): Promise<SyncPerformanceExtrasResult> {
  const { supabase, nango, userId, clientId, clientName, connectionId, startDate, endDate } = params;

  const accounts = await resolveAccounts(supabase, userId, clientId, connectionId);
  if (accounts.length === 0) {
    return { success: false, rowsSaved: 0, accountsProcessed: 0, error: 'No active Google Ads accounts configured for this client.' };
  }

  let nangoConnection;
  try {
    nangoConnection = await nango.getConnection(toNangoPlatform('google-ads'), connectionId);
  } catch (e: unknown) {
    return { success: false, rowsSaved: 0, accountsProcessed: accounts.length, error: `Google Ads connection not found or expired: ${e instanceof Error ? e.message : String(e)}` };
  }
  const accessToken = (nangoConnection.credentials as { access_token?: string })?.access_token;
  if (!accessToken) {
    return { success: false, rowsSaved: 0, accountsProcessed: accounts.length, error: 'No access token found in Google Ads connection.' };
  }

  const adGroupRows: AdGroupMetricRow[] = [];
  const budgetRows: CampaignBudgetRow[] = [];
  const impressionShareRows: SearchImpressionShareRow[] = [];
  const errors: Array<{ customerId: string; error: string }> = [];

  await Promise.all(accounts.map(async (account) => {
    const cleanCustomerId = account.customer_id.replace(/-/g, '');
    if (cleanCustomerId.length !== 10) return;
    const loginCustomerId = account.manager_customer_id ? account.manager_customer_id.replace(/-/g, '') : null;

    try {
      const [adGroups, budgets, impressionShare] = await Promise.all([
        fetchGoogleAdGroupBreakdown(cleanCustomerId, loginCustomerId, accessToken, startDate, endDate),
        fetchGoogleCampaignBudgets(cleanCustomerId, loginCustomerId, accessToken),
        fetchGoogleSearchImpressionShare(cleanCustomerId, loginCustomerId, accessToken, startDate, endDate),
      ]);
      adGroupRows.push(...adGroups.map(r => ({ ...r, accountId: account.customer_id })));
      budgetRows.push(...budgets.map(r => ({ ...r, accountId: account.customer_id })));
      impressionShareRows.push(...impressionShare.map(r => ({ ...r, accountId: account.customer_id })));
    } catch (e: unknown) {
      errors.push({ customerId: account.customer_id, error: e instanceof Error ? e.message : String(e) });
    }
  }));

  let rowsSaved = 0;
  if (adGroupRows.length > 0) {
    await saveGoogleAdGroupMetrics(userId, clientId, adGroupRows, supabase);
    rowsSaved += adGroupRows.length;
  }
  if (budgetRows.length > 0) {
    await saveGoogleCampaignBudgets(userId, clientId, budgetRows, supabase);
    rowsSaved += budgetRows.length;
  }
  if (impressionShareRows.length > 0) {
    await saveGoogleSearchImpressionShare(userId, clientId, impressionShareRows, supabase);
    rowsSaved += impressionShareRows.length;
  }

  // AI insight callout — generated once per sync, not per page load.
  if (adGroupRows.length > 0 || impressionShareRows.length > 0) {
    const totalImpressions = adGroupRows.reduce((s, r) => s + r.impressions, 0);
    const totalClicks = adGroupRows.reduce((s, r) => s + r.clicks, 0);
    const avgImpressionShare = impressionShareRows.filter(r => r.searchImpressionShare != null).length > 0
      ? impressionShareRows.reduce((s, r) => s + (r.searchImpressionShare ?? 0), 0) / impressionShareRows.filter(r => r.searchImpressionShare != null).length
      : null;
    const topAdGroup = [...adGroupRows].sort((a, b) => b.clicks - a.clicks)[0];

    const facts: string[] = [
      `Total impressions ${totalImpressions.toLocaleString()}, clicks ${totalClicks.toLocaleString()} across ${startDate} to ${endDate}`,
    ];
    if (avgImpressionShare != null) facts.push(`Average search impression share ${avgImpressionShare.toFixed(1)}%`);
    if (topAdGroup) facts.push(`Top ad group by clicks: "${topAdGroup.adGroupName}" in campaign "${topAdGroup.campaignName}" with ${topAdGroup.clicks} clicks`);

    const insightText = await generateInsightNarrative({ clientName, periodStart: startDate, periodEnd: endDate, facts });
    if (insightText) {
      await supabase.from('client_hub_insights').upsert({
        client_id: clientId,
        section_key: 'googleAdsPerformance',
        insight_text: insightText,
        period_start: startDate,
        period_end: endDate,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'client_id,section_key' });
    }
  }

  return {
    success: true,
    rowsSaved,
    accountsProcessed: accounts.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}
