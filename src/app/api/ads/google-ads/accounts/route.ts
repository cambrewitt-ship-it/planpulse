import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';
import { Nango } from '@nangohq/node';

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
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });
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

    // 2. Look up their Google Ads connection_id from the database
    const { data: connection, error: dbError } = await supabase
      .from('ad_platform_connections')
      .select('connection_id')
      .eq('user_id', user.id)
      .eq('platform', 'google-ads')
      .eq('connection_status', 'active')
      .single();

    if (dbError || !connection) {
      console.error('Database error fetching connection:', dbError);
      return NextResponse.json(
        { error: 'Google Ads connection not found', details: dbError?.message },
        { status: 404 }
      );
    }

    console.log('Step 3: Found Google Ads connection:', connection.connection_id);

    // 3. Use Nango's proxy to call Google Ads API
    // This is the correct way - Nango handles authentication and routing
    console.log('Step 4: Calling Google Ads API through Nango proxy...');
    const endpoint = '/googleads/v16/customers:listAccessibleCustomers';
    console.log('Endpoint:', endpoint);

    try {
      const response = await nango.get({
        providerConfigKey: 'google-ads',
        connectionId: connection.connection_id,
        endpoint: endpoint,
      });

      console.log('Step 5: Successfully fetched data from Google Ads API');
      console.log('Response data:', JSON.stringify(response.data, null, 2));

      // 4. Extract customer IDs from resource names
      // Format: "customers/1234567890" → "1234567890"
      const customerIds = response.data.resourceNames?.map((name: string) => 
        name.replace('customers/', '')
      ) || [];

      console.log('Step 6: Extracted customer IDs:', customerIds);

      // 5. Return accounts in the expected format
      return NextResponse.json({ 
        accounts: customerIds.map((id: string) => ({ customerId: id }))
      });
    } catch (nangoError: any) {
      console.error('=== Nango API Error ===');
      console.error('Error status:', nangoError.status);
      console.error('Error message:', nangoError.message);
      console.error('Error code:', nangoError.code);
      
      if (nangoError.response) {
        console.error('Response status:', nangoError.response.status);
        console.error('Response statusText:', nangoError.response.statusText);
        console.error('Response data:', JSON.stringify(nangoError.response.data, null, 2));
      }

      const errorDetails = nangoError.response?.data?.message || 
                          nangoError.response?.data?.error || 
                          nangoError.message || 
                          'Unknown error';
      
      return NextResponse.json(
        {
          error: 'Failed to fetch Google Ads accounts',
          details: errorDetails,
          status: nangoError.response?.status || nangoError.status,
        },
        { status: nangoError.response?.status || nangoError.status || 500 }
      );
    }

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

