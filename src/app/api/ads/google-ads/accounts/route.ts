import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

export async function GET() {
  console.log('=== GET /api/ads/google-ads/accounts ===');

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

    const { data: connections, error: dbError } = await supabase
      .from('ad_platform_connections')
      .select('connection_id')
      .eq('user_id', user.id)
      .eq('platform', 'google-ads')
      .eq('connection_status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    if (dbError || !connections || connections.length === 0) {
      return NextResponse.json(
        { error: 'Google Ads connection not found', details: dbError?.message },
        { status: 404 }
      );
    }

    const nangoConnection = await nango.getConnection(toNangoPlatform('google-ads'), connections[0].connection_id);
    const accessToken = (nangoConnection.credentials as any)?.access_token;

    if (!accessToken) {
      throw new Error('No access token found in Nango connection');
    }

    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    if (!developerToken) {
      return NextResponse.json({ error: 'Server misconfiguration: GOOGLE_ADS_DEVELOPER_TOKEN is required' }, { status: 500 });
    }

    // List all accessible customers for the authenticated user
    const listResponse = await fetch('https://googleads.googleapis.com/v21/customers:listAccessibleCustomers', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'Content-Type': 'application/json',
      },
    });

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      throw new Error(`Failed to list accessible customers: ${listResponse.status} - ${errorText}`);
    }

    const listData = await listResponse.json();
    const customerIds: string[] = (listData.resourceNames || []).map((name: string) =>
      name.replace('customers/', '')
    );

    console.log(`Found ${customerIds.length} accessible customer IDs`);

    // Query each customer to get name, currency, and whether it's a manager (MCC) account.
    // No login-customer-id for this pass — we query each account on its own behalf.
    const accountDetails: Array<{
      customerId: string;
      descriptiveName: string | null;
      currencyCode: string | null;
      isManager: boolean;
    }> = [];

    for (const customerId of customerIds) {
      try {
        const searchResponse = await fetch(
          `https://googleads.googleapis.com/v21/customers/${customerId}/googleAds:search`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'developer-token': developerToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: `SELECT customer.descriptive_name, customer.currency_code, customer.manager FROM customer LIMIT 1`,
            }),
          }
        );

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          const customer = searchData.results?.[0]?.customer;
          accountDetails.push({
            customerId,
            descriptiveName: customer?.descriptiveName ?? null,
            currencyCode: customer?.currencyCode ?? null,
            isManager: customer?.manager === true,
          });
        } else {
          // May be an MCC that can't be queried directly; include with unknown type
          accountDetails.push({ customerId, descriptiveName: null, currencyCode: null, isManager: false });
        }
      } catch {
        accountDetails.push({ customerId, descriptiveName: null, currencyCode: null, isManager: false });
      }
    }

    const managerIds = accountDetails.filter(a => a.isManager).map(a => a.customerId);
    console.log(`Manager (MCC) accounts: ${managerIds.join(', ') || 'none'}`);

    // For each manager account, query its client sub-accounts so we can map
    // sub-account ID → parent manager ID.
    const clientToManager: Record<string, string> = {};

    for (const managerId of managerIds) {
      try {
        const clientsResponse = await fetch(
          `https://googleads.googleapis.com/v21/customers/${managerId}/googleAds:search`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'developer-token': developerToken,
              'Content-Type': 'application/json',
              'login-customer-id': managerId,
            },
            body: JSON.stringify({
              query: `SELECT customer_client.id, customer_client.manager FROM customer_client WHERE customer_client.level = 1`,
            }),
          }
        );

        if (clientsResponse.ok) {
          const clientsData = await clientsResponse.json();
          for (const result of clientsData.results || []) {
            const clientId = result.customerClient?.id?.toString();
            if (clientId && clientId !== managerId) {
              clientToManager[clientId] = managerId;
            }
          }
        }
      } catch (e: any) {
        console.warn(`Failed to list clients for manager ${managerId}:`, e.message);
      }
    }

    console.log('Client → Manager map:', clientToManager);

    // Build the final accounts list with resolved managerCustomerId
    const accounts = accountDetails.map(a => ({
      customerId: a.customerId,
      descriptiveName: a.descriptiveName,
      currencyCode: a.currencyCode,
      isManager: a.isManager,
      // Sub-accounts get their parent manager ID; manager/standalone accounts get null
      managerCustomerId: clientToManager[a.customerId] ?? null,
    }));

    return NextResponse.json({ accounts });

  } catch (error: any) {
    console.error('=== ERROR in /api/ads/google-ads/accounts ===', error?.message);
    return NextResponse.json(
      { error: 'Failed to fetch Google Ads accounts', details: error?.message },
      { status: 500 }
    );
  }
}
