import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { BOT_TOOL_DEFINITIONS } from '@/lib/agent-tools';

export const maxDuration = 60;

const BOT_SYSTEM_PROMPT = `You are PlanPulse, a media agency assistant responding in Microsoft Teams.

You have access to live data: client health, spend pacing, action points, and channel performance.

Rules:
- Be concise. Lead with the most important number or status.
- Use bullet points for lists, bold for client names.
- Max 5 items per list — summarise the rest as "...and N more".
- For write actions (create/complete), confirm what you did with a ✅.
- If asked something outside your tools, say so briefly.
- Never mention "tokens", "Claude", or internal system details.`;

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

function validateTeamsHmac(body: string, authHeader: string | null, secret: string): boolean {
  if (!authHeader?.startsWith('HMAC ')) return false;
  const provided = authHeader.slice(5);
  const expected = createHmac('sha256', Buffer.from(secret, 'base64'))
    .update(Buffer.from(body, 'utf8'))
    .digest('base64');
  return provided === expected;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runBotTools(toolName: string, toolInput: Record<string, unknown>, userId: string, supabase: any): Promise<unknown> {
  if (toolName === 'get_client_status') {
    const { client_name, status_filter } = toolInput as { client_name?: string; status_filter?: string };

    let clientQuery = supabase
      .from('clients')
      .select('id, name, account_manager')
      .eq('user_id', userId);

    if (client_name) clientQuery = (clientQuery as any).ilike('name', `%${client_name}%`);

    const { data: clients } = await clientQuery;
    if (!clients?.length) return { error: 'No matching clients found' };

    const clientIds = clients.map((c: any) => c.id);
    const { data: healthRows } = await supabase
      .from('client_health_status')
      .select('client_id, status, total_overdue_tasks, budget_health_percentage, active_channel_count')
      .in('client_id', clientIds);

    const healthMap = new Map((healthRows ?? []).map((h: any) => [h.client_id, h]));

    let results = clients.map((c: any) => {
      const h = healthMap.get(c.id) as any;
      return {
        name: c.name,
        health: h?.status ?? 'unknown',
        overdue_tasks: h?.total_overdue_tasks ?? 0,
        budget_health_pct: h?.budget_health_percentage ?? null,
        active_channels: h?.active_channel_count ?? 0,
        account_manager: c.account_manager,
      };
    });

    if (status_filter) {
      results = results.filter((r: any) => r.health === status_filter);
    }

    return results;
  }

  if (toolName === 'get_action_points') {
    const { client_name } = toolInput as { client_name?: string };

    let clientQuery = supabase
      .from('clients')
      .select('id, name')
      .eq('user_id', userId);

    if (client_name) clientQuery = (clientQuery as any).ilike('name', `%${client_name}%`);

    const { data: clients } = await clientQuery;
    if (!clients?.length) return { error: 'No matching clients found' };

    const clientIds = clients.map((c: any) => c.id);
    const clientMap = new Map(clients.map((c: any) => [c.id, c.name]));

    // Get all action points
    const { data: allAps } = await supabase
      .from('action_points')
      .select('id, text, channel_type, category, due_date, days_before_live_due, frequency');

    // Get completions for these clients
    const { data: completions } = await supabase
      .from('client_action_point_completions')
      .select('client_id, action_point_id, completed')
      .in('client_id', clientIds)
      .eq('completed', true);

    const completedSet = new Set(
      (completions ?? []).map((c: any) => `${c.client_id}::${c.action_point_id}`)
    );

    const today = new Date().toISOString().split('T')[0];
    const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    const overdue: any[] = [];
    const dueSoon: any[] = [];

    for (const clientId of clientIds) {
      const clientName = clientMap.get(clientId);
      for (const ap of allAps ?? []) {
        if (completedSet.has(`${clientId}::${ap.id}`)) continue;
        if (!ap.due_date) continue;
        const item = { client: clientName, channel: ap.channel_type, task: ap.text, due_date: ap.due_date };
        if (ap.due_date < today) overdue.push(item);
        else if (ap.due_date <= in7Days) dueSoon.push(item);
      }
    }

    return {
      today,
      overdue_count: overdue.length,
      due_within_7_days_count: dueSoon.length,
      overdue_items: overdue.slice(0, 10),
      due_soon_items: dueSoon.slice(0, 10),
    };
  }

  if (toolName === 'get_daily_briefing') {
    const [clientStatus, actionPoints] = await Promise.all([
      runBotTools('get_client_status', {}, userId, supabase),
      runBotTools('get_action_points', {}, userId, supabase),
    ]);

    const clients = Array.isArray(clientStatus) ? clientStatus : [];
    const red = clients.filter((c: any) => c.health === 'red');
    const amber = clients.filter((c: any) => c.health === 'amber');
    const ap = actionPoints as any;

    return {
      date: new Date().toISOString().split('T')[0],
      client_summary: { total: clients.length, red: red.length, amber: amber.length, green: clients.length - red.length - amber.length },
      red_clients: red.map((c: any) => c.name),
      amber_clients: amber.map((c: any) => c.name),
      overdue_action_points: ap?.overdue_count ?? 0,
      overdue_items: ap?.overdue_items ?? [],
    };
  }

  if (toolName === 'get_channel_library') {
    const { channel_type } = toolInput as { channel_type?: string };
    let query = supabase
      .from('media_channel_library')
      .select('title, channel_type, notes')
      .order('channel_type');
    if (channel_type) query = (query as any).ilike('channel_type', `%${channel_type}%`);
    const { data } = await query;
    return { total: (data ?? []).length, entries: (data ?? []).slice(0, 10) };
  }

  if (toolName === 'get_channel_performance') {
    const { client_name } = toolInput as { client_name?: string };

    let clientQuery = supabase
      .from('clients')
      .select('id, name')
      .eq('user_id', userId);
    if (client_name) clientQuery = (clientQuery as any).ilike('name', `%${client_name}%`);

    const { data: clients } = await clientQuery;
    if (!clients?.length) return { error: 'No matching clients found' };

    const clientIds = clients.map((c: any) => c.id);
    const clientMap = new Map(clients.map((c: any) => [c.id, c.name]));

    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    const { data: metrics } = await supabase
      .from('ad_performance_metrics')
      .select('client_id, platform, spend, impressions, clicks, conversions')
      .eq('user_id', userId)
      .in('client_id', clientIds)
      .gte('date', monthStart)
      .lte('date', today)
      .not('campaign_id', 'like', 'manual-override-%');

    const spendByClient = new Map<string, { spend: number; impressions: number; clicks: number; conversions: number }>();
    for (const m of metrics ?? []) {
      const existing = spendByClient.get(m.client_id) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
      existing.spend += Number(m.spend || 0);
      existing.impressions += Number(m.impressions || 0);
      existing.clicks += Number(m.clicks || 0);
      existing.conversions += Number(m.conversions || 0);
      spendByClient.set(m.client_id, existing);
    }

    const { data: healthRows } = await supabase
      .from('client_health_status')
      .select('client_id, budget_health_percentage, status')
      .in('client_id', clientIds);

    const healthMap = new Map((healthRows ?? []).map((h: any) => [h.client_id, h]));

    return clients.map((c: any) => {
      const perf = spendByClient.get(c.id);
      const health = healthMap.get(c.id) as any;
      const spendVariancePct = health?.budget_health_percentage != null
        ? health.budget_health_percentage - 100
        : null;
      return {
        client: clientMap.get(c.id),
        actual_spend_mtd: perf?.spend ?? 0,
        spend_variance_pct: spendVariancePct !== null ? Number(spendVariancePct.toFixed(1)) : null,
        pacing_status: spendVariancePct === null ? 'no data'
          : spendVariancePct > 15 ? 'overpacing'
          : spendVariancePct < -15 ? 'underpacing'
          : 'on track',
        health: health?.status ?? 'unknown',
        impressions: perf?.impressions ?? null,
        clicks: perf?.clicks ?? null,
        conversions: perf?.conversions ?? null,
      };
    });
  }

  if (toolName === 'complete_action_point') {
    const { client_name, action_point_description, channel_type } = toolInput as {
      client_name: string;
      action_point_description: string;
      channel_type?: string;
    };

    const { data: clients } = await (supabase as any)
      .from('clients')
      .select('id, name')
      .eq('user_id', userId)
      .ilike('name', `%${client_name}%`);

    if (!clients?.length) return { error: `No client found matching "${client_name}"` };
    if (clients.length > 1) return { error: 'Multiple clients matched — be more specific.', matches: clients.map((c: any) => c.name) };

    const client = clients[0];

    let apQuery = supabase.from('action_points').select('id, text, channel_type, category');
    if (channel_type) apQuery = (apQuery as any).ilike('channel_type', `%${channel_type}%`);
    const { data: allAps } = await apQuery;

    const matches = (allAps ?? []).filter((ap: any) =>
      ap.text.toLowerCase().includes(action_point_description.toLowerCase())
    );

    if (!matches.length) return { error: `No action point found matching "${action_point_description}"` };
    if (matches.length > 1) return {
      clarification_needed: true,
      message: 'Multiple matched — which did you mean?',
      matches: matches.map((ap: any) => ({ text: ap.text, channel: ap.channel_type })),
    };

    const ap = matches[0];
    const { error: upsertErr } = await (supabase as any)
      .from('client_action_point_completions')
      .upsert(
        { client_id: client.id, action_point_id: ap.id, completed: true, completed_at: new Date().toISOString() },
        { onConflict: 'client_id,action_point_id' }
      );

    if (upsertErr) return { error: 'Failed to mark complete' };
    return { success: true, message: `✅ Marked "${ap.text}" as complete for ${client.name}` };
  }

  if (toolName === 'create_action_point') {
    const { text, channel_type, category, days_before_live_due, frequency } = toolInput as {
      text: string;
      channel_type: string;
      category: 'SET UP' | 'HEALTH CHECK';
      days_before_live_due?: number;
      frequency?: string;
    };

    const payload: Record<string, unknown> = { text: text.trim(), channel_type, category };
    if (category === 'HEALTH CHECK' && frequency) payload.frequency = frequency;
    if (category === 'SET UP' && days_before_live_due !== undefined) payload.days_before_live_due = days_before_live_due;

    const { data, error: insertErr } = await (supabase as any)
      .from('action_points')
      .insert(payload)
      .select()
      .single();

    if (insertErr) return { error: 'Failed to create action point' };
    return { success: true, message: `✅ Created "${text}" for ${channel_type}`, id: (data as any)?.id };
  }

  return { error: `Unknown tool: ${toolName}` };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const rawBody = await request.text();

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ type: 'message', text: 'Configuration error.' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // user_integrations is a new table — cast to any until types are regenerated
  const { data: integration } = await (supabase as any)
    .from('user_integrations')
    .select('teams_bot_hmac_secret')
    .eq('user_id', userId)
    .maybeSingle();

  if (!integration?.teams_bot_hmac_secret) {
    return NextResponse.json({ type: 'message', text: 'Bot not configured for this workspace.' }, { status: 403 });
  }

  // Validate HMAC signature from Teams
  const authHeader = request.headers.get('authorization');
  if (!validateTeamsHmac(rawBody, authHeader, integration.teams_bot_hmac_secret)) {
    return NextResponse.json({ type: 'message', text: 'Invalid request signature.' }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ type: 'message', text: 'Could not parse request.' }, { status: 400 });
  }

  // Strip @mention and HTML tags from the message
  const rawText = body?.text ?? body?.attachments?.[0]?.content ?? '';
  const query = stripHtml(rawText);

  if (!query) {
    return NextResponse.json({
      type: 'message',
      text: 'Hi! @mention me with a question like "which clients are underpacing?" or "what\'s overdue today?"',
    });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    let messages: Anthropic.MessageParam[] = [{ role: 'user', content: query }];

    // Tool-use loop (max 5 rounds to stay within Teams' 5s window isn't guaranteed,
    // but haiku is fast enough for 1-2 tool calls)
    for (let round = 0; round < 5; round++) {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: BOT_SYSTEM_PROMPT,
        tools: BOT_TOOL_DEFINITIONS,
        messages,
      });

      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason !== 'tool_use') {
        const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
        return NextResponse.json({ type: 'message', text: textBlock?.text ?? 'Done.' });
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        const result = await runBotTools(block.name, block.input as Record<string, unknown>, userId, supabase);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    return NextResponse.json({ type: 'message', text: 'Request processed.' });
  } catch (err: any) {
    console.error('[teams-bot] error:', err);
    return NextResponse.json({ type: 'message', text: 'Something went wrong. Try again shortly.' });
  }
}
