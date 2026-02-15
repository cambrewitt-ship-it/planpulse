import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

export async function POST(request: NextRequest) {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  POST /api/ads/google-analytics/list-events                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('Timestamp:', new Date().toISOString());
  
  try {
    const body = await request.json();
    const { propertyId, clientId } = body;

    console.log('List events API called with params:', {
      propertyId: propertyId || '(will use all active properties)',
      clientId: clientId || '(not specified)',
    });

    // Get authenticated user
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });
    
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Look up user's connection for Google Analytics
    let query = supabase
      .from('ad_platform_connections')
      .select('connection_id, platform, connection_status')
      .eq('user_id', userId)
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

    console.log('Found GA connection:', { connectionId: connection.connection_id });

    // Initialize Nango
    const nangoSecretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
    if (!nangoSecretKey) {
      console.error('GA4 API Error: NANGO_SECRET_KEY_DEV_PLAN_CHECK not configured');
      return NextResponse.json({
        success: false,
        error: 'Server configuration error',
      }, { status: 500 });
    }

    const nango = new Nango({ secretKey: nangoSecretKey });

    // Get the OAuth access token from Nango
    let accessToken: string;
    try {
      const nangoConnection = await nango.getConnection(toNangoPlatform('google-analytics'), connection.connection_id);
      accessToken = nangoConnection.credentials?.access_token as string;

      if (!accessToken) {
        return NextResponse.json({
          success: false,
          error: 'No access token found in Nango connection',
        }, { status: 401 });
      }
    } catch (nangoError: any) {
      console.error('GA4 API Error: Failed to get Nango connection:', nangoError);
      return NextResponse.json({
        success: false,
        error: 'Failed to retrieve OAuth credentials',
      }, { status: 500 });
    }

    // Get Google Analytics properties from database
    let propertiesQuery = supabase
      .from('google_analytics_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (propertyId) {
      propertiesQuery = propertiesQuery.eq('property_id', propertyId);
    }

    const { data: gaAccounts, error: accountsError } = await propertiesQuery;

    if (accountsError || !gaAccounts || gaAccounts.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No Google Analytics properties configured',
      }, { status: 400 });
    }

    console.log(`✓ Found ${gaAccounts.length} GA4 property/properties`);

    // Fetch events for each property
    const allEvents: Array<{ name: string; count: number; propertyId: string }> = [];

    for (const account of gaAccounts) {
      const propId = account.property_id;
      
      console.log(`\nFetching events for GA4 property ${propId}...`);

      try {
        // GA4 Data API request to get event names
        const requestBody = {
          dateRanges: [
            {
              startDate: '30daysAgo',
              endDate: 'today',
            }
          ],
          dimensions: [{ name: 'eventName' }],
          metrics: [{ name: 'eventCount' }],
          orderBys: [
            {
              metric: {
                metricName: 'eventCount',
              },
              desc: true,
            }
          ],
          limit: 50, // Top 50 events
        };

        const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runReport`;

        console.log('GA4 API Request:', {
          url,
          propertyId: propId,
          requestBody: JSON.stringify(requestBody, null, 2),
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
          continue; // Skip this property
        }

        const data = await response.json();
        console.log(`✓ Success! Got ${data.rows?.length || 0} events`);

        // Process results
        if (data.rows && Array.isArray(data.rows)) {
          for (const row of data.rows) {
            const eventName = row.dimensionValues?.[0]?.value || '';
            const eventCount = parseInt(row.metricValues?.[0]?.value || '0', 10);

            if (eventName) {
              allEvents.push({
                name: eventName,
                count: eventCount,
                propertyId: propId,
              });
            }
          }
        }

      } catch (error: any) {
        console.error(`Failed to fetch events for property ${propId}:`, error);
        // Continue with other properties
      }
    }

    // Aggregate events across properties (sum counts for same event name)
    const eventMap = new Map<string, number>();
    allEvents.forEach(event => {
      const current = eventMap.get(event.name) || 0;
      eventMap.set(event.name, current + event.count);
    });

    // Convert to array and sort by count
    const aggregatedEvents = Array.from(eventMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    console.log(`\nTotal unique events found: ${aggregatedEvents.length}`);
    console.log('Top 5 events:', aggregatedEvents.slice(0, 5));

    return NextResponse.json({
      success: true,
      events: aggregatedEvents,
      propertiesProcessed: gaAccounts.length,
    });

  } catch (error: any) {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║  GA4 List Events API ERROR                                    ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error',
    }, { status: 500 });
  }
}
