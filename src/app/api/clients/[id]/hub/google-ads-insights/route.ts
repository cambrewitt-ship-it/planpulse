import { NextRequest, NextResponse } from 'next/server';
import { subDays, format } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { isClientOwnedByUser } from '@/lib/client-hub/assert-ownership';
import {
  getGoogleAdsSearchTerms, getGoogleAdsGeoBreakdown, getGoogleAdsDeviceDonut,
  getGoogleAdsDayOfWeekDonut, getGoogleAdsAgeGenderByImpressions,
} from '@/lib/client-hub/get-google-ads-report';
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
  const hiddenCards = sanitizeHiddenCards(config?.hidden_cards).googleAdsInsights ?? [];

  const [searchTerms, geoBreakdown, deviceDonut, dayOfWeekDonut, ageGender] = await Promise.all([
    getGoogleAdsSearchTerms(supabase, clientId),
    getGoogleAdsGeoBreakdown(supabase, clientId),
    getGoogleAdsDeviceDonut(supabase, clientId),
    getGoogleAdsDayOfWeekDonut(supabase, clientId, range),
    getGoogleAdsAgeGenderByImpressions(supabase, clientId, range),
  ]);

  return NextResponse.json({
    period: { start, end }, searchTerms, geoBreakdown, deviceDonut, dayOfWeekDonut,
    ageDonut: ageGender.age, genderDonut: ageGender.gender, hiddenCards,
  });
}
