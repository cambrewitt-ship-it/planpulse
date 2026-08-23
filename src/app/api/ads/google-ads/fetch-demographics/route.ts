import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';
import { saveGoogleDemographics, type DemographicRow } from '@/lib/ad-metrics';

/**
 * Fetches Google Ads audience demographics via the age_range_view and
 * gender_view resources — structurally different from the campaign-level
 * report in /api/ads/fetch-spend, and distinct GAQL resources from each
 * other (Google reports age and gender as separate breakdowns, unlike
 * Meta's joint age×gender). No country breakdown for Google in v1 — that
 * would need a third resource (geographic_view); Meta covers country.
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

    let query = supabase
      .from('ad_platform_connections')
      .select('connection_id, client_id')
      .eq('user_id', user.id).eq('platform', 'google-ads').eq('connection_status', 'active');
    if (clientId) query = query.eq('client_id', clientId);
    const { data: connections } = await query.order('created_at', { ascending: false }).limit(1);
    const connection = connections?.[0];
    if (!connection) return Response.json({ error: 'Google Ads not connected. Please connect your account first.' }, { status: 404 });

    const nangoSecretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
    if (!nangoSecretKey) return Response.json({ error: 'Server configuration error: Nango secret key not found' }, { status: 500 });
    const nango = new Nango({ secretKey: nangoSecretKey });

    const accountsQuery = clientId
      ? supabase.from('google_ads_accounts').select('customer_id, account_name, manager_customer_id')
          .eq('user_id', user.id).eq('client_id', clientId).eq('is_active', true)
      : supabase.from('google_ads_accounts').select('customer_id, account_name, manager_customer_id')
          .eq('user_id', user.id).eq('connection_id', connection.connection_id).eq('is_active', true);
    let { data: accounts } = await accountsQuery;
    if (clientId && (!accounts || accounts.length === 0)) {
      ({ data: accounts } = await supabase.from('google_ads_accounts').select('customer_id, account_name, manager_customer_id')
        .eq('user_id', user.id).eq('connection_id', connection.connection_id).eq('is_active', true));
    }
    if (!accounts || accounts.length === 0) {
      return Response.json({ success: false, error: 'No Google Ads accounts configured.' }, { status: 404 });
    }

    let nangoConnection;
    try {
      nangoConnection = await nango.getConnection(toNangoPlatform('google-ads'), connection.connection_id);
    } catch {
      return Response.json({ success: false, error: 'Google Ads connection not found or expired. Please reconnect.' }, { status: 424 });
    }
    const accessToken = (nangoConnection.credentials as { access_token?: string })?.access_token;
    if (!accessToken) return Response.json({ error: 'No access token found in Google Ads connection.' }, { status: 401 });

    const rows: DemographicRow[] = [];
    const errors: Array<{ customerId: string; error: string }> = [];

    interface GaqlResult {
      segments?: { date?: string };
      adGroupCriterion?: { ageRange?: { type?: string }; gender?: { type?: string } };
      metrics?: { costMicros?: number; impressions?: string; clicks?: string; conversions?: string };
    }

    const AGE_QUERY = `
      SELECT segments.date, ad_group_criterion.age_range.type,
             metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
      FROM age_range_view
      WHERE segments.date >= '${startDate}' AND segments.date <= '${endDate}'
    `;
    const GENDER_QUERY = `
      SELECT segments.date, ad_group_criterion.gender.type,
             metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
      FROM gender_view
      WHERE segments.date >= '${startDate}' AND segments.date <= '${endDate}'
    `;

    for (const account of accounts) {
      const cleanCustomerId = account.customer_id.replace(/-/g, '');
      if (cleanCustomerId.length !== 10) continue;

      const loginCustomerId = account.manager_customer_id ? account.manager_customer_id.replace(/-/g, '') : null;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
        'Content-Type': 'application/json',
        ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}),
      };
      const apiUrl = `https://googleads.googleapis.com/v25/customers/${cleanCustomerId}/googleAds:search`;

      async function runQuery(gaql: string): Promise<Array<Record<string, unknown>>> {
        const res = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify({ query: gaql }) });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Google Ads API error ${res.status}: ${text.slice(0, 300)}`);
        }
        const json = await res.json();
        return Array.isArray(json.results) ? json.results : [];
      }

      try {
        const [ageResults, genderResults] = await Promise.all([runQuery(AGE_QUERY), runQuery(GENDER_QUERY)]);

        for (const r of ageResults as GaqlResult[]) {
          rows.push({
            accountId: account.customer_id, date: r.segments?.date ?? startDate,
            breakdownType: 'age', breakdownValue: r.adGroupCriterion?.ageRange?.type ?? 'UNKNOWN',
            spend: (r.metrics?.costMicros ?? 0) / 1_000_000,
            impressions: parseInt(r.metrics?.impressions ?? '0', 10),
            clicks: parseInt(r.metrics?.clicks ?? '0', 10),
            conversions: parseFloat(r.metrics?.conversions ?? '0'),
          });
        }
        for (const r of genderResults as GaqlResult[]) {
          rows.push({
            accountId: account.customer_id, date: r.segments?.date ?? startDate,
            breakdownType: 'gender', breakdownValue: r.adGroupCriterion?.gender?.type ?? 'UNKNOWN',
            spend: (r.metrics?.costMicros ?? 0) / 1_000_000,
            impressions: parseInt(r.metrics?.impressions ?? '0', 10),
            clicks: parseInt(r.metrics?.clicks ?? '0', 10),
            conversions: parseFloat(r.metrics?.conversions ?? '0'),
          });
        }
      } catch (err) {
        errors.push({ customerId: account.customer_id, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    if (rows.length > 0) {
      try {
        await saveGoogleDemographics(user.id, clientId || null, rows);
      } catch (saveError) {
        console.error('Failed to persist Google demographics:', saveError);
      }
    }

    return Response.json({
      success: true, platform: 'google-ads', dateRange: { startDate, endDate },
      rowsSaved: rows.length, accountsProcessed: accounts.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return Response.json({ error: 'Internal server error', details: message }, { status: 500 });
  }
}
