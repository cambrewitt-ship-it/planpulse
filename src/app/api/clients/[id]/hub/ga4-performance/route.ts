import { NextRequest, NextResponse } from 'next/server';
import { subDays, format } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { isClientOwnedByUser } from '@/lib/client-hub/assert-ownership';
import {
  getGA4KpiTiles, getGA4DailySeries, getGA4ChannelBreakdown, getGA4DeviceBreakdown, getGA4NewVsReturningBreakdown,
} from '@/lib/client-hub/get-ga4-report';
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

  const today = new Date();
  const start = req.nextUrl.searchParams.get('start') ?? format(subDays(today, 29), 'yyyy-MM-dd');
  const end = req.nextUrl.searchParams.get('end') ?? format(today, 'yyyy-MM-dd');
  const range = { start, end };

  const { data: config } = await supabase
    .from('client_hub_config')
    .select('hidden_cards')
    .eq('client_id', clientId)
    .maybeSingle();
  const hiddenCards = sanitizeHiddenCards(config?.hidden_cards).ga4Performance ?? [];

  const [metrics, dailySeries, channelDonut, deviceDonut, newVsReturningDonut, insight] = await Promise.all([
    getGA4KpiTiles(supabase, clientId, range),
    getGA4DailySeries(supabase, clientId, range),
    getGA4ChannelBreakdown(supabase, clientId, range),
    getGA4DeviceBreakdown(supabase, clientId, range),
    getGA4NewVsReturningBreakdown(supabase, clientId, range),
    getStoredInsight(supabase, clientId, 'ga4Performance'),
  ]);

  return NextResponse.json({ period: { start, end }, metrics, dailySeries, channelDonut, deviceDonut, newVsReturningDonut, insight, hiddenCards });
}
