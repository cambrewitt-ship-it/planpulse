import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/rate-limit';
import { computeFunnelStages } from '@/lib/client-hub/get-funnel-data';
import type { FunnelConfig } from '@/lib/types/funnel';

type Params = { params: Promise<{ token: string; funnelId: string }> | { token: string; funnelId: string } };

async function resolveParams(params: Params['params']): Promise<{ token: string; funnelId: string }> {
  return await Promise.resolve(params);
}

/** Public, token-gated funnel calculate — same trust model as api/hub/[token]/demographics/route.ts. */
export async function GET(req: NextRequest, { params }: Params) {
  const limited = await rateLimit(req, 'hub-public', 60, 60);
  if (limited) return limited;

  const { token, funnelId } = await resolveParams(params);
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'Missing required parameters: startDate, endDate' }, { status: 400 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!serviceRoleKey) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
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
    .select('sections')
    .eq('client_id', link.client_id)
    .maybeSingle();

  const sections = (config?.sections ?? {}) as Record<string, boolean>;
  if (sections.funnels === false) {
    return NextResponse.json({ error: 'Section not visible' }, { status: 403 });
  }

  // Scope the funnel lookup to this client — defense-in-depth, matches isClientOwnedByUser pattern
  const { data: funnelRow, error: funnelError } = await (admin as any)
    .from('media_plan_funnels')
    .select('id, config, client_id')
    .eq('id', funnelId)
    .eq('client_id', link.client_id)
    .maybeSingle();

  if (funnelError || !funnelRow) {
    return NextResponse.json({ error: 'Funnel not found' }, { status: 404 });
  }

  const { data: clientRow } = await admin
    .from('clients')
    .select('user_id')
    .eq('id', link.client_id)
    .maybeSingle();

  if (!clientRow?.user_id) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const { stages, totalSpend } = await computeFunnelStages(admin, {
    userId: clientRow.user_id,
    clientId: link.client_id,
    config: funnelRow.config as FunnelConfig,
    startDate,
    endDate,
  });

  return NextResponse.json({ success: true, stages, totalSpend });
}
