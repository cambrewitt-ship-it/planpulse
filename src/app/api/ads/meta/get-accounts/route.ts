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

    // Query meta_ads_accounts for user's accounts
    const { data: accounts, error: queryError } = await supabase
      .from('meta_ads_accounts')
      .select('id, account_id, account_name, is_active, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (queryError) {
      console.error('Query error:', queryError);
      return NextResponse.json(
        { error: 'Failed to fetch Meta Ads accounts' },
        { status: 500 }
      );
    }

    // Format response
    const formattedAccounts = (accounts || []).map(account => ({
      id: account.id,
      accountId: account.account_id,
      accountName: account.account_name,
      isActive: account.is_active,
      createdAt: account.created_at,
    }));

    return NextResponse.json({
      accounts: formattedAccounts,
    });

  } catch (error) {
    console.error('Unexpected error in get-accounts route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

