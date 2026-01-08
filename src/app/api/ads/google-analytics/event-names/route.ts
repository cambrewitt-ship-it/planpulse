import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

export async function POST(request: NextRequest) {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  POST /api/ads/google-analytics/event-names                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('Timestamp:', new Date().toISOString());
  
  let body: any = null;
  
  try {
    // Parse request body with error handling
    try {
      body = await request.json();
    } catch (parseError: any) {
      console.error('Event Names API Error: Failed to parse request body:', parseError);
      return NextResponse.json({
        success: false,
        error: 'Invalid request body',
        errorDetails: parseError.message,
      }, { status: 400 });
    }

    const { clientId, propertyId } = body;

    console.log('Event Names API route called with params:', {
      propertyId: propertyId || '(not specified - will use first active property)',
      clientId: clientId || '(not specified)',
      timestamp: new Date().toISOString(),
    });

    // Get authenticated user
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });
    
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('Event Names API Error: Failed to retrieve session:', sessionError);
      return NextResponse.json({
        success: false,
        error: 'Unable to verify session',
        errorDetails: sessionError.message,
      }, { status: 500 });
    }

    const user = session?.user;

    if (!user || !user.id) {
      console.error('Event Names API Error: Unauthorized - no user in session');
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
      console.error('Event Names API Error: No Google Analytics connection found', { dbError, clientId });
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
      console.error('Event Names API Error: NANGO_SECRET_KEY_DEV_PLAN_CHECK not configured');
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
        console.error('Event Names API Error: No access token in Nango connection');
        return NextResponse.json({
          success: false,
          error: 'No access token found in Nango connection',
          errorDetails: 'OAuth credentials may have expired. Please reconnect your Google Analytics account.',
        }, { status: 401 });
      }
      console.log('Successfully retrieved access token from Nango');
    } catch (nangoError: any) {
      console.error('Event Names API Error: Failed to get Nango connection:', nangoError);
      return NextResponse.json({
        success: false,
        error: 'Failed to retrieve OAuth credentials',
        errorDetails: nangoError.message,
      }, { status: 500 });
    }

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
      console.error('Event Names API Error: Database query failed:', accountsError);
      return NextResponse.json({
        success: false,
        error: 'Failed to query Google Analytics properties',
        errorDetails: accountsError.message,
      }, { status: 500 });
    }

    if (!gaAccounts || gaAccounts.length === 0) {
      console.error('Event Names API Error: No Google Analytics properties configured');
      return NextResponse.json({
        success: false,
        error: 'Google Analytics property ID not configured',
        errorDetails: propertyId 
          ? `No active property found with ID: ${propertyId}` 
          : 'No active Google Analytics properties found for this user.',
      }, { status: 400 });
    }

    console.log(`✓ Found ${gaAccounts.length} GA4 property/properties`);

    // Use the first property (or the specified one)
    const targetProperty = gaAccounts[0];
    const targetPropertyId = targetProperty.property_id;

    console.log(`Fetching event names for property: ${targetPropertyId}`);

    // Fetch event names using GA4 Data API
    // We'll query for the last 30 days to get a comprehensive list of events
    const endDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 30 days ago

    const requestBody = {
      dateRanges: [
        {
          startDate: startDate,
          endDate: endDate,
        }
      ],
      dimensions: [{ name: 'eventName' }], // Dimension to get event names
      metrics: [{ name: 'eventCount' }],    // Count of events
      limit: 100,  // Limit to top 100 events
      orderBys: [
        {
          metric: {
            metricName: 'eventCount'
          },
          desc: true // Order by count descending
        }
      ]
    };

    // GA4 Data API endpoint
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${targetPropertyId}:runReport`;

    console.log('GA4 Event Names API Request:', {
      url,
      propertyId: targetPropertyId,
      dateRange: { startDate, endDate },
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
      console.error(`GA4 Data API error (${response.status}):`, errorText);
      let errorMessage = `GA4 Data API error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText.substring(0, 200) || errorMessage;
      }
      return NextResponse.json({
        success: false,
        error: errorMessage,
        errorDetails: errorText.substring(0, 500),
      }, { status: response.status });
    }

    const data = await response.json();
    console.log(`✓ Success! Got ${data.rows?.length || 0} event names`);

    // Process results to extract event names
    const eventNames: Array<{ name: string; count: number }> = [];
    
    if (data.rows && Array.isArray(data.rows)) {
      for (const row of data.rows) {
        const eventName = row.dimensionValues?.[0]?.value || '';
        const eventCount = parseInt(row.metricValues?.[0]?.value || '0', 10);
        
        if (eventName) {
          eventNames.push({
            name: eventName,
            count: eventCount,
          });
        }
      }
    }

    console.log('Event names retrieved:', {
      count: eventNames.length,
      topEvents: eventNames.slice(0, 5).map(e => e.name),
    });

    return NextResponse.json({
      success: true,
      propertyId: targetPropertyId,
      propertyName: targetProperty.property_name,
      dateRange: { startDate, endDate },
      eventNames: eventNames,
    });

  } catch (error: any) {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║  Event Names API ERROR - Unhandled Exception                 ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    console.error('Timestamp:', new Date().toISOString());
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error',
      errorDetails: `${error.name}: ${error.message}`,
    }, { status: 500 });
  }
}

