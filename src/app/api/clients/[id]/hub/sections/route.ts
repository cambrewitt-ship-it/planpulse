import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

const DEFAULT_SECTIONS: Record<string, boolean> = {
  snapshot: true, charts: true, pacing: true, goals: true,
  brief: true, notes: true, documents: true, spend: true,
};

const VALID_KEYS = Object.keys(DEFAULT_SECTIONS);

// PATCH — flip one section's client-visibility flag. Body: { key, visible }
export async function PATCH(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { key, visible } = await req.json();
  if (!VALID_KEYS.includes(key) || typeof visible !== 'boolean') {
    return NextResponse.json({ error: 'key must be a valid section and visible must be a boolean' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('client_hub_config')
    .select('sections')
    .eq('client_id', clientId)
    .maybeSingle();

  const sections = { ...DEFAULT_SECTIONS, ...(existing?.sections ?? {}), [key]: visible };

  const { data, error } = await supabase
    .from('client_hub_config')
    .upsert({ client_id: clientId, sections, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
    .select('sections')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sections: data.sections });
}
