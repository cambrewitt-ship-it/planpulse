import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { startOfMonth, subDays, format } from 'date-fns';
import { sendTeamsAlert } from '@/lib/teams';

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

function aggregateAdRows(rows: any[]): Record<string, number> {
  let spend = 0, impressions = 0, clicks = 0, conversions = 0;
  for (const r of rows) {
    spend += Number(r.spend || 0);
    impressions += Number(r.impressions || 0);
    clicks += Number(r.clicks || 0);
    conversions += Number(r.conversions || 0);
  }
  const result: Record<string, number> = { spend, impressions, clicks, conversions };
  if (clicks > 0 && impressions > 0) result.ctr = (clicks / impressions) * 100;
  if (clicks > 0) { result.cpl = spend / clicks; result.cpc = spend / clicks; }
  if (conversions > 0) result.cpa = spend / conversions;
  return result;
}

// Map media plan channel names to benchmark channel_name values
function mapChannelToBenchmark(channelName: string): string {
  const lower = channelName.toLowerCase();
  if (lower.includes('meta') || lower.includes('facebook') || lower.includes('instagram')) return 'Meta Ads';
  if (lower.includes('google display') || lower.includes('display')) return 'Google Display';
  if (lower.includes('google') || lower.includes('search')) return 'Google Ads';
  if (lower.includes('linkedin')) return 'LinkedIn Ads';
  if (lower.includes('tiktok')) return 'TikTok Ads';
  if (lower.includes('youtube')) return 'YouTube';
  return channelName;
}

// Map channel name to platform key for ad_performance_metrics
function channelToPlatform(channelName: string): string | null {
  const lower = channelName.toLowerCase();
  if (lower.includes('meta') || lower.includes('facebook') || lower.includes('instagram')) return 'meta-ads';
  if (lower.includes('google')) return 'google-ads';
  return null;
}

