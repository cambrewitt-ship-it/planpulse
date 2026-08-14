import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ALL_TOOL_NAMES } from '@/lib/agent-templates';

export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: agents, error } = await supabase
    .from('user_agents')
    .select('*')
    .eq('user_id', session.user.id)
    .order('is_template', { ascending: false })
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ agents: agents ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { name, description, system_prompt, enabled_tools, icon, color } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (!system_prompt?.trim()) return NextResponse.json({ error: 'system_prompt is required' }, { status: 400 });

  const invalidTools = (enabled_tools ?? []).filter((t: string) => !(ALL_TOOL_NAMES as readonly string[]).includes(t));
  if (invalidTools.length > 0) {
    return NextResponse.json({ error: `Unknown tools: ${invalidTools.join(', ')}` }, { status: 400 });
  }

  const { data: agent, error } = await supabase
    .from('user_agents')
    .insert({
      user_id: session.user.id,
      name: name.trim(),
      description: description?.trim() ?? null,
      system_prompt: system_prompt.trim(),
      enabled_tools: enabled_tools ?? [],
      icon: icon ?? null,
      color: color ?? null,
      is_template: false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ agent });
}
