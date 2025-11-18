import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { Nango } from '@nangohq/node';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';
import { toNangoPlatform } from '@/lib/platform-mapping';

export async function POST(request: NextRequest) {
  console.log('=== POST /api/ads/meta/fetch-spend ===');
  console.log('Request received');
  
  try {
    // Parse request body
    const body = await request.json();
    console.log('Request body:', body);
    const { startDate, endDate } = body;

    // Validate required parameters
    if (!startDate || !endDate) {
      return Response.json(
        { error: 'Missing required parameters: startDate, endDate' },
        { status: 400 }
      );
    }

    // Validate date range
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return Response.json(
        { error: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    if (end < start) {
      return Response.json(
        { error: 'endDate must be after startDate' },
        { status: 400 }
      );
    }

    // Get authenticated user
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });
    
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('Failed to retrieve session:', sessionError);
      return Response.json(
        { error: 'Unable to verify session' },
        { status: 500 }
      );
    }

    const user = session?.user;

    if (!user || !user.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Look up user's connection for Meta Ads
    const { data: connection, error: dbError } = await supabase
      .from('ad_platform_connections')
      .select('connection_id, platform, connection_status')
      .eq('user_id', user.id)
      .eq('platform', 'meta-ads')
      .single();

    if (dbError || !connection) {
      return Response.json(
        { error: 'Meta Ads not connected. Please connect your account first.' },
        { status: 404 }
      );
    }

    // Check if connection is active
    if (connection.connection_status !== 'active') {
      return Response.json(
        { error: `Connection status is "${connection.connection_status}". Please reconnect your account.` },
        { status: 403 }
      );
    }

    // Initialize Nango with correct secret key
    const nangoSecretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
    if (!nangoSecretKey) {
      console.error('NANGO_SECRET_KEY_DEV_PLAN_CHECK not configured');
      return Response.json(
        { error: 'Server configuration error: Nango secret key not found' },
        { status: 500 }
      );
    }

    const nango = new Nango({ secretKey: nangoSecretKey });

    console.log('=== META ADS DATA FETCH ===');
    console.log('Date Range:', { startDate, endDate });
    console.log('User ID:', user.id);
    console.log('Connection ID:', connection.connection_id);

    try {
      // Step 1: Get Meta Ads accounts from database
      const { data: metaAdsAccounts, error: accountsError } = await supabase
        .from('meta_ads_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (accountsError || !metaAdsAccounts || metaAdsAccounts.length === 0) {
        return Response.json({
          success: false,
          error: 'No Meta Ads accounts configured'
        }, { status: 404 });
      }

      console.log(`Found ${metaAdsAccounts.length} Meta Ads account(s)`);

      // Step 2: Get the OAuth access token from Nango's connection
      const nangoConnection = await nango.getConnection(toNangoPlatform('meta-ads'), connection.connection_id);
      const accessToken = nangoConnection.credentials?.access_token;

      if (!accessToken) {
        throw new Error('No access token found in Nango connection');
      }

      console.log('✓ Got OAuth token from Nango');

      // Step 3: For each account, call Meta Marketing API
      const allSpendData = [];
      const errors = [];

      for (const account of metaAdsAccounts) {
        const accountId = account.account_id;
        
        console.log(`\nFetching data for Meta account ${accountId}...`);

        try {
          // Build query params
          const params = new URLSearchParams({
            fields: 'spend,account_name,date_start,date_stop',
            time_range: JSON.stringify({
              since: startDate,
              until: endDate
            }),
            level: 'account',
            access_token: accessToken
          });

          const url = `https://graph.facebook.com/v18.0/${accountId}/insights?${params.toString()}`;

          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            }
          });

          console.log(`Response status: ${response.status}`);

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error response:`, errorText.substring(0, 500));
            throw new Error(`Meta Marketing API error: ${response.status}`);
          }

          const data = await response.json();
          console.log(`✓ Success! Got ${data.data?.length || 0} results`);

          // Process results
          if (data.data && Array.isArray(data.data)) {
            for (const result of data.data) {
              allSpendData.push({
                accountId: accountId,
                accountName: result.account_name || account.account_name,
                dateStart: result.date_start || '',
                dateStop: result.date_stop || '',
                spend: parseFloat(result.spend || '0'),
                currency: account.currency || 'USD'
              });
            }
          }

        } catch (error: any) {
          console.error(`Failed for account ${accountId}:`, error.message);
          errors.push({
            accountId: accountId,
            accountName: account.account_name,
            error: error.message
          });
        }
      }

      return Response.json({
        success: true,
        platform: 'meta-ads',
        dateRange: { startDate, endDate },
        data: allSpendData,
        accountsProcessed: metaAdsAccounts.length,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (error: any) {
      console.error('=== Meta Ads Error ===', error);
      return Response.json({
        success: false,
        error: error.message
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('=== Error in meta/fetch-spend API route ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error stack:', error.stack);
    
    return Response.json(
      {
        error: 'Internal server error',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

