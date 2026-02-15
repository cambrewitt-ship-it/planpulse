import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';
import { FunnelConfig, FunnelStage } from '@/lib/types/funnel';
import { calculateFunnelMetrics } from '@/lib/utils/funnel-calculations';

// GET /api/funnels/[funnelId]/calculate?startDate={}&endDate={}
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

    // Fetch funnel (RLS handles authorization)
    const { data: funnel, error: fetchError } = await supabase
      .from('media_plan_funnels')
      .select('*')
      .eq('id', funnelId)
      .single();

    if (fetchError || !funnel) {
      return NextResponse.json(
        { success: false, error: 'Funnel not found' },
        { status: 404 }
      );
    }

    const config = funnel.config as FunnelConfig;
    const channelIds = funnel.channel_ids as string[];

    // Find clientId from one of the channels
    const { data: mediaPlanBuilders } = await supabase
      .from('client_media_plan_builder')
      .select('client_id, channels');

    let clientId: string | null = null;
    for (const builder of mediaPlanBuilders || []) {
      const channels = builder.channels || [];
      // Check if any of the funnel's channelIds exist in this builder
      if (channelIds.some(id => channels.find((ch: any) => ch.id === id))) {
        clientId = builder.client_id;
        break;
      }
    }

    if (!clientId) {
      return NextResponse.json(
        { success: false, error: 'Client not found for funnel channels' },
        { status: 404 }
      );
    }

    // Determine which data sources we need
    const needsMeta = config.stages.some(s => s.source === 'meta');
    const needsGoogle = config.stages.some(s => s.source === 'google');
    const needsGA4 = config.stages.some(s => s.source === 'ga4');

    // Extract GA4 event names if needed
    const ga4EventNames = needsGA4 
      ? config.stages
          .filter(s => s.source === 'ga4' && s.eventName)
          .map(s => s.eventName!)
      : [];

    const needsGA4Events = ga4EventNames.length > 0;
    const needsGA4StandardMetrics = needsGA4 && config.stages.some(
      s => s.source === 'ga4' && !s.eventName
    );

    console.log('Funnel calculation requirements:', {
      funnelId,
      needsMeta,
      needsGoogle,
      needsGA4,
      needsGA4Events,
      ga4EventNames,
      needsGA4StandardMetrics,
    });

    // Fetch data from platforms
    const fetchPromises: Promise<any>[] = [];
    let metaData: any = null;
    let googleData: any = null;
    let ga4StandardData: any = null;
    let ga4EventsData: any = null;

    // Fetch Meta Ads data
    if (needsMeta) {
      fetchPromises.push(
        fetch(`${request.nextUrl.origin}/api/ads/meta/fetch-spend`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Cookie': request.headers.get('cookie') || '',
          },
          body: JSON.stringify({ 
            startDate, 
            endDate,
            clientId,
          }),
        })
          .then(res => res.json())
          .then(data => { metaData = data; })
          .catch(err => console.error('Meta fetch error:', err))
      );
    }

    // Fetch Google Ads data
    if (needsGoogle) {
      fetchPromises.push(
        fetch(`${request.nextUrl.origin}/api/ads/fetch-spend`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Cookie': request.headers.get('cookie') || '',
          },
          body: JSON.stringify({ 
            startDate, 
            endDate,
            platform: 'google-ads',
            clientId,
          }),
        })
          .then(res => res.json())
          .then(data => { googleData = data; })
          .catch(err => console.error('Google fetch error:', err))
      );
    }

    // Fetch GA4 standard metrics
    if (needsGA4StandardMetrics) {
      fetchPromises.push(
        fetch(`${request.nextUrl.origin}/api/ads/google-analytics/fetch-data`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Cookie': request.headers.get('cookie') || '',
          },
          body: JSON.stringify({ 
            startDate, 
            endDate,
            clientId,
            metrics: ['activeUsers', 'conversions', 'sessions', 'screenPageViews'],
          }),
        })
          .then(res => res.json())
          .then(data => { ga4StandardData = data; })
          .catch(err => console.error('GA4 standard metrics fetch error:', err))
      );
    }

    // Fetch GA4 events data
    if (needsGA4Events) {
      fetchPromises.push(
        fetch(`${request.nextUrl.origin}/api/ads/google-analytics/fetch-data`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Cookie': request.headers.get('cookie') || '',
          },
          body: JSON.stringify({ 
            startDate, 
            endDate,
            clientId,
            eventNames: ga4EventNames,
          }),
        })
          .then(res => res.json())
          .then(data => { ga4EventsData = data; })
          .catch(err => console.error('GA4 events fetch error:', err))
      );
    }

    // Wait for all fetches to complete
    await Promise.all(fetchPromises);

    console.log('Fetched data:', {
      metaSuccess: metaData?.success,
      googleSuccess: googleData?.success,
      ga4StandardSuccess: ga4StandardData?.success,
      ga4EventsSuccess: ga4EventsData?.success,
    });

    // Aggregate metrics from raw data
    const aggregateMetrics = (data: any[]) => {
      return data.reduce((acc, point) => {
        Object.keys(point).forEach(key => {
          if (typeof point[key] === 'number' && key !== 'date') {
            acc[key] = (acc[key] || 0) + point[key];
          }
        });
        return acc;
      }, {} as Record<string, number>);
    };

    // Process Meta data
    const metaMetrics = metaData?.success && metaData.data 
      ? aggregateMetrics(metaData.data)
      : { impressions: 0, clicks: 0, spend: 0 };

    // Process Google data
    const googleMetrics = googleData?.success && googleData.data 
      ? aggregateMetrics(googleData.data)
      : { impressions: 0, clicks: 0, spend: 0 };

    // Process GA4 standard metrics
    const ga4Standard = ga4StandardData?.success && ga4StandardData.data
      ? aggregateMetrics(ga4StandardData.data)
      : { activeUsers: 0, conversions: 0, sessions: 0 };

    // Process GA4 events
    const ga4Events = ga4EventsData?.success && ga4EventsData.events
      ? ga4EventsData.events
      : [];

    // Calculate total spend
    const totalSpend = (metaMetrics.spend || 0) + (googleMetrics.spend || 0);

    // Build raw data structure for calculation
    const rawData = {
      metaMetrics,
      googleMetrics,
      ga4Metrics: {
        standardMetrics: ga4Standard,
        events: ga4Events,
      },
      totalSpend,
    };

    console.log('Raw data for calculation:', {
      metaMetrics,
      googleMetrics,
      ga4Standard,
      ga4EventsCount: ga4Events.length,
      totalSpend,
    });

    // Calculate funnel metrics
    const calculatedStages = calculateFunnelMetrics(config, rawData);

    return NextResponse.json({
      success: true,
      config: {
        ...config,
        channelIds: funnel.channel_ids,
        totalCost: totalSpend,
        dateRange: { startDate, endDate },
      },
      stages: calculatedStages,
      totalCost: totalSpend,
      dataFetchStatus: {
        meta: metaData?.success || false,
        google: googleData?.success || false,
        ga4Standard: ga4StandardData?.success || false,
        ga4Events: ga4EventsData?.success || false,
      },
    });

  } catch (error: any) {
    console.error('GET /api/funnels/[funnelId]/calculate error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
