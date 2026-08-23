import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Nango } from '@nangohq/node';
import { saveMetaAdsMetrics } from '@/lib/ad-metrics';
import { syncGoogleAdsSpend } from '@/lib/ads/google-ads-live';

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
    const supabase = await createClient();
    
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
      .select('id, connection_id, platform, connection_status, client_id')
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

    // Only use a connection that belongs to this specific client — never fall back
    // to another client's connection, as that would leak cross-client spend data.
    const connection: any = connections?.[0];

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
        const result = await syncGoogleAdsSpend({
          supabase,
          nango,
          userId: user.id,
          clientId: clientId || null,
          connectionId: connection.connection_id,
          connectionRowId: connection.id,
          startDate,
          endDate,
        });

        if (!result.success) {
          const status = /not found or expired/i.test(result.error || '') ? 424
            : /No access token/i.test(result.error || '') ? 401
            : 404;
          return Response.json({
            success: false,
            platform: 'google-ads',
            dateRange: { startDate, endDate },
            data: [],
            error: result.error,
            errors: result.errors,
            accountsProcessed: result.accountsProcessed,
          }, { status });
        }

        return Response.json({
          success: true,
          platform: 'google-ads',
          dateRange: { startDate, endDate },
          data: result.data,
          accountsProcessed: result.accountsProcessed,
          errors: result.errors,
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

      // Persist Meta spend data (Google is handled above; this path is Meta via Nango proxy)
      if (platform === 'meta-ads' && Array.isArray(transformedData) && transformedData.length > 0) {
        try {
          const metaMetrics = transformedData.map((item: any) => ({
            accountId: item.account_id || item.accountId || '',
            accountName: item.account_name || item.accountName || '',
            campaignId: item.campaign_id || item.campaignId || '',
            campaignName: item.campaign_name || item.campaignName || '',
            dateStart: item.date_start || item.dateStart || startDate,
            dateStop: item.date_stop || item.dateStop || endDate,
            spend: parseFloat(item.spend || '0'),
            impressions: parseInt(item.impressions || '0', 10),
            reach: parseInt(item.reach || '0', 10),
            clicks: parseInt(item.clicks || '0', 10),
            ctr: parseFloat(item.ctr || '0'),
            cpc: parseFloat(item.cpc || '0'),
            cpm: parseFloat(item.cpm || '0'),
            frequency: parseFloat(item.frequency || '0'),
            currency: item.currency || 'USD',
          }));
          await saveMetaAdsMetrics(user.id, clientId || null, metaMetrics);
          console.log(`✓ Saved ${metaMetrics.length} Meta Ads metrics to database (clientId: ${clientId || 'none'})`);
        } catch (saveError) {
          console.error('Failed to persist Meta Ads metrics:', saveError);
        }
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

