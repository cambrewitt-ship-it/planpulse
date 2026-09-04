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
    const { accounts, clientId } = body;

    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      return NextResponse.json(
        { error: 'At least one account is required' },
        { status: 400 }
      );
    }

    // Verify the user has an active Google Analytics connection for this client.
    // Use limit(1) instead of single() — a user can have multiple active GA4
    // connections (one per client), so filter by client_id when known and
    // never let a second client's connection make this route error out.
    let connectionQuery = supabase
      .from('ad_platform_connections')
      .select('connection_id')
      .eq('user_id', user.id)
      .eq('platform', 'google-analytics')
      .eq('connection_status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);
    if (clientId) connectionQuery = connectionQuery.eq('client_id', clientId);
    const { data: connections, error: connectionError } = await connectionQuery;

    if (connectionError || !connections?.length) {
      console.error('Connection lookup error:', connectionError);
      return NextResponse.json(
        { error: 'No active Google Analytics connection found. Please connect your Google Analytics account first.' },
        { status: 404 }
      );
    }

    // Insert all selected accounts
    const accountsToInsert = accounts.map(account => ({
      user_id: user.id,
      client_id: clientId ?? null,
      property_id: account.propertyId,
      property_name: account.propertyName || null,
      account_id: account.accountId || null,
      account_name: account.accountName || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }));

    const { data: savedAccounts, error: insertError } = await supabase
      .from('google_analytics_accounts')
      .upsert(
        accountsToInsert,
        {
          onConflict: 'user_id,client_id,property_id',
          ignoreDuplicates: false,
        }
      )
      .select();

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to save Google Analytics accounts' },
        { status: 500 }
      );
    }

    console.log('Successfully saved Google Analytics accounts:', {
      userId: user.id,
      count: savedAccounts?.length,
    });

    return NextResponse.json({
      success: true,
      accounts: savedAccounts,
    });

  } catch (error) {
    console.error('Unexpected error in save-accounts route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


