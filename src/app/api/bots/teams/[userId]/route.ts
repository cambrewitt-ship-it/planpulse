import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { createHmac } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { BOT_TOOL_DEFINITIONS } from '@/lib/agent-tools';
import { sendTeamsAlert } from '@/lib/teams';

export const maxDuration = 60;

const BOT_SYSTEM_PROMPT = `You are PlanPulse, a media agency assistant responding in Microsoft Teams.

You have access to live data: client health, spend pacing, action points, and channel performance.

Rules:
- Be concise. Lead with the most important number or status.
- Use bullet points for lists, bold for client names.
- Max 5 items per list — summarise the rest as "...and N more".
- For write actions (create/complete), confirm what you did with a ✅.
- If asked something outside your tools, say so briefly.
- Never mention "tokens", "Claude", or internal system details.
- Do not use **bold** markdown — write plain text or use ALL CAPS for emphasis instead.`;

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

function stripMarkdownBold(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1');
}

function validateTeamsHmac(body: string, authHeader: string | null, secret: string): boolean {
  if (!authHeader?.startsWith('HMAC ')) return false;
  const provided = authHeader.slice(5);
  const expected = createHmac('sha256', Buffer.from(secret, 'base64'))
    .update(Buffer.from(body, 'utf8'))
    .digest('base64');
  return provided === expected;
}

function teamsResponse(text: string): NextResponse {
  return NextResponse.json({ type: 'message', text });
}

