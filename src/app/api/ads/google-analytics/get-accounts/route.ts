import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';

export async function GET() {
  console.log('=== GET /api/ads/google-analytics/get-accounts ===');
  
  try {
    // 1. Get authenticated user's ID
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      console.error('Authentication error:', authError);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = session.user;
    console.log('Fetching Google Analytics accounts for user:', user.id);

    // 2. Query saved Google Analytics accounts from database
    const { data: accounts, error: dbError } = await supabase
      .from('google_analytics_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (dbError) {
      console.error('Database error fetching accounts:', dbError);
      return NextResponse.json(
        { error: 'Failed to fetch accounts', details: dbError.message },
        { status: 500 }
      );
    }

    console.log('Found', accounts?.length || 0, 'saved Google Analytics accounts');

    // 3. Format accounts for frontend
    const formattedAccounts = (accounts || []).map((account) => ({
      id: account.id,
      propertyId: account.property_id,
      propertyName: account.property_name,
      accountId: account.account_id,
      accountName: account.account_name,
      isActive: account.is_active,
      createdAt: account.created_at,
    }));

    return NextResponse.json({ 
      accounts: formattedAccounts
    });
    
  } catch (error: any) {
    console.error('=== ERROR in /api/ads/google-analytics/get-accounts ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch Google Analytics accounts',
        details: error?.message || 'Unknown error',
        type: error?.constructor?.name
      },
      { status: 500 }
    );
  }
}

