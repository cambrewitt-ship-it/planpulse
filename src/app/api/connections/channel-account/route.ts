import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

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

    console.log('[channel-account] Request:', { clientId, channelType, userId: user.id });

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

    console.log('[channel-account] Platform mapped:', { channelType, lowerChannelType, platform });

    if (!platform) {
      console.log('[channel-account] No platform matched');
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
      .maybeSingle();

    console.log('[channel-account] Client-specific connection:', { connection, connectionError });

    if (connectionError) {
      console.error('Error querying ad_platform_connections:', connectionError);
      return NextResponse.json({
        accountName: null,
        accountId: null,
        hasConnection: false,
      });
    }

    // For Meta Ads, if no client-specific connection exists, check if user has any connection
    // and if accounts exist - Meta Ads accounts are user-level, not client-level
    if (!connection && platform === 'meta-ads') {
      // Check if user has any Meta Ads connection (any client)
      const { data: anyConnection } = await supabase
        .from('ad_platform_connections')
        .select('connection_id, connection_status')
        .eq('user_id', user.id)
        .eq('platform', platform)
        .eq('connection_status', 'active')
        .limit(1)
        .maybeSingle();
      
      // If user has a connection (even for a different client), check for accounts
      if (anyConnection) {
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
        }

        // Return account if found, even though connection is for a different client
        if (account) {
          return NextResponse.json({
            accountName: account.account_name || null,
            accountId: account.account_id || null,
            hasConnection: true,
          });
        }
      }
      
      // No connection found at all
      return NextResponse.json({
        accountName: null,
        accountId: null,
        hasConnection: false,
      });
    }

    // For Google Ads, if no client-specific connection exists, check if user has any connection
    // and if accounts exist - Google Ads accounts are user-level, not client-level
    if (!connection && platform === 'google-ads') {
      console.log('[channel-account] No client-specific connection, checking for any Google Ads connection');
      // Check if user has any Google Ads connection (any client)
      const { data: anyConnection } = await supabase
        .from('ad_platform_connections')
        .select('connection_id, connection_status')
        .eq('user_id', user.id)
        .eq('platform', platform)
        .eq('connection_status', 'active')
        .limit(1)
        .maybeSingle();
      
      console.log('[channel-account] Any Google Ads connection:', anyConnection);
      
      // If user has a connection (even for a different client), check for accounts
      if (anyConnection) {
        // Try to find any active Google Ads account for this user
        const { data: account, error: accountError } = await supabase
          .from('google_ads_accounts')
          .select('account_name, customer_id')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        console.log('[channel-account] Google Ads account found:', { account, accountError });

        if (accountError) {
          console.error('Error fetching Google Ads account:', accountError);
        }

        // Return account if found, even though connection is for a different client
        if (account) {
          console.log('[channel-account] Returning account:', account.account_name);
          return NextResponse.json({
            accountName: account.account_name || null,
            accountId: account.customer_id || null,
            hasConnection: true,
          });
        } else {
          console.log('[channel-account] Connection exists but no account found');
        }
      }
      
      // No connection found at all
      console.log('[channel-account] No Google Ads connection found');
      return NextResponse.json({
        accountName: null,
        accountId: null,
        hasConnection: false,
      });
    }

    if (!connection) {
      // No active connection found for this client (other platforms)
      return NextResponse.json({
        accountName: null,
        accountId: null,
        hasConnection: false,
      });
    }

    // Get account name and ID based on platform
    if (platform === 'google-ads') {
      // First try to find account with matching connection_id
      let account = null;
      const { data: accountWithConnection, error: accountError } = await supabase
        .from('google_ads_accounts')
        .select('account_name, customer_id')
        .eq('user_id', user.id)
        .eq('connection_id', connection.connection_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!accountError && accountWithConnection) {
        account = accountWithConnection;
      } else {
        // If no account found with matching connection_id, try to find any active account for this user
        // (Google Ads accounts are user-level, not client-level)
        const { data: anyAccount, error: anyAccountError } = await supabase
          .from('google_ads_accounts')
          .select('account_name, customer_id')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!anyAccountError && anyAccount) {
          account = anyAccount;
        }
      }

      if (accountError && !account) {
        console.error('Error fetching Google Ads account:', accountError);
        return NextResponse.json({
          accountName: null,
          accountId: null,
          hasConnection: true,
        });
      }

      console.log('[channel-account] Returning Google Ads account:', account?.account_name || 'null');
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

      // If no account found, still return hasConnection: true since the connection exists
      // but log it for debugging
      if (!account) {
        console.warn(`Meta Ads connection exists for client ${clientId} but no active account found for user ${user.id}`);
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

