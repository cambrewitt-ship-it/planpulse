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
    const { accounts } = body;

    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      return NextResponse.json(
        { error: 'At least one account is required' },
        { status: 400 }
      );
    }

    // Get user's Meta Ads connection
    const { data: connection, error: connectionError } = await supabase
      .from('ad_platform_connections')
      .select('connection_id')
      .eq('user_id', user.id)
      .eq('platform', 'meta-ads')
      .single();

    if (connectionError || !connection) {
      console.error('Connection lookup error:', connectionError);
      return NextResponse.json(
        { error: 'No active Meta Ads connection found. Please connect your Meta Ads account first.' },
        { status: 404 }
      );
    }

    // Insert all selected accounts
    const accountsToInsert = accounts.map(account => ({
      user_id: user.id,
      account_id: account.accountId,
      account_name: account.accountName || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }));

    const { data: savedAccounts, error: insertError } = await supabase
      .from('meta_ads_accounts')
      .upsert(
        accountsToInsert,
        {
          onConflict: 'user_id,account_id',
          ignoreDuplicates: false,
        }
      )
      .select();

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to save Meta Ads accounts' },
        { status: 500 }
      );
    }

    console.log('Successfully saved Meta Ads accounts:', {
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

