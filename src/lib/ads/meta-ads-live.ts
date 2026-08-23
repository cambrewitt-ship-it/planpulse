/**
 * Live Meta Ads fetch + persist, shared by the on-demand API route
 * (src/app/api/ads/meta/fetch-spend/route.ts) and the 6-hour refresh cron
 * (src/app/api/cron/refresh-ad-data/route.ts). See google-ads-live.ts for
 * why this logic is extracted rather than duplicated per caller.
 */

import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';
import { saveMetaAdsMetrics } from '@/lib/ad-metrics';
import { markSynced } from '@/lib/ads/sync-status';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export interface MetaAdMetrics {
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
}

export interface MetaAdsSyncResult {
  success: boolean;
  data: MetaAdMetrics[];
  accountsProcessed: number;
  error?: string;
  errors?: Array<{ accountId: string; accountName: string; error: string }>;
  connectionExpired?: boolean;
}

async function fetchMetaAdsAccounts(
  supabase: AnySupabase,
  userId: string,
  clientId: string | null,
): Promise<any[]> {
  let metaAdsAccounts: any[] = [];

  if (clientId) {
    const { data: clientAccounts } = await supabase
      .from('meta_ads_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('client_id', clientId)
      .eq('is_active', true);
    if (clientAccounts && clientAccounts.length > 0) {
      metaAdsAccounts = clientAccounts;
    }
  }

  // Fall back only to accounts never assigned to any client (client_id IS
  // NULL — pre-migration legacy rows). Never fall back to another client's
  // explicitly-assigned account, which would leak its spend into this
  // client's sync.
  if (metaAdsAccounts.length === 0) {
    const { data: anyAccounts } = await supabase
      .from('meta_ads_accounts')
      .select('*')
      .eq('user_id', userId)
      .is('client_id', null)
      .eq('is_active', true);
    metaAdsAccounts = anyAccounts || [];
  }

  return metaAdsAccounts;
}

/**
 * Fetches live Meta Ads spend for one connection, saves it to
 * ad_performance_metrics, and stamps the connection's last_synced_at.
 */
export async function syncMetaAdsSpend(params: {
  supabase: AnySupabase;
  nango: Nango;
  userId: string;
  clientId: string | null;
  connectionId: string;
  connectionRowId: string;
  startDate: string;
  endDate: string;
}): Promise<MetaAdsSyncResult> {
  const { supabase, nango, userId, clientId, connectionId, connectionRowId, startDate, endDate } = params;

  const metaAdsAccounts = await fetchMetaAdsAccounts(supabase, userId, clientId);

  if (metaAdsAccounts.length === 0) {
    return {
      success: false,
      data: [],
      accountsProcessed: 0,
      error: clientId
        ? 'No Meta Ads accounts configured for this client. Please add an account in Platform Connections.'
        : 'No Meta Ads accounts configured',
    };
  }

  let nangoConnection;
  try {
    nangoConnection = await nango.getConnection(toNangoPlatform('meta-ads'), connectionId);
  } catch (nangoError: any) {
    const httpStatus = nangoError.response?.status || nangoError.status;
    if (httpStatus === 404) {
      await supabase.from('ad_platform_connections').delete().eq('id', connectionRowId);
      return {
        success: false,
        data: [],
        accountsProcessed: metaAdsAccounts.length,
        error: 'Meta Ads connection not found. Please reconnect your account in Platform Connections.',
        connectionExpired: true,
      };
    }
    return {
      success: false,
      data: [],
      accountsProcessed: metaAdsAccounts.length,
      error: nangoError.message,
    };
  }

  const accessToken = (nangoConnection.credentials as any)?.access_token;
  if (!accessToken) {
    return {
      success: false,
      data: [],
      accountsProcessed: metaAdsAccounts.length,
      error: 'No access token found in Nango connection',
    };
  }

  const allSpendData: MetaAdMetrics[] = [];
  const errors: Array<{ accountId: string; accountName: string; error: string }> = [];

  await Promise.all(metaAdsAccounts.map(async (account) => {
    let accountId = account.account_id;
    if (accountId && !accountId.startsWith('act_')) {
      accountId = `act_${accountId}`;
    }

    try {
      const fields = 'spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,account_name,campaign_id,campaign_name,date_start,date_stop,actions';

      const buildUrl = (token: string) => {
        const p = new URLSearchParams({
          fields,
          time_range: JSON.stringify({ since: startDate, until: endDate }),
          time_increment: '1',
          level: 'campaign',
          limit: '100',
          access_token: token,
        });
        return `https://graph.facebook.com/v26.0/${accountId}/insights?${p.toString()}`;
      };

      const pushResults = (results: any[]) => {
        for (const result of results) {
          allSpendData.push({
            accountId,
            accountName: result.account_name || account.account_name,
            campaignId: result.campaign_id || '',
            campaignName: result.campaign_name || '',
            dateStart: result.date_start || '',
            dateStop: result.date_stop || '',
            spend: parseFloat(result.spend || '0'),
            impressions: parseInt(result.impressions || '0', 10),
            reach: parseInt(result.reach || '0', 10),
            clicks: parseInt(result.clicks || '0', 10),
            ctr: parseFloat(result.ctr || '0'),
            cpc: parseFloat(result.cpc || '0'),
            cpm: parseFloat(result.cpm || '0'),
            frequency: parseFloat(result.frequency || '0'),
            currency: account.currency || 'USD',
            actions: result.actions || [],
          });
        }
      };

      const response = await fetch(buildUrl(accessToken), { method: 'GET', headers: { 'Content-Type': 'application/json' } });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Meta Marketing API error: ${response.status}`;
        let isExpiredToken = false;

        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error) {
            const metaError = errorData.error;
            if (metaError.code === 460 || metaError.error_subcode === 460 ||
                metaError.error_subcode === 463 ||
                (metaError.message && /Session has expired|expired|invalidated/.test(metaError.message))) {
              isExpiredToken = true;
              errorMessage = 'Your Meta Ads connection has been invalidated. Please reconnect your Meta Ads account in the platform settings.';
            } else {
              errorMessage = `Meta Marketing API error: ${metaError.message || metaError.type || response.status}`;
              if (metaError.error_subcode) errorMessage += ` (Code: ${metaError.error_subcode})`;
            }
          }
        } catch {
          if (errorText && /Session has expired|expired|invalidated/.test(errorText)) {
            isExpiredToken = true;
            errorMessage = 'Your Meta Ads connection has been invalidated. Please reconnect your Meta Ads account in the platform settings.';
          } else if (errorText) {
            errorMessage += `: ${errorText.substring(0, 200)}`;
          }
        }

        if (isExpiredToken) {
          try {
            const refreshedConnection = await nango.getConnection(toNangoPlatform('meta-ads'), connectionId);
            const refreshedToken = (refreshedConnection.credentials as any)?.access_token;

            if (refreshedToken && refreshedToken !== accessToken) {
              const retryResponse = await fetch(buildUrl(refreshedToken), { method: 'GET', headers: { 'Content-Type': 'application/json' } });
              if (retryResponse.ok) {
                let retryPageData = await retryResponse.json();
                if (retryPageData.data && Array.isArray(retryPageData.data)) pushResults(retryPageData.data);
                while (retryPageData.paging?.next) {
                  const nextRetryResponse = await fetch(retryPageData.paging.next);
                  if (!nextRetryResponse.ok) break;
                  retryPageData = await nextRetryResponse.json();
                  if (retryPageData.data && Array.isArray(retryPageData.data)) pushResults(retryPageData.data);
                }
                return; // Skip to next account — retry succeeded
              }
            }
          } catch (refreshError) {
            console.error('Meta token refresh failed:', refreshError);
          }

          void supabase
            .from('ad_platform_connections')
            .update({ connection_status: 'expired', updated_at: new Date().toISOString() })
            .eq('id', connectionRowId)
            .then(() => {});
        }

        throw new Error(errorMessage);
      }

      let pageData = await response.json();
      if (pageData.data && Array.isArray(pageData.data)) pushResults(pageData.data);

      while (pageData.paging?.next) {
        const nextResponse = await fetch(pageData.paging.next);
        if (!nextResponse.ok) break;
        pageData = await nextResponse.json();
        if (pageData.data && Array.isArray(pageData.data)) pushResults(pageData.data);
      }
    } catch (error: any) {
      errors.push({ accountId, accountName: account.account_name, error: error.message });
    }
  }));

  if (allSpendData.length > 0) {
    try {
      await saveMetaAdsMetrics(userId, clientId || null, allSpendData, supabase);
    } catch (saveError) {
      console.error('Failed to persist Meta Ads metrics:', saveError);
    }
  }

  await markSynced(supabase, connectionRowId);

  return {
    success: true,
    data: allSpendData,
    accountsProcessed: metaAdsAccounts.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}
