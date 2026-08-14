import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('agency_settings')
    .select('*')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? {});
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch = {
    user_id:             session.user.id,
    updated_at:          new Date().toISOString(),
    agency_name:         body.agency_name         ?? undefined,
    agency_address:      body.agency_address      ?? undefined,
    agency_email:        body.agency_email        ?? undefined,
    agency_phone:        body.agency_phone        ?? undefined,
    bank_name:           body.bank_name           ?? undefined,
    bank_account_name:   body.bank_account_name   ?? undefined,
    bank_account_number: body.bank_account_number ?? undefined,
    invoice_notes:       body.invoice_notes       ?? undefined,
    invoice_due_days:    body.invoice_due_days    ?? undefined,
  } as const;

  const { data, error } = await supabase
    .from('agency_settings')
    .upsert(patch, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