// GET — return channels, existing goals, benchmarks, actuals, campaigns, and GA4 actuals
export async function GET(_req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Optional filters from widget config
  const url = new URL(_req.url);
  const filterCampaignIds = (url.searchParams.get('campaignIds') ?? '').split(',').filter(Boolean);
  const filterPlatforms = (url.searchParams.get('platforms') ?? '').split(',').filter(Boolean);
  // Conversion event selectors
  const ga4EventName = url.searchParams.get('ga4EventName') ?? null;   // GA4 metric_name to use as conversion
  const metaActionType = url.searchParams.get('metaActionType') ?? null; // meta_actions action_type

  // 1. Channels from media plan builder
  const { data: planData } = await supabase
    .from('client_media_plan_builder')
    .select('channels')
    .eq('client_id', clientId)
    .maybeSingle();

  const rawChannels: any[] = (planData?.channels as any[]) ?? [];
  const channels = rawChannels
    .filter(ch => ch.channelName)
    .map(ch => ({
      channelName: ch.channelName as string,
      benchmarkChannel: mapChannelToBenchmark(ch.channelName),
      platform: channelToPlatform(ch.channelName),
    }));

  // 2. Existing goals for this client
  const { data: goals } = await supabase
    .from('client_campaign_goals')
    .select('*')
    .eq('client_id', clientId)
    .order('is_primary', { ascending: false })
    .order('set_at', { ascending: false });

  // 3. Benchmarks for all relevant benchmark channels
  const benchmarkChannelNames = [...new Set(channels.map(ch => ch.benchmarkChannel))];
  let benchmarks: any[] = [];
  if (benchmarkChannelNames.length > 0) {
    const { data } = await supabase
      .from('channel_benchmarks')
      .select('*')
      .in('channel_name', benchmarkChannelNames);
    benchmarks = data ?? [];
  }

  // 4. Actual performance for the current month
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const today = format(new Date(), 'yyyy-MM-dd');

  // Use filter platforms if provided, else derive from media plan channels,
  // else fall back to both supported platforms so trend/series queries always run.
  const activePlatforms = filterPlatforms.length > 0
    ? filterPlatforms
    : channels.map(ch => ch.platform).filter(Boolean).length > 0
      ? ([...new Set(channels.map(ch => ch.platform).filter(Boolean))] as string[])
      : (['meta-ads', 'google-ads'] as string[]);

  let actuals: Record<string, {
    spend: number; impressions: number; clicks: number; conversions: number;
    cpc_sum: number; cpc_count: number; cpm_sum: number; cpm_count: number;
    ctr_sum: number; ctr_count: number;
  }> = {};

  if (activePlatforms.length > 0) {
    let metricsQuery = supabase
      .from('ad_performance_metrics')
      .select('platform, spend, impressions, clicks, ctr, conversions, cpc, cpm')
      .eq('client_id', clientId)
      .in('platform', activePlatforms as ('google-ads' | 'meta-ads')[])
      .gte('date', monthStart)
      .lte('date', today)
      .not('campaign_id', 'like', 'manual-override-%');

    if (filterCampaignIds.length > 0) {
      metricsQuery = metricsQuery.in('campaign_id', filterCampaignIds);
    }

    const { data: metrics } = await metricsQuery;

    for (const row of metrics ?? []) {
      if (!row.platform) continue;
      if (!actuals[row.platform]) {
        actuals[row.platform] = {
          spend: 0, impressions: 0, clicks: 0, conversions: 0,
          cpc_sum: 0, cpc_count: 0, cpm_sum: 0, cpm_count: 0, ctr_sum: 0, ctr_count: 0,
        };
      }
      const a = actuals[row.platform];
      a.spend += Number(row.spend || 0);
      a.impressions += Number(row.impressions || 0);
      a.clicks += Number(row.clicks || 0);
      a.conversions += Number(row.conversions || 0);
      if (row.cpc) { a.cpc_sum += Number(row.cpc); a.cpc_count++; }
      if (row.cpm) { a.cpm_sum += Number(row.cpm); a.cpm_count++; }
      if (row.ctr) { a.ctr_sum += Number(row.ctr); a.ctr_count++; }
    }

    // 4a. Override Meta conversions using specific meta_actions action_type if requested
    if (metaActionType && actuals['meta-ads']) {
      let metaActQuery = supabase
        .from('ad_performance_metrics')
        .select('meta_actions')
        .eq('client_id', clientId)
        .eq('platform', 'meta-ads')
        .gte('date', monthStart)
        .lte('date', today)
        .not('meta_actions', 'is', null);
      if (filterCampaignIds.length > 0) metaActQuery = metaActQuery.in('campaign_id', filterCampaignIds);
      const { data: metaActRows } = await metaActQuery;
      let metaConvs = 0;
      for (const row of metaActRows ?? []) {
        for (const act of ((row.meta_actions as any[]) ?? [])) {
          if (act.action_type === metaActionType) metaConvs += parseInt(act.value, 10) || 0;
        }
      }
      actuals['meta-ads'].conversions = metaConvs;
    }

    // Derive final metrics per platform
    for (const platform of activePlatforms) {
      const a = actuals[platform];
      if (!a) continue;
      const computed: Record<string, number> = {
        spend: a.spend,
        impressions: a.impressions,
        clicks: a.clicks,
        conversions: a.conversions,
      };
      if (a.clicks > 0 && a.impressions > 0) computed.ctr = (a.clicks / a.impressions) * 100;
      if (a.clicks > 0) computed.cpl = a.spend / a.clicks;
      if (a.cpc_count > 0) computed.cpc = a.cpc_sum / a.cpc_count;
      if (a.cpm_count > 0) computed.cpm = a.cpm_sum / a.cpm_count;
      if (a.ctr_count > 0 && !computed.ctr) computed.ctr = a.ctr_sum / a.ctr_count;
      if (a.conversions > 0) computed.cpa = a.spend / a.conversions;
      actuals[platform] = computed as any;
    }
  }

  // Build channel actuals lookup: channelName → metric → value
  const channelActuals: Record<string, Record<string, number | null>> = {};
  for (const ch of channels) {
    channelActuals[ch.channelName] = {};
    if (ch.platform && actuals[ch.platform]) {
      channelActuals[ch.channelName] = { ...(actuals[ch.platform] as any) };
    }
  }

  // 5. Combined actuals across all active platforms (for widget display)
  let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalConversions = 0;
  for (const a of Object.values(actuals)) {
    totalSpend += (a as any).spend ?? 0;
    totalImpressions += (a as any).impressions ?? 0;
    totalClicks += (a as any).clicks ?? 0;
    totalConversions += (a as any).conversions ?? 0;
  }
  const combinedActuals: Record<string, number> = {
    spend: totalSpend,
    impressions: totalImpressions,
    clicks: totalClicks,
    conversions: totalConversions,
  };
  if (totalClicks > 0 && totalImpressions > 0) combinedActuals.ctr = (totalClicks / totalImpressions) * 100;
  if (totalClicks > 0) { combinedActuals.cpl = totalSpend / totalClicks; combinedActuals.cpc = totalSpend / totalClicks; }
  if (totalConversions > 0) combinedActuals.cpa = totalSpend / totalConversions;

  // 6. 7-day trend: last 7 days vs prior 7 days
  // 6b. 24h trend: yesterday vs day before yesterday (avoids partial-day today)
  const todayDate = new Date();
  const last7Start = format(subDays(todayDate, 6), 'yyyy-MM-dd');
  const last30Start = format(subDays(todayDate, 29), 'yyyy-MM-dd');
  const prev7Start = format(subDays(todayDate, 13), 'yyyy-MM-dd');
  const prev7End = format(subDays(todayDate, 7), 'yyyy-MM-dd');
  const yesterday = format(subDays(todayDate, 1), 'yyyy-MM-dd');
  const dayBefore = format(subDays(todayDate, 2), 'yyyy-MM-dd');

  let last7DaysActuals: Record<string, number> = {};
  let prev7DaysActuals: Record<string, number> = {};
  let yesterdayActuals: Record<string, number> = {};
  let dayBeforeActuals: Record<string, number> = {};
  let last30DaysSeries: Array<{ date: string; spend: number; impressions: number; clicks: number; conversions: number }> = [];

  if (activePlatforms.length > 0) {
    const trendBase = () => supabase
      .from('ad_performance_metrics')
      .select('spend, impressions, clicks, conversions')
      .eq('client_id', clientId)
      .in('platform', activePlatforms as ('google-ads' | 'meta-ads')[])
      .not('campaign_id', 'like', 'manual-override-%');

    const applyFilter = (q: ReturnType<typeof trendBase>) =>
      filterCampaignIds.length > 0 ? q.in('campaign_id', filterCampaignIds) : q;

    const seriesBase = () => supabase
      .from('ad_performance_metrics')
      .select('date, spend, impressions, clicks, conversions, meta_actions')
      .eq('client_id', clientId)
      .in('platform', activePlatforms as ('google-ads' | 'meta-ads')[])
      .not('campaign_id', 'like', 'manual-override-%');

    const applySeriesFilter = (q: ReturnType<typeof seriesBase>) =>
      filterCampaignIds.length > 0 ? q.in('campaign_id', filterCampaignIds) : q;

    const [{ data: last7Rows }, { data: prev7Rows }, { data: yesterdayRows }, { data: dayBeforeRows }, { data: seriesRows }] = await Promise.all([
      applyFilter(trendBase()).gte('date', last7Start).lte('date', today),
      applyFilter(trendBase()).gte('date', prev7Start).lte('date', prev7End),
      applyFilter(trendBase()).eq('date', yesterday),
      applyFilter(trendBase()).eq('date', dayBefore),
      applySeriesFilter(seriesBase()).gte('date', last30Start).lte('date', today),
    ]);

    last7DaysActuals = aggregateAdRows(last7Rows ?? []);
    prev7DaysActuals = aggregateAdRows(prev7Rows ?? []);
    yesterdayActuals = aggregateAdRows(yesterdayRows ?? []);
    dayBeforeActuals = aggregateAdRows(dayBeforeRows ?? []);

    // Build ordered daily series (oldest → newest), one entry per date with data.
    // Apply metaActionType conversion override per-day — same logic as the monthly override.
    const byDate = new Map<string, { spend: number; impressions: number; clicks: number; conversions: number }>();
    for (const row of seriesRows ?? []) {
      const cur = byDate.get(row.date) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
      cur.spend += Number(row.spend || 0);
      cur.impressions += Number(row.impressions || 0);
      cur.clicks += Number(row.clicks || 0);
      if (metaActionType && row.meta_actions) {
        for (const act of (row.meta_actions as any[]) ?? []) {
          if (act.action_type === metaActionType) cur.conversions += parseInt(act.value, 10) || 0;
        }
      } else {
        cur.conversions += Number(row.conversions || 0);
      }
      byDate.set(row.date, cur);
    }
    for (let i = 29; i >= 0; i--) {
      const d = format(subDays(todayDate, i), 'yyyy-MM-dd');
      const agg = byDate.get(d);
      if (agg) last30DaysSeries.push({ date: d, ...agg });
    }
  }

  // 7. GA4 actuals for the current month
  const { data: ga4Rows } = await supabase
    .from('google_analytics_metrics')
    .select('metric_name, metric_value')
    .eq('client_id', clientId)
    .gte('date', monthStart)
    .lte('date', today);

  const ga4Totals: Record<string, number> = {};
  for (const row of ga4Rows ?? []) {
    ga4Totals[row.metric_name] = (ga4Totals[row.metric_name] ?? 0) + Number(row.metric_value ?? 0);
  }

  // Use specified GA4 event as the conversion denominator for cost metrics
  const convMetric = ga4EventName ?? 'conversions';
  const ga4ConvCount = ga4Totals[convMetric] ?? 0;
  const ga4Actuals: Record<string, number> = { ...ga4Totals };
  if (ga4ConvCount > 0) {
    ga4Actuals.cpa = totalSpend / ga4ConvCount;
    ga4Actuals.conversions = ga4ConvCount;
  }
  if (ga4Totals.sessions > 0) ga4Actuals.cpl = totalSpend / ga4Totals.sessions;
  if (ga4Totals.activeUsers > 0) ga4Actuals.cpc = totalSpend / ga4Totals.activeUsers;
  if (totalImpressions > 0 && ga4Totals.activeUsers > 0) ga4Actuals.ctr = (ga4Totals.activeUsers / totalImpressions) * 100;

  // 7. Available campaigns for widget modal (always unfiltered, MTD)
  const { data: campaignRows } = await supabase
    .from('ad_performance_metrics')
    .select('campaign_id, campaign_name, platform')
    .eq('client_id', clientId)
    .gte('date', monthStart)
    .not('campaign_id', 'like', 'manual-override-%')
    .order('campaign_name');

  const seenCampaigns = new Set<string>();
  const campaigns = (campaignRows ?? [])
    .filter(r => { if (seenCampaigns.has(r.campaign_id)) return false; seenCampaigns.add(r.campaign_id); return true; })
    .map(r => ({ id: r.campaign_id, name: r.campaign_name ?? r.campaign_id, platform: r.platform }));

  // 8. Available GA4 event names for the modal event picker
  const ga4Events = Object.keys(ga4Totals).sort();

  // 9. Available Meta conversion action types from meta_actions JSONB
  const { data: metaEvtRows } = await supabase
    .from('ad_performance_metrics')
    .select('meta_actions')
    .eq('client_id', clientId)
    .eq('platform', 'meta-ads')
    .gte('date', monthStart)
    .not('meta_actions', 'is', null)
    .limit(300);

  const metaEvtMap = new Map<string, number>();
  for (const row of metaEvtRows ?? []) {
    for (const act of ((row.meta_actions as any[]) ?? [])) {
      metaEvtMap.set(act.action_type, (metaEvtMap.get(act.action_type) ?? 0) + (parseInt(act.value, 10) || 0));
    }
  }
  const metaEvents = Array.from(metaEvtMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    channels,
    goals: goals ?? [],
    benchmarks,
    channelActuals,
    combinedActuals,
    ga4Actuals,
    last7DaysActuals,
    prev7DaysActuals,
    yesterdayActuals,
    dayBeforeActuals,
    last30DaysSeries,
    campaigns,
    ga4Events,
    metaEvents,
    period: { start: monthStart, end: today },
  });
}

