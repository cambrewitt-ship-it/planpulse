import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';
import { saveMetaDemographics, type DemographicRow } from '@/lib/ad-metrics';

/**
 * Fetches Meta Ads audience demographic breakdowns (age×gender, country) at
 * account level. Deliberately a separate, lower-cadence sync from
 * /api/ads/meta/fetch-spend — demographics change far less often than daily
 * spend, and Meta breakdown dimensions are mutually exclusive per call
 * (age,gender and country each need their own Insights request), so this
 * already doubles the Meta API call volume per account per sync.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startDate, endDate, clientId } = body;

    if (!startDate || !endDate) {
      return Response.json({ error: 'Missing required parameters: startDate, endDate' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: sessionError } = await supabase.auth.getUser();
    if (sessionError) return Response.json({ error: 'Unable to verify session' }, { status: 500 });
    if (!user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let connection: { connection_id: string } | null = null;
    if (clientId) {
      const { data } = await supabase
        .from('ad_platform_connections')
        .select('connection_id')
        .eq('user_id', user.id).eq('platform', 'meta-ads').eq('connection_status', 'active').eq('client_id', clientId)
        .maybeSingle();
      connection = data;
    }
    if (!connection) {
      const { data } = await supabase
        .from('ad_platform_connections')
        .select('connection_id')
        .eq('user_id', user.id).eq('platform', 'meta-ads').eq('connection_status', 'active')
        .limit(1).maybeSingle();
      connection = data;
    }
    if (!connection) {
      return Response.json({ error: 'Meta Ads not connected. Please connect your account first.' }, { status: 404 });
    }

    const nangoSecretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
    if (!nangoSecretKey) return Response.json({ error: 'Server configuration error: Nango secret key not found' }, { status: 500 });
    const nango = new Nango({ secretKey: nangoSecretKey });

    // Supabase's generated types cause excessively-deep instantiation errors on this
    // table's query chain (same workaround used in meta/fetch-spend/route.ts).
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let metaAdsAccounts: Array<{ account_id: string; account_name: string | null }> = [];
    if (clientId) {
      const { data } = await (supabase as any).from('meta_ads_accounts').select('account_id, account_name')
        .eq('user_id', user.id).eq('client_id', clientId).eq('is_active', true);
      if (data && data.length > 0) metaAdsAccounts = data;
    }
    if (metaAdsAccounts.length === 0) {
      const { data } = await (supabase as any).from('meta_ads_accounts').select('account_id, account_name')
        .eq('user_id', user.id).eq('is_active', true);
      metaAdsAccounts = data ?? [];
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
    if (metaAdsAccounts.length === 0) {
      return Response.json({ success: false, error: 'No Meta Ads accounts configured for this client.' }, { status: 404 });
    }

    let nangoConnection;
    try {
      nangoConnection = await nango.getConnection(toNangoPlatform('meta-ads'), connection.connection_id);
    } catch {
      return Response.json({ success: false, error: 'Meta Ads connection not found. Please reconnect your account.', connectionExpired: true }, { status: 424 });
    }
    const accessToken = (nangoConnection.credentials as { access_token?: string })?.access_token;
    if (!accessToken) return Response.json({ error: 'No access token found in Meta connection' }, { status: 401 });

    const rows: DemographicRow[] = [];
    const errors: Array<{ accountId: string; error: string }> = [];

    async function fetchBreakdown(accountId: string, breakdowns: string): Promise<unknown[]> {
      const params = new URLSearchParams({
        fields: 'spend,impressions,reach,clicks,date_start',
        breakdowns,
        time_range: JSON.stringify({ since: startDate, until: endDate }),
        time_increment: '1',
        level: 'account',
        limit: '500',
        access_token: accessToken as string,
      });
      const url = `https://graph.facebook.com/v26.0/${accountId}/insights?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Meta Insights (${breakdowns}) error ${res.status}: ${text.slice(0, 300)}`);
      }
      const json = await res.json();
      return Array.isArray(json.data) ? json.data : [];
    }

    for (const account of metaAdsAccounts) {
      let accountId = account.account_id;
      if (accountId && !accountId.startsWith('act_')) accountId = `act_${accountId}`;

      try {
        const [ageGenderRows, countryRows] = await Promise.all([
          fetchBreakdown(accountId, 'age,gender'),
          fetchBreakdown(accountId, 'country'),
        ]);

        for (const r of ageGenderRows as Array<Record<string, string>>) {
          rows.push({
            accountId, date: r.date_start,
            breakdownType: 'age_gender', breakdownValue: `${r.age ?? 'unknown'}|${r.gender ?? 'unknown'}`,
            spend: parseFloat(r.spend || '0'), impressions: parseInt(r.impressions || '0', 10),
            clicks: parseInt((r as unknown as { clicks?: string }).clicks || '0', 10),
            reach: parseInt(r.reach || '0', 10),
          });
        }
        for (const r of countryRows as Array<Record<string, string>>) {
          rows.push({
            accountId, date: r.date_start,
            breakdownType: 'country', breakdownValue: r.country ?? 'unknown',
            spend: parseFloat(r.spend || '0'), impressions: parseInt(r.impressions || '0', 10),
            clicks: parseInt((r as unknown as { clicks?: string }).clicks || '0', 10),
            reach: parseInt(r.reach || '0', 10),
          });
        }
      } catch (err) {
        errors.push({ accountId, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    if (rows.length > 0) {
      try {
        await saveMetaDemographics(user.id, clientId || null, rows);
      } catch (saveError) {
        console.error('Failed to persist Meta demographics:', saveError);
      }
    }

    return Response.json({
      success: true, platform: 'meta-ads', dateRange: { startDate, endDate },
      rowsSaved: rows.length, accountsProcessed: metaAdsAccounts.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return Response.json({ error: 'Internal server error', details: message }, { status: 500 });
  }
}
