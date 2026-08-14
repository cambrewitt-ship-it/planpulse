import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ALL_TOOL_NAMES } from '@/lib/agent-templates';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: agent, error } = await supabase
    .from('user_agents')
    .select('*')
    .eq('id', id)
    .eq('user_id', session.user.id)
    .single();

  if (error || !agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ agent });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { name, description, system_prompt, enabled_tools, is_enabled, icon, color } = body;

  if (enabled_tools !== undefined) {
    const invalidTools = enabled_tools.filter((t: string) => !(ALL_TOOL_NAMES as readonly string[]).includes(t));
    if (invalidTools.length > 0) {
      return NextResponse.json({ error: `Unknown tools: ${invalidTools.join(', ')}` }, { status: 400 });
    }
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description?.trim() ?? null;
  if (system_prompt !== undefined) updates.system_prompt = system_prompt.trim();
  if (enabled_tools !== undefined) updates.enabled_tools = enabled_tools;
  if (is_enabled !== undefined) updates.is_enabled = is_enabled;
  if (icon !== undefined) updates.icon = icon ?? null;
  if (color !== undefined) updates.color = color ?? null;

  const { data: agent, error } = await supabase
    .from('user_agents')
    .update(updates)
    .eq('id', id)
    .eq('user_id', session.user.id)
    .select()
    .single();

  if (error || !agent) return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: error ? 500 : 404 });

  return NextResponse.json({ agent });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('user_agents')
    .delete()
    .eq('id', id)
    .eq('user_id', session.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
