import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { startOfMonth, format } from 'date-fns';

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
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

// GET — return channels, existing goals, benchmarks, and actuals
export async function GET(_req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

  const platforms = [...new Set(channels.map(ch => ch.platform).filter(Boolean))] as string[];
  let actuals: Record<string, Record<string, number>> = {}; // platform → metric → value

  if (platforms.length > 0) {
    const { data: metrics } = await supabase
      .from('ad_performance_metrics')
      .select('platform, spend, impressions, clicks, ctr, conversions, cpc, cpm')
      .eq('client_id', clientId)
      .in('platform', platforms as ('google-ads' | 'meta-ads')[])
      .gte('date', monthStart)
      .lte('date', today)
      .not('campaign_id', 'like', 'manual-override-%');

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

    // Derive final metrics
    for (const platform of platforms) {
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
      actuals[platform] = computed;
    }
  }

  // Build channel actuals lookup: channelName → metric → value
  const channelActuals: Record<string, Record<string, number | null>> = {};
  for (const ch of channels) {
    channelActuals[ch.channelName] = {};
    if (ch.platform && actuals[ch.platform]) {
      channelActuals[ch.channelName] = { ...actuals[ch.platform] };
    }
  }

  return NextResponse.json({
    channels,
    goals: goals ?? [],
    benchmarks,
    channelActuals,
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
  const { id, channel, metric, benchmark_id, target_value, stretch_value, floor_value, brief_id } = body;

  if (!channel || !metric) {
    return NextResponse.json({ error: 'channel and metric are required' }, { status: 400 });
  }

  if (id) {
    // Update existing
    const { data, error } = await supabase
      .from('client_campaign_goals')
      .update({
        metric, benchmark_id: benchmark_id ?? null,
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
      benchmark_id: benchmark_id ?? null,
      target_value: target_value ?? null,
      stretch_value: stretch_value ?? null,
      floor_value: floor_value ?? null,
      set_by: session.user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ goal: data }, { status: 201 });
}
