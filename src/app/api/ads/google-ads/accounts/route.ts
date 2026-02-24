import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

export async function GET() {
  console.log('=== GET /api/ads/google-ads/accounts ===');
  
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
    console.log('Step 2: Looking up Google Ads connection for user:', user.id);

    // 2. Look up their Google Ads connection_id from the database (get most recent active connection)
    const { data: connections, error: dbError } = await supabase
      .from('ad_platform_connections')
      .select('connection_id')
      .eq('user_id', user.id)
      .eq('platform', 'google-ads')
      .eq('connection_status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    if (dbError || !connections || connections.length === 0) {
      console.error('Database error fetching connection:', dbError);
      return NextResponse.json(
        { error: 'Google Ads connection not found', details: dbError?.message },
        { status: 404 }
      );
    }

    const connection = connections[0];

    console.log('Step 3: Found Google Ads connection:', connection.connection_id);

    // 3. Get the OAuth access token from Nango
    console.log('Step 4: Getting access token from Nango...');
    const nangoConnection = await nango.getConnection(toNangoPlatform('google-ads'), connection.connection_id);
    const accessToken = (nangoConnection.credentials as any)?.access_token;

    if (!accessToken) {
      throw new Error('No access token found in Nango connection');
    }

    // 4. Get developer token and MCC ID from environment
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const mccId = process.env.GOOGLE_ADS_MCC_ID;

    if (!developerToken) {
      console.error('GOOGLE_ADS_DEVELOPER_TOKEN is not configured');
      return NextResponse.json(
        { error: 'Server misconfiguration: GOOGLE_ADS_DEVELOPER_TOKEN is required' },
        { status: 500 }
      );
    }

    console.log('Step 5: Calling Google Ads API to list accessible customers...');

    // 5. Call Google Ads API to list accessible customers
    // The listAccessibleCustomers endpoint returns all customers accessible to the authenticated user
    const listCustomersUrl = 'https://googleads.googleapis.com/v21/customers:listAccessibleCustomers';

    const listHeaders: HeadersInit = {
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    };

    // If MCC ID is provided, add it as login-customer-id header for proper account hierarchy handling
    if (mccId) {
      listHeaders['login-customer-id'] = mccId;
      console.log('Using MCC ID as login-customer-id:', mccId);
    }

    const listResponse = await fetch(listCustomersUrl, {
      method: 'GET',
      headers: listHeaders,
    });

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      console.error('Google Ads API error listing customers:', errorText);
      throw new Error(`Failed to list accessible customers: ${listResponse.status} - ${errorText}`);
    }

    const listData = await listResponse.json();
    console.log('Step 6: Successfully fetched accessible customers');

    // 6. Extract customer IDs from resource names
    // Format: "customers/1234567890" → "1234567890"
    const customerResourceNames = listData.resourceNames || [];
    const customerIds = customerResourceNames.map((name: string) => 
      name.replace('customers/', '')
    );

    console.log('Step 7: Found', customerIds.length, 'accessible customer accounts');

    // 7. Fetch detailed account information for each customer
    const accounts: Array<{ customerId: string; descriptiveName: string | null; currencyCode: string | null }> = [];

    for (const customerId of customerIds) {
      try {
        // Query customer details using Google Ads API
        const query = `
          SELECT
            customer.descriptive_name,
            customer.currency_code
          FROM customer
          LIMIT 1
        `;

        const searchUrl = `https://googleads.googleapis.com/v21/customers/${customerId}/googleAds:search`;
        
        const searchResponse = await fetch(searchUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'developer-token': developerToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: query,
          }),
        });

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          const results = searchData.results || [];
          
          if (results.length > 0) {
            const customer = results[0].customer;
            accounts.push({
              customerId: customerId,
              descriptiveName: customer?.descriptiveName || null,
              currencyCode: customer?.currencyCode || null,
            });
          } else {
            // If no results, still include the customer ID
            accounts.push({
              customerId: customerId,
              descriptiveName: null,
              currencyCode: null,
            });
          }
        } else {
          // If query fails (might be MCC account or insufficient permissions), still include customer ID
          console.warn(`Failed to query details for customer ${customerId}:`, searchResponse.status);
          accounts.push({
            customerId: customerId,
            descriptiveName: null,
            currencyCode: null,
          });
        }
      } catch (error: any) {
        console.warn(`Error fetching details for customer ${customerId}:`, error.message);
        // Include customer ID even if details fetch fails
        accounts.push({
          customerId: customerId,
          descriptiveName: null,
          currencyCode: null,
        });
      }
    }

    console.log('Step 8: Successfully fetched account details for', accounts.length, 'accounts');

    // 8. Return accounts in the expected format
    return NextResponse.json({ 
      accounts: accounts
    });

  } catch (error: any) {
    console.error('=== ERROR in /api/ads/google-ads/accounts ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    console.error('Full error object:', JSON.stringify(error, null, 2));
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch Google Ads accounts',
        details: error?.message || 'Unknown error',
        type: error?.constructor?.name
      },
      { status: 500 }
    );
  }
}

