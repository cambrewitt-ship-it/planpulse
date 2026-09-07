import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// platform_campaigns isn't in the generated database.ts types yet — see
// campaigns/route.ts for why these queries cast to `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

const PATCHABLE_FIELDS = [
  'campaign_name', 'channel_name', 'expected_geo', 'expected_geo_mode',
  'expected_budget_amount', 'expected_budget_currency', 'expected_optimization_goal',
  'expected_destination_url', 'notes', 'is_active',
] as const;

// PATCH /api/setup-auditor/campaigns/[id] — update a registered campaign's intended spec
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as AnySupabase;

  const body = await request.json();
  const update: Record<string, unknown> = {};
  for (const field of PATCHABLE_FIELDS) {
    const camel = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (camel in (body ?? {})) update[field] = body[camel];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
  }

  const { data, error } = await db
    .from('platform_campaigns')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data });
}

// DELETE /api/setup-auditor/campaigns/[id] — unregister a campaign (cascades to its findings)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as AnySupabase;

  const { error } = await db.from('platform_campaigns').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
