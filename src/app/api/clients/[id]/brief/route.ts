import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

// GET — fetch the client brief (most recent) and all version snapshots
export async function GET(_req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: brief, error } = await supabase
    .from('client_briefs')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!brief) return NextResponse.json({ brief: null, versions: [] });

  // Resolve locker name
  let locked_by_name: string | null = null;
  if (brief.locked_by) {
    const { data: am } = await supabase
      .from('account_managers')
      .select('name')
      .eq('user_id', brief.locked_by)
      .maybeSingle();
    locked_by_name = am?.name ?? 'Team member';
  }

  const { data: versions, error: vErr } = await supabase
    .from('client_brief_versions')
    .select('*')
    .eq('brief_id', brief.id)
    .order('version', { ascending: false });

  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

  return NextResponse.json({ brief: { ...brief, locked_by_name }, versions: versions ?? [] });
}

// POST — create or update the brief, always saving a version snapshot first
export async function POST(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { objectives, kpis, budget, start_date, end_date, target_audience, brief_body, lock } = body;

  // Check if a brief already exists
  const { data: existing } = await supabase
    .from('client_briefs')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.is_locked && !lock) {
    return NextResponse.json({ error: 'Brief is locked and cannot be edited' }, { status: 403 });
  }

  const nextVersion = existing ? existing.version + 1 : 1;

  const briefPayload = {
    objectives: objectives ?? null,
    kpis: kpis ?? null,
    budget: budget ?? null,
    start_date: start_date ?? null,
    end_date: end_date ?? null,
    target_audience: target_audience ?? null,
    brief_body: brief_body ?? null,
  };

  let briefId: string;
  let savedBrief: Record<string, unknown>;

  if (existing) {
    // Save version snapshot before updating
    await supabase.from('client_brief_versions').insert({
      client_id: clientId,
      brief_id: existing.id,
      brief_data: existing as unknown as Record<string, unknown>,
      version: existing.version,
      saved_by: session.user.id,
    });

    const lockFields = lock
      ? { is_locked: true, locked_at: new Date().toISOString(), locked_by: session.user.id }
      : {};

    const { data, error } = await supabase
      .from('client_briefs')
      .update({ ...briefPayload, version: nextVersion, ...lockFields })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    briefId = data.id;
    savedBrief = data as unknown as Record<string, unknown>;
  } else {
    const { data, error } = await supabase
      .from('client_briefs')
      .insert({ client_id: clientId, ...briefPayload, created_by: session.user.id, version: 1 })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    briefId = data.id;
    savedBrief = data as unknown as Record<string, unknown>;
  }

  // Resolve locker name if locked
  let locked_by_name: string | null = null;
  if (lock) {
    const { data: am } = await supabase
      .from('account_managers')
      .select('name')
      .eq('user_id', session.user.id)
      .maybeSingle();
    locked_by_name = am?.name ?? 'Team member';
  }

  // Fetch updated versions
  const { data: versions } = await supabase
    .from('client_brief_versions')
    .select('*')
    .eq('brief_id', briefId)
    .order('version', { ascending: false });

  return NextResponse.json({ brief: { ...savedBrief, locked_by_name }, versions: versions ?? [] }, { status: existing ? 200 : 201 });
}
