import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, 'media-plan-builder-leads', 5, 60);
  if (limited) return limited;

  let body: { name?: string; email?: string; hp?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Honeypot — real visitors never fill this hidden field. Pretend success
  // without touching the DB so bots can't tell it was rejected.
  if (body.hp) {
    return NextResponse.json({ success: true });
  }

  const name = body.name?.trim() || null;
  const email = body.email?.trim().toLowerCase() ?? '';
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('media_plan_builder_leads')
    .insert({ name, email, source: 'media-plan-builder' });

  if (error) {
    console.error('Error saving media plan builder lead:', error);
    return NextResponse.json({ error: 'Failed to save — please try again' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
