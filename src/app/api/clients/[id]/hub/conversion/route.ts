import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

const DEFAULT_SECTIONS = {
  snapshot: true, charts: true, pacing: true, goals: true,
  brief: true, notes: true, documents: true, spend: true,
};

// PATCH — set which Meta Ads action_type counts as the client's conversion metric,
// and the label it's shown under (e.g. "Leads", "Purchases"). Body: { actionType, label }
export async function PATCH(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { actionType, label } = await req.json();
  if (actionType !== null && typeof actionType !== 'string') {
    return NextResponse.json({ error: 'actionType must be a string or null' }, { status: 400 });
  }
  if (typeof label !== 'string' || !label.trim()) {
    return NextResponse.json({ error: 'label must be a non-empty string' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('client_hub_config')
    .select('sections')
    .eq('client_id', clientId)
    .maybeSingle();

  const { data, error } = await supabase
    .from('client_hub_config')
    .upsert({
      client_id: clientId,
      sections: existing?.sections ?? DEFAULT_SECTIONS,
      conversion_action_type: actionType,
      conversion_label: label.trim(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id' })
    .select('conversion_action_type, conversion_label')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversionActionType: data.conversion_action_type, conversionLabel: data.conversion_label });
}
