import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

/**
 * POST /api/ads/google-analytics/sync-metrics
 * Fetches GA4 metrics and syncs them to the google_analytics_metrics table
 *
 * Request body:
 * {
 *   startDate: "YYYY-MM-DD",
 *   endDate: "YYYY-MM-DD",
 *   clientId?: "client-uuid",
 *   propertyId?: "GA4-property-id"
 * }
 */
export async function POST(request: NextRequest) {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  POST /api/ads/google-analytics/sync-metrics                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  try {
    const body = await request.json();
    const { startDate, endDate, clientId, propertyId } = body;

    if (!startDate || !endDate) {
      console.error('❌ Missing date parameters');
      return NextResponse.json({
        success: false,
        error: 'Missing required parameters: startDate, endDate',
      }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      console.error('❌ Unauthorized');
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    console.log('📊 Syncing GA4 metrics');
    console.log('User:', userId);
    console.log('Date range:', { startDate, endDate });
    console.log('Client:', clientId);
    console.log('Property:', propertyId);

    // First, fetch GA4 data using the fetch-data endpoint
    console.log('📥 Fetching GA4 data from Google Analytics API...');
    let fetchDataUrl = `/api/ads/google-analytics/fetch-data`;

    // Call the fetch-data endpoint to get GA4 metrics
    const fetchResponse = await fetch(`${request.headers.get('origin') || 'http://localhost:3000'}${fetchDataUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        clientId,
        propertyId,
        metrics: ['activeUsers', 'conversions', 'sessions', 'totalUsers', 'screenPageViews', 'eventCount'],
      }),
    });

    if (!fetchResponse.ok) {
      const fetchError = await fetchResponse.json();
      console.error('❌ Failed to fetch GA4 data:', fetchError);
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch GA4 data from Google Analytics',
        details: fetchError,
      }, { status: fetchResponse.status });
    }

    const fetchedData = await fetchResponse.json();
    console.log('✓ GA4 fetch successful:', { dataPoints: fetchedData.data?.length || 0 });

    if (!fetchedData.success || !fetchedData.data || fetchedData.data.length === 0) {
      console.warn('⚠️  No GA4 data returned');
      return NextResponse.json({
        success: true,
        message: 'No GA4 data available for this date range',
        rowsInserted: 0,
      });
    }

    // Get GA4 properties to associate data with property_ids
    // First try with client_id, then fallback to just user_id
    let propertiesQuery = supabase
      .from('google_analytics_accounts')
      .select('property_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (propertyId) {
      propertiesQuery = propertiesQuery.eq('property_id', propertyId);
    }

    if (clientId) {
      propertiesQuery = propertiesQuery.eq('client_id', clientId);
    }

    let { data: gaProperties } = await propertiesQuery;

    // If no properties found with client_id filter, try without it
    if ((!gaProperties || gaProperties.length === 0) && clientId) {
      console.log('⚠️  No GA4 properties found with client_id filter, trying without client_id...');

      let fallbackQuery = supabase
        .from('google_analytics_accounts')
        .select('property_id')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (propertyId) {
        fallbackQuery = fallbackQuery.eq('property_id', propertyId);
      }

      const { data: fallbackProperties } = await fallbackQuery;
      gaProperties = fallbackProperties;
    }

    if (!gaProperties || gaProperties.length === 0) {
      console.warn('⚠️  No GA4 properties found');
      return NextResponse.json({
        success: true,
        message: 'No GA4 properties configured',
        rowsInserted: 0,
      });
    }

    console.log(`✓ Found ${gaProperties.length} GA4 property/properties:`, gaProperties);
    const gaPropId = gaProperties[0].property_id;
    console.log('Using property_id:', gaPropId);

    // Transform fetched data and prepare for insertion
    console.log('🔄 Transforming GA4 data for database insertion...');
    const insertData: any[] = [];

    // Standard metrics to sync
    const standardMetrics = ['activeUsers', 'conversions', 'sessions', 'totalUsers', 'screenPageViews', 'eventCount'];

    if (fetchedData.data && Array.isArray(fetchedData.data)) {
      for (const dataPoint of fetchedData.data) {
        const date = dataPoint.date;

        // Sync standard metrics
        for (const metric of standardMetrics) {
          if (dataPoint[metric] !== undefined && dataPoint[metric] !== null) {
            insertData.push({
              user_id: userId,
              client_id: clientId || null,
              property_id: gaPropId,
              date,
              metric_name: metric,
              metric_value: dataPoint[metric],
              users_count: 0,
            });
          }
        }
      }
    }

    // Also sync custom GA4 events if present in response
    if (fetchedData.events && Array.isArray(fetchedData.events)) {
      console.log(`📌 Found ${fetchedData.events.length} custom GA4 events to sync`);
      for (const event of fetchedData.events) {
        insertData.push({
          user_id: userId,
          client_id: clientId || null,
          property_id: gaPropId,
          date: startDate, // Events are aggregated across date range
          metric_name: event.name, // Use actual event name like 'purchase', 'sign_up'
          metric_value: event.count,
          users_count: event.users || 0,
        });
      }
    }

    if (insertData.length === 0) {
      console.warn('⚠️  No metrics to insert');
      return NextResponse.json({
        success: true,
        message: 'No metrics to insert',
        rowsInserted: 0,
      });
    }

    console.log(`✓ Prepared ${insertData.length} records for insertion`);
    console.log('Sample record:', insertData[0]);

    // Upsert data
    const { error: upsertError } = await (supabase as any)
      .from('google_analytics_metrics')
      .upsert(insertData, {
        onConflict: 'user_id,property_id,date,metric_name',
      });

    if (upsertError) {
      console.error('✗ Error upserting GA4 metrics:', upsertError);
      return NextResponse.json({
        success: false,
        error: 'Failed to upsert GA4 metrics',
        details: upsertError.message,
      }, { status: 500 });
    }

    console.log(`✓ Successfully upserted ${insertData.length} GA4 metric records`);

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${insertData.length} GA4 metric records`,
      rowsInserted: insertData.length,
    });
  } catch (error: any) {
    console.error('GA4 sync error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to sync GA4 metrics',
    }, { status: 500 });
  }
}
