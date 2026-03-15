// DELETE /api/account-managers/[id]
// Delete an account manager

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!id) {
      return NextResponse.json({ error: 'Account manager ID is required' }, { status: 400 });
    }

    // First, get the account manager name to check clients
    const { data: accountManager } = await supabase
      .from('account_managers')
      .select('name')
      .eq('id', id)
      .single();

    if (accountManager) {
      const { data: assignedClients } = await supabase
        .from('clients')
        .select('id')
        .eq('account_manager', accountManager.name)
        .limit(1);

      if (assignedClients && assignedClients.length > 0) {
        return NextResponse.json(
          { error: 'Cannot delete account manager: one or more clients are assigned to this manager' },
          { status: 409 }
        );
      }
    }

    const { error: deleteError } = await supabase
      .from('account_managers')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting account manager:', deleteError);
      return NextResponse.json({ error: 'Failed to delete account manager' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error in DELETE /api/account-managers/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
