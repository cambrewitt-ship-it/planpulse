import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateFunnelMetrics } from '@/lib/utils/funnel-calculations';
import type { FunnelConfig } from '@/lib/types/funnel';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

// All GA4 metrics supported by the funnel
const ALL_GA4_METRICS = [
  'activeUsers', 'totalUsers', 'newUsers', 'sessions', 'engagedSessions',
  'conversions', 'eventCount', 'bounceRate', 'screenPageViews',
];

// GET /api/funnels/[funnelId]/calculate?startDate=&endDate=
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ funnelId: string }> }
) {
  try {
    const { funnelId } = await params;
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: startDate, endDate' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Load funnel config
    const { data: funnelRow, error: funnelError } = await (supabase as any)
      .from('media_plan_funnels')
      .select('id, name, channel_ids, config, client_id')
      .eq('id', funnelId)
      .single();

    if (funnelError || !funnelRow) {
      return NextResponse.json(
        { success: false, error: 'Funnel not found', details: funnelError?.message },
        { status: 404 }
      );
    }

    const config = funnelRow.config as FunnelConfig;
    const clientId = funnelRow.client_id as string | null;

    // Aggregate Meta Ads spend metrics for the date range
    let metaSpend = 0;
    let metaImpressions = 0;
    let metaClicks = 0;

    let googleSpend = 0;
    let googleImpressions = 0;
    let googleClicks = 0;

    let metaQuery = supabase
      .from('ad_performance_metrics')
      .select('spend, impressions, clicks')
      .eq('user_id', userId)
      .eq('platform', 'meta-ads')
      .gte('date', startDate)
      .lte('date', endDate);

    if (clientId) {
      metaQuery = metaQuery.eq('client_id', clientId);
    }

    let googleQuery = supabase
      .from('ad_performance_metrics')
      .select('spend, impressions, clicks')
      .eq('user_id', userId)
      .eq('platform', 'google-ads')
      .gte('date', startDate)
      .lte('date', endDate);

    if (clientId) {
      googleQuery = googleQuery.eq('client_id', clientId);
    }

    const [metaResult, googleResult] = await Promise.all([metaQuery, googleQuery]);

    if (metaResult.error) {
      console.warn('[Funnel Calculate] Meta query error:', metaResult.error.message);
    }
    for (const row of metaResult.data || []) {
      metaSpend += Number(row.spend) || 0;
      metaImpressions += Number(row.impressions) || 0;
      metaClicks += Number(row.clicks) || 0;
    }

    for (const row of googleResult.data || []) {
      googleSpend += Number(row.spend) || 0;
      googleImpressions += Number(row.impressions) || 0;
      googleClicks += Number(row.clicks) || 0;
    }

    // Fetch GA4 data directly (same pattern as fetch-data route, no HTTP loopback)
    const ga4StandardMetrics: Record<string, number> = {};
    const ga4Events: Array<{ name: string; count: number; users: number }> = [];

    try {
      // Mirror fetch-data route: filter by client_id if present, then fall back to user-level
      let connectionQuery = supabase
        .from('ad_platform_connections')
        .select('connection_id')
        .eq('user_id', userId)
        .eq('platform', 'google-analytics')
        .eq('connection_status', 'active');

      if (clientId) {
        connectionQuery = connectionQuery.eq('client_id', clientId);
      }

      let { data: connection, error: connErr } = await connectionQuery.maybeSingle();

      // Fall back to any active GA4 connection for this user if client-scoped lookup failed
      if (!connection && clientId) {
        const { data: fallback } = await supabase
          .from('ad_platform_connections')
          .select('connection_id')
          .eq('user_id', userId)
          .eq('platform', 'google-analytics')
          .eq('connection_status', 'active')
          .maybeSingle();
        connection = fallback;
      }

      console.log('[Funnel Calculate] GA4 connection lookup:', { found: !!connection, connErr: connErr?.message, clientId, userId });

      if (connection) {
        const nangoSecretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
        if (!nangoSecretKey) {
          console.warn('[Funnel Calculate] NANGO_SECRET_KEY_DEV_PLAN_CHECK not set');
        } else {
          const nango = new Nango({ secretKey: nangoSecretKey });
          const nangoConnection = await nango.getConnection(
            toNangoPlatform('google-analytics'),
            connection.connection_id
          );
          const accessToken = (nangoConnection.credentials as any)?.access_token as string;
          console.log('[Funnel Calculate] Got access token:', !!accessToken);

          if (accessToken) {
            // GA4 accounts stored per-user only (no client_id column)
            const { data: gaAccounts } = await supabase
              .from('google_analytics_accounts')
              .select('property_id, property_name')
              .eq('user_id', userId)
              .eq('is_active', true);

            console.log('[Funnel Calculate] GA4 accounts found:', gaAccounts?.length || 0);

            if (gaAccounts && gaAccounts.length > 0) {
              for (const account of gaAccounts) {
                try {
                  const requestBody = {
                    dateRanges: [{ startDate, endDate }],
                    dimensions: [{ name: 'date' }],
                    metrics: ALL_GA4_METRICS.map(m => ({ name: m })),
                  };

                  const ga4Response = await fetch(
                    `https://analyticsdata.googleapis.com/v1beta/properties/${account.property_id}:runReport`,
                    {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify(requestBody),
                    }
                  );

                  console.log(`[Funnel Calculate] GA4 API response for property ${account.property_id}:`, ga4Response.status);

                  if (ga4Response.ok) {
                    const ga4Data = await ga4Response.json();
                    const rowCount = ga4Data.rows?.length || 0;
                    console.log(`[Funnel Calculate] GA4 rows returned:`, rowCount);

                    if (ga4Data.rows && Array.isArray(ga4Data.rows)) {
                      // Build metric header index map
                      const metricHeaderMap = new Map<string, number>();
                      (ga4Data.metricHeaders || []).forEach((header: any, index: number) => {
                        if (header?.name) metricHeaderMap.set(header.name, index);
                      });

                      // Sum each metric across all days
                      for (const row of ga4Data.rows) {
                        for (const metric of ALL_GA4_METRICS) {
                          const metricIndex = metricHeaderMap.get(metric);
                          if (metricIndex !== undefined && row.metricValues?.[metricIndex]) {
                            const value = parseFloat(row.metricValues[metricIndex]?.value || '0') || 0;
                            ga4StandardMetrics[metric] = (ga4StandardMetrics[metric] || 0) + value;
                          }
                        }
                      }
                    }
                  } else {
                    const errText = await ga4Response.text().catch(() => '');
                    console.warn(`[Funnel Calculate] GA4 API error for property ${account.property_id}:`, ga4Response.status, errText.substring(0, 200));
                  }

                  // Second call: fetch event counts by event name (for funnel stages using specific events)
                  const eventRequestBody = {
                    dateRanges: [{ startDate, endDate }],
                    dimensions: [{ name: 'eventName' }],
                    metrics: [{ name: 'eventCount' }, { name: 'activeUsers' }],
                  };

                  const ga4EventResponse = await fetch(
                    `https://analyticsdata.googleapis.com/v1beta/properties/${account.property_id}:runReport`,
                    {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify(eventRequestBody),
                    }
                  );

                  console.log(`[Funnel Calculate] GA4 Events API response for property ${account.property_id}:`, ga4EventResponse.status);

                  if (ga4EventResponse.ok) {
                    const ga4EventData = await ga4EventResponse.json();
                    const eventRowCount = ga4EventData.rows?.length || 0;
                    console.log(`[Funnel Calculate] GA4 event rows returned:`, eventRowCount);

                    if (ga4EventData.rows && Array.isArray(ga4EventData.rows)) {
                      for (const row of ga4EventData.rows) {
                        const eventName = row.dimensionValues?.[0]?.value;
                        const eventCount = parseFloat(row.metricValues?.[0]?.value || '0') || 0;
                        const eventUsers = parseFloat(row.metricValues?.[1]?.value || '0') || 0;

                        if (eventName && eventName !== '(not set)') {
                          const existing = ga4Events.find(e => e.name === eventName);
                          if (existing) {
                            existing.count += eventCount;
                            existing.users += eventUsers;
                          } else {
                            ga4Events.push({ name: eventName, count: eventCount, users: eventUsers });
                          }
                        }
                      }
                    }
                  } else {
                    const errText = await ga4EventResponse.text().catch(() => '');
                    console.warn(`[Funnel Calculate] GA4 Events API error for property ${account.property_id}:`, ga4EventResponse.status, errText.substring(0, 200));
                  }
                } catch (propError: any) {
                  console.warn(`[Funnel Calculate] Failed to fetch GA4 for property ${account.property_id}:`, propError.message);
                }
              }
            }
          }
        }
      }

      console.log('[Funnel Calculate] GA4 aggregated totals:', ga4StandardMetrics);
      console.log('[Funnel Calculate] GA4 events populated:', ga4Events.length, ga4Events.map(e => `${e.name}:${e.count}`));
    } catch (ga4Error: any) {
      console.warn('[Funnel Calculate] GA4 fetch error (non-blocking):', ga4Error.message);
    }

    const totalSpend = metaSpend + googleSpend;

    const rawData = {
      metaMetrics: {
        impressions: metaImpressions,
        clicks: metaClicks,
        link_clicks: 0, // not stored in ad_performance_metrics
        spend: metaSpend,
      },
      googleMetrics: {
        impressions: googleImpressions,
        clicks: googleClicks,
        spend: googleSpend,
      },
      ga4Metrics: {
        standardMetrics: {
          activeUsers: ga4StandardMetrics['activeUsers'] || 0,
          totalUsers: ga4StandardMetrics['totalUsers'] || 0,
          newUsers: ga4StandardMetrics['newUsers'] || 0,
          sessions: ga4StandardMetrics['sessions'] || 0,
          engagedSessions: ga4StandardMetrics['engagedSessions'] || 0,
          conversions: ga4StandardMetrics['conversions'] || 0,
          eventCount: ga4StandardMetrics['eventCount'] || 0,
          bounceRate: ga4StandardMetrics['bounceRate'] || 0,
          screenPageViews: ga4StandardMetrics['screenPageViews'] || 0,
        },
        events: ga4Events,
      },
      totalSpend,
    };

    const stages = calculateFunnelMetrics(config, rawData);

    return NextResponse.json({ success: true, stages });
  } catch (error: any) {
    console.error('GET /api/funnels/[funnelId]/calculate unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
