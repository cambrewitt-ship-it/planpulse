import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check connections
    const { data: connections } = await supabase
      .from('ad_platform_connections')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('platform', 'google-ads');

    // Check saved accounts
    const { data: accounts } = await supabase
      .from('google_ads_accounts')
      .select('*')
      .eq('user_id', session.user.id);

    // Test actual Google Ads API access
    let apiTest: any = null;

    if (accounts && accounts.length > 0 && connections && connections.length > 0) {
      try {
        const account = accounts[0];
        const connection = connections.find(c => c.connection_id === account.connection_id);

        if (connection) {
          const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK || '' });
          const nangoConnection = await nango.getConnection(toNangoPlatform('google-ads'), connection.connection_id);
          const accessToken = (nangoConnection.credentials as any)?.access_token;

          if (accessToken) {
            // Test 1: List accessible customers
            const listUrl = 'https://googleads.googleapis.com/v16/customers:listAccessibleCustomers';
            const listResponse = await fetch(listUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
              },
            });

            const listData = listResponse.ok ? await listResponse.json() : { error: await listResponse.text() };

            // Test 2: Try to access the saved customer ID
            const customerUrl = `https://googleads.googleapis.com/v16/customers/${account.customer_id}/googleAds:search`;
            const query = 'SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1';

            const customerResponse = await fetch(customerUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ query }),
            });

            const customerData = customerResponse.ok ? await customerResponse.json() : { error: await customerResponse.text() };

            apiTest = {
              listAccessibleCustomers: {
                status: listResponse.status,
                data: listData,
              },
              testCustomerAccess: {
                customerId: account.customer_id,
                status: customerResponse.status,
                data: customerData,
              },
              mccId: process.env.GOOGLE_ADS_MCC_ID,
            };
          }
        }
      } catch (error: any) {
        apiTest = { error: error.message };
      }
    }

    return NextResponse.json({
      userId: session.user.id,
      connections: connections || [],
      savedAccounts: accounts || [],
      diagnosis: {
        hasConnection: (connections?.length || 0) > 0,
        hasActiveConnection: (connections?.filter(c => c.connection_status === 'active').length || 0) > 0,
        hasSavedAccounts: (accounts?.length || 0) > 0,
        hasActiveAccounts: (accounts?.filter(a => a.is_active).length || 0) > 0,
      },
      apiTest,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
