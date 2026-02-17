import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

export async function GET() {
  console.log('=== GET /api/ads/meta/accounts ===');
  
  try {
    // Initialize Nango with secret key
    const secretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
    if (!secretKey) {
      console.error('NANGO_SECRET_KEY_DEV_PLAN_CHECK is not configured');
      return NextResponse.json(
        { error: 'Server misconfiguration' },
        { status: 500 }
      );
    }
    
    const nango = new Nango({ secretKey });
    
    // 1. Get authenticated user's ID
    console.log('Step 1: Authenticating user...');
    const supabase = await createClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      console.error('Authentication error:', authError);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = session.user;
    console.log('Step 2: Looking up Meta Ads connection for user:', user.id);

    // 2. Look up their Meta Ads connection_id from the database
    const { data: connection, error: dbError } = await supabase
      .from('ad_platform_connections')
      .select('connection_id')
      .eq('user_id', user.id)
      .eq('platform', 'meta-ads')
      .eq('connection_status', 'active')
      .single();

    if (dbError || !connection) {
      console.error('Database error fetching connection:', dbError);
      return NextResponse.json(
        { error: 'Meta Ads connection not found', details: dbError?.message },
        { status: 404 }
      );
    }

    console.log('Step 3: Found Meta Ads connection:', connection.connection_id);

    // 3. Get the OAuth access token from Nango
    console.log('Step 4: Getting access token from Nango...');
    const nangoConnection = await nango.getConnection(toNangoPlatform('meta-ads'), connection.connection_id);
    const accessToken = (nangoConnection.credentials as any)?.access_token;

    if (!accessToken) {
      throw new Error('No access token found in Nango connection');
    }

    console.log('Step 5: Calling Meta API to list ad accounts...');

    // 4. Call Meta API to get user's ad accounts
    // First, get the user ID
    const meResponse = await fetch('https://graph.facebook.com/v18.0/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!meResponse.ok) {
      throw new Error(`Failed to get user info: ${meResponse.status}`);
    }

    const meData = await meResponse.json();
    const userId = meData.id;

    console.log('Step 6: User ID:', userId);

    // Now get the ad accounts
    const accountsResponse = await fetch(
      `https://graph.facebook.com/v18.0/${userId}/adaccounts?fields=id,name,account_status,currency`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!accountsResponse.ok) {
      const errorText = await accountsResponse.text();
      console.error('Meta API error:', errorText);
      throw new Error(`Failed to fetch ad accounts: ${accountsResponse.status}`);
    }

    const accountsData = await accountsResponse.json();
    console.log('Step 7: Successfully fetched ad accounts:', accountsData.data?.length || 0);

    // 5. Format and return the accounts
    const formattedAccounts = (accountsData.data || []).map((account: any) => ({
      accountId: account.id,
      accountName: account.name,
      accountStatus: account.account_status,
      currency: account.currency,
    }));

    return NextResponse.json({ 
      accounts: formattedAccounts
    });
    
  } catch (error: any) {
    console.error('=== ERROR in /api/ads/meta/accounts ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch Meta Ads accounts',
        details: error?.message || 'Unknown error',
        type: error?.constructor?.name
      },
      { status: 500 }
    );
  }
}

