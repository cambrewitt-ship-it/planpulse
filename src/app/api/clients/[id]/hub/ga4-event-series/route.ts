import { NextRequest, NextResponse } from 'next/server';
import { subDays, format } from 'date-fns';
import { Nango } from '@nangohq/node';
import { createClient } from '@/lib/supabase/server';
import { isClientOwnedByUser } from '@/lib/client-hub/assert-ownership';
import { previousPeriod } from '@/lib/client-hub/get-ga4-report';
import { fetchGA4EventSeries } from '@/lib/ads/ga4-live';

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

/**
 * Live per-day counts for one named conversion event — the "Key events" tab's
 * specific-event picker only, not the default cached view. See
 * fetchGA4EventSeries in src/lib/ads/ga4-live.ts for why this stays live.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isClientOwnedByUser(supabase, clientId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const eventName = req.nextUrl.searchParams.get('eventName');
  if (!eventName) return NextResponse.json({ error: 'Missing required parameter: eventName' }, { status: 400 });

  const today = new Date();
  const start = req.nextUrl.searchParams.get('start') ?? format(subDays(today, 29), 'yyyy-MM-dd');
  const end = req.nextUrl.searchParams.get('end') ?? format(today, 'yyyy-MM-dd');
  const prevRange = previousPeriod({ start, end });

  const { data: connections } = await supabase
    .from('ad_platform_connections')
    .select('connection_id')
    .eq('user_id', session.user.id).eq('client_id', clientId).eq('platform', 'google-analytics').eq('connection_status', 'active')
    .order('created_at', { ascending: false }).limit(1);
  const connection = connections?.[0];
  if (!connection) return NextResponse.json({ error: 'Google Analytics not connected. Please connect your account first.' }, { status: 404 });

  const nangoSecretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
  if (!nangoSecretKey) return NextResponse.json({ error: 'Server configuration error: Nango secret key not found' }, { status: 500 });
  const nango = new Nango({ secretKey: nangoSecretKey });

  const result = await fetchGA4EventSeries({
    supabase, nango, userId: session.user.id, clientId, connectionId: connection.connection_id, eventName,
    startDate: start, endDate: end, previousStartDate: prevRange.start, previousEndDate: prevRange.end,
  });

  if (!result.success) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ period: { start, end }, eventName, current: result.current, previous: result.previous });
}
