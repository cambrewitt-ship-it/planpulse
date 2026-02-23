import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Save actual spend for a media channel
 * POST /api/channels/actual-spend
 * Body: { channelId: string, clientId: string, month: string (YYYY-MM), actualSpend: number }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { channelId, clientId, month, actualSpend } = body;

    if (!channelId || !clientId || !month || actualSpend === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: channelId, clientId, month, actualSpend' },
        { status: 400 }
      );
    }

    // Upsert the actual spend value
    // We'll store this in a simple key-value format in the client_media_plan_builder channels
    // Or create a new table for manual actual spend overrides
    
    // For now, let's update the ad_performance_metrics table with a synthetic entry
    // that represents the manual override for this channel/month
    const [year, monthNum] = month.split('-');
    const monthStart = `${year}-${monthNum.padStart(2, '0')}-01`;
    
    // Get the channel name from the media plan builder
    const { data: planData } = await supabase
      .from('client_media_plan_builder')
      .select('channels')
      .eq('client_id', clientId)
      .single();

    if (!planData?.channels) {
      return NextResponse.json({ error: 'Client media plan not found' }, { status: 404 });
    }

    const channels = planData.channels as any[];
    const channel = channels.find((ch: any) => ch.id === channelId);
    
    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    // Determine platform from channel type
    const channelType = (channel.channelName || '').toLowerCase();
    const platform = channelType.includes('meta') || channelType.includes('facebook') || channelType.includes('instagram')
      ? 'meta-ads'
      : channelType.includes('google')
      ? 'google-ads'
      : null;

    if (!platform) {
      return NextResponse.json({ error: 'Unable to determine platform for channel' }, { status: 400 });
    }

    // Get connected account ID for this channel
    const accountId = channel.connectedAccountId || 'manual-override';
    
    // Upsert a synthetic entry in ad_performance_metrics for the manual override
    // Use a special campaign_id to indicate this is a manual override
    const { error: upsertError } = await supabase
      .from('ad_performance_metrics')
      .upsert({
        user_id: session.user.id,
        client_id: clientId,
        platform: platform,
        account_id: accountId,
        account_name: channel.connectedAccount || 'Manual Override',
        campaign_id: `manual-override-${channelId}-${month}`,
        campaign_name: `${channel.channelName} - Manual Override`,
        date: monthStart,
        spend: actualSpend,
        currency: 'USD',
        impressions: 0,
        clicks: 0,
        ctr: 0,
      }, {
        onConflict: 'user_id,platform,account_id,campaign_id,date',
        ignoreDuplicates: false,
      });

    if (upsertError) {
      console.error('Error saving actual spend:', upsertError);
      return NextResponse.json(
        { error: 'Failed to save actual spend', details: upsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in POST /api/channels/actual-spend:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
