import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { Nango } from '@nangohq/node';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';
import { toNangoPlatform } from '@/lib/platform-mapping';

export async function POST(request: NextRequest) {
  console.log('=== POST /api/ads/fetch-spend ===');
  console.log('Request received');
  
  try {
    // Parse request body
    const body = await request.json();
    console.log('Request body:', body);
    const { platform, startDate, endDate, clientId } = body;

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
    // If clientId is provided, filter by it; otherwise get the most recent connection
    // For Google Ads and Meta Ads, if no client-specific connection exists, fall back to any user connection
    let query = supabase
      .from('ad_platform_connections')
      .select('connection_id, platform, connection_status, client_id')
      .eq('user_id', user.id)
      .eq('platform', platform)
      .eq('connection_status', 'active');
    
    // Filter by client_id if provided
    if (clientId) {
      query = query.eq('client_id', clientId);
    }
    
    const { data: connections, error: dbError } = await query
      .order('created_at', { ascending: false })
      .limit(1);

    if (dbError) {
      console.error('Error querying connections:', dbError);
      return Response.json(
        { error: 'Platform not connected. Please connect your account first.' },
        { status: 404 }
      );
    }

    // If no connection found and clientId was provided, for Google Ads and Meta Ads,
    // fall back to checking for any connection (since accounts are user-level)
    let connection = connections?.[0];
    if (!connection && clientId && (platform === 'google-ads' || platform === 'meta-ads')) {
      console.log(`No connection found for client ${clientId}, checking for any ${platform} connection...`);
      const { data: anyConnections, error: anyConnectionError } = await supabase
        .from('ad_platform_connections')
        .select('connection_id, platform, connection_status, client_id')
        .eq('user_id', user.id)
        .eq('platform', platform)
        .eq('connection_status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (!anyConnectionError && anyConnections && anyConnections.length > 0) {
        connection = anyConnections[0];
        console.log(`Found connection for different client: ${connection.client_id}, using it for client ${clientId}`);
      }
    }

    if (!connection) {
      return Response.json(
        { error: 'Platform not connected. Please connect your account first.' },
        { status: 404 }
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

    // Platform-specific API configuration
    let endpoint: string;
    let params: Record<string, any>;

    console.log('=== Fetch Spend Request ===');
    console.log('Platform:', platform);
    console.log('Date Range:', { startDate, endDate });
    console.log('User ID:', user.id);
    console.log('Client ID:', clientId);
    console.log('Connection ID:', connection.connection_id);
    console.log('Connection client_id:', connection.client_id);

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
            error: 'No Google Ads accounts configured. Please visit /api/ads/google-ads/accounts to see available accounts and save them.'
          }, { status: 404 });
        }

        console.log(`Found ${googleAdsAccounts.length} Google Ads account(s)`);
        googleAdsAccounts.forEach((account, idx) => {
          console.log(`  Account ${idx + 1}:`, {
            customerId: account.customer_id,
            accountName: account.account_name,
            isActive: account.is_active
          });
        });

        // Step 2: Get the OAuth access token from Nango's connection using SDK
        // Use the connection_id from the saved Google Ads account (not from the client-filtered connection)
        // This ensures we use the correct OAuth token for the account
        const accountConnectionId = googleAdsAccounts[0].connection_id;
        console.log('Step 2: Getting access token from Nango...');
        console.log('Account Connection ID:', accountConnectionId);
        console.log('Provider config key:', toNangoPlatform('google-ads'));

        let nangoConnection;
        try {
          nangoConnection = await nango.getConnection(toNangoPlatform('google-ads'), accountConnectionId);
          console.log('Nango connection retrieved successfully');
        } catch (nangoError: any) {
          console.error('Failed to get Nango connection:', {
            status: nangoError.status,
            message: nangoError.message,
            code: nangoError.code,
            response: nangoError.response
          });
          
          // Check if connection exists in Nango
          try {
            const allConnections = await nango.listConnections();
            console.log('All Nango connections:', JSON.stringify(allConnections, null, 2));
          } catch (listError) {
            console.error('Could not list connections:', listError);
          }
          
          return Response.json({
            success: false,
            error: 'Google Ads connection not found or expired. Please reconnect your Google Ads account.',
            details: nangoError.message,
            connectionId: accountConnectionId
          }, { status: 424 });
        }
        
        const accessToken = nangoConnection.credentials?.access_token;

        if (!accessToken) {
          return Response.json({
            success: false,
            error: 'No access token found in Google Ads connection. Please reconnect your account.'
          }, { status: 401 });
        }

        console.log('✓ Got OAuth token from Nango');

        // Get MCC ID from environment (optional - only needed if using MCC account)
        const mccId = process.env.GOOGLE_ADS_MCC_ID;
        const cleanMccId = mccId ? mccId.replace(/-/g, '') : null;
        if (cleanMccId) {
          console.log(`Using MCC ID: ${mccId} (clean: ${cleanMccId})`);
        } else {
          console.log('No MCC ID configured - using direct customer access');
        }

        // Step 3: First, verify which customers are accessible
        console.log('Step 3: Verifying accessible customers...');
        let accessibleCustomerIds: string[] = [];
        try {
          const listCustomersUrl = 'https://googleads.googleapis.com/v16/customers:listAccessibleCustomers';
          const listHeaders: Record<string, string> = {
            'Authorization': `Bearer ${accessToken}`,
            'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
          };

          // Only add login-customer-id if MCC is configured
          if (cleanMccId) {
            listHeaders['login-customer-id'] = cleanMccId;
          }

          const listResponse = await fetch(listCustomersUrl, {
            method: 'GET',
            headers: listHeaders
          });
          
          if (listResponse.ok) {
            const listData = await listResponse.json();
            const accessibleResources = listData.resourceNames || [];
            // Extract customer IDs from resource names (format: customers/1234567890)
            accessibleCustomerIds = accessibleResources.map((resource: string) => {
              const match = resource.match(/customers\/(\d+)/);
              return match ? match[1] : null;
            }).filter(Boolean);
            console.log(`✓ Found ${accessibleCustomerIds.length} accessible customers: ${accessibleCustomerIds.join(', ')}`);
          } else {
            console.warn(`⚠ Could not list accessible customers (status ${listResponse.status}). Will try anyway...`);
          }
        } catch (listError) {
          console.warn(`⚠ Error listing accessible customers:`, listError);
          // Continue anyway
        }

        // Step 4: For each customer ID, call Google Ads API directly
        const allSpendData = [];
        const errors = [];

        for (const account of googleAdsAccounts) {
          const customerId = account.customer_id;
          // Strip dashes from customer ID for API call
          const cleanCustomerId = customerId.replace(/-/g, '');
          
          // Check if customer is accessible
          if (accessibleCustomerIds.length > 0 && !accessibleCustomerIds.includes(cleanCustomerId)) {
            console.warn(`⚠ Customer ID ${customerId} (${cleanCustomerId}) is not in the list of accessible customers`);
            errors.push({
              customerId: customerId,
              accountName: account.account_name,
              error: `Customer ID ${customerId} is not accessible through your MCC account. Please verify the customer is linked to MCC ${mccId} and that you have permission to access it.`
            });
            continue;
          }
          
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

          console.log(`\n=== Fetching Google Ads spend data ===`);
          console.log(`  Customer ID (raw): ${customerId}`);
          console.log(`  Customer ID (clean, for API): ${cleanCustomerId}`);
          console.log(`  Account Name: ${account.account_name || 'N/A'}`);
          console.log(`  Date range: ${startDate} to ${endDate}`);
          console.log(`  Full query:`, query);

          try {
            // Google Ads API requires customer IDs without dashes in the URL
            // Also verify the customer ID is properly formatted (10 digits)
            if (cleanCustomerId.length !== 10) {
              throw new Error(`Invalid customer ID format: ${customerId} (cleaned: ${cleanCustomerId}). Customer IDs must be 10 digits.`);
            }
            
            const apiUrl = `https://googleads.googleapis.com/v16/customers/${cleanCustomerId}/googleAds:search`;
            console.log(`  API URL: ${apiUrl}`);

            // Build headers - only include login-customer-id if MCC is configured
            const requestHeaders: Record<string, string> = {
              'Authorization': `Bearer ${accessToken}`,
              'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
              'Content-Type': 'application/json',
            };

            // Only add login-customer-id if MCC is configured
            if (cleanMccId) {
              requestHeaders['login-customer-id'] = cleanMccId;
              console.log(`  Using MCC login-customer-id: ${cleanMccId}`);
            }

            const response = await fetch(
              apiUrl,
              {
                method: 'POST',
                headers: requestHeaders,
                body: JSON.stringify({ query: query })
              }
            );

            console.log(`Response status: ${response.status}`);

            if (!response.ok) {
              let errorText = '';
              let errorJson = null;
              try {
                errorText = await response.text();
                // Try to parse as JSON for better error messages
                try {
                  errorJson = JSON.parse(errorText);
                } catch {
                  // Not JSON, that's okay
                }
              } catch (e) {
                errorText = 'Could not read error response';
              }
              
              console.error(`❌ Google Ads API error for customer ${customerId}:`, {
                status: response.status,
                statusText: response.statusText,
                errorText: errorText.substring(0, 1000),
                errorJson: errorJson,
                url: `https://googleads.googleapis.com/v16/customers/${cleanCustomerId}/googleAds:search`
              });
              
              // Provide more helpful error messages
              if (response.status === 404) {
                const errorMessage = errorJson?.error?.message || errorJson?.error || 'Customer ID not found or not accessible';
                console.error(`  🔴 404 Error Details:`, {
                  customerId,
                  cleanCustomerId,
                  mccId,
                  errorMessage,
                  possibleCauses: [
                    'Customer ID is not linked to your MCC account (2246810345)',
                    'Customer ID does not exist',
                    'Access token does not have permission to access this customer',
                    'Customer ID format might be incorrect'
                  ]
                });
                
                errors.push({
                  customerId: customerId,
                  accountName: account.account_name,
                  error: `404 - Customer ID ${customerId} not found or not accessible. Please verify: (1) This customer is linked to your MCC account ${mccId}, (2) The customer ID is correct, (3) Your Google Ads account has access to this customer.`
                });
              } else {
                errors.push({
                  customerId: customerId,
                  accountName: account.account_name,
                  error: `Google Ads API error ${response.status}: ${errorJson?.error?.message || errorJson?.error || errorText.substring(0, 200)}`
                });
              }
              // Continue to next account instead of throwing
              continue;
            }

            const data = await response.json();
            console.log(`✓ Success! Got ${data.results?.length || 0} results`);
            console.log(`  Query date range: ${startDate} to ${endDate}`);
            console.log(`  Customer ID: ${customerId} (clean: ${cleanCustomerId})`);
            
            if (!data.results || data.results.length === 0) {
              console.log(`  ⚠ No results returned from Google Ads API for date range ${startDate} to ${endDate}`);
              console.log(`  This could mean:`);
              console.log(`    - No campaigns have spend in this date range`);
              console.log(`    - Date range is in the future (no spend data yet)`);
              console.log(`    - All campaigns are paused or have no activity`);
              console.log(`    - Customer ID doesn't have access to campaigns with spend`);
              console.log(`  Full response keys:`, Object.keys(data));
              if (data.fieldMask) {
                console.log(`  Field mask:`, data.fieldMask);
              }
              if (data.requestId) {
                console.log(`  Request ID:`, data.requestId);
              }
              // Log first 500 chars of response for debugging
              const responseStr = JSON.stringify(data, null, 2);
              console.log(`  Response preview:`, responseStr.substring(0, 500));
            }

            // Process results
            if (data.results && Array.isArray(data.results)) {
              for (const result of data.results) {
                const spend = (result.metrics?.costMicros || 0) / 1000000;
                const date = result.segments?.date || '';
                console.log(`  - Date: ${date}, Spend: $${spend}, Campaign: ${result.campaign?.name || 'N/A'}`);
                
                allSpendData.push({
                  customerId: customerId,
                  accountName: account.account_name,
                  campaignId: result.campaign?.id?.toString() || '',
                  campaignName: result.campaign?.name || '',
                  date: date,
                  spend: spend,
                  currency: 'USD'
                });
              }
            } else {
              console.log('  ⚠ No results array in response or results is empty');
              console.log('  Response structure:', Object.keys(data));
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

        console.log(`=== GOOGLE ADS FETCH COMPLETE ===`);
        console.log(`Total spend data items: ${allSpendData.length}`);
        console.log(`Accounts processed: ${googleAdsAccounts.length}`);
        console.log(`Errors: ${errors.length}`);
        if (allSpendData.length > 0) {
          console.log(`Sample data:`, allSpendData.slice(0, 3));
        }
        
        // Return response - if we have errors, still return success but include errors
        // Only return error status if all accounts failed
        const hasAnySuccess = allSpendData.length > 0;
        const hasAnyErrors = errors.length > 0;
        
        if (!hasAnySuccess && hasAnyErrors && googleAdsAccounts.length > 0) {
          // All accounts failed - return error status
          const firstError = errors[0];
          return Response.json({
            success: false,
            platform: 'google-ads',
            dateRange: { startDate, endDate },
            data: [],
            error: firstError.error,
            errors: errors,
            accountsProcessed: googleAdsAccounts.length
          }, { status: 404 });
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

