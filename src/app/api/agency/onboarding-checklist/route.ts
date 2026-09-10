import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const VALID_ITEMS = [
  'viewed_agency_dashboard',
  'visited_demo_dashboard',
  'visited_demo_portal',
  'created_first_client',
] as const;
type ChecklistItem = typeof VALID_ITEMS[number];

const DEFAULT_CHECKLIST: Record<ChecklistItem, boolean> = {
  viewed_agency_dashboard: false,
  visited_demo_dashboard: false,
  visited_demo_portal: false,
  created_first_client: false,
};

// GET — current "Getting Started" checklist state for the logged-in user
export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('agency_settings')
    .select('onboarding_checklist')
    .eq('user_id', session.user.id)
    .maybeSingle();

  return NextResponse.json({ checklist: data?.onboarding_checklist ?? DEFAULT_CHECKLIST });
}

// POST { item } — marks one checklist item complete
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { item } = await request.json();
  if (!VALID_ITEMS.includes(item)) {
    return NextResponse.json({ error: 'Invalid checklist item' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('agency_settings')
    .select('onboarding_checklist')
    .eq('user_id', session.user.id)
    .maybeSingle();

  const checklist = { ...DEFAULT_CHECKLIST, ...(existing?.onboarding_checklist ?? {}), [item]: true };

  const { error } = await supabase
    .from('agency_settings')
    .upsert({ user_id: session.user.id, onboarding_checklist: checklist }, { onConflict: 'user_id' });

  if (error) {
    console.error('Error updating onboarding checklist:', error);
    return NextResponse.json({ error: 'Failed to update checklist' }, { status: 500 });
  }

  return NextResponse.json({ checklist });
}
