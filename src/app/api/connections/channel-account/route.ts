import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('Authentication error:', authError);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const channelType = searchParams.get('channelType');

    if (!clientId || !channelType) {
      return NextResponse.json(
        { error: 'clientId and channelType are required' },
        { status: 400 }
      );
    }

    // Map channel type to platform
    let platform: string | null = null;
    const lowerChannelType = channelType.toLowerCase();
    
    if (lowerChannelType.includes('google')) {
      platform = 'google-ads';
    } else if (lowerChannelType.includes('meta') || lowerChannelType.includes('facebook')) {
      platform = 'meta-ads';
    } else if (lowerChannelType.includes('linkedin')) {
      platform = 'linkedin-ads';
    }

    if (!platform) {
      return NextResponse.json({
        accountName: null,
        accountId: null,
        hasConnection: false,
      });
    }

    // Query ad_platform_connections for this client and platform
    const { data: connection, error: connectionError } = await supabase
      .from('ad_platform_connections')
      .select('connection_id, connection_status')
      .eq('user_id', user.id)
      .eq('client_id', clientId)
      .eq('platform', platform)
      .eq('connection_status', 'active')
      .single();

    if (connectionError || !connection) {
      // No active connection found
      return NextResponse.json({
        accountName: null,
        accountId: null,
        hasConnection: false,
      });
    }

    // Get account name and ID based on platform
    if (platform === 'google-ads') {
      const { data: account, error: accountError } = await supabase
        .from('google_ads_accounts')
        .select('account_name, customer_id')
        .eq('user_id', user.id)
        .eq('connection_id', connection.connection_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (accountError) {
        console.error('Error fetching Google Ads account:', accountError);
        return NextResponse.json({
          accountName: null,
          accountId: null,
          hasConnection: true,
        });
      }

      return NextResponse.json({
        accountName: account?.account_name || null,
        accountId: account?.customer_id || null,
        hasConnection: true,
      });
    } else if (platform === 'meta-ads') {
      // Meta Ads accounts don't have connection_id, so we just get the first active account for the user
      // The connection check above already verified there's an active connection for this client
      const { data: account, error: accountError } = await supabase
        .from('meta_ads_accounts')
        .select('account_name, account_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (accountError) {
        console.error('Error fetching Meta Ads account:', accountError);
        return NextResponse.json({
          accountName: null,
          accountId: null,
          hasConnection: true,
        });
      }

      return NextResponse.json({
        accountName: account?.account_name || null,
        accountId: account?.account_id || null,
        hasConnection: true,
      });
    }

    // For other platforms (like LinkedIn), just return connection status
    return NextResponse.json({
      accountName: null,
      accountId: null,
      hasConnection: true,
    });

  } catch (error) {
    console.error('Unexpected error in channel-account route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

