import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

export async function GET() {
  console.log('=== GET /api/ads/meta/accounts ===');
  
  try {
    // Initialize Nango with secret key
    const secretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
    if (!secretKey) {
      console.error('NANGO_SECRET_KEY_DEV_PLAN_CHECK is not configured');
      return NextResponse.json(
        { error: 'Server misconfiguration' },
        { status: 500 }
      );
    }
    
    const nango = new Nango({ secretKey });
    
    // 1. Get authenticated user's ID
    console.log('Step 1: Authenticating user...');
    const supabase = await createClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      console.error('Authentication error:', authError);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = session.user;
    console.log('Step 2: Looking up Meta Ads connection for user:', user.id);

    // 2. Look up their Meta Ads connection_id from the database
    // Use limit(1) instead of single() — users may have multiple active connections (one per client)
    const { data: connections, error: dbError } = await supabase
      .from('ad_platform_connections')
      .select('connection_id, client_id')
      .eq('user_id', user.id)
      .eq('platform', 'meta-ads')
      .eq('connection_status', 'active')
      .limit(1);

    const connection = connections?.[0] ?? null;

    if (dbError || !connection) {
      console.error('Database error fetching connection:', dbError);
      return NextResponse.json(
        { error: 'Meta Ads connection not found. Please reconnect your Meta Ads account.', details: dbError?.message },
        { status: 404 }
      );
    }

    console.log('Step 3: Found Meta Ads connection in DB, connection_id:', connection.connection_id, 'client_id:', connection.client_id);

    // 3. Get the OAuth access token from Nango
    // Nango Connect UI stores the connection with end_user.id as the connection_id.
    // Try three candidate IDs in order:
    //   1. What's stored in our DB (may be the real UUID or a stale fallback string)
    //   2. The end_user.id format: `${userId}:${clientId}` (used when creating the connect session)
    //   3. Just the userId alone (in case the connection was created without a clientId)
    console.log('Step 4: Getting access token from Nango...');
    const nangoPlatformKey = toNangoPlatform('meta-ads');
    const endUserId = `${user.id}:${connection.client_id}`;

    const candidateIds = [
      connection.connection_id,
      endUserId,
      user.id,
    ].filter((id, i, arr) => id && arr.indexOf(id) === i); // deduplicate, drop empty

    let nangoConnection: any = null;
    let resolvedConnectionId: string | null = null;

    for (const candidateId of candidateIds) {
      try {
        console.log('Trying Nango connection_id:', candidateId);
        nangoConnection = await nango.getConnection(nangoPlatformKey, candidateId);
        resolvedConnectionId = candidateId;
        console.log('✓ Nango connection found with ID:', candidateId);
        break;
      } catch (e: any) {
        console.warn(`getConnection failed for ID "${candidateId}":`, e?.message);
      }
    }

    // If none of the candidates worked, list all connections and search by end_user prefix
    if (!nangoConnection) {
      console.warn('All candidate IDs failed, falling back to listing all connections...');
      try {
        const listed = await nango.listConnections();
        console.log('Total Nango connections:', listed.connections?.length ?? 0);
        const match = (listed.connections ?? []).find(
          (c: any) =>
            c.provider_config_key === nangoPlatformKey &&
            (c.end_user?.id === endUserId || c.end_user?.id?.startsWith(user.id))
        );
        if (match) {
          console.log('Found via list, connection_id:', match.connection_id);
          nangoConnection = await nango.getConnection(nangoPlatformKey, match.connection_id);
          resolvedConnectionId = match.connection_id;
        } else {
          console.error('No matching connection found. Available:',
            (listed.connections ?? []).map((c: any) => ({ provider: c.provider_config_key, id: c.connection_id, endUser: c.end_user?.id }))
          );
        }
      } catch (listErr: any) {
        console.error('List connections also failed:', listErr?.message);
      }
    }

    if (!nangoConnection) {
      return NextResponse.json(
        { error: 'Could not retrieve Meta Ads credentials from Nango. Please reconnect your account.' },
        { status: 502 }
      );
    }

    // Persist the working connection_id if it differs from what we stored
    if (resolvedConnectionId && resolvedConnectionId !== connection.connection_id) {
      console.log('Updating stored connection_id to:', resolvedConnectionId);
      await supabase
        .from('ad_platform_connections')
        .update({ connection_id: resolvedConnectionId, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('client_id', connection.client_id)
        .eq('platform', 'meta-ads');
    }

    const accessToken = (nangoConnection.credentials as any)?.access_token;

    if (!accessToken) {
      throw new Error('No access token found in Nango connection');
    }

    console.log('Step 5: Calling Meta API to list ad accounts...');

    const authHeaders = { 'Authorization': `Bearer ${accessToken}` };

    // Helper to fetch all pages of a Meta API endpoint
    const fetchAllPages = async (url: string): Promise<any[]> => {
      const results: any[] = [];
      let nextUrl: string | null = url;
      while (nextUrl) {
        const res = await fetch(nextUrl, { headers: authHeaders });
        if (!res.ok) break;
        const json = await res.json();
        if (json.data) results.push(...json.data);
        nextUrl = json.paging?.next ?? null;
      }
      return results;
    };

    // 4a. Fetch personal ad accounts
    const personalAccounts = await fetchAllPages(
      'https://graph.facebook.com/v18.0/me/adaccounts?fields=id,name,account_status,currency&limit=200'
    );
    console.log('Step 6: Personal ad accounts:', personalAccounts.length);

    // 4b. Fetch businesses (portfolios) the user belongs to
    const businesses = await fetchAllPages(
      'https://graph.facebook.com/v18.0/me/businesses?fields=id,name&limit=200'
    );
    console.log('Step 7: Business portfolios:', businesses.length);

    // 4c. For each business, fetch owned and client ad accounts
    const businessAccountArrays = await Promise.all(
      businesses.flatMap((biz: any) => [
        fetchAllPages(
          `https://graph.facebook.com/v18.0/${biz.id}/owned_ad_accounts?fields=id,name,account_status,currency&limit=200`
        ),
        fetchAllPages(
          `https://graph.facebook.com/v18.0/${biz.id}/client_ad_accounts?fields=id,name,account_status,currency&limit=200`
        ),
      ])
    );

    const allRaw = [
      ...personalAccounts,
      ...businessAccountArrays.flat(),
    ];

    // Deduplicate by account id
    const seen = new Set<string>();
    const deduped = allRaw.filter((acc: any) => {
      if (seen.has(acc.id)) return false;
      seen.add(acc.id);
      return true;
    });

    console.log(`Step 8: Total unique accounts: ${deduped.length} (${personalAccounts.length} personal + ${deduped.length - personalAccounts.length} from business portfolios)`);

    // 5. Format and return the accounts
    const formattedAccounts = deduped.map((account: any) => ({
      accountId: account.id,
      accountName: account.name,
      accountStatus: account.account_status,
      currency: account.currency,
    }));

    return NextResponse.json({
      accounts: formattedAccounts
    });
    
  } catch (error: any) {
    console.error('=== ERROR in /api/ads/meta/accounts ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch Meta Ads accounts',
        details: error?.message || 'Unknown error',
        type: error?.constructor?.name
      },
      { status: 500 }
    );
  }
}

