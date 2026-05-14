import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ id: string; noteId: string }> | { id: string; noteId: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  const resolved = await Promise.resolve(params);
  const { id: clientId, noteId } = resolved;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (typeof body.is_pinned === 'boolean') updates.is_pinned = body.is_pinned;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('client_notes')
    .update(updates)
    .eq('id', noteId)
    .eq('client_id', clientId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ note: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const resolved = await Promise.resolve(params);
  const { id: clientId, noteId } = resolved;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('client_notes')
    .delete()
    .eq('id', noteId)
    .eq('client_id', clientId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
