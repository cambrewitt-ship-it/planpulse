import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

export async function GET(request: NextRequest) {
  try {
    const secretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
    if (!secretKey) {
      console.log('[google-ads/campaigns] No Nango secret key');
      return NextResponse.json({ campaigns: [] });
    }

    const nango = new Nango({ secretKey });
    const supabase = await createClient();

    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user;
    const clientId = request.nextUrl.searchParams.get('clientId');
    console.log(`[google-ads/campaigns] user=${user.id} clientId=${clientId}`);

    // Get the active Google Ads connection — try client-specific first, fall back to any active connection
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
      console.log(`[google-ads/campaigns] client-specific connection: ${connection?.connection_id ?? 'none'}`);
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
      console.log(`[google-ads/campaigns] fallback connection: ${connection?.connection_id ?? 'none'}`);
    }
    if (!connection) {
      console.log('[google-ads/campaigns] No Google Ads connection found');
      return NextResponse.json({ campaigns: [] });
    }

    // google_ads_accounts has no client_id column — fetch all active accounts for this user
    const { data: accountsData, error: accountsError } = await supabase
      .from('google_ads_accounts')
      .select('customer_id, account_name')
      .eq('user_id', user.id)
      .eq('is_active', true);
    const googleAdsAccounts = (accountsData ?? []) as Array<{ customer_id: string; account_name: string }>;
    console.log(`[google-ads/campaigns] accounts found: ${googleAdsAccounts.length}`, accountsError?.message ?? '');

    if (googleAdsAccounts.length === 0) {
      return NextResponse.json({ campaigns: [] });
    }

    // Get OAuth token from Nango
    let accessToken: string | null = null;
    try {
      const nangoConn = await nango.getConnection(toNangoPlatform('google-ads'), connection.connection_id);
      accessToken = (nangoConn.credentials as any)?.access_token ?? null;
      console.log(`[google-ads/campaigns] Nango token retrieved: ${accessToken ? 'yes' : 'no'}`);
    } catch (e: any) {
      console.log(`[google-ads/campaigns] Nango token error: ${e.message}`);
      return NextResponse.json({ campaigns: [] });
    }

    if (!accessToken) {
      console.log('[google-ads/campaigns] No access token');
      return NextResponse.json({ campaigns: [] });
    }

    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '';

    const gaqlQuery = `
      SELECT campaign.id, campaign.name, campaign.status
      FROM campaign
      WHERE campaign.status != 'REMOVED'
      ORDER BY campaign.name
    `;

    const seen = new Map<string, string>();

    for (const account of googleAdsAccounts) {
      const cleanCustomerId = account.customer_id.replace(/-/g, '');
      console.log(`[google-ads/campaigns] querying account ${account.customer_id} (clean: ${cleanCustomerId})`);

      if (cleanCustomerId.length !== 10) {
        console.log(`[google-ads/campaigns] skipping — unexpected customer ID length ${cleanCustomerId.length}`);
        continue;
      }

      try {
        const headers: Record<string, string> = {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'Content-Type': 'application/json',
          'login-customer-id': cleanCustomerId,
        };

        const response = await fetch(
          `https://googleads.googleapis.com/v21/customers/${cleanCustomerId}/googleAds:search`,
          { method: 'POST', headers, body: JSON.stringify({ query: gaqlQuery }) }
        );

        if (!response.ok) {
          const errText = await response.text();
          console.log(`[google-ads/campaigns] API error ${response.status} for ${cleanCustomerId}: ${errText.substring(0, 300)}`);
          continue;
        }

        const data = await response.json();
        console.log(`[google-ads/campaigns] ${cleanCustomerId} returned ${data.results?.length ?? 0} campaigns`);
        for (const result of (data.results ?? [])) {
          const id = result.campaign?.id?.toString();
          const name = result.campaign?.name;
          if (id && name && !seen.has(id)) {
            seen.set(id, name);
          }
        }
      } catch (e: any) {
        console.log(`[google-ads/campaigns] fetch error for ${cleanCustomerId}: ${e.message}`);
      }
    }

    const campaigns = Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
    console.log(`[google-ads/campaigns] returning ${campaigns.length} campaigns`);
    return NextResponse.json({ campaigns });
  } catch (error: any) {
    console.error('[google-ads/campaigns] Unexpected error:', error);
    return NextResponse.json({ campaigns: [] });
  }
}
