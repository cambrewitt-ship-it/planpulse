import { NextRequest, NextResponse } from 'next/server';
import { subDays, format } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { isClientOwnedByUser } from '@/lib/client-hub/assert-ownership';
import { getGA4TopLandingPages, getGA4TopCountries, getGA4TopEvents } from '@/lib/client-hub/get-ga4-report';
import { getStoredInsight } from '@/lib/client-hub/generate-insight';
import { sanitizeHiddenCards } from '@/lib/client-hub/hidden-cards';

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

export async function GET(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isClientOwnedByUser(supabase, clientId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // period is only used to seed the "Sync" button's request range — the
  // breakdown reads below are last-sync snapshots, not date-filtered.
  const today = new Date();
  const start = req.nextUrl.searchParams.get('start') ?? format(subDays(today, 29), 'yyyy-MM-dd');
  const end = req.nextUrl.searchParams.get('end') ?? format(today, 'yyyy-MM-dd');

  const { data: config } = await supabase
    .from('client_hub_config')
    .select('hidden_cards')
    .eq('client_id', clientId)
    .maybeSingle();
  const hiddenCards = sanitizeHiddenCards(config?.hidden_cards).ga4Insights ?? [];

  const [landingPages, countries, events, insight] = await Promise.all([
    getGA4TopLandingPages(supabase, clientId),
    getGA4TopCountries(supabase, clientId),
    getGA4TopEvents(supabase, clientId),
    getStoredInsight(supabase, clientId, 'ga4Insights'),
  ]);

  return NextResponse.json({ period: { start, end }, landingPages, countries, events, insight, hiddenCards });
}
