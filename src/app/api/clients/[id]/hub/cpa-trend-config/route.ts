import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isClientOwnedByUser } from '@/lib/client-hub/assert-ownership';
import { DEFAULT_CPA_TREND_WIDGET, VALID_CPA_PLATFORMS, type CpaTrendConfig } from '@/lib/client-hub/cpa-trend-widget';

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

// GET — current CPA trend widget config (platform/event), for the settings gear modal.
export async function GET(_req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('client_hub_config')
    .select('cpa_trend_widget')
    .eq('client_id', clientId)
    .maybeSingle();

  return NextResponse.json({ cpaTrendWidget: { ...DEFAULT_CPA_TREND_WIDGET, ...(data?.cpa_trend_widget ?? {}) } });
}

// PATCH — update the CPA trend widget config from the settings gear modal.
export async function PATCH(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isClientOwnedByUser(supabase, clientId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json();
  const patch: Partial<CpaTrendConfig> = {};
  if (body.platform != null) {
    if (!VALID_CPA_PLATFORMS.includes(body.platform)) return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    patch.platform = body.platform;
  }
  if ('event' in body) {
    if (body.event !== null && typeof body.event !== 'string') return NextResponse.json({ error: 'event must be a string or null' }, { status: 400 });
    patch.event = body.event;
  }

  const { data: existing } = await supabase
    .from('client_hub_config')
    .select('cpa_trend_widget')
    .eq('client_id', clientId)
    .maybeSingle();

  const cpaTrendWidget = { ...DEFAULT_CPA_TREND_WIDGET, ...(existing?.cpa_trend_widget ?? {}), ...patch };

  const { data, error } = await supabase
    .from('client_hub_config')
    .upsert({ client_id: clientId, cpa_trend_widget: cpaTrendWidget, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
    .select('cpa_trend_widget')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cpaTrendWidget: data.cpa_trend_widget });
}
