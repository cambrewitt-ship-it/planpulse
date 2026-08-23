/**
 * Live Google Ads fetch + persist, shared by the on-demand API route
 * (src/app/api/ads/fetch-spend/route.ts, platform=google-ads) and the
 * 6-hour refresh cron (src/app/api/cron/refresh-ad-data/route.ts). Extracted
 * so both callers run the exact same fetch/save/stamp logic instead of the
 * cron re-implementing it against a service-role client.
 */

import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';
import { saveGoogleAdsMetrics } from '@/lib/ad-metrics';
import { markSynced } from '@/lib/ads/sync-status';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export interface GoogleAdMetrics {
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
}

interface GoogleAdsAccountRow {
  customer_id: string;
  account_name: string | null;
  manager_customer_id: string | null;
  is_active: boolean;
}

export interface GoogleAdsSyncResult {
  success: boolean;
  data: GoogleAdMetrics[];
  accountsProcessed: number;
  error?: string;
  errors?: Array<{ customerId: string; accountName: string; error: string }>;
}

/**
 * Fetches per-day, per-campaign conversion counts broken down by named
 * conversion action (e.g. "Purchase", "Phone Call Lead"), so the Client Hub
 * trend builder can filter a conversions trend to one specific event —
 * mirroring what Meta's `actions` field already gives us for free.
 *
 * This is a separate GAQL call (rather than adding segments.conversion_action_name
 * to the main campaign query) because segmenting by conversion action fans out
 * cost/impressions/clicks per action and would double-count them if merged
 * into the same rows — this query is used only for the conversions breakdown.
 */
async function fetchGoogleConversionActionBreakdown(
  cleanCustomerId: string,
  loginCustomerId: string | null,
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<Map<string, Array<{ action_type: string; value: string }>>> {
  const breakdown = new Map<string, Array<{ action_type: string; value: string }>>();

  const query = `
    SELECT
      campaign.id,
      segments.date,
      segments.conversion_action_name,
      metrics.conversions
    FROM campaign
    WHERE segments.date >= '${startDate}' AND segments.date <= '${endDate}'
    ORDER BY segments.date DESC
  `;

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
    'Content-Type': 'application/json',
    ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}),
  };

  try {
    const response = await fetch(
      `https://googleads.googleapis.com/v25/customers/${cleanCustomerId}/googleAds:search`,
      { method: 'POST', headers, body: JSON.stringify({ query }) }
    );
    if (!response.ok) {
      console.log(`[conversion-action-breakdown] API error ${response.status} for ${cleanCustomerId}`);
      return breakdown;
    }
    const data = await response.json();
    for (const result of (data.results ?? [])) {
      const campaignId = result.campaign?.id?.toString();
      const date = result.segments?.date;
      const name = result.segments?.conversionActionName;
      const value = result.metrics?.conversions;
      if (!campaignId || !date || !name || !value) continue;
      const key = `${campaignId}|${date}`;
      const arr = breakdown.get(key) ?? [];
      arr.push({ action_type: name, value: String(value) });
      breakdown.set(key, arr);
    }
  } catch (e: any) {
    console.log(`[conversion-action-breakdown] fetch error for ${cleanCustomerId}: ${e.message}`);
  }

  return breakdown;
}

async function fetchGoogleAdsAccounts(
  supabase: AnySupabase,
  userId: string,
  clientId: string | null,
  connectionId: string,
): Promise<GoogleAdsAccountRow[]> {
  let { data } = clientId
    ? await supabase
        .from('google_ads_accounts')
        .select('customer_id, account_name, manager_customer_id, is_active')
        .eq('user_id', userId)
        .eq('client_id', clientId)
        .eq('is_active', true)
    : await supabase
        .from('google_ads_accounts')
        .select('customer_id, account_name, manager_customer_id, is_active')
        .eq('user_id', userId)
        .eq('connection_id', connectionId)
        .eq('is_active', true);

  // Fall back to connection-scoped accounts only when they've never been
  // assigned to any client (client_id IS NULL — pre-migration legacy rows).
  // Never fall back to an account explicitly assigned to a DIFFERENT client:
  // connection_id is shared across a user's clients (e.g. one Nango/MCC
  // login used for several client accounts), so matching on it alone would
  // leak another client's Google Ads data into this client's sync.
  if (clientId && (!data || data.length === 0)) {
    ({ data } = await supabase
      .from('google_ads_accounts')
      .select('customer_id, account_name, manager_customer_id, is_active')
      .eq('user_id', userId)
      .eq('connection_id', connectionId)
      .is('client_id', null)
      .eq('is_active', true));
  }

  return (data || []) as GoogleAdsAccountRow[];
}

/**
 * Fetches live Google Ads spend for one connection, saves it to
 * ad_performance_metrics, and stamps the connection's last_synced_at.
 * Does NOT touch ad_platform_connections.connection_status on auth failure
 * beyond what the account-level "not enabled" handling already did — token
 * refresh/expiry handling matches the original route.
 */
