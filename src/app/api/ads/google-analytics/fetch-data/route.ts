import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

export async function POST(request: NextRequest) {
  console.log('=== POST /api/ads/google-analytics/fetch-data ===');
  
  try {
    const body = await request.json();
    const { startDate, endDate, metrics, propertyId, clientId } = body;

    // Validate required parameters
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required parameters: startDate, endDate' },
        { status: 400 }
      );
    }

    // Validate date range
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    if (end < start) {
      return NextResponse.json(
        { error: 'endDate must be after startDate' },
        { status: 400 }
      );
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
      console.error('Failed to retrieve session:', sessionError);
      return NextResponse.json(
        { error: 'Unable to verify session' },
        { status: 500 }
      );
    }

    const user = session?.user;

    if (!user || !user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
      return NextResponse.json(
        { error: 'Google Analytics not connected. Please connect your account first.' },
        { status: 404 }
      );
    }

    // Initialize Nango
    const nangoSecretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
    if (!nangoSecretKey) {
      console.error('NANGO_SECRET_KEY_DEV_PLAN_CHECK not configured');
      return NextResponse.json(
        { error: 'Server configuration error: Nango secret key not found' },
        { status: 500 }
      );
    }

    const nango = new Nango({ secretKey: nangoSecretKey });

    // Get the OAuth access token from Nango
    const nangoConnection = await nango.getConnection(toNangoPlatform('google-analytics'), connection.connection_id);
    const accessToken = nangoConnection.credentials?.access_token;

    if (!accessToken) {
      throw new Error('No access token found in Nango connection');
    }

    console.log('=== GA4 DATA FETCH ===');
    console.log('Date Range:', { startDate, endDate });
    console.log('Metrics:', requestedMetrics);
    console.log('User ID:', user.id);
    console.log('Connection ID:', connection.connection_id);

    // Get Google Analytics properties from database
    let propertiesQuery = supabase
      .from('google_analytics_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (propertyId) {
      propertiesQuery = propertiesQuery.eq('property_id', propertyId);
    }

    const { data: gaAccounts, error: accountsError } = await propertiesQuery;

    if (accountsError || !gaAccounts || gaAccounts.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No Google Analytics properties configured'
      }, { status: 404 });
    }

    console.log(`Found ${gaAccounts.length} GA4 property/properties`);

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
        // Format dates for GA4 API (YYYYMMDD)
        const formatDateForGA4 = (dateStr: string) => {
          return dateStr.replace(/-/g, '');
        };

        // GA4 Data API request body - property is in URL, not in body
        const requestBody = {
          dateRanges: [
            {
              startDate: formatDateForGA4(startDate),
              endDate: formatDateForGA4(endDate),
            }
          ],
          dimensions: dimensions.map(d => ({ name: d })),
          metrics: ga4Metrics.map(m => ({ name: m })),
        };

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
            // Convert GA4 date format (YYYYMMDD) to ISO (YYYY-MM-DD)
            const formattedDate = dateValue.length === 8 
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
    console.error('=== Error in google-analytics/fetch-data API route ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Full error object:', error);
    
    // Return error with more details for debugging
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error.message || 'Unknown error',
        errorName: error.name,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

