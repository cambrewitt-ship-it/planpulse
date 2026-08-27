import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isClientOwnedByUser } from '@/lib/client-hub/assert-ownership';
import { SECTION_KEYS } from '@/lib/client-hub/section-meta';

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

const DEFAULT_SECTIONS: Record<string, boolean> = Object.fromEntries(SECTION_KEYS.map(k => [k, true]));

// PATCH — set which Meta action_type powers the "Meta Ads — Paid" section's
// metric (KPI tile, cost-per-metric, page-likes-vs-metric, top-ads-by-metric),
// and its display label. Body: { actionType, label }. actionType: null resets
// to the default (post_engagement / "Engagements").
export async function PATCH(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isClientOwnedByUser(supabase, clientId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

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
      meta_paid_action_type: actionType,
      meta_paid_metric_label: label.trim(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id' })
    .select('meta_paid_action_type, meta_paid_metric_label')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ actionType: data.meta_paid_action_type, label: data.meta_paid_metric_label });
}
