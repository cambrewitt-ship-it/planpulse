import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

export async function GET() {
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

    const { data: connections } = await supabase
      .from('ad_platform_connections')
      .select('connection_id, client_id')
      .eq('user_id', user.id)
      .eq('platform', 'meta-ads')
      .eq('connection_status', 'active')
      .limit(1);

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

    const { data: savedAccounts } = await supabase
      .from('meta_ads_accounts')
      .select('account_id, account_name')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (!savedAccounts || savedAccounts.length === 0) {
      return NextResponse.json({ campaigns: [] });
    }

    const authHeaders = { Authorization: `Bearer ${accessToken}` };

    const campaignArrays = await Promise.all(
      savedAccounts.map(async (account) => {
        try {
          const res = await fetch(
            `https://graph.facebook.com/v18.0/${account.account_id}/campaigns?fields=id,name,status,effective_status&limit=200`,
            { headers: authHeaders }
          );
          if (!res.ok) return [];
          const json = await res.json();
          return (json.data ?? []).map((c: any) => ({
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
