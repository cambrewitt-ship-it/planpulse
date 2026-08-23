import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/rate-limit';
import { readCachedSpendData, readCachedGA4Data } from '@/lib/ads/cached-analytics';

type Params = { params: Promise<{ token: string }> | { token: string } };

async function resolveToken(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).token;
}

/**
 * Public, token-gated cost-per-metric read — same trust model as
 * api/hub/[token]/demographics/route.ts. Cache-only: unlike the agency's
 * /api/clients/[id]/analytics-data route, this never triggers a live platform
 * sync — that stays an agency-triggered action, not something an anonymous
 * link visitor should be able to cause.
 */
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
  if (sections.costPerMetric === false) {
    return NextResponse.json({ error: 'Section not visible' }, { status: 403 });
  }

  const start = req.nextUrl.searchParams.get('start');
  const end = req.nextUrl.searchParams.get('end');
  if (!start || !end) {
    return NextResponse.json({ error: 'Missing required parameters: start, end' }, { status: 400 });
  }

  const [spendData, ga4Data] = await Promise.all([
    readCachedSpendData(admin, link.client_id, start, end),
    readCachedGA4Data(admin, link.client_id, start, end),
  ]);

  return NextResponse.json({ success: true, spendData, ga4Data });
}
