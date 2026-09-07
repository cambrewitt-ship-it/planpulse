import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// campaign_audit_rules_global isn't in the generated database.ts types yet —
// cast to `any` for these queries, same workaround used elsewhere in the
// codebase for tables added ahead of a `supabase gen types` regen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

// GET /api/setup-auditor/rules?platform=google-ads|meta-ads — agency-wide default rules
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as AnySupabase;

  const platform = request.nextUrl.searchParams.get('platform');
  let query = db.from('campaign_audit_rules_global').select('*').order('platform').order('rule_label');
  if (platform) query = query.eq('platform', platform);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: data ?? [] });
}

// PATCH /api/setup-auditor/rules — update an existing global rule's expected value/severity
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as AnySupabase;

  const { id, expectedValue, severity, description } = await request.json();
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (expectedValue !== undefined) update.expected_value = expectedValue;
  if (severity !== undefined) update.severity = severity;
  if (description !== undefined) update.description = description;

  const { data, error } = await db
    .from('campaign_audit_rules_global')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data });
}

// POST /api/setup-auditor/rules — add a new agency-wide rule
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as AnySupabase;

  const { platform, ruleKey, ruleLabel, expectedValue, severity, description } = await request.json();
  if (!platform || !ruleKey || !ruleLabel || expectedValue === undefined) {
    return NextResponse.json({ error: 'platform, ruleKey, ruleLabel, and expectedValue are required' }, { status: 400 });
  }

  const { data, error } = await db
    .from('campaign_audit_rules_global')
    .insert({ platform, rule_key: ruleKey, rule_label: ruleLabel, expected_value: expectedValue, severity: severity ?? 'warning', description: description ?? null })
    .select()
    .single();

  if (error) {
    const status = error.code === '23505' ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ rule: data }, { status: 201 });
}

// DELETE /api/setup-auditor/rules?id=... — remove a global rule
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as AnySupabase;

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { error } = await db.from('campaign_audit_rules_global').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
