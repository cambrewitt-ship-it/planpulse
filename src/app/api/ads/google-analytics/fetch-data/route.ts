import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

export async function POST(request: NextRequest) {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  POST /api/ads/google-analytics/fetch-data                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('Timestamp:', new Date().toISOString());
  
  let body: any = null;
  
  try {
    // Parse request body with error handling
    try {
      body = await request.json();
    } catch (parseError: any) {
      console.error('GA4 API Error: Failed to parse request body:', parseError);
      return NextResponse.json({
        success: false,
        error: 'Invalid request body',
        errorDetails: parseError.message,
        stack: process.env.NODE_ENV === 'development' ? parseError.stack : undefined,
      }, { status: 400 });
    }

    const { startDate, endDate, metrics, propertyId, clientId, eventName } = body;

    // Log all incoming parameters
    console.log('GA4 API route called with params:', {
      propertyId: propertyId || '(not specified - will use all active properties)',
      clientId: clientId || '(not specified)',
      startDate,
      endDate,
      metrics: metrics || '(using defaults)',
      eventName: eventName || '(not specified - all events)',
      timestamp: new Date().toISOString(),
    });

    // Validate required parameters
    if (!startDate || !endDate) {
      console.error('GA4 API Error: Missing required date parameters');
      return NextResponse.json({
        success: false,
        error: 'Missing required parameters: startDate, endDate',
        received: { startDate, endDate },
      }, { status: 400 });
    }

    // Validate date range
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      console.error('GA4 API Error: Invalid date format', { startDate, endDate });
      return NextResponse.json({
        success: false,
        error: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DD)',
        received: { startDate, endDate },
      }, { status: 400 });
    }

    if (end < start) {
      console.error('GA4 API Error: endDate before startDate', { startDate, endDate });
      return NextResponse.json({
        success: false,
        error: 'endDate must be after startDate',
        received: { startDate, endDate },
      }, { status: 400 });
    }

    // Default metrics if not provided - includes events, key events (conversions), and active users
    const requestedMetrics = metrics || [
      'activeUsers',      // Active users (daily)
      'eventCount',       // Total events
      'conversions',      // Key events (conversions)
      'totalUsers',       // Total users
      'sessions',         // Sessions
      'screenPageViews'   // Page views
    ];

    // Get authenticated user
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });
    
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('GA4 API Error: Failed to retrieve session:', sessionError);
      return NextResponse.json({
        success: false,
        error: 'Unable to verify session',
        errorDetails: sessionError.message,
      }, { status: 500 });
    }

    const user = session?.user;

    if (!user || !user.id) {
      console.error('GA4 API Error: Unauthorized - no user in session');
      return NextResponse.json({
        success: false,
        error: 'Unauthorized',
        errorDetails: 'No authenticated user found in session',
      }, { status: 401 });
    }

    console.log('Authenticated user:', user.id);

    // Look up user's connection for Google Analytics
    let query = supabase
      .from('ad_platform_connections')
      .select('connection_id, platform, connection_status')
      .eq('user_id', user.id)
      .eq('platform', 'google-analytics')
      .eq('connection_status', 'active');
    
    if (clientId) {
      query = query.eq('client_id', clientId);
    }
    
    const { data: connection, error: dbError } = await query.single();

    if (dbError || !connection) {
      console.error('GA4 API Error: No Google Analytics connection found', { dbError, clientId });
      return NextResponse.json({
        success: false,
        error: 'Google Analytics not connected. Please connect your account first.',
        errorDetails: dbError?.message || 'No active connection found',
      }, { status: 404 });
    }

    console.log('Found GA connection:', { connectionId: connection.connection_id, platform: connection.platform });

    // Initialize Nango
    const nangoSecretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
    if (!nangoSecretKey) {
      console.error('GA4 API Error: NANGO_SECRET_KEY_DEV_PLAN_CHECK not configured');
      return NextResponse.json({
        success: false,
        error: 'Server configuration error: Nango secret key not found',
        errorDetails: 'Missing environment variable: NANGO_SECRET_KEY_DEV_PLAN_CHECK',
      }, { status: 500 });
    }

    const nango = new Nango({ secretKey: nangoSecretKey });

    // Get the OAuth access token from Nango with error handling
    let accessToken: string;
    try {
      console.log('Fetching Nango connection for:', { platform: toNangoPlatform('google-analytics'), connectionId: connection.connection_id });
      const nangoConnection = await nango.getConnection(toNangoPlatform('google-analytics'), connection.connection_id);
      accessToken = nangoConnection.credentials?.access_token as string;

      if (!accessToken) {
        console.error('GA4 API Error: No access token in Nango connection', {
          hasCredentials: !!nangoConnection.credentials,
          credentialKeys: nangoConnection.credentials ? Object.keys(nangoConnection.credentials) : [],
        });
        return NextResponse.json({
          success: false,
          error: 'No access token found in Nango connection',
          errorDetails: 'OAuth credentials may have expired. Please reconnect your Google Analytics account.',
        }, { status: 401 });
      }
      console.log('Successfully retrieved access token from Nango');
    } catch (nangoError: any) {
      console.error('GA4 API Error: Failed to get Nango connection:', nangoError);
      return NextResponse.json({
        success: false,
        error: 'Failed to retrieve OAuth credentials',
        errorDetails: nangoError.message,
        stack: process.env.NODE_ENV === 'development' ? nangoError.stack : undefined,
      }, { status: 500 });
    }

    console.log('=== GA4 DATA FETCH ===');
    console.log('Date Range:', { startDate, endDate });
    console.log('Metrics:', requestedMetrics);
    console.log('User ID:', user.id);
    console.log('Connection ID:', connection.connection_id);

    // Get Google Analytics properties from database
    console.log('Querying GA4 properties from database...');
    let propertiesQuery = supabase
      .from('google_analytics_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (propertyId) {
      console.log('Filtering by specific propertyId:', propertyId);
      propertiesQuery = propertiesQuery.eq('property_id', propertyId);
    }

    const { data: gaAccounts, error: accountsError } = await propertiesQuery;

    // Check if we have any GA properties configured
    if (accountsError) {
      console.error('GA4 API Error: Database query failed:', accountsError);
      return NextResponse.json({
        success: false,
        error: 'Failed to query Google Analytics properties',
        errorDetails: accountsError.message,
      }, { status: 500 });
    }

    if (!gaAccounts || gaAccounts.length === 0) {
      console.error('GA4 API Error: No Google Analytics properties configured', {
        userId: user.id,
        requestedPropertyId: propertyId,
      });
      return NextResponse.json({
        success: false,
        error: 'Google Analytics property ID not configured',
        errorDetails: propertyId 
          ? `No active property found with ID: ${propertyId}` 
          : 'No active Google Analytics properties found for this user. Please configure a GA4 property in your settings.',
      }, { status: 400 });
    }

    console.log(`✓ Found ${gaAccounts.length} GA4 property/properties:`, gaAccounts.map(a => ({
      propertyId: a.property_id,
      propertyName: a.property_name,
      isActive: a.is_active,
    })));

    // Map metric names to GA4 API metric names
    // Note: GA4 Data API uses these exact metric names
    const metricMapping: Record<string, string> = {
      'activeUsers': 'activeUsers',              // Daily active users
      'conversions': 'conversions',             // Conversion events (key events)
      'totalUsers': 'totalUsers',                // Total users
      'sessions': 'sessions',                   // Sessions
      'screenPageViews': 'screenPageViews',      // Page views
      'eventCount': 'eventCount',                // Total event count
      'newUsers': 'newUsers',                    // New users
      'engagementRate': 'engagementRate',        // Engagement rate
      'averageSessionDuration': 'averageSessionDuration', // Avg session duration
      'bounceRate': 'bounceRate',                // Bounce rate
      // Alternative names (if GA4 returns different names)
      'keyEvents': 'conversions',                // Some APIs use keyEvents for conversions
    };

    // Convert requested metrics to GA4 API format
    const ga4Metrics = requestedMetrics
      .map(m => metricMapping[m] || m)
      .filter(Boolean);

    // Add date dimension for time series
    const dimensions = ['date'];

    // Fetch data for each property
    const allData: Array<{
      propertyId: string;
      propertyName: string;
      date: string;
      [key: string]: string | number;
    }> = [];
    const errors: Array<{ propertyId: string; error: string }> = [];

    for (const account of gaAccounts) {
      const propertyId = account.property_id;
      
      console.log(`\nFetching data for GA4 property ${propertyId}...`);

      try {
        // GA4 Data API request body - property is in URL, not in body
        // Note: GA4 API accepts YYYY-MM-DD format directly (NOT YYYYMMDD)
        const requestBody: any = {
          dateRanges: [
            {
              startDate: startDate,  // Already in YYYY-MM-DD format
              endDate: endDate,      // Already in YYYY-MM-DD format
            }
          ],
          dimensions: dimensions.map(d => ({ name: d })),
          metrics: ga4Metrics.map(m => ({ name: m })),
        };

        // If eventName is specified, add dimension filter to only count that specific event
        if (eventName && ga4Metrics.includes('eventCount')) {
          console.log(`Adding dimension filter for event: ${eventName}`);
          requestBody.dimensionFilter = {
            filter: {
              fieldName: 'eventName',
              stringFilter: {
                matchType: 'EXACT',
                value: eventName,
              },
            },
          };
        }

        // GA4 Data API endpoint format: properties/{propertyId}:runReport
        const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

        console.log('GA4 API Request:', {
          url,
          propertyId,
          requestBody: JSON.stringify(requestBody, null, 2),
          metrics: ga4Metrics,
          dimensions,
        });

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        console.log(`Response status: ${response.status}`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`GA4 Data API error (${response.status}):`, errorText.substring(0, 1000));
          let errorMessage = `GA4 Data API error: ${response.status}`;
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
          } catch {
            errorMessage = errorText.substring(0, 200) || errorMessage;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        console.log(`✓ Success! Got ${data.rows?.length || 0} rows`);
        console.log('GA4 API Response sample:', {
          rowCount: data.rows?.length || 0,
          firstRow: data.rows?.[0],
          metricHeaders: data.metricHeaders,
          dimensionHeaders: data.dimensionHeaders,
          hasData: !!data.rows && data.rows.length > 0,
        });
        
        if (!data.rows || data.rows.length === 0) {
          console.warn(`No rows returned from GA4 API for property ${propertyId}`, {
            requestBody,
            response: data,
          });
        }

        // Process results
        if (data.rows && Array.isArray(data.rows)) {
          // Create a map of metric header names to their indices
          const metricHeaderMap = new Map<string, number>();
          if (data.metricHeaders && Array.isArray(data.metricHeaders)) {
            data.metricHeaders.forEach((header: any, index: number) => {
              // GA4 returns metric names in format like "activeUsers" or "conversions"
              const metricName = header?.name || '';
              if (metricName) {
                metricHeaderMap.set(metricName, index);
              }
            });
          }

          console.log('Metric header mapping:', {
            metricHeaders: data.metricHeaders?.map((h: any) => h?.name),
            metricHeaderMap: Array.from(metricHeaderMap.entries()),
            requestedMetrics: ga4Metrics,
            hasRows: data.rows.length > 0,
          });

          for (const row of data.rows) {
            const dateValue = row.dimensionValues?.[0]?.value || '';
            // GA4 API returns dates in YYYY-MM-DD format (or YYYYMMDD depending on request)
            // If it's already in YYYY-MM-DD format, use as-is
            // If it's in YYYYMMDD format (8 digits), convert to YYYY-MM-DD
            const formattedDate = dateValue.length === 8 && !dateValue.includes('-')
              ? `${dateValue.substring(0, 4)}-${dateValue.substring(4, 6)}-${dateValue.substring(6, 8)}`
              : dateValue;

            const dataPoint: {
              propertyId: string;
              propertyName: string;
              date: string;
              [key: string]: string | number;
            } = {
              propertyId: propertyId,
              propertyName: account.property_name || propertyId,
              date: formattedDate,
            };

            // Map metric values using metricHeaders to ensure correct mapping
            if (row.metricValues && Array.isArray(row.metricValues)) {
              ga4Metrics.forEach((metric) => {
                // Find the index of this metric in the response headers
                const metricIndex = metricHeaderMap.get(metric);
                
                if (metricIndex !== undefined && row.metricValues[metricIndex]) {
                  const metricValue = row.metricValues[metricIndex]?.value || '0';
                  // Convert to number, handling different formats
                  // GA4 sometimes returns values as strings like "123.45" or "0"
                  let numericValue = 0;
                  if (typeof metricValue === 'string') {
                    numericValue = parseFloat(metricValue) || 0;
                  } else if (typeof metricValue === 'number') {
                    numericValue = metricValue;
                  }
                  dataPoint[metric] = numericValue;
                } else {
                  // Metric not found in response, set to 0
                  console.warn(`Metric ${metric} not found in GA4 response headers`, {
                    metric,
                    availableHeaders: Array.from(metricHeaderMap.keys()),
                    metricIndex,
                  });
                  dataPoint[metric] = 0;
                }
              });
            }
            
            console.log(`Data point for ${formattedDate}:`, {
              date: formattedDate,
              metrics: ga4Metrics.map(m => ({ metric: m, value: dataPoint[m] })),
            });

            allData.push(dataPoint);
          }
        }

      } catch (error: any) {
        console.error(`Failed for property ${propertyId}:`, {
          error: error.message,
          stack: error.stack,
          propertyId,
          propertyName: account.property_name,
        });
        errors.push({
          propertyId: propertyId,
          error: error.message
        });
      }
    }

    // Aggregate data by date (in case multiple properties)
    const aggregatedData: Record<string, {
      date: string;
      [key: string]: string | number;
    }> = {};

    allData.forEach(point => {
      const dateKey = point.date;
      if (!aggregatedData[dateKey]) {
        aggregatedData[dateKey] = {
          date: dateKey,
        };
      }

      // Sum metrics across properties
      ga4Metrics.forEach(metric => {
        const currentValue = aggregatedData[dateKey][metric] as number || 0;
        aggregatedData[dateKey][metric] = currentValue + (point[metric] as number || 0);
      });
    });

    const finalData = Object.values(aggregatedData).sort((a, b) => 
      a.date.localeCompare(b.date)
    );

    console.log('Final aggregated data:', {
      totalDataPoints: finalData.length,
      samplePoint: finalData[0],
      metrics: ga4Metrics,
      dateRange: { startDate, endDate },
      allDataLength: allData.length,
      errorsCount: errors.length,
    });

    // If we have errors but no data, return error with helpful message
    if (finalData.length === 0 && errors.length > 0) {
      console.error('No data returned and errors occurred:', errors);
      
      // Check for API not enabled error
      const apiDisabledError = errors.find(e => 
        e.error.includes('has not been used') || 
        e.error.includes('is disabled') ||
        e.error.includes('SERVICE_DISABLED')
      );
      
      if (apiDisabledError) {
        // Extract activation URL if present
        const activationUrlMatch = apiDisabledError.error.match(/https:\/\/console\.developers\.google\.com[^\s]+/);
        const activationUrl = activationUrlMatch ? activationUrlMatch[0] : null;
        
        return NextResponse.json({
          success: false,
          error: 'Google Analytics Data API is not enabled',
          errorDetails: apiDisabledError.error,
          activationUrl: activationUrl,
          errors: errors,
        }, { status: 403 });
      }
      
      return NextResponse.json({
        success: false,
        error: `Failed to fetch GA4 data: ${errors.map(e => e.error).join('; ')}`,
        errors: errors,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      platform: 'google-analytics',
      dateRange: { startDate, endDate },
      metrics: ga4Metrics,
      data: finalData,
      propertiesProcessed: gaAccounts.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║  GA4 API ERROR - Unhandled Exception                         ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    console.error('Timestamp:', new Date().toISOString());
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Request body:', body);
    console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    
    // Return error with more details for debugging
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error',
      errorDetails: `${error.name}: ${error.message}`,
      errorName: error.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

