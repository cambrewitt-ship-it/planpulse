import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { getClientHubData } from '@/lib/client-hub/get-hub-data';

type Params = { params: Promise<{ token: string }> | { token: string } };

async function resolveToken(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).token;
}

const DEFAULT_SECTIONS: Record<string, boolean> = {
  snapshot: true, charts: true, pacing: true, goals: true,
  brief: true, notes: true, documents: true, spend: true,
};

/**
 * Public, token-gated hub read. Uses the service-role client because this
 * route intentionally serves unauthenticated visitors — token possession is
 * the only access check, matching the "anyone with the link" model. The
 * token is the sole input; client_id is always resolved server-side from
 * the share-link row, never accepted from the caller.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const token = await resolveToken(params);

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }
  const admin = createSupabaseAdmin(supabaseUrl, serviceRoleKey);

  const { data: link } = await admin
    .from('client_hub_share_links')
    .select('client_id, is_enabled')
    .eq('token', token)
    .maybeSingle();

  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  if (!link.is_enabled) return NextResponse.json({ error: 'This link is no longer active' }, { status: 403 });

  const { data: config } = await admin
    .from('client_hub_config')
    .select('sections, conversion_action_type, conversion_label')
    .eq('client_id', link.client_id)
    .maybeSingle();

  const data = await getClientHubData(admin, link.client_id, {
    start: req.nextUrl.searchParams.get('start') ?? undefined,
    end: req.nextUrl.searchParams.get('end') ?? undefined,
    conversionActionType: config?.conversion_action_type ?? null,
    conversionLabel: config?.conversion_label ?? undefined,
  });
  if (!data) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const sections: Record<string, boolean> = { ...DEFAULT_SECTIONS, ...(config?.sections ?? {}) };

  // Agency-internal notes never reach the client, regardless of section visibility
  const notes = data.notes.filter(n => n.note_type !== 'handover');

  return NextResponse.json({
    client: data.client,
    agency: data.agency,
    period: data.period,
    conversion: data.conversion,
    sections,
    metrics: sections.snapshot ? data.metrics : [],
    monthlyTrend: sections.charts ? data.monthlyTrend : [],
    channelActuals: sections.charts ? data.channelActuals : [],
    pacing: sections.pacing ? data.pacing : null,
    goals: sections.goals ? data.goals : [],
    brief: sections.brief ? data.brief : null,
    notes: sections.notes ? notes : [],
    documents: sections.documents ? data.documents : [],
    spendRows: sections.spend ? data.spendRows : [],
  });
}
