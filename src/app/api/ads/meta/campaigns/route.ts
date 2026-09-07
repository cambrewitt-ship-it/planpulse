import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

export async function GET(request: NextRequest) {
  try {
    const secretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
    if (!secretKey) {
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const nango = new Nango({ secretKey });
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const clientId = request.nextUrl.searchParams.get('clientId');
    // Optional: restrict to campaigns Meta currently reports as actually
    // delivering (effective_status === 'ACTIVE'), not merely "not deleted".
    const liveOnly = request.nextUrl.searchParams.get('status') === 'active';

    // Find the connection — try client-specific first, fall back to any active connection.
    let connection: { connection_id: string; client_id: string | null } | null = null;

    if (clientId) {
      const { data: clientConns } = await supabase
        .from('ad_platform_connections')
        .select('connection_id, client_id')
        .eq('user_id', user.id)
        .eq('platform', 'meta-ads')
        .eq('connection_status', 'active')
        .eq('client_id', clientId)
        .limit(1);
      connection = clientConns?.[0] ?? null;
    }

    if (!connection) {
      const { data: anyConns } = await supabase
        .from('ad_platform_connections')
        .select('connection_id, client_id')
        .eq('user_id', user.id)
        .eq('platform', 'meta-ads')
        .eq('connection_status', 'active')
        .limit(1);
      connection = anyConns?.[0] ?? null;
    }

    if (!connection) {
      return NextResponse.json({ error: 'Meta Ads not connected' }, { status: 404 });
    }

    const nangoPlatformKey = toNangoPlatform('meta-ads');
    const endUserId = connection.client_id ? `${user.id}:${connection.client_id}` : user.id;

    const candidateIds = [connection.connection_id, endUserId, user.id].filter(
      (id, i, arr) => id && arr.indexOf(id) === i
    );

    let accessToken: string | null = null;

    for (const candidateId of candidateIds) {
      try {
        const nangoConn = await nango.getConnection(nangoPlatformKey, candidateId);
        accessToken = (nangoConn.credentials as any)?.access_token ?? null;
        if (accessToken) break;
      } catch (_) {}
    }

    if (!accessToken) {
      try {
        const listed = await nango.listConnections();
        const match = (listed.connections ?? []).find(
          (c: any) =>
            c.provider_config_key === nangoPlatformKey &&
            (c.end_user?.id === endUserId || c.end_user?.id?.startsWith(user.id))
        );
        if (match) {
          const nangoConn = await nango.getConnection(nangoPlatformKey, match.connection_id);
          accessToken = (nangoConn.credentials as any)?.access_token ?? null;
        }
      } catch (_) {}
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Could not retrieve Meta credentials. Please reconnect your account.' },
        { status: 502 }
      );
    }

    // Determine which ad accounts to query.
    // Try client-specific first; fall back to user-level accounts.
    let savedAccounts: Array<{ account_id: string; account_name: string | null }> = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;

    if (clientId) {
      const { data: clientAccounts } = await db
        .from('meta_ads_accounts')
        .select('account_id, account_name')
        .eq('user_id', user.id)
        .eq('client_id', clientId)
        .eq('is_active', true);
      savedAccounts = (clientAccounts as Array<{ account_id: string; account_name: string | null }> | null) ?? [];
    }

    if (savedAccounts.length === 0) {
      // No clientId at all → legitimately show every account for this user
      // (e.g. onboarding, before a client has any accounts saved). But if a
      // clientId WAS given and it just has no accounts of its own, only fall
      // back to accounts never assigned to any client (client_id IS NULL —
      // pre-migration legacy rows) — never to another client's explicitly
      // assigned account, which would leak its campaigns into this client's
      // picker.
      let fallbackQuery = db
        .from('meta_ads_accounts')
        .select('account_id, account_name')
        .eq('user_id', user.id)
        .eq('is_active', true);
      if (clientId) fallbackQuery = fallbackQuery.is('client_id', null);
      const { data: anyAccounts } = await fallbackQuery;
      savedAccounts = (anyAccounts as Array<{ account_id: string; account_name: string | null }> | null) ?? [];
    }

    if (savedAccounts.length === 0) {
      return NextResponse.json({ campaigns: [] });
    }

    const authHeaders = { Authorization: `Bearer ${accessToken}` };

    // Fetch all campaigns with pagination (Meta API limit is 100 per page)
    const campaignArrays = await Promise.all(
      savedAccounts.map(async (account) => {
        try {
          const allCampaigns: any[] = [];
          let url: string | null =
            `https://graph.facebook.com/v26.0/act_${account.account_id.replace(/^act_/, '')}/campaigns?fields=id,name,status,effective_status&limit=100`;

          while (url) {
            const res = await fetch(url, { headers: authHeaders });
            if (!res.ok) break;
            const json = await res.json();
            const page = json.data ?? [];
            allCampaigns.push(...page);
            url = json.paging?.next ?? null;
          }

          return allCampaigns.map((c: any) => ({
            id: c.id,
            name: c.name,
            status: c.status,
            effectiveStatus: c.effective_status,
            accountId: account.account_id,
            accountName: account.account_name,
          }));
        } catch {
          return [];
        }
      })
    );

    const allCampaigns = campaignArrays.flat();
    const campaigns = liveOnly ? allCampaigns.filter((c) => c.effectiveStatus === 'ACTIVE') : allCampaigns;

    return NextResponse.json({ campaigns });
  } catch (error: any) {
    console.error('Error in /api/ads/meta/campaigns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaigns', details: error?.message },
      { status: 500 }
    );
  }
}
