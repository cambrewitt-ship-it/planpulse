import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/rate-limit';

type Params = { params: Promise<{ token: string }> | { token: string } };

async function resolveToken(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).token;
}

/** Public, token-gated funnel list — same trust model as api/hub/[token]/demographics/route.ts. */
export async function GET(req: NextRequest, { params }: Params) {
  const limited = await rateLimit(req, 'hub-public', 60, 60);
  if (limited) return limited;

  const token = await resolveToken(params);

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

  const { data: funnels, error } = await (admin as any)
    .from('media_plan_funnels')
    .select('id, name, channel_ids, config, created_at, updated_at')
    .eq('client_id', link.client_id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch funnels' }, { status: 500 });
  }

  const mapped = (funnels || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    channelIds: f.channel_ids,
    config: f.config,
    createdAt: f.created_at,
    updatedAt: f.updated_at,
  }));

  return NextResponse.json({ success: true, funnels: mapped });
}
