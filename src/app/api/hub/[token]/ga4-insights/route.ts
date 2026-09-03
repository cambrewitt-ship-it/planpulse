import { NextRequest, NextResponse } from 'next/server';
import { subDays, format } from 'date-fns';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/rate-limit';
import { getGA4TopLandingPages, getGA4TopCountries, getGA4TopEvents } from '@/lib/client-hub/get-ga4-report';
import { getStoredInsight } from '@/lib/client-hub/generate-insight';
import { sanitizeHiddenCards } from '@/lib/client-hub/hidden-cards';

type Params = { params: Promise<{ token: string }> | { token: string } };

async function resolveToken(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).token;
}

/** Public, token-gated Google Analytics — Behaviour read — same trust model as api/hub/[token]/route.ts. */
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
    .select('sections, hidden_cards')
    .eq('client_id', link.client_id)
    .maybeSingle();

  const sections = (config?.sections ?? {}) as Record<string, boolean>;
  if (sections.ga4Insights === false) {
    return NextResponse.json({ error: 'Section not visible' }, { status: 403 });
  }
  const hiddenCards = sanitizeHiddenCards(config?.hidden_cards).ga4Insights ?? [];

  const today = new Date();
  const start = req.nextUrl.searchParams.get('start') ?? format(subDays(today, 29), 'yyyy-MM-dd');
  const end = req.nextUrl.searchParams.get('end') ?? format(today, 'yyyy-MM-dd');

  const [landingPages, countries, events, insight] = await Promise.all([
    getGA4TopLandingPages(admin, link.client_id),
    getGA4TopCountries(admin, link.client_id),
    getGA4TopEvents(admin, link.client_id),
    getStoredInsight(admin, link.client_id, 'ga4Insights'),
  ]);

  // Strip data for hidden cards server-side — this is an unauthenticated
  // endpoint, so redaction can't rely on the client choosing not to render it.
  return NextResponse.json({
    period: { start, end },
    landingPages: hiddenCards.includes('landingPages') ? [] : landingPages,
    countries: hiddenCards.includes('countries') ? [] : countries,
    events: hiddenCards.includes('events') ? [] : events,
    insight: hiddenCards.includes('insight') ? null : insight,
    hiddenCards,
  });
}
