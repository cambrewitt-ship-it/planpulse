import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

export async function GET(request: NextRequest) {
  try {
    const secretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
    if (!secretKey) {
      return NextResponse.json({ conversionActions: [] });
    }

    const nango = new Nango({ secretKey });
    const supabase = await createClient();

    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user;
    const clientId = request.nextUrl.searchParams.get('clientId');

    // Get the active Google Ads connection — try client-specific first, fall back to any active
    let connection: { connection_id: string } | null = null;
    if (clientId) {
      const { data } = await supabase
        .from('ad_platform_connections')
        .select('connection_id')
        .eq('user_id', user.id)
        .eq('platform', 'google-ads')
        .eq('connection_status', 'active')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1);
      connection = data?.[0] ?? null;
    }
    if (!connection) {
      const { data } = await supabase
        .from('ad_platform_connections')
        .select('connection_id')
        .eq('user_id', user.id)
        .eq('platform', 'google-ads')
        .eq('connection_status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);
      connection = data?.[0] ?? null;
    }
    if (!connection) {
      return NextResponse.json({ conversionActions: [] });
    }

    // Prefer client-scoped accounts; fall back to connection-scoped for legacy setups.
    let { data: accountsData } = clientId
      ? await supabase
          .from('google_ads_accounts')
          .select('customer_id, account_name, manager_customer_id')
          .eq('user_id', user.id)
          .eq('client_id', clientId)
          .eq('is_active', true)
      : await supabase
          .from('google_ads_accounts')
          .select('customer_id, account_name, manager_customer_id')
          .eq('user_id', user.id)
          .eq('connection_id', connection.connection_id)
          .eq('is_active', true);

    if (clientId && (!accountsData || accountsData.length === 0)) {
      ({ data: accountsData } = await supabase
        .from('google_ads_accounts')
        .select('customer_id, account_name, manager_customer_id')
        .eq('user_id', user.id)
        .eq('connection_id', connection.connection_id)
        .eq('is_active', true));
    }

    const googleAdsAccounts = (accountsData ?? []) as Array<{
      customer_id: string;
      account_name: string | null;
      manager_customer_id: string | null;
    }>;

    if (googleAdsAccounts.length === 0) {
      return NextResponse.json({ conversionActions: [] });
    }

    let accessToken: string | null = null;
    try {
      const nangoConn = await nango.getConnection(toNangoPlatform('google-ads'), connection.connection_id);
      accessToken = (nangoConn.credentials as any)?.access_token ?? null;
    } catch (e: any) {
      console.log(`[google-ads/conversion-actions] Nango token error: ${e.message}`);
      return NextResponse.json({ conversionActions: [] });
    }

    if (!accessToken) {
      return NextResponse.json({ conversionActions: [] });
    }

    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '';

    const gaqlQuery = `
      SELECT conversion_action.id, conversion_action.name, metrics.all_conversions
      FROM conversion_action
      WHERE conversion_action.status = 'ENABLED'
        AND segments.date DURING LAST_30_DAYS
      ORDER BY conversion_action.name
    `;

    const seen = new Map<string, { name: string; count: number }>();

    for (const account of googleAdsAccounts) {
      const cleanCustomerId = account.customer_id.replace(/-/g, '');
      if (cleanCustomerId.length !== 10) continue;

      const loginCustomerId = account.manager_customer_id
        ? account.manager_customer_id.replace(/-/g, '')
        : cleanCustomerId;

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'Content-Type': 'application/json',
        'login-customer-id': loginCustomerId,
      };

      try {
        const response = await fetch(
          `https://googleads.googleapis.com/v21/customers/${cleanCustomerId}/googleAds:search`,
          { method: 'POST', headers, body: JSON.stringify({ query: gaqlQuery }) }
        );

        if (!response.ok) {
          const errText = await response.text();
          let errJson: any = null;
          try { errJson = JSON.parse(errText); } catch {}
          const isNotEnabled = errJson?.error?.details?.[0]?.errors?.[0]?.errorCode?.authorizationError === 'CUSTOMER_NOT_ENABLED';
          if (isNotEnabled) {
            supabase.from('google_ads_accounts').update({ is_active: false })
              .eq('user_id', user.id).eq('customer_id', account.customer_id).then(() => {});
            continue;
          }
          console.log(`[google-ads/conversion-actions] API error ${response.status} for ${cleanCustomerId}: ${errText.substring(0, 300)}`);
          continue;
        }

        const data = await response.json();
        for (const result of (data.results ?? [])) {
          const id = result.conversion_action?.id?.toString();
          const name = result.conversion_action?.name;
          const rowCount = result.metrics?.allConversions ?? 0;
          if (id && name) {
            const existing = seen.get(id);
            if (existing) {
              existing.count += rowCount;
            } else {
              seen.set(id, { name, count: rowCount });
            }
          }
        }
      } catch (e: any) {
        console.log(`[google-ads/conversion-actions] fetch error for ${cleanCustomerId}: ${e.message}`);
      }
    }

    const conversionActions = Array.from(seen.entries())
      .map(([id, { name, count }]) => ({ id, name, count: Math.round(count) }))
      .sort((a, b) => b.count - a.count);
    console.log(`[google-ads/conversion-actions] returning ${conversionActions.length} actions`);
    return NextResponse.json({ conversionActions });
  } catch (error: any) {
    console.error('[google-ads/conversion-actions] Unexpected error:', error);
    return NextResponse.json({ conversionActions: [] });
  }
}