function makeSupabase() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) throw new Error('Supabase env vars missing');
  return createClient(supabaseUrl, serviceKey);
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

    const { data: allAps } = await supabase
      .from('action_points')
      .select('id, text, channel_type, category, due_date, days_before_live_due, frequency');

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

  if (toolName === 'generate_report') {
    const { client_name, start_date, end_date } = toolInput as {
      client_name: string; start_date: string; end_date: string;
    };

    const { data: clients } = await (supabase as any)
      .from('clients')
      .select('id, name')
      .eq('user_id', userId)
      .ilike('name', `%${client_name}%`);

    if (!clients?.length) return { error: `No client found matching "${client_name}"` };
    if (clients.length > 1) return { error: 'Multiple clients matched — be more specific.', matches: clients.map((c: any) => c.name) };

    const client = clients[0];

    const [healthRes, metricsRes, actionRes, completionsRes] = await Promise.all([
      supabase.from('client_health_status')
        .select('status, total_overdue_tasks, budget_health_percentage')
        .eq('client_id', client.id).maybeSingle(),
      supabase.from('ad_performance_metrics')
        .select('platform, spend')
        .eq('client_id', client.id)
        .gte('date', start_date).lte('date', end_date)
        .not('campaign_id', 'like', 'manual-override-%'),
      supabase.from('action_points').select('id, text, channel_type, due_date'),
      supabase.from('client_action_point_completions')
        .select('action_point_id').eq('client_id', client.id).eq('completed', true),
    ]);

    const health = healthRes.data;
    const metrics = metricsRes.data ?? [];
    const completedIds = new Set((completionsRes.data ?? []).map((c: any) => c.action_point_id));
    const today = new Date().toISOString().split('T')[0];
    const overdueCount = (actionRes.data ?? []).filter((ap: any) =>
      !completedIds.has(ap.id) && ap.due_date && ap.due_date < today
    ).length;

    const totalSpend = metrics.reduce((s: number, m: any) => s + Number(m.spend || 0), 0);
    const platformLabels: Record<string, string> = {
      'meta-ads': 'Meta Ads', 'google-ads': 'Google Ads',
      'linkedin-ads': 'LinkedIn Ads', 'tiktok-ads': 'TikTok Ads',
    };
    const byPlatform = new Map<string, number>();
    for (const m of metrics) {
      byPlatform.set(m.platform, (byPlatform.get(m.platform) ?? 0) + Number(m.spend || 0));
    }
    const channelLines = Array.from(byPlatform.entries())
      .filter(([, s]) => s > 0)
      .map(([p, s]) => `${platformLabels[p] ?? p}: $${s.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);

    const statusIcon = health?.status === 'red' ? 'Red' : health?.status === 'amber' ? 'Amber' : 'Green';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

    return {
      client: client.name,
      date_range: `${start_date} to ${end_date}`,
      health: statusIcon,
      budget_health_pct: health?.budget_health_percentage ?? null,
      total_spend: Math.round(totalSpend * 100) / 100,
      channels: channelLines,
      overdue_action_points: overdueCount,
      note: appUrl ? `Full PDF available in the dashboard: ${appUrl}/clients/${client.id}/dashboard` : 'Full PDF available in the PlanPulse dashboard.',
    };
  }

  if (toolName === 'generate_invoice') {
    const { client_name, start_date, end_date, spend_type = 'actual' } = toolInput as {
      client_name: string;
      start_date: string;
      end_date: string;
      spend_type?: 'actual' | 'planned';
    };

    const { data: clients } = await (supabase as any)
      .from('clients')
      .select('id, name')
      .eq('user_id', userId)
      .ilike('name', `%${client_name}%`);

    if (!clients?.length) return { error: `No client found matching "${client_name}"` };
    if (clients.length > 1) return { error: 'Multiple clients matched — be more specific.', matches: clients.map((c: any) => c.name) };

    const client = clients[0];

    const { data: mediaPlan } = await supabase
      .from('client_media_plan_builder')
      .select('channels, commission')
      .eq('client_id', client.id)
      .maybeSingle();

    const commission = mediaPlan?.commission ?? 0;

    const channels: Array<{ name: string; net: number; gross: number }> = [];

    if (spend_type === 'planned') {
      const rawChannels: any[] = mediaPlan?.channels ?? [];
      const [startY, startM, startD] = start_date.split('-').map(Number);
      const [endY, endM, endD] = end_date.split('-').map(Number);

      for (const ch of rawChannels) {
        let total = 0;
        let year = startY; let month = startM;
        while (year < endY || (year === endY && month <= endM)) {
          const daysInMonth = new Date(year, month, 0).getDate();
          const mStart = (year === startY && month === startM) ? startD : 1;
          const mEnd = (year === endY && month === endM) ? endD : daysInMonth;
          const fraction = (mEnd - mStart + 1) / daysInMonth;
          const key = `${year}-${String(month).padStart(2, '0')}`;
          const keyAlt = `${year}-${month}`;
          for (const f of ch.flights ?? []) {
            if (f.monthlySpend) {
              total += Number(f.monthlySpend[key] ?? f.monthlySpend[keyAlt] ?? 0) * fraction;
            }
          }
          month++; if (month > 12) { month = 1; year++; }
        }
        if (total > 0) {
          const gross = commission > 0 && commission < 100 ? total / (1 - commission / 100) : total;
          channels.push({ name: ch.channelName || 'Unknown', net: Math.round(total * 100) / 100, gross: Math.round(gross * 100) / 100 });
        }
      }
    } else {
      const { data: metrics } = await supabase
        .from('ad_performance_metrics')
        .select('platform, spend')
        .eq('client_id', client.id)
        .gte('date', start_date)
        .lte('date', end_date)
        .not('campaign_id', 'like', 'manual-override-%');

      const byPlatform = new Map<string, number>();
      for (const m of metrics ?? []) {
        byPlatform.set(m.platform, (byPlatform.get(m.platform) ?? 0) + Number(m.spend || 0));
      }

      const platformLabels: Record<string, string> = {
        'meta-ads': 'Meta Ads', 'google-ads': 'Google Ads',
        'linkedin-ads': 'LinkedIn Ads', 'tiktok-ads': 'TikTok Ads',
      };

      for (const [platform, net] of byPlatform) {
        if (net > 0) {
          const gross = commission > 0 && commission < 100 ? net / (1 - commission / 100) : net;
          channels.push({
            name: platformLabels[platform] ?? platform,
            net: Math.round(net * 100) / 100,
            gross: Math.round(gross * 100) / 100,
          });
        }
      }
    }

    if (!channels.length) {
      return { error: `No ${spend_type} spend data found for ${client.name} between ${start_date} and ${end_date}` };
    }

    const subtotal = channels.reduce((s, c) => s + c.net, 0);
    const totalGross = channels.reduce((s, c) => s + c.gross, 0);
    const commissionAmount = totalGross - subtotal;

    const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const lines = [
      `Invoice — ${client.name} (${start_date} to ${end_date})`,
      '',
      ...channels.map(c => `• ${c.name}: ${fmt(c.net)}`),
      '──────────────────',
      `Subtotal: ${fmt(subtotal)}`,
      ...(commission > 0 ? [`Commission (${commission}%): ${fmt(commissionAmount)}`, `Total: ${fmt(totalGross)}`] : [`Total: ${fmt(subtotal)}`]),
      '',
      `Generated: ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    ];

    return {
      formatted: lines.join('\n'),
      client_name: client.name,
      date_range: { start: start_date, end: end_date },
      channels,
      subtotal,
      commission_pct: commission,
      commission_amount: Math.round(commissionAmount * 100) / 100,
      total: Math.round(totalGross * 100) / 100,
    };
  }

  return { error: `Unknown tool: ${toolName}` };
}