export async function syncGoogleAdsSpend(params: {
  supabase: AnySupabase;
  nango: Nango;
  userId: string;
  clientId: string | null;
  connectionId: string;
  connectionRowId: string;
  startDate: string;
  endDate: string;
}): Promise<GoogleAdsSyncResult> {
  const { supabase, nango, userId, clientId, connectionId, connectionRowId, startDate, endDate } = params;

  const googleAdsAccounts = await fetchGoogleAdsAccounts(supabase, userId, clientId, connectionId);

  if (googleAdsAccounts.length === 0) {
    return {
      success: false,
      data: [],
      accountsProcessed: 0,
      error: 'No Google Ads accounts configured. Please visit /api/ads/google-ads/accounts to see available accounts and save them.',
    };
  }

  let nangoConnection;
  try {
    nangoConnection = await nango.getConnection(toNangoPlatform('google-ads'), connectionId);
  } catch (nangoError: any) {
    void supabase
      .from('ad_platform_connections')
      .update({ connection_status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', connectionRowId)
      .then(() => {});
    return {
      success: false,
      data: [],
      accountsProcessed: googleAdsAccounts.length,
      error: `Google Ads connection not found or expired: ${nangoError.message}`,
    };
  }

  const accessToken = (nangoConnection.credentials as any)?.access_token;
  if (!accessToken) {
    return {
      success: false,
      data: [],
      accountsProcessed: googleAdsAccounts.length,
      error: 'No access token found in Google Ads connection. Please reconnect your account.',
    };
  }

  const allSpendData: GoogleAdMetrics[] = [];
  const errors: Array<{ customerId: string; accountName: string; error: string }> = [];

  await Promise.all(googleAdsAccounts.map(async (account) => {
    const customerId = account.customer_id;
    const cleanCustomerId = customerId.replace(/-/g, '');

    try {
      if (cleanCustomerId.length !== 10) {
        throw new Error(`Invalid customer ID format: ${customerId} (cleaned: ${cleanCustomerId}). Customer IDs must be 10 digits.`);
      }

      const loginCustomerId = account.manager_customer_id
        ? account.manager_customer_id.replace(/-/g, '')
        : null;

      const requestHeaders: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
        'Content-Type': 'application/json',
        ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}),
      };

      const query = `
        SELECT
          campaign.id,
          campaign.name,
          segments.date,
          metrics.cost_micros,
          metrics.impressions,
          metrics.clicks,
          metrics.ctr,
          metrics.average_cpc,
          metrics.conversions
        FROM campaign
        WHERE segments.date >= '${startDate}' AND segments.date <= '${endDate}'
        ORDER BY segments.date DESC
      `;

      const conversionBreakdownPromise = fetchGoogleConversionActionBreakdown(
        cleanCustomerId, loginCustomerId, accessToken, startDate, endDate,
      );

      const response = await fetch(
        `https://googleads.googleapis.com/v25/customers/${cleanCustomerId}/googleAds:search`,
        { method: 'POST', headers: requestHeaders, body: JSON.stringify({ query }) }
      );

      if (!response.ok) {
        let errorText = '';
        let errorJson: any = null;
        try {
          errorText = await response.text();
          try { errorJson = JSON.parse(errorText); } catch { /* not JSON */ }
        } catch {
          errorText = 'Could not read error response';
        }

        const isNotEnabled = errorJson?.error?.details?.[0]?.errors?.[0]?.errorCode?.authorizationError === 'CUSTOMER_NOT_ENABLED';
        if (isNotEnabled) {
          void supabase.from('google_ads_accounts').update({ is_active: false })
            .eq('user_id', userId).eq('customer_id', account.customer_id).then(() => {});
          return;
        }

        errors.push({
          customerId,
          accountName: account.account_name || '',
          error: `Google Ads API error ${response.status}: ${errorJson?.error?.message || errorJson?.error || errorText.substring(0, 200)}`,
        });
        return;
      }

      const data = await response.json();

      if (data.results && Array.isArray(data.results)) {
        const conversionBreakdown = await conversionBreakdownPromise;
        for (const result of data.results) {
          const spend = (result.metrics?.costMicros || 0) / 1000000;
          const averageCpc = (result.metrics?.averageCpc || 0) / 1000000;
          const impressions = parseInt(result.metrics?.impressions || '0', 10);
          const clicks = parseInt(result.metrics?.clicks || '0', 10);
          const ctr = parseFloat(result.metrics?.ctr || '0');
          const conversions = parseFloat(result.metrics?.conversions || '0');
          const date = result.segments?.date || '';
          const campaignId = result.campaign?.id?.toString() || '';

          allSpendData.push({
            customerId,
            accountName: account.account_name || '',
            campaignId,
            campaignName: result.campaign?.name || '',
            date,
            spend,
            impressions,
            clicks,
            ctr,
            averageCpc,
            conversions,
            currency: 'USD',
            conversionActions: conversionBreakdown.get(`${campaignId}|${date}`),
          });
        }
      }
    } catch (error: any) {
      errors.push({ customerId, accountName: account.account_name || '', error: error.message });
    }
  }));

  const hasAnySuccess = allSpendData.length > 0;
  if (!hasAnySuccess && errors.length > 0) {
    return {
      success: false,
      data: [],
      accountsProcessed: googleAdsAccounts.length,
      error: errors[0].error,
      errors,
    };
  }

  if (allSpendData.length > 0) {
    try {
      await saveGoogleAdsMetrics(userId, clientId || null, allSpendData, supabase);
    } catch (saveError) {
      console.error('Failed to persist Google Ads metrics:', saveError);
    }
  }

  await markSynced(supabase, connectionRowId);

  return {
    success: true,
    data: allSpendData,
    accountsProcessed: googleAdsAccounts.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}
