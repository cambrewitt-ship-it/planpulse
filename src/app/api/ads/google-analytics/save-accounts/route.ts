import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';

export async function POST(request: NextRequest) {
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

    // Parse request body
    const body = await request.json();
    const { accounts } = body;

    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      return NextResponse.json(
        { error: 'At least one account is required' },
        { status: 400 }
      );
    }

    // Get user's Google Analytics connection
    const { data: connection, error: connectionError } = await supabase
      .from('ad_platform_connections')
      .select('connection_id')
      .eq('user_id', user.id)
      .eq('platform', 'google-analytics')
      .single();

    if (connectionError || !connection) {
      console.error('Connection lookup error:', connectionError);
      return NextResponse.json(
        { error: 'No active Google Analytics connection found. Please connect your Google Analytics account first.' },
        { status: 404 }
      );
    }

    // Insert all selected accounts
    const accountsToInsert = accounts.map(account => ({
      user_id: user.id,
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
          onConflict: 'user_id,property_id',
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


