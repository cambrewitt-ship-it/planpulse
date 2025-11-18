import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';

function formatCustomerId(customerId: string): string {
  // Format 1234567890 as 123-456-7890
  if (customerId.length === 10) {
    return `${customerId.slice(0, 3)}-${customerId.slice(3, 6)}-${customerId.slice(6)}`;
  }
  return customerId;
}

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

    // Query google_ads_accounts for user's accounts
    const { data: accounts, error: queryError } = await supabase
      .from('google_ads_accounts')
      .select('id, customer_id, account_name, is_active, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (queryError) {
      console.error('Query error:', queryError);
      return NextResponse.json(
        { error: 'Failed to fetch Google Ads accounts' },
        { status: 500 }
      );
    }

    // Format response
    const formattedAccounts = (accounts || []).map(account => ({
      id: account.id,
      customerId: account.customer_id,
      displayCustomerId: formatCustomerId(account.customer_id),
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

