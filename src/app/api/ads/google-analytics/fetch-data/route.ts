import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';
import { syncGA4Data } from '@/lib/ads/ga4-live';

export async function POST(request: NextRequest) {
  let body: any = null;

  try {
    try {
      body = await request.json();
    } catch (parseError: any) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request body',
        errorDetails: parseError.message,
      }, { status: 400 });
    }

    const { startDate, endDate, metrics, propertyId, clientId, eventName, eventNames } = body;

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
    const requestedMetrics: string[] = metrics || [
      'activeUsers',      // Active users (daily)
      'eventCount',       // Total events
      'conversions',      // Key events (conversions)
      'totalUsers',       // Total users
      'sessions',         // Sessions
      'screenPageViews'   // Page views
    ];

    // Get authenticated user
    const supabase = await createClient();

    const { data: { user }, error: sessionError } = await supabase.auth.getUser();

    if (sessionError) {
      console.error('GA4 API Error: Failed to retrieve user:', sessionError);
      return NextResponse.json({
        success: false,
        error: 'Unable to verify session',
        errorDetails: sessionError.message,
      }, { status: 500 });
    }

    if (!user || !user.id) {
      console.error('GA4 API Error: Unauthorized - no authenticated user');
      return NextResponse.json({
        success: false,
        error: 'Unauthorized',
        errorDetails: 'No authenticated user found',
      }, { status: 401 });
    }

    // Look up user's connection for Google Analytics
    let connQuery = supabase
      .from('ad_platform_connections')
      .select('id, connection_id, platform, connection_status')
      .eq('user_id', user.id)
      .eq('platform', 'google-analytics')
      .eq('connection_status', 'active');

    if (clientId) {
      connQuery = connQuery.eq('client_id', clientId);
    }

    const { data: connection, error: dbError } = await connQuery.single();

    if (dbError || !connection) {
      console.error('GA4 API Error: No Google Analytics connection found', { dbError, clientId });
      return NextResponse.json({
        success: false,
        error: 'Google Analytics not connected. Please connect your account first.',
        errorDetails: dbError?.message || 'No active connection found',
      }, { status: 404 });
    }

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

    // Determine query mode: event-specific (discovery, for the event picker
    // dropdown — always live, not cached) or standard date-series metrics
    // (what the dashboard charts, cached in google_analytics_metrics).
    const isEventQuery = eventNames && Array.isArray(eventNames) && eventNames.length > 0;

    if (!isEventQuery) {
      const result = await syncGA4Data({
        supabase,
        nango,
        userId: user.id,
        clientId: clientId || null,
        connectionId: connection.connection_id,
        connectionRowId: connection.id,
        startDate,
        endDate,
        requestedMetrics,
        eventName: eventName || null,
        propertyId: propertyId || null,
      });

      if (!result.success) {
        return NextResponse.json({
          success: false,
          error: result.error,
          errorDetails: result.error,
          errors: result.errors,
        }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        platform: 'google-analytics',
        queryType: 'metrics',
        dateRange: { startDate, endDate },
        metrics: requestedMetrics,
        data: result.data,
        propertiesProcessed: result.propertiesProcessed,
        errors: result.errors,
      });
    }

    // ── Event-name discovery mode (live-only, not cached) ──────────────────
    console.log('Fetching Nango connection for:', { platform: toNangoPlatform('google-analytics'), connectionId: connection.connection_id });
    let accessToken: string;
    try {
      const nangoConnection = await nango.getConnection(toNangoPlatform('google-analytics'), connection.connection_id);
      accessToken = (nangoConnection.credentials as any)?.access_token as string;

      if (!accessToken) {
        return NextResponse.json({
          success: false,
          error: 'No access token found in Nango connection',
          errorDetails: 'OAuth credentials may have expired. Please reconnect your Google Analytics account.',
        }, { status: 401 });
      }
    } catch (nangoError: any) {
      console.error('GA4 API Error: Failed to get Nango connection:', nangoError);
      return NextResponse.json({
        success: false,
        error: 'Failed to retrieve OAuth credentials',
        errorDetails: nangoError.message,
      }, { status: 500 });
    }

    let propertiesQuery = supabase
      .from('google_analytics_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (propertyId) {
      propertiesQuery = propertiesQuery.eq('property_id', propertyId);
    }
    if (clientId) propertiesQuery = propertiesQuery.eq('client_id', clientId);

    let { data: gaAccounts, error: accountsError } = await propertiesQuery;

    // Fall back to legacy rows saved before client scoping was added, never
    // to another client's explicitly-assigned property.
    if (clientId && !accountsError && (!gaAccounts || gaAccounts.length === 0)) {
      let legacyQuery = supabase
        .from('google_analytics_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .is('client_id', null);
      if (propertyId) legacyQuery = legacyQuery.eq('property_id', propertyId);
      const legacy = await legacyQuery;
      gaAccounts = legacy.data;
      accountsError = legacy.error;
    }

    if (accountsError) {
      return NextResponse.json({
        success: false,
        error: 'Failed to query Google Analytics properties',
        errorDetails: accountsError.message,
      }, { status: 500 });
    }

    if (!gaAccounts || gaAccounts.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Google Analytics property ID not configured',
        errorDetails: propertyId
          ? `No active property found with ID: ${propertyId}`
          : 'No active Google Analytics properties found for this user. Please configure a GA4 property in your settings.',
      }, { status: 400 });
    }

    const allData: Array<{
      propertyId: string;
      propertyName: string;
      eventName: string;
      [key: string]: string | number;
    }> = [];
    const errors: Array<{ propertyId: string; error: string }> = [];

    await Promise.all(gaAccounts.map(async (account) => {
      const propId = account.property_id;

      try {
        const requestBody: any = {
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: 'eventName' }],
          metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
          dimensionFilter: {
            filter: { fieldName: 'eventName', inListFilter: { values: eventNames } },
          },
        };

        const response = await fetch(
          `https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runReport`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
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

        if (data.rows && Array.isArray(data.rows)) {
          const metricHeaderMap = new Map<string, number>();
          if (data.metricHeaders && Array.isArray(data.metricHeaders)) {
            data.metricHeaders.forEach((header: any, index: number) => {
              if (header?.name) metricHeaderMap.set(header.name, index);
            });
          }

          for (const row of data.rows) {
            const eventNameValue = row.dimensionValues?.[0]?.value || '';
            const dataPoint: {
              propertyId: string;
              propertyName: string;
              eventName: string;
              [key: string]: string | number;
            } = {
              propertyId: propId,
              propertyName: account.property_name || propId,
              eventName: eventNameValue,
            };

            if (row.metricValues && Array.isArray(row.metricValues)) {
              const eventCountIndex = metricHeaderMap.get('eventCount');
              const totalUsersIndex = metricHeaderMap.get('totalUsers');

              if (eventCountIndex !== undefined && row.metricValues[eventCountIndex]) {
                dataPoint.eventCount = parseFloat(row.metricValues[eventCountIndex]?.value || '0') || 0;
              }
              if (totalUsersIndex !== undefined && row.metricValues[totalUsersIndex]) {
                dataPoint.totalUsers = parseFloat(row.metricValues[totalUsersIndex]?.value || '0') || 0;
              }
            }

            allData.push(dataPoint);
          }
        }
      } catch (error: any) {
        errors.push({ propertyId: propId, error: error.message });
      }
    }));

    const aggregatedEvents: Record<string, { name: string; count: number; users: number }> = {};
    allData.forEach(point => {
      const eventKey = point.eventName as string;
      if (!aggregatedEvents[eventKey]) {
        aggregatedEvents[eventKey] = { name: eventKey, count: 0, users: 0 };
      }
      aggregatedEvents[eventKey].count += (point.eventCount as number) || 0;
      aggregatedEvents[eventKey].users += (point.totalUsers as number) || 0;
    });

    const eventsArray = Object.values(aggregatedEvents).sort((a, b) => b.count - a.count);

    if (eventsArray.length === 0 && errors.length > 0) {
      const apiDisabledError = errors.find(e =>
        e.error.includes('has not been used') ||
        e.error.includes('is disabled') ||
        e.error.includes('SERVICE_DISABLED')
      );

      if (apiDisabledError) {
        const activationUrlMatch = apiDisabledError.error.match(/https:\/\/console\.developers\.google\.com[^\s]+/);
        return NextResponse.json({
          success: false,
          error: 'Google Analytics Data API is not enabled',
          errorDetails: apiDisabledError.error,
          activationUrl: activationUrlMatch ? activationUrlMatch[0] : null,
          errors,
        }, { status: 403 });
      }

      return NextResponse.json({
        success: false,
        error: `Failed to fetch GA4 data: ${errors.map(e => e.error).join('; ')}`,
        errors,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      platform: 'google-analytics',
      queryType: 'events',
      dateRange: { startDate, endDate },
      events: eventsArray,
      propertiesProcessed: gaAccounts.length,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error('GA4 API Error - Unhandled Exception:', error);
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
