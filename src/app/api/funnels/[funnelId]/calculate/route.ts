import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateFunnelMetrics } from '@/lib/utils/funnel-calculations';
import type { FunnelConfig } from '@/lib/types/funnel';

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

    // GA4 metrics
    let ga4ActiveUsers = 0;
    let ga4Conversions = 0;
    let ga4Sessions = 0;
    let ga4Events: Array<{ name: string; count: number; users: number }> = [];

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

    // Fetch Google Analytics 4 data
    let ga4Query = supabase
      .from('google_analytics_metrics')
      .select('metric_name, metric_value, users_count')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate);

    if (clientId) {
      ga4Query = ga4Query.eq('client_id', clientId);
    }

    const [metaResult, googleResult, ga4Result] = await Promise.all([metaQuery, googleQuery, ga4Query]);

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

    // Aggregate GA4 metrics
    for (const row of ga4Result.data || []) {
      const metricName = row.metric_name as string;
      const metricValue = Number(row.metric_value) || 0;
      const usersCount = Number(row.users_count) || 0;

      if (metricName === 'activeUsers') {
        ga4ActiveUsers += metricValue;
      } else if (metricName === 'conversions') {
        ga4Conversions += metricValue;
      } else if (metricName === 'sessions') {
        ga4Sessions += metricValue;
      } else {
        // Event-based metrics
        const existingEvent = ga4Events.find(e => e.name === metricName);
        if (existingEvent) {
          existingEvent.count += metricValue;
          existingEvent.users += usersCount;
        } else {
          ga4Events.push({ name: metricName, count: metricValue, users: usersCount });
        }
      }
    }

    const totalSpend = metaSpend + googleSpend;

    const rawData = {
      metaMetrics: {
        impressions: metaImpressions,
        clicks: metaClicks,
        spend: metaSpend,
      },
      googleMetrics: {
        impressions: googleImpressions,
        clicks: googleClicks,
        spend: googleSpend,
      },
      ga4Metrics: {
        standardMetrics: {
          activeUsers: ga4ActiveUsers,
          conversions: ga4Conversions,
          sessions: ga4Sessions,
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
