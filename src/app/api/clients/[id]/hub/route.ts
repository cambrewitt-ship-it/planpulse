import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getClientHubData } from '@/lib/client-hub/get-hub-data';

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

const DEFAULT_SECTIONS = {
  snapshot: true, charts: true, pacing: true, goals: true,
  brief: true, notes: true, documents: true, spend: true,
};

// GET — full hub data bag + section visibility + share-link status, for the agency edit view
// Optional ?start=YYYY-MM-DD&end=YYYY-MM-DD overrides the default reporting period.
export async function GET(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: config } = await supabase
    .from('client_hub_config')
    .select('sections, conversion_action_type, conversion_label')
    .eq('client_id', clientId)
    .maybeSingle();

  const data = await getClientHubData(supabase, clientId, {
    start: req.nextUrl.searchParams.get('start') ?? undefined,
    end: req.nextUrl.searchParams.get('end') ?? undefined,
    conversionActionType: config?.conversion_action_type ?? null,
    conversionLabel: config?.conversion_label ?? undefined,
  });
  if (!data) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const { data: shareLink } = await supabase
    .from('client_hub_share_links')
    .select('token, is_enabled')
    .eq('client_id', clientId)
    .maybeSingle();

  return NextResponse.json({
    ...data,
    sections: config?.sections ?? DEFAULT_SECTIONS,
    shareLink: shareLink ?? null,
  });
}
