/**
 * On-demand Google Ads "Insights" report — search terms, region breakdown,
 * device breakdown. Kept separate from google-ads-live.ts for the same
 * reason as google-ads-performance-extras.ts: this data is only needed for
 * a manually-triggered report sync, not the always-on 6h cron. Search term
 * volume is unbounded, so results are capped to the top ~200 by impressions
 * — the report table doesn't need the long tail.
 */

import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';
import { saveGoogleSearchTerms, saveGoogleGeoBreakdown, saveGoogleDeviceBreakdown } from '@/lib/ad-metrics';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export interface SearchTermRow {
  accountId: string;
  campaignId: string;
  campaignName: string;
  searchTerm: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

export interface GeoRow {
  accountId: string;
  campaignId: string;
  campaignName: string;
  regionCriterionId: string;
  regionName: string | null;
  impressions: number;
  clicks: number;
  ctr: number;
  averageCpc: number;
}

export interface DeviceRow {
  accountId: string;
  campaignId: string;
  campaignName: string;
  device: string;
  date: string;
  impressions: number;
  clicks: number;
}

interface GoogleAdsAccountRow {
  customer_id: string;
  account_name: string | null;
  manager_customer_id: string | null;
}

interface SearchTermGaqlResult {
  campaign?: { id?: string | number; name?: string };
  searchTermView?: { searchTerm?: string };
  metrics?: { impressions?: string; clicks?: string; ctr?: string };
}

interface GeoGaqlResult {
  campaign?: { id?: string | number; name?: string };
  geographicView?: { countryCriterionId?: string | number };
  metrics?: { impressions?: string; clicks?: string; ctr?: string; averageCpc?: number };
}

interface GeoTargetConstantResult {
  geoTargetConstant?: { id?: string | number; name?: string };
}

interface DeviceGaqlResult {
  campaign?: { id?: string | number; name?: string };
  segments?: { device?: string; date?: string };
  metrics?: { impressions?: string; clicks?: string };
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

export async function fetchGoogleSearchTerms(
  cleanCustomerId: string, loginCustomerId: string | null, accessToken: string, startDate: string, endDate: string,
): Promise<SearchTermRow[]> {
  const query = `
    SELECT campaign.id, campaign.name, search_term_view.search_term,
           metrics.impressions, metrics.clicks, metrics.ctr
    FROM search_term_view
    WHERE segments.date >= '${startDate}' AND segments.date <= '${endDate}'
    ORDER BY metrics.impressions DESC
    LIMIT 200
  `;
  const results = await runGaql<SearchTermGaqlResult>(cleanCustomerId, gaqlHeaders(accessToken, loginCustomerId), query);
  return results.map(r => ({
    accountId: cleanCustomerId,
    campaignId: r.campaign?.id?.toString() ?? '',
    campaignName: r.campaign?.name ?? '',
    searchTerm: r.searchTermView?.searchTerm ?? '',
    impressions: parseInt(r.metrics?.impressions ?? '0', 10),
    clicks: parseInt(r.metrics?.clicks ?? '0', 10),
    ctr: parseFloat(r.metrics?.ctr ?? '0'),
  }));
}

async function resolveGeoTargetNames(cleanCustomerId: string, headers: Record<string, string>, criterionIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (criterionIds.length === 0) return names;
  const resourceNames = criterionIds.map(id => `'geoTargetConstants/${id}'`).join(', ');
  const query = `SELECT geo_target_constant.id, geo_target_constant.name FROM geo_target_constant WHERE geo_target_constant.resource_name IN (${resourceNames})`;
  try {
    const results = await runGaql<GeoTargetConstantResult>(cleanCustomerId, headers, query);
    for (const r of results) {
      const id = r.geoTargetConstant?.id?.toString();
      if (id && r.geoTargetConstant?.name) names.set(id, r.geoTargetConstant.name);
    }
  } catch {
    // Name resolution is a nice-to-have — fall back to raw criterion IDs on failure.
  }
  return names;
}

export async function fetchGoogleGeoBreakdown(
  cleanCustomerId: string, loginCustomerId: string | null, accessToken: string, startDate: string, endDate: string,
): Promise<GeoRow[]> {
  const headers = gaqlHeaders(accessToken, loginCustomerId);
  const query = `
    SELECT campaign.id, campaign.name, geographic_view.country_criterion_id,
           metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc
    FROM geographic_view
    WHERE segments.date >= '${startDate}' AND segments.date <= '${endDate}'
  `;
  const results = await runGaql<GeoGaqlResult>(cleanCustomerId, headers, query);
  const criterionIds = [...new Set(results.map(r => r.geographicView?.countryCriterionId?.toString()).filter((v): v is string => !!v))];
  const names = await resolveGeoTargetNames(cleanCustomerId, headers, criterionIds);

  return results.map(r => {
    const criterionId = r.geographicView?.countryCriterionId?.toString() ?? '';
    return {
      accountId: cleanCustomerId,
      campaignId: r.campaign?.id?.toString() ?? '',
      campaignName: r.campaign?.name ?? '',
      regionCriterionId: criterionId,
      regionName: names.get(criterionId) ?? null,
      impressions: parseInt(r.metrics?.impressions ?? '0', 10),
      clicks: parseInt(r.metrics?.clicks ?? '0', 10),
      ctr: parseFloat(r.metrics?.ctr ?? '0'),
      averageCpc: (r.metrics?.averageCpc ?? 0) / 1_000_000,
    };
  });
}

export async function fetchGoogleDeviceBreakdown(
  cleanCustomerId: string, loginCustomerId: string | null, accessToken: string, startDate: string, endDate: string,
): Promise<DeviceRow[]> {
  const query = `
    SELECT campaign.id, campaign.name, segments.device, segments.date, metrics.impressions, metrics.clicks
    FROM campaign
    WHERE segments.date >= '${startDate}' AND segments.date <= '${endDate}'
  `;
  const results = await runGaql<DeviceGaqlResult>(cleanCustomerId, gaqlHeaders(accessToken, loginCustomerId), query);
  return results.map(r => ({
    accountId: cleanCustomerId,
    campaignId: r.campaign?.id?.toString() ?? '',
    campaignName: r.campaign?.name ?? '',
    device: r.segments?.device ?? 'UNKNOWN',
    date: r.segments?.date ?? startDate,
    impressions: parseInt(r.metrics?.impressions ?? '0', 10),
    clicks: parseInt(r.metrics?.clicks ?? '0', 10),
  }));
}

export interface SyncInsightsReportResult {
  success: boolean;
  rowsSaved: number;
  accountsProcessed: number;
  error?: string;
  errors?: Array<{ customerId: string; error: string }>;
}

export async function syncGoogleAdsInsightsReport(params: {
  supabase: AnySupabase;
  nango: Nango;
  userId: string;
  clientId: string;
  connectionId: string;
  startDate: string;
  endDate: string;
}): Promise<SyncInsightsReportResult> {
  const { supabase, nango, userId, clientId, connectionId, startDate, endDate } = params;

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

  const searchTermRows: SearchTermRow[] = [];
  const geoRows: GeoRow[] = [];
  const deviceRows: DeviceRow[] = [];
  const errors: Array<{ customerId: string; error: string }> = [];

  await Promise.all(accounts.map(async (account) => {
    const cleanCustomerId = account.customer_id.replace(/-/g, '');
    if (cleanCustomerId.length !== 10) return;
    const loginCustomerId = account.manager_customer_id ? account.manager_customer_id.replace(/-/g, '') : null;

    try {
      const [searchTerms, geo, device] = await Promise.all([
        fetchGoogleSearchTerms(cleanCustomerId, loginCustomerId, accessToken, startDate, endDate),
        fetchGoogleGeoBreakdown(cleanCustomerId, loginCustomerId, accessToken, startDate, endDate),
        fetchGoogleDeviceBreakdown(cleanCustomerId, loginCustomerId, accessToken, startDate, endDate),
      ]);
      searchTermRows.push(...searchTerms.map(r => ({ ...r, accountId: account.customer_id })));
      geoRows.push(...geo.map(r => ({ ...r, accountId: account.customer_id })));
      deviceRows.push(...device.map(r => ({ ...r, accountId: account.customer_id })));
    } catch (e: unknown) {
      errors.push({ customerId: account.customer_id, error: e instanceof Error ? e.message : String(e) });
    }
  }));

  let rowsSaved = 0;
  if (searchTermRows.length > 0) {
    await saveGoogleSearchTerms(userId, clientId, searchTermRows, startDate, endDate, supabase);
    rowsSaved += searchTermRows.length;
  }
  if (geoRows.length > 0) {
    await saveGoogleGeoBreakdown(userId, clientId, geoRows, startDate, endDate, supabase);
    rowsSaved += geoRows.length;
  }
  if (deviceRows.length > 0) {
    await saveGoogleDeviceBreakdown(userId, clientId, deviceRows, startDate, endDate, supabase);
    rowsSaved += deviceRows.length;
  }

  return {
    success: true,
    rowsSaved,
    accountsProcessed: accounts.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}
