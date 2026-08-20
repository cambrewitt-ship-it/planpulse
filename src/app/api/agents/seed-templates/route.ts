import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AGENT_TEMPLATE_SEEDS } from '@/lib/agent-templates';

export async function POST() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const seeds = AGENT_TEMPLATE_SEEDS.map(t => ({ ...t, user_id: session.user.id }));

  // Insert-only pass: applies each template's default is_enabled for brand-new
  // users. No-ops on conflict, so a user's existing on/off toggle is never reset.
  const { error: insertError } = await supabase
    .from('user_agents')
    .upsert(seeds, { onConflict: 'user_id,template_slug', ignoreDuplicates: true });

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Content sync pass: keeps name/prompt/tools/icon/color current for both new
  // and existing rows. is_enabled is deliberately omitted so it stays untouched.
  const contentSeeds = seeds.map(({ user_id, name, description, system_prompt, enabled_tools, is_template, template_slug, icon, color }) => (
    { user_id, name, description, system_prompt, enabled_tools, is_template, template_slug, icon, color }
  ));
  const { data, error } = await supabase
    .from('user_agents')
    .upsert(contentSeeds, { onConflict: 'user_id,template_slug', ignoreDuplicates: false })
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ seeded: data?.length ?? 0 });
}
