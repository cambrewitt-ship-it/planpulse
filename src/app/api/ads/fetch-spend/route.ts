import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { Nango } from '@nangohq/node';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';

export async function POST(request: NextRequest) {
  console.log('=== POST /api/ads/fetch-spend ===');
  console.log('Request received');
  
  try {
    // Parse request body
    const body = await request.json();
    console.log('Request body:', body);
    const { platform, startDate, endDate } = body;

    // Validate required parameters
    if (!platform || !startDate || !endDate) {
      return Response.json(
        { error: 'Missing required parameters: platform, startDate, endDate' },
        { status: 400 }
      );
    }

    // Validate platform
    if (platform !== 'google-ads' && platform !== 'meta-ads') {
      return Response.json(
        { error: 'Invalid platform. Must be "google-ads" or "meta-ads"' },
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

    // Look up user's connection for the platform
    // Get the most recent active connection (user may have multiple connections for different clients)
    const { data: connections, error: dbError } = await supabase
      .from('ad_platform_connections')
      .select('connection_id, platform, connection_status')
      .eq('user_id', user.id)
      .eq('platform', platform)
      .eq('connection_status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    if (dbError) {
      console.error('Error querying connections:', dbError);
      return Response.json(
        { error: 'Platform not connected. Please connect your account first.' },
        { status: 404 }
      );
    }

    if (!connections || connections.length === 0) {
      return Response.json(
        { error: 'Platform not connected. Please connect your account first.' },
        { status: 404 }
      );
    }

    const connection = connections[0];

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

    // Platform-specific API configuration
    let endpoint: string;
    let params: Record<string, any>;

    console.log('=== Fetch Spend Request ===');
    console.log('Platform:', platform);
    console.log('Date Range:', { startDate, endDate });
    console.log('User ID:', user.id);
    console.log('Connection ID:', connection.connection_id);

    if (platform === 'google-ads') {
      try {
        console.log('=== GOOGLE ADS DATA FETCH ===');
        
        // Step 1: Get Google Ads accounts from database
        const { data: googleAdsAccounts, error: accountsError } = await supabase
          .from('google_ads_accounts')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true);

        if (accountsError || !googleAdsAccounts || googleAdsAccounts.length === 0) {
          return Response.json({
            success: false,
            error: 'No Google Ads accounts configured'
          }, { status: 404 });
        }

        console.log(`Found ${googleAdsAccounts.length} Google Ads account(s)`);

        // Step 2: Get the OAuth access token from Nango's connection
        // We'll use Nango's API to get the connection details
        const nangoResponse = await fetch(
          `https://api.nango.dev/connection/${connection.connection_id}?provider_config_key=google-ads`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${nangoSecretKey}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (!nangoResponse.ok) {
          throw new Error(`Failed to get Nango connection: ${nangoResponse.status}`);
        }

        const nangoData = await nangoResponse.json();
        const accessToken = nangoData.credentials?.access_token;

        if (!accessToken) {
          throw new Error('No access token found in Nango connection');
        }

        console.log('✓ Got OAuth token from Nango');

        // Get MCC ID from environment
        const mccId = process.env.GOOGLE_ADS_MCC_ID;
        if (!mccId) {
          throw new Error('GOOGLE_ADS_MCC_ID not configured in environment variables');
        }
        console.log(`Using MCC ID: ${mccId}`);

        // Step 3: For each customer ID, call Google Ads API directly
        const allSpendData = [];
        const errors = [];

        for (const account of googleAdsAccounts) {
          const customerId = account.customer_id;
          // Strip dashes from customer ID for API call
          const cleanCustomerId = customerId.replace(/-/g, '');
          
          const query = `
            SELECT
              campaign.id,
              campaign.name,
              metrics.cost_micros,
              segments.date
            FROM campaign
            WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
            ORDER BY segments.date DESC
          `;

          console.log(`\nFetching data for customer ${customerId} (clean: ${cleanCustomerId})...`);

          try {
            const response = await fetch(
              `https://googleads.googleapis.com/v16/customers/${cleanCustomerId}/googleAds:search`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
                  'Content-Type': 'application/json',
                  'login-customer-id': mccId
                },
                body: JSON.stringify({ query: query })
              }
            );

            console.log(`Response status: ${response.status}`);

            if (!response.ok) {
              const errorText = await response.text();
              console.error(`Error response:`, errorText.substring(0, 500));
              throw new Error(`Google Ads API error: ${response.status}`);
            }

            const data = await response.json();
            console.log(`✓ Success! Got ${data.results?.length || 0} results`);

            // Process results
            if (data.results && Array.isArray(data.results)) {
              for (const result of data.results) {
                allSpendData.push({
                  customerId: customerId,
                  accountName: account.account_name,
                  campaignId: result.campaign?.id?.toString() || '',
                  campaignName: result.campaign?.name || '',
                  date: result.segments?.date || '',
                  spend: (result.metrics?.costMicros || 0) / 1000000,
                  currency: 'USD'
                });
              }
            }

          } catch (error: any) {
            console.error(`Failed for customer ${customerId}:`, error.message);
            errors.push({
              customerId: customerId,
              accountName: account.account_name,
              error: error.message
            });
          }
        }

        return Response.json({
          success: true,
          platform: 'google-ads',
          dateRange: { startDate, endDate },
          data: allSpendData,
          accountsProcessed: googleAdsAccounts.length,
          errors: errors.length > 0 ? errors : undefined
        });

      } catch (error: any) {
        console.error('=== Google Ads Error ===', error);
        return Response.json({
          success: false,
          error: error.message
        }, { status: 500 });
      }
    } else if (platform === 'meta-ads') {
      // Meta Ads (Facebook) Marketing API - Insights API
      // Reference: https://developers.facebook.com/docs/marketing-api/insights
      // The Insights API provides ad performance metrics including spend data
      
      // Note: The ad_account_id will be retrieved from Nango connection metadata
      // Format: act_{ad_account_id}/insights
      endpoint = '/insights';
      
      // Meta Ads Insights API parameters
      params = {
        time_range: {
          since: startDate,  // YYYY-MM-DD format
          until: endDate,    // YYYY-MM-DD format
        },
        // Fields to retrieve from the API
        // spend: Amount spent on ads (in account currency)
        // impressions: Number of times ads were shown
        // clicks: Number of clicks on ads
        // conversions: Number of conversions tracked
        // campaign_name, campaign_id: Campaign identification
        fields: 'campaign_id,campaign_name,spend,impressions,clicks,conversions,cpm,cpc,ctr',
        level: 'campaign', // Get data at campaign level (can also be 'account', 'adset', or 'ad')
        limit: 1000, // Maximum number of results per request
      };

      console.log('Meta Ads endpoint:', endpoint);
      console.log('Meta Ads params:', JSON.stringify(params, null, 2));
    } else {
      throw new Error('Invalid platform');
    }

    // Make API call through Nango proxy
    try {
      console.log('Making Nango request...');
      console.log('Endpoint:', endpoint);
      console.log('Params:', JSON.stringify(params, null, 2));

      const response = await nango.get({
        providerConfigKey: platform,
        connectionId: connection.connection_id,
        endpoint: endpoint,
        params: params,
      });

      console.log('=== Nango Response ===');
      console.log('Status:', response.status || 'success');
      console.log('Data type:', typeof response.data);
      console.log('Data keys:', response.data ? Object.keys(response.data) : 'null');
      console.log('Full response data:', JSON.stringify(response.data, null, 2));

      // Transform platform-specific data
      let transformedData = response.data;
      
      if (platform === 'meta-ads' && response.data) {
        console.log('Processing Meta Ads data...');
        // Meta Ads returns data in a specific format
        // Usually: { data: [...], paging: {...} }
        // Spend is already in account currency (no conversion needed)
        
        // If response has a 'data' field (common Meta API structure), extract it
        if (response.data.data) {
          transformedData = response.data.data;
          console.log('Extracted Meta Ads data array from response.data.data');
        }
        
        console.log('Meta Ads data count:', Array.isArray(transformedData) ? transformedData.length : 'not an array');
        console.log('Meta Ads data sample:', JSON.stringify(
          Array.isArray(transformedData) ? transformedData[0] : transformedData,
          null,
          2
        ));
      }

      return Response.json({
        success: true,
        platform,
        dateRange: { startDate, endDate },
        data: transformedData,
        rawDataSample: Array.isArray(response.data) ? response.data[0] : response.data,
      });
    } catch (nangoError: any) {
      console.error('=== Nango API Error ===');
      console.error('Error status:', nangoError.status);
      console.error('Error message:', nangoError.message);
      console.error('Error code:', nangoError.code);
      
      // Safely log response data without circular references
      if (nangoError.response) {
        console.error('Response status:', nangoError.response.status);
        console.error('Response statusText:', nangoError.response.statusText);
        console.error('Response data:', nangoError.response.data);
      }

      // Handle rate limiting
      if (nangoError.status === 429) {
        return Response.json(
          { error: 'Rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      }

      // Handle other API errors
      const errorDetails = nangoError.response?.data?.message || 
                          nangoError.response?.data?.error || 
                          nangoError.message || 
                          'Unknown error';
      
      return Response.json(
        {
          error: 'Failed to fetch ad spend data',
          details: errorDetails,
          status: nangoError.response?.status || nangoError.status,
          platform,
        },
        { status: nangoError.response?.status || nangoError.status || 500 }
      );
    }
  } catch (error: any) {
    console.error('=== Error in fetch-spend API route ===');
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

