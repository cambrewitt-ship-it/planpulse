import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

export async function POST(request: NextRequest) {
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

    // Parse request body
    const body = await request.json();
    const { customerId, accountName, currency } = body;

    if (!customerId) {
      return NextResponse.json(
        { error: 'Customer ID is required' },
        { status: 400 }
      );
    }

    // Validate customer ID
    const cleanedCustomerId = customerId.replace(/[-\s]/g, '');
    
    if (!/^\d{10}$/.test(cleanedCustomerId)) {
      return NextResponse.json(
        { error: 'Invalid format. Customer ID must be exactly 10 digits.' },
        { status: 400 }
      );
    }

    // Get user's Google Ads connection (get most recent active connection)
    const { data: connections, error: connectionError } = await supabase
      .from('ad_platform_connections')
      .select('connection_id')
      .eq('user_id', user.id)
      .eq('platform', 'google-ads')
      .eq('connection_status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    if (connectionError || !connections || connections.length === 0) {
      console.error('Connection lookup error:', connectionError);
      return NextResponse.json(
        { error: 'No active Google Ads connection found. Please connect your Google Ads account first.' },
        { status: 404 }
      );
    }

    const connection = connections[0];

    // Upsert the Google Ads account
    const { data: savedAccount, error: insertError } = await supabase
      .from('google_ads_accounts')
      .upsert(
        {
          user_id: user.id,
          connection_id: connection.connection_id,
          customer_id: cleanedCustomerId,
          account_name: accountName || null,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,customer_id',
          ignoreDuplicates: false,
        }
      )
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to save Google Ads account' },
        { status: 500 }
      );
    }

    console.log('Successfully saved Google Ads account:', {
      userId: user.id,
      customerId: cleanedCustomerId,
      accountName: accountName || 'N/A',
      currency: currency || 'N/A',
    });

    return NextResponse.json({
      success: true,
      account: savedAccount,
    });

  } catch (error) {
    console.error('Unexpected error in save-account route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

