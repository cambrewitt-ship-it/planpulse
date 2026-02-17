import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

export async function GET() {
  console.log('=== GET /api/ads/meta/discover-accounts ===');
  
  try {
    // 1. Authenticate user
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
    console.log('Authenticated user:', user.id);

    // 2. Get Meta connection from database
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
        { error: 'Meta Ads connection not found. Please connect your account first.' },
        { status: 404 }
      );
    }

    console.log('Found Meta Ads connection:', connection.connection_id);

    // 3. Get access token from Nango
    const nangoSecretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
    if (!nangoSecretKey) {
      console.error('NANGO_SECRET_KEY_DEV_PLAN_CHECK is not configured');
      return NextResponse.json(
        { error: 'Server misconfiguration' },
        { status: 500 }
      );
    }
    
    const nango = new Nango({ secretKey: nangoSecretKey });
    const nangoConnection = await nango.getConnection(toNangoPlatform('meta-ads'), connection.connection_id);
    const accessToken = (nangoConnection.credentials as any)?.access_token;

    if (!accessToken) {
      throw new Error('No access token found in Nango connection');
    }

    console.log('✓ Got access token from Nango');

    // 4. Call Meta API to get ad accounts
    const response = await fetch(
      'https://graph.facebook.com/v18.0/me/adaccounts?fields=id,name,account_status',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Meta API error:', errorText);
      throw new Error(`Failed to fetch ad accounts: ${response.status}`);
    }

    const data = await response.json();
    console.log(`✓ Successfully fetched ${data.data?.length || 0} ad accounts`);

    // 5. Return list of available ad accounts
    const accounts = (data.data || []).map((account: any) => ({
      id: account.id,
      name: account.name,
      accountStatus: account.account_status,
    }));

    return NextResponse.json({ 
      success: true,
      accounts: accounts
    });
    
  } catch (error: any) {
    console.error('=== ERROR in /api/ads/meta/discover-accounts ===');
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    
    return NextResponse.json(
      { 
        error: 'Failed to discover Meta Ads accounts',
        details: error?.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}

