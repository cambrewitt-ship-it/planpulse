import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isClientOwnedByUser } from '@/lib/client-hub/assert-ownership';
import { SECTION_KEYS, normalizeSectionOrder } from '@/lib/client-hub/section-meta';

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

// PATCH — persist the client-portal section display order. Body: { order: string[] }
export async function PATCH(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isClientOwnedByUser(supabase, clientId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { order } = await req.json();
  if (!Array.isArray(order) || !order.every((k) => typeof k === 'string' && SECTION_KEYS.includes(k))) {
    return NextResponse.json({ error: 'order must be an array of valid section keys' }, { status: 400 });
  }

  const sectionOrder = normalizeSectionOrder(order);

  const { data, error } = await supabase
    .from('client_hub_config')
    .upsert({ client_id: clientId, section_order: sectionOrder, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
    .select('section_order')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sectionOrder: normalizeSectionOrder(data.section_order) });
}
