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

    // Get most recent Google Ads connection
    const { data: connections } = await supabase
      .from('ad_platform_connections')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('platform', 'google-ads')
      .eq('connection_status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!connections || connections.length === 0) {
      return NextResponse.json({ error: 'No Google Ads connection found' }, { status: 404 });
    }

    const connection = connections[0];

    // Get OAuth token
    const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK || '' });
    const nangoConnection = await nango.getConnection(toNangoPlatform('google-ads'), connection.connection_id);
    const accessToken = (nangoConnection.credentials as any)?.access_token;

    if (!accessToken) {
      return NextResponse.json({ error: 'No access token' }, { status: 401 });
    }

    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

    // Test 1: Simple listAccessibleCustomers without ANY extra headers
    const test1 = await fetch('https://googleads.googleapis.com/v16/customers:listAccessibleCustomers', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': devToken || '',
      },
    });

    const test1Data = test1.ok ? await test1.json() : { error: await test1.text(), status: test1.status };

    // If that worked, get the customer IDs
    let accessibleCustomers: string[] = [];
    if (test1.ok && test1Data.resourceNames) {
      accessibleCustomers = test1Data.resourceNames.map((name: string) =>
        name.replace('customers/', '')
      );
    }

    // Test 2: If we have accessible customers, try to query the first one
    let test2Data = null;
    if (accessibleCustomers.length > 0) {
      const firstCustomer = accessibleCustomers[0];
      const test2 = await fetch(`https://googleads.googleapis.com/v16/customers/${firstCustomer}/googleAds:search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': devToken || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1'
        }),
      });

      test2Data = {
        customerId: firstCustomer,
        status: test2.status,
        data: test2.ok ? await test2.json() : { error: await test2.text() }
      };
    }

    return NextResponse.json({
      developerToken: devToken ? `${devToken.substring(0, 4)}...${devToken.substring(devToken.length - 4)}` : 'NOT SET',
      test1_listAccessibleCustomers: {
        status: test1.status,
        data: test1Data,
        accessibleCustomers,
      },
      test2_queryFirstCustomer: test2Data,
      savedAccountInDatabase: {
        customerId: '7977327674',
        note: 'This is what you saved - is it in the accessible list above?'
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}
