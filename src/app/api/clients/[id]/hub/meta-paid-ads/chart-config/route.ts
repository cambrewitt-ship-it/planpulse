import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isClientOwnedByUser } from '@/lib/client-hub/assert-ownership';
import { DEFAULT_META_PAID_CHART_CONFIG, type MetaPaidChartConfig } from '@/lib/client-hub/meta-paid-chart-config';

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

const STRING_FIELDS: Array<keyof MetaPaidChartConfig> = [
  'commentsEvent', 'commentsLabel', 'reactionsEvent', 'reactionsLabel', 'pageLikesEvent', 'pageLikesLabel',
];

// PATCH — repoint either series of "Post comments vs reactions" or the
// pageLikes side of "Page likes vs {metric}" at any Meta action_type, and
// set its display label. Body: any subset of MetaPaidChartConfig's fields.
export async function PATCH(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isClientOwnedByUser(supabase, clientId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json();
  const patch: Partial<MetaPaidChartConfig> = {};
  for (const field of STRING_FIELDS) {
    if (body[field] != null) {
      if (typeof body[field] !== 'string' || !body[field].trim()) {
        return NextResponse.json({ error: `${field} must be a non-empty string` }, { status: 400 });
      }
      patch[field] = body[field].trim();
    }
  }

  const { data: existing } = await supabase
    .from('client_hub_config')
    .select('meta_paid_chart_config')
    .eq('client_id', clientId)
    .maybeSingle();

  const chartConfig = { ...DEFAULT_META_PAID_CHART_CONFIG, ...(existing?.meta_paid_chart_config ?? {}), ...patch };

  const { data, error } = await supabase
    .from('client_hub_config')
    .upsert({ client_id: clientId, meta_paid_chart_config: chartConfig, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
    .select('meta_paid_chart_config')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ chartConfig: data.meta_paid_chart_config });
}
