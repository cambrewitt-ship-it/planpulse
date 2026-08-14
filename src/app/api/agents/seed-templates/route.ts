import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AGENT_TEMPLATE_SEEDS } from '@/lib/agent-templates';

export async function POST() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const seeds = AGENT_TEMPLATE_SEEDS.map(t => ({ ...t, user_id: session.user.id }));

  const { data, error } = await supabase
    .from('user_agents')
    .upsert(seeds, { onConflict: 'user_id,template_slug', ignoreDuplicates: false })
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ seeded: data?.length ?? 0 });
}
