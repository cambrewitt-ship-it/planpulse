// PATCH /api/agency/clients/[id]
// Update a client's account_manager assignment

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
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

    const body = await request.json();
    const { account_manager } = body;

    if (account_manager !== undefined && account_manager !== null && typeof account_manager !== 'string') {
      return NextResponse.json({ error: 'account_manager must be a string or null' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('clients')
      .update({ account_manager: account_manager ?? null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, name, account_manager')
      .single();

    if (error) {
      console.error('Error updating client account_manager:', error);
      return NextResponse.json({ error: 'Failed to update client' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error: unknown) {
    console.error('Error in PATCH /api/agency/clients/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
