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

    // Find the connection for this specific client (or first active if no clientId)
    let connectionQuery = supabase
      .from('ad_platform_connections')
      .select('connection_id, client_id')
      .eq('user_id', user.id)
      .eq('platform', 'meta-ads')
      .eq('connection_status', 'active');

    if (clientId) {
      connectionQuery = connectionQuery.eq('client_id', clientId);
    }

    const { data: connections } = await connectionQuery.limit(1);
    const connection = connections?.[0] ?? null;

    if (!connection) {
      return NextResponse.json({ error: 'Meta Ads not connected' }, { status: 404 });
    }

    const nangoPlatformKey = toNangoPlatform('meta-ads');
    const endUserId = `${user.id}:${connection.client_id}`;

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
    // When a clientId is provided, prefer accounts that have stored performance
    // data for that client. For brand-new clients (no metrics yet), fall back to
    // discovering accounts live from the Meta API using this client's token —
    // which naturally scopes to accounts accessible by that connection.
    let savedAccounts: Array<{ account_id: string; account_name: string | null }> = [];

    if (clientId) {
      const { data: clientMetrics } = await supabase
        .from('ad_performance_metrics')
        .select('account_id, account_name')
        .eq('client_id', clientId)
        .eq('platform', 'meta-ads')
        .limit(500);

      const seen = new Map<string, string | null>();
      (clientMetrics || []).forEach((r: any) => {
        const id = String(r.account_id).replace(/^act_/, '');
        if (!seen.has(id)) seen.set(id, r.account_name ?? null);
      });

      if (seen.size > 0) {
        savedAccounts = Array.from(seen.entries()).map(([account_id, account_name]) => ({
          account_id,
          account_name,
        }));
      }
    }

    // If we still have no accounts, query meta_ads_accounts.
    // After the migration, filter by client_id when provided so accounts are
    // fully isolated per client. Also include legacy rows (client_id IS NULL)
    // so existing data continues to work before any re-save.
    if (savedAccounts.length === 0) {
      let accountQuery = supabase
        .from('meta_ads_accounts')
        .select('account_id, account_name')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (clientId) {
        accountQuery = accountQuery.or(`client_id.eq.${clientId},client_id.is.null`);
      }

      const { data: allAccounts } = await accountQuery;
      savedAccounts = allAccounts ?? [];
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
