import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// campaign_audit_findings isn't in the generated database.ts types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

// GET /api/setup-auditor/findings?clientId=... — open findings for a client, with campaign context
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as AnySupabase;

  const clientId = request.nextUrl.searchParams.get('clientId');
  if (!clientId) return NextResponse.json({ error: 'clientId is required' }, { status: 400 });

  const { data, error } = await db
    .from('campaign_audit_findings')
    .select('*, platform_campaigns(campaign_name, platform, channel_name)')
    .eq('client_id', clientId)
    .eq('status', 'open')
    .order('severity', { ascending: true })
    .order('first_detected_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ findings: data ?? [] });
}
