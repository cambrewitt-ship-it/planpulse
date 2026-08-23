import { NextRequest, NextResponse } from 'next/server';
import { subDays, format } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { getClientDemographics } from '@/lib/client-hub/get-demographics';
import { isClientOwnedByUser } from '@/lib/client-hub/assert-ownership';
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
  const start = req.nextUrl.searchParams.get('start') ?? format(subDays(today, 89), 'yyyy-MM-dd');
  const end = req.nextUrl.searchParams.get('end') ?? format(today, 'yyyy-MM-dd');

  const { data: config } = await supabase
    .from('client_hub_config')
    .select('hidden_cards')
    .eq('client_id', clientId)
    .maybeSingle();
  const hiddenCards = sanitizeHiddenCards(config?.hidden_cards).demographics ?? [];

  const demographics = await getClientDemographics(supabase, clientId, { start, end });
  return NextResponse.json({ demographics, hiddenCards, period: { start, end } });
}
