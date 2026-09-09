// src/app/api/agency/alerts/resolve/route.ts
// POST — mark one alert from the /agency Alerts panel as resolved.
//
// - type 'finding': the alert is backed by a real campaign_audit_findings
//   row, so resolving it updates that row's status to 'resolved'. It's safe
//   to do manually — evaluate.ts's persistFindings only reopens a resolved
//   row if a later scan finds the same rule_key non-compliant again, it never
//   ignores or permanently suppresses it (src/lib/setup-auditor/evaluate.ts).
//   RLS on campaign_audit_findings / platform_campaigns doesn't scope by
//   owner (USING (true), same as every setup-auditor table), so ownership is
//   verified here via platform_campaigns.user_id before updating.
// - type 'not_spending' | 'pacing': computed live from spend data on every
//   request — there's no row to flip a status on, so this records a
//   dismissal instead, which GET /api/agency/alerts filters out.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// campaign_audit_findings / agency_alert_dismissals aren't in the generated
// database.ts types yet — same cast-to-any workaround used throughout
// src/app/api/setup-auditor/*.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const id: string | undefined = body?.id;
  const type: string | undefined = body?.type;
  if (!id || !type) return NextResponse.json({ error: 'id and type are required' }, { status: 400 });

  const db = supabase as AnySupabase;

  if (type === 'finding') {
    const findingId = id.startsWith('finding:') ? id.slice('finding:'.length) : id;

    const { data: finding, error: findingError } = await db
      .from('campaign_audit_findings')
      .select('id, platform_campaign_id')
      .eq('id', findingId)
      .single();
    if (findingError || !finding) {
      return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
    }

    const { data: campaign } = await db
      .from('platform_campaigns')
      .select('user_id')
      .eq('id', finding.platform_campaign_id)
      .single();
    if (!campaign || campaign.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { error: updateError } = await db
      .from('campaign_audit_findings')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', findingId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  }

  if (type === 'not_spending' || type === 'pacing') {
    const { error } = await db
      .from('agency_alert_dismissals')
      .upsert({ user_id: session.user.id, alert_id: id }, { onConflict: 'user_id,alert_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown alert type' }, { status: 400 });
}