async function runClaudeAsync(query: string, userId: string, webhookUrl: string): Promise<void> {
  const supabase = makeSupabase();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    let messages: Anthropic.MessageParam[] = [{ role: 'user', content: query }];

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
        const text = stripMarkdownBold(textBlock?.text ?? 'Done.');
        await sendTeamsAlert({ title: '', text, webhookUrl });
        return;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        const result = await runBotTools(block.name, block.input as Record<string, unknown>, userId, supabase);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    await sendTeamsAlert({ title: '', text: 'Request processed.', webhookUrl });
  } catch (err: any) {
    console.error('[teams-bot] async error:', err);
    await sendTeamsAlert({ title: '', text: 'Something went wrong — please try again.', webhookUrl });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const rawBody = await request.text();

  let supabase: any;
  try {
    supabase = makeSupabase();
  } catch {
    return teamsResponse('Configuration error.');
  }

  const { data: integration } = await (supabase as any)
    .from('user_integrations')
    .select('teams_bot_hmac_secret, teams_webhook_url')
    .eq('user_id', userId)
    .maybeSingle();

  if (!integration?.teams_bot_hmac_secret) {
    return teamsResponse('Bot not configured for this workspace.');
  }

  const authHeader = request.headers.get('authorization');
  if (!validateTeamsHmac(rawBody, authHeader, integration.teams_bot_hmac_secret)) {
    return NextResponse.json({ type: 'message', text: 'Invalid request signature.' }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return teamsResponse('Could not parse request.');
  }

  const rawText = body?.text ?? body?.attachments?.[0]?.content ?? '';
  const query = stripHtml(rawText);

  if (!query) {
    return teamsResponse('Hi! Ask me anything about your campaigns — e.g. "which clients are underpacing?" or "what\'s overdue today?"');
  }

  const webhookUrl = integration.teams_webhook_url;

  if (!webhookUrl) {
    // No webhook URL — try synchronous (may time out on complex queries)
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    try {
      let messages: Anthropic.MessageParam[] = [{ role: 'user', content: query }];
      for (let round = 0; round < 3; round++) {
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
          return teamsResponse(stripMarkdownBold(textBlock?.text ?? 'Done.'));
        }
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;
          const result = await runBotTools(block.name, block.input as Record<string, unknown>, userId, supabase);
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
        }
        messages.push({ role: 'user', content: toolResults });
      }
      return teamsResponse('Request processed.');
    } catch (err: any) {
      console.error('[teams-bot] sync error:', err);
      return teamsResponse('Something went wrong. Try again shortly.');
    }
  }

  // Async path: ACK immediately, process in background
  waitUntil(runClaudeAsync(query, userId, webhookUrl));
  return teamsResponse('⏳ On it...');
}
