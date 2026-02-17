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
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    // Delete account with security check (RLS will enforce, but we also check explicitly)
    const { data: deletedAccount, error: deleteError } = await supabase
      .from('google_ads_accounts')
      .delete()
      .eq('id', accountId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (deleteError) {
      console.error('Delete error:', deleteError);
      
      // Check if account doesn't exist or doesn't belong to user
      if (deleteError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Account not found or you do not have permission to delete it' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { error: 'Failed to delete Google Ads account' },
        { status: 500 }
      );
    }

    console.log('Successfully deleted Google Ads account:', {
      userId: user.id,
      accountId: accountId,
      customerId: deletedAccount.customer_id,
    });

    return NextResponse.json({
      success: true,
      message: 'Account deleted successfully',
    });

  } catch (error) {
    console.error('Unexpected error in delete-account route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

