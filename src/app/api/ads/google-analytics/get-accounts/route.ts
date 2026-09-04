import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

export async function GET(request: NextRequest) {
  console.log('=== GET /api/ads/google-analytics/get-accounts ===');

  try {
    const clientId = request.nextUrl.searchParams.get('clientId');

    // 1. Get authenticated user's ID
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
    console.log('Fetching Google Analytics accounts for user:', user.id, 'client:', clientId);

    // 2. Query saved Google Analytics accounts from database, scoped to this client
    let query = supabase
      .from('google_analytics_accounts')
      .select('*')
      .eq('user_id', user.id);
    if (clientId) query = query.eq('client_id', clientId);

    let { data: accounts, error: dbError } = await query.order('created_at', { ascending: false });

    // Fall back to legacy rows saved before client scoping was added, so
    // accounts don't disappear from this client's list until re-saved.
    if (clientId && !dbError && (!accounts || accounts.length === 0)) {
      const legacy = await supabase
        .from('google_analytics_accounts')
        .select('*')
        .eq('user_id', user.id)
        .is('client_id', null)
        .order('created_at', { ascending: false });
      accounts = legacy.data;
      dbError = legacy.error;
    }

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


