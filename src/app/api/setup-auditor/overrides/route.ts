import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// campaign_audit_rule_overrides isn't in the generated database.ts types yet —
// cast to `any` for these queries, same workaround used elsewhere in the
// codebase for tables added ahead of a `supabase gen types` regen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

// GET /api/setup-auditor/overrides?platformCampaignId=...  OR  ?clientId=...&channelName=...
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as AnySupabase;

  const platformCampaignId = request.nextUrl.searchParams.get('platformCampaignId');
  const clientId = request.nextUrl.searchParams.get('clientId');
  const channelName = request.nextUrl.searchParams.get('channelName');

  let query = db.from('campaign_audit_rule_overrides').select('*');
  if (platformCampaignId) {
    query = query.eq('scope', 'campaign').eq('platform_campaign_id', platformCampaignId);
  } else if (clientId && channelName) {
    query = query.eq('scope', 'client_channel').eq('client_id', clientId).eq('channel_name', channelName);
  } else {
    return NextResponse.json({ error: 'Provide platformCampaignId, or clientId + channelName' }, { status: 400 });
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ overrides: data ?? [] });
}

// POST /api/setup-auditor/overrides — create a legitimate exception to a global rule.
// `reason` is required — it's what makes this an accountable exception rather
// than a silent rule bypass.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as AnySupabase;

  const body = await request.json();
  const { scope, clientId, channelName, platformCampaignId, ruleKey, overrideValue, reason, expiresAt } = body ?? {};

  if (!scope || !ruleKey || overrideValue === undefined || !reason) {
    return NextResponse.json({ error: 'scope, ruleKey, overrideValue, and reason are required' }, { status: 400 });
  }
  if (scope === 'client_channel' && (!clientId || !channelName)) {
    return NextResponse.json({ error: 'clientId and channelName are required for scope=client_channel' }, { status: 400 });
  }
  if (scope === 'campaign' && !platformCampaignId) {
    return NextResponse.json({ error: 'platformCampaignId is required for scope=campaign' }, { status: 400 });
  }

  const { data, error } = await db
    .from('campaign_audit_rule_overrides')
    .insert({
      scope,
      client_id: scope === 'client_channel' ? clientId : null,
      channel_name: scope === 'client_channel' ? channelName : null,
      platform_campaign_id: scope === 'campaign' ? platformCampaignId : null,
      rule_key: ruleKey,
      override_value: overrideValue,
      reason,
      expires_at: expiresAt ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ override: data }, { status: 201 });
}

// DELETE /api/setup-auditor/overrides?id=... — remove an override (the global rule applies again)
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as AnySupabase;

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { error } = await db.from('campaign_audit_rule_overrides').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
