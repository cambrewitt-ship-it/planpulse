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

    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user;
    const clientId = request.nextUrl.searchParams.get('clientId');

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
      const { data: anyAccounts } = await db
        .from('meta_ads_accounts')
        .select('account_id, account_name')
        .eq('user_id', user.id)
        .eq('is_active', true);
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
            `https://graph.facebook.com/v18.0/act_${account.account_id.replace(/^act_/, '')}/campaigns?fields=id,name,status,effective_status&limit=100`;

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

    return NextResponse.json({ campaigns: campaignArrays.flat() });
  } catch (error: any) {
    console.error('Error in /api/ads/meta/campaigns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaigns', details: error?.message },
      { status: 500 }
    );
  }
}
