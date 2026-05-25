import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const id = await resolveId(params);
  const supabase = await createServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify ownership before deletion
  const { data: doc } = await supabase
    .from('library_documents')
    .select('id, user_id')
    .eq('id', id)
    .single();

  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (doc.user_id !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await supabase
    .from('library_documents')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
