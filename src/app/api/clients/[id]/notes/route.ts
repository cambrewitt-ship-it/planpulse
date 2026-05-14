import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: notes, error } = await supabase
    .from('client_notes')
    .select('*')
    .eq('client_id', clientId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Resolve author names from account_managers
  const userIds = [...new Set((notes || []).map(n => n.created_by).filter(Boolean))];
  let authorMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: ams } = await supabase
      .from('account_managers')
      .select('user_id, name')
      .in('user_id', userIds);
    for (const am of ams || []) {
      if (am.user_id) authorMap[am.user_id] = am.name;
    }
  }

  const enriched = (notes || []).map(n => ({
    ...n,
    author_name: n.created_by ? (authorMap[n.created_by] ?? 'Team member') : 'Team member',
  }));

  return NextResponse.json({ notes: enriched });
}

export async function POST(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { note_body, note_type = 'general' } = body;

  if (!note_body?.trim()) {
    return NextResponse.json({ error: 'note_body is required' }, { status: 400 });
  }

  const validTypes = ['handover', 'client_intel', 'general'];
  const safeType = validTypes.includes(note_type) ? note_type : 'general';

  const { data, error } = await supabase
    .from('client_notes')
    .insert({
      client_id: clientId,
      note_body: note_body.trim(),
      note_type: safeType,
      created_by: session.user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Resolve author name
  const { data: am } = await supabase
    .from('account_managers')
    .select('name')
    .eq('user_id', session.user.id)
    .maybeSingle();

  return NextResponse.json({
    note: { ...data, author_name: am?.name ?? 'Team member' },
  }, { status: 201 });
}