// POST — create or update a goal
export async function POST(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, channel, metric, benchmark_id, target_value, stretch_value, floor_value, brief_id, goal_type, is_primary } = body;

  if (!channel || !metric) {
    return NextResponse.json({ error: 'channel and metric are required' }, { status: 400 });
  }

  if (id) {
    // Update existing
    const { data, error } = await supabase
      .from('client_campaign_goals')
      .update({
        metric,
        goal_type: goal_type ?? null,
        is_primary: is_primary ?? false,
        benchmark_id: benchmark_id ?? null,
        target_value: target_value ?? null,
        stretch_value: stretch_value ?? null,
        floor_value: floor_value ?? null,
        set_by: session.user.id,
        set_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('client_id', clientId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { data: client } = await supabase.from('clients').select('name').eq('id', clientId).maybeSingle();
    sendTeamsAlert({
      title: 'Goal Updated',
      text: `A campaign goal was updated for **${client?.name ?? 'a client'}**`,
      color: '0078D4',
      facts: [
        { name: 'Channel', value: channel },
        { name: 'Metric', value: metric },
        ...(target_value != null ? [{ name: 'Target', value: String(target_value) }] : []),
      ],
    });
    return NextResponse.json({ goal: data });
  }

  // Create new
  const { data, error } = await supabase
    .from('client_campaign_goals')
    .insert({
      client_id: clientId,
      brief_id: brief_id ?? null,
      channel,
      metric,
      goal_type: goal_type ?? null,
      is_primary: is_primary ?? false,
      benchmark_id: benchmark_id ?? null,
      target_value: target_value ?? null,
      stretch_value: stretch_value ?? null,
      floor_value: floor_value ?? null,
      set_by: session.user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: client } = await supabase.from('clients').select('name').eq('id', clientId).maybeSingle();
  sendTeamsAlert({
    title: 'Goal Created',
    text: `A new campaign goal was set for **${client?.name ?? 'a client'}**`,
    color: '107C10',
    facts: [
      { name: 'Channel', value: channel },
      { name: 'Metric', value: metric },
      ...(target_value != null ? [{ name: 'Target', value: String(target_value) }] : []),
    ],
  });
  return NextResponse.json({ goal: data }, { status: 201 });
}

// DELETE — remove a goal by id (?id=...)
export async function DELETE(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const goalId = searchParams.get('id');
  if (!goalId) return NextResponse.json({ error: 'id query param is required' }, { status: 400 });

  const { error } = await supabase
    .from('client_campaign_goals')
    .delete()
    .eq('id', goalId)
    .eq('client_id', clientId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
