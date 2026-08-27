/**
 * On-demand Meta ad-level Insights fetch — powers the Client Hub "Top
 * Performing Paid Ads by Engagements" widget. Deliberately a separate
 * file/function from src/lib/ads/meta-ads-live.ts's syncMetaAdsSpend rather
 * than a `level` parameter on it: ad-level insights fan out far more rows
 * than campaign-level (one row per ad, not per campaign) and aren't needed
 * on the always-on 6h cron. Triggered by a manual "Sync paid ads data"
 * button (see fetch-ad-level/route.ts).
 */

import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';
import { saveMetaAdEngagement } from '@/lib/ad-metrics';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export interface MetaAdLevelRow {
  accountId: string;
  campaignId: string;
  campaignName: string;
  adId: string;
  adName: string;
  impressions: number;
  spend: number;
  /** post_engagement value specifically — kept for backward-compatible default sorting/display. */
  engagements: number;
  /** Full actions array, so the Top Ads widget can be re-pointed at any action_type without a re-sync. */
  actions: Array<{ action_type: string; value: string }>;
}

interface MetaAdsAccountRow {
  account_id: string;
  account_name: string | null;
}

/** Mirrors fetchMetaAdsAccounts in meta-ads-live.ts — same client-then-legacy-fallback resolution. */
async function resolveAccounts(supabase: AnySupabase, userId: string, clientId: string): Promise<MetaAdsAccountRow[]> {
  const { data: clientAccounts } = await supabase
    .from('meta_ads_accounts')
    .select('account_id, account_name')
    .eq('user_id', userId).eq('client_id', clientId).eq('is_active', true);
  if (clientAccounts && clientAccounts.length > 0) return clientAccounts;

  const { data: anyAccounts } = await supabase
    .from('meta_ads_accounts')
    .select('account_id, account_name')
    .eq('user_id', userId).is('client_id', null).eq('is_active', true);
  return anyAccounts || [];
}

export async function fetchMetaAdLevelInsights(
  accountId: string, accessToken: string, startDate: string, endDate: string,
): Promise<MetaAdLevelRow[]> {
  const fields = 'ad_id,ad_name,campaign_id,campaign_name,impressions,spend,actions';
  const params = new URLSearchParams({
    fields,
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    level: 'ad',
    limit: '200',
    access_token: accessToken,
  });

  const rows: MetaAdLevelRow[] = [];
  const pushResults = (results: Array<Record<string, unknown>>) => {
    for (const r of results) {
      const actions = (r.actions as Array<{ action_type: string; value: string }> | undefined) ?? [];
      const engagementAction = actions.find(a => a.action_type === 'post_engagement');
      rows.push({
        accountId,
        campaignId: (r.campaign_id as string) ?? '',
        campaignName: (r.campaign_name as string) ?? '',
        adId: (r.ad_id as string) ?? '',
        adName: (r.ad_name as string) ?? '',
        impressions: parseInt((r.impressions as string) ?? '0', 10),
        spend: parseFloat((r.spend as string) ?? '0'),
        engagements: engagementAction ? parseInt(engagementAction.value, 10) || 0 : 0,
        actions,
      });
    }
  };

  let response = await fetch(`https://graph.facebook.com/v26.0/${accountId}/insights?${params.toString()}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Meta Marketing API error ${response.status}: ${text.slice(0, 300)}`);
  }
  let page = await response.json();
  if (Array.isArray(page.data)) pushResults(page.data);
  while (page.paging?.next) {
    response = await fetch(page.paging.next);
    if (!response.ok) break;
    page = await response.json();
    if (Array.isArray(page.data)) pushResults(page.data);
  }

  return rows;
}

export interface SyncMetaAdLevelResult {
  success: boolean;
  rowsSaved: number;
  accountsProcessed: number;
  error?: string;
  errors?: Array<{ accountId: string; error: string }>;
}

export async function syncMetaAdLevelInsights(params: {
  supabase: AnySupabase;
  nango: Nango;
  userId: string;
  clientId: string;
  connectionId: string;
  startDate: string;
  endDate: string;
}): Promise<SyncMetaAdLevelResult> {
  const { supabase, nango, userId, clientId, connectionId, startDate, endDate } = params;

  const accounts = await resolveAccounts(supabase, userId, clientId);
  if (accounts.length === 0) {
    return { success: false, rowsSaved: 0, accountsProcessed: 0, error: 'No active Meta Ads accounts configured for this client.' };
  }

  let nangoConnection;
  try {
    nangoConnection = await nango.getConnection(toNangoPlatform('meta-ads'), connectionId);
  } catch (e: unknown) {
    return { success: false, rowsSaved: 0, accountsProcessed: accounts.length, error: `Meta Ads connection not found or expired: ${e instanceof Error ? e.message : String(e)}` };
  }
  const accessToken = (nangoConnection.credentials as { access_token?: string })?.access_token;
  if (!accessToken) {
    return { success: false, rowsSaved: 0, accountsProcessed: accounts.length, error: 'No access token found in Meta Ads connection.' };
  }

  const allRows: MetaAdLevelRow[] = [];
  const errors: Array<{ accountId: string; error: string }> = [];

  await Promise.all(accounts.map(async (account) => {
    let accountId = account.account_id;
    if (accountId && !accountId.startsWith('act_')) accountId = `act_${accountId}`;
    try {
      const rows = await fetchMetaAdLevelInsights(accountId, accessToken, startDate, endDate);
      allRows.push(...rows);
    } catch (e: unknown) {
      errors.push({ accountId, error: e instanceof Error ? e.message : String(e) });
    }
  }));

  let rowsSaved = 0;
  if (allRows.length > 0) {
    await saveMetaAdEngagement(userId, clientId, allRows, startDate, endDate, supabase);
    rowsSaved = allRows.length;
  }

  return {
    success: true,
    rowsSaved,
    accountsProcessed: accounts.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}
