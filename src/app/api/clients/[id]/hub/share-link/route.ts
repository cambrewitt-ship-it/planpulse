import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { isClientOwnedByUser } from '@/lib/client-hub/assert-ownership';

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

// GET — get-or-create the client's share link
export async function GET(_req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isClientOwnedByUser(supabase, clientId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from('client_hub_share_links')
    .select('token, is_enabled')
    .eq('client_id', clientId)
    .maybeSingle();

  if (existing) return NextResponse.json({ shareLink: existing });

  const { data, error } = await supabase
    .from('client_hub_share_links')
    .insert({ client_id: clientId, token: generateToken(), created_by: session.user.id })
    .select('token, is_enabled')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ shareLink: data });
}

// PATCH — toggle is_enabled
export async function PATCH(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isClientOwnedByUser(supabase, clientId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { is_enabled } = await req.json();
  if (typeof is_enabled !== 'boolean') {
    return NextResponse.json({ error: 'is_enabled must be a boolean' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('client_hub_share_links')
    .update({ is_enabled })
    .eq('client_id', clientId)
    .select('token, is_enabled')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'No share link exists for this client yet' }, { status: 404 });
  return NextResponse.json({ shareLink: data });
}
