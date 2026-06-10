import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;

const CLIENT_AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_client_intelligence',
    description: "Fetch this client's campaign brief, goals, handover notes, and documents. Always call this first when generating an overview.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_channel_performance',
    description: 'Get channel-level performance and spend pacing for this client. Returns planned vs actual spend, variance %, and KPIs per channel.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'YYYY-MM-DD. Defaults to start of current month.' },
        end_date: { type: 'string', description: 'YYYY-MM-DD. Defaults to today.' },
      },
      required: [],
    },
  },
  {
    name: 'get_action_points',
    description: 'Get outstanding action points for this client — overdue, due soon, and upcoming tasks.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'complete_action_point',
    description: 'Mark an action point as complete for this client. Searches by partial text match.',
    input_schema: {
      type: 'object',
      properties: {
        action_point_description: { type: 'string', description: 'Partial text of the action point to complete.' },
        channel_type: { type: 'string', description: 'Optional: channel to filter by (e.g. "Meta", "Google").' },
      },
      required: ['action_point_description'],
    },
  },
  {
    name: 'update_media_plan_budget',
    description: "Update a channel's planned budget for a specific month in this client's media plan.",
    input_schema: {
      type: 'object',
      properties: {
        channel_name: { type: 'string', description: 'Channel to update (e.g. "Meta Ads", "Google Ads").' },
        month: { type: 'string', description: 'Month in YYYY-MM format.' },
        new_budget: { type: 'number', description: 'New planned budget in dollars.' },
      },
      required: ['channel_name', 'month', 'new_budget'],
    },
  },
  {
    name: 'update_manual_spend',
    description: 'Update the actual spend amount for a non-digital channel (OOH, Organic Social, EDM, etc.) by setting the manual spend value.',
    input_schema: {
      type: 'object',
      properties: {
        channel_name: { type: 'string', description: 'Channel name (partial match ok, e.g. "OOH", "Instagram", "EDM").' },
        actual_spend: { type: 'number', description: 'The actual spend amount in dollars.' },
      },
      required: ['channel_name', 'actual_spend'],
    },
  },
  {
    name: 'toggle_ooh_checklist',
    description: 'Tick or untick an OOH milestone checklist item. Items: creative_approved, artwork_submitted, site_confirmation, installation_confirmed, photo_proof.',
    input_schema: {
      type: 'object',
      properties: {
        channel_name: { type: 'string', description: 'OOH channel name (partial match ok).' },
        item_key: {
          type: 'string',
          enum: ['creative_approved', 'artwork_submitted', 'site_confirmation', 'installation_confirmed', 'photo_proof'],
          description: 'The milestone key to toggle.',
        },
        completed: { type: 'boolean', description: 'true to mark done, false to unmark.' },
      },
      required: ['channel_name', 'item_key', 'completed'],
    },
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

async function callInternal(path: string, req: NextRequest) {
  const origin = new URL(req.url).origin;
  const cookie = req.headers.get('cookie') ?? '';
  const res = await fetch(`${origin}${path}`, { headers: { cookie } });
  if (!res.ok) return { error: `API call failed: ${res.status}` };
  return res.json();
}

// ── Tool implementations ─────────────────────────────────────────────────────

async function toolGetClientIntelligence(clientId: string, req: NextRequest) {
  const origin = new URL(req.url).origin;
  const cookie = req.headers.get('cookie') ?? '';

  async function get(path: string) {
    const res = await fetch(`${origin}${path}`, { headers: { cookie } });
    return res.ok ? res.json() : null;
  }

  const [briefRes, notesRes, goalsRes, docsRes] = await Promise.all([
    get(`/api/clients/${clientId}/brief`),
    get(`/api/clients/${clientId}/notes`),
    get(`/api/clients/${clientId}/goals`),
    get(`/api/clients/${clientId}/documents`),
  ]);

  const brief = briefRes?.brief ?? null;
  const notes: any[] = notesRes?.notes ?? [];
  const goals: any[] = goalsRes?.goals ?? [];
  const channelActuals = goalsRes?.channelActuals ?? {};
  const documents: any[] = docsRes?.documents ?? [];

  const lines: string[] = ['--- CLIENT INTELLIGENCE ---', ''];

  if (brief) {
    lines.push('Campaign Brief:');
    if (brief.objectives) lines.push(`  Objectives: ${brief.objectives}`);
    if (brief.kpis) lines.push(`  KPIs: ${brief.kpis}`);
    if (brief.budget != null) lines.push(`  Budget: $${Number(brief.budget).toLocaleString()}`);
    if (brief.start_date || brief.end_date) lines.push(`  Dates: ${brief.start_date ?? 'TBD'} → ${brief.end_date ?? 'TBD'}`);
    if (brief.target_audience) lines.push(`  Audience: ${brief.target_audience}`);
    lines.push('');
  }

  const primaryGoal = goals.find((g: any) => g.channel === 'overarching' && g.is_primary);
  const channelGoals = goals.filter((g: any) => g.channel !== 'overarching');
  if (primaryGoal) {
    lines.push(`Primary Goal: ${primaryGoal.goal_type ?? 'Goal'} via ${primaryGoal.metric}`);
    if (primaryGoal.target_value != null) lines.push(`  Target: ${primaryGoal.target_value}`);
    lines.push('');
  }

  if (channelGoals.length > 0) {
    lines.push('Channel Goals:');
    for (const g of channelGoals) {
      const actual = channelActuals?.[g.channel]?.[g.metric?.toLowerCase()] ?? null;
      lines.push(`  ${g.channel} — ${g.metric}: Target ${g.target_value ?? 'N/A'} | Actual: ${actual != null ? Number(actual).toFixed(2) : 'N/A'}`);
    }
    lines.push('');
  }

  const pinnedNotes = notes.filter((n: any) => n.is_pinned);
  const otherNotes = notes.filter((n: any) => !n.is_pinned);
  const allNotes = [...pinnedNotes, ...otherNotes].slice(0, 5);
  if (allNotes.length > 0) {
    lines.push('Handover Notes & Intel:');
    for (const n of allNotes) {
      const date = new Date(n.created_at).toLocaleDateString('en-AU');
      lines.push(`  [${n.note_type ?? 'general'}] ${n.author_name} (${date}): ${n.note_body}`);
    }
    lines.push('');
  }

  const textDocs = documents.filter((d: any) => d.is_text_doc && d.text_content);
  if (textDocs.length > 0) {
    lines.push('Documents:');
    for (const d of textDocs.slice(0, 3)) {
      lines.push(`  [${d.file_name}]: ${String(d.text_content).slice(0, 300)}...`);
    }
  }

  lines.push('--- END ---');
  return { context: lines.join('\n'), summary: { has_brief: !!brief, goal_count: goals.length, note_count: notes.length, doc_count: documents.length } };
}

async function toolGetChannelPerformance(clientId: string, req: NextRequest, input: { start_date?: string; end_date?: string }) {
  const data = await callInternal(`/api/agency/clients`, req);
  if (data.error) return data;

  const clients: any[] = Array.isArray(data) ? data : (data.clients ?? []);
  const client = clients.find((c: any) => c.id === clientId || c.clientId === clientId);
  if (!client) return { error: 'Client not found in performance data' };

  return {
    client: client.name,
    health: client.health?.status ?? 'green',
    spend_variance_pct: client.spendVariancePct,
    planned_budget: client.plannedBudget,
    actual_spend: client.actualSpend,
    channels: (client.channels ?? []).map((ch: any) => ({
      name: ch.channelName,
      status: ch.status,
      start: ch.startDate,
      end: ch.endDate,
    })),
  };
}

async function toolGetActionPoints(clientId: string, req: NextRequest) {
  const data = await callInternal('/api/agency/action-points', req);
  if (data.error) return data;

  const today = new Date().toISOString().split('T')[0];
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const clientEntry = (data.clients ?? []).find((c: any) => c.clientId === clientId);
  if (!clientEntry) return { total: 0, overdue: [], due_soon: [], upcoming: [] };

  const overdue: any[] = [];
  const dueSoon: any[] = [];
  const upcoming: any[] = [];

  for (const channel of clientEntry.channels ?? []) {
    for (const ap of channel.actionPoints ?? []) {
      const item = { id: ap.id, channel: channel.channelType, task: ap.text, category: ap.category, due_date: ap.due_date };
      if (!ap.due_date) upcoming.push(item);
      else if (ap.due_date < today) overdue.push(item);
      else if (ap.due_date <= in7Days) dueSoon.push(item);
      else upcoming.push(item);
    }
  }

  return { total: overdue.length + dueSoon.length + upcoming.length, overdue, due_soon: dueSoon, upcoming: upcoming.slice(0, 10) };
}

async function toolCompleteActionPoint(clientId: string, input: { action_point_description: string; channel_type?: string }) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Unauthorized' };

  let query = supabase.from('action_points').select('id, text, channel_type, category');
  if (input.channel_type) query = (query as any).ilike('channel_type', `%${input.channel_type}%`);
  const { data: allAps } = await query;

  const matches = (allAps || []).filter((ap: any) =>
    ap.text.toLowerCase().includes(input.action_point_description.toLowerCase())
  );

  if (!matches.length) return { error: `No action point found matching "${input.action_point_description}"` };
  if (matches.length > 1) {
    return {
      clarification_needed: true,
      message: 'Multiple action points matched — which one?',
      matches: matches.map((ap: any) => ({ id: ap.id, text: ap.text, channel_type: ap.channel_type })),
    };
  }

  const ap = matches[0];
  const { error: upsertError } = await (supabase as any)
    .from('client_action_point_completions')
    .upsert(
      { client_id: clientId, action_point_id: ap.id, completed: true, completed_at: new Date().toISOString() },
      { onConflict: 'client_id,action_point_id' }
    );

  if (upsertError) return { error: 'Failed to mark as complete', details: upsertError.message };
  return { success: true, message: `Marked "${ap.text}" as complete`, action_point: { id: ap.id, text: ap.text, channel_type: ap.channel_type } };
}

async function toolUpdateMediaPlanBudget(clientId: string, input: { channel_name: string; month: string; new_budget: number }) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Unauthorized' };

  const { data: mediaPlan } = await supabase
    .from('client_media_plan_builder')
    .select('client_id, channels')
    .eq('client_id', clientId)
    .maybeSingle();

  if (!mediaPlan) return { error: 'No media plan found. Create one in the app first.' };

  const channels: any[] = JSON.parse(JSON.stringify(mediaPlan.channels || []));
  const channelIdx = channels.findIndex((ch: any) =>
    ch.channelName?.toLowerCase().includes(input.channel_name.toLowerCase())
  );

  if (channelIdx === -1) {
    return {
      error: `Channel "${input.channel_name}" not found`,
      available_channels: channels.map((ch: any) => ch.channelName).filter(Boolean),
    };
  }

  const channel = channels[channelIdx];
  const flights: any[] = channel.flights || [];
  if (!flights.length) return { error: `No flights found for ${channel.channelName}` };

  const oldBudget = flights[0].monthlySpend?.[input.month] ?? 0;
  if (!flights[0].monthlySpend) flights[0].monthlySpend = {};
  flights[0].monthlySpend[input.month] = input.new_budget;
  channels[channelIdx] = { ...channel, flights };

  const { error: updateError } = await supabase
    .from('client_media_plan_builder')
    .update({ channels })
    .eq('client_id', clientId);

  if (updateError) return { error: 'Failed to save budget update', details: updateError.message };

  return {
    success: true,
    message: `Updated ${channel.channelName} budget for ${input.month}: $${Number(oldBudget).toLocaleString()} → $${Number(input.new_budget).toLocaleString()}`,
    channel: channel.channelName,
    month: input.month,
    previous_budget: oldBudget,
    new_budget: input.new_budget,
  };
}

async function toolUpdateManualSpend(clientId: string, input: { channel_name: string; actual_spend: number }) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Unauthorized' };

  const { data: mediaPlan } = await supabase
    .from('client_media_plan_builder')
    .select('client_id, channels')
    .eq('client_id', clientId)
    .maybeSingle();

  if (!mediaPlan) return { error: 'No media plan found' };

  const channels: any[] = JSON.parse(JSON.stringify(mediaPlan.channels || []));
  const channelIdx = channels.findIndex((ch: any) =>
    ch.channelName?.toLowerCase().includes(input.channel_name.toLowerCase())
  );

  if (channelIdx === -1) {
    return {
      error: `Channel "${input.channel_name}" not found`,
      available_channels: channels.map((ch: any) => ch.channelName).filter(Boolean),
    };
  }

  const prev = channels[channelIdx].manualActualSpend ?? 0;
  channels[channelIdx] = { ...channels[channelIdx], manualActualSpend: input.actual_spend };

  const { error: updateError } = await supabase
    .from('client_media_plan_builder')
    .update({ channels })
    .eq('client_id', clientId);

  if (updateError) return { error: 'Failed to save spend update', details: updateError.message };

  return {
    success: true,
    message: `Updated actual spend for ${channels[channelIdx].channelName}: $${Number(prev).toLocaleString()} → $${Number(input.actual_spend).toLocaleString()}`,
    channel: channels[channelIdx].channelName,
    previous_spend: prev,
    new_spend: input.actual_spend,
  };
}

async function toolToggleOohChecklist(clientId: string, input: { channel_name: string; item_key: string; completed: boolean }) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Unauthorized' };

  const { data: mediaPlan } = await supabase
    .from('client_media_plan_builder')
    .select('client_id, channels')
    .eq('client_id', clientId)
    .maybeSingle();

  if (!mediaPlan) return { error: 'No media plan found' };

  const channels: any[] = JSON.parse(JSON.stringify(mediaPlan.channels || []));
  const channelIdx = channels.findIndex((ch: any) =>
    ch.channelName?.toLowerCase().includes(input.channel_name.toLowerCase())
  );

  if (channelIdx === -1) {
    return {
      error: `Channel "${input.channel_name}" not found`,
      available_channels: channels.map((ch: any) => ch.channelName).filter(Boolean),
    };
  }

  const channel = channels[channelIdx];
  const checklistItems = { ...(channel.checklistItems || {}), [input.item_key]: input.completed };
  channels[channelIdx] = { ...channel, checklistItems };

  const { error: updateError } = await supabase
    .from('client_media_plan_builder')
    .update({ channels })
    .eq('client_id', clientId);

  if (updateError) return { error: 'Failed to save checklist update', details: updateError.message };

  const LABELS: Record<string, string> = {
    creative_approved: 'Creative approved',
    artwork_submitted: 'Artwork submitted to supplier',
    site_confirmation: 'Site confirmation received',
    installation_confirmed: 'Installation confirmed',
    photo_proof: 'Photo proof received',
  };

  return {
    success: true,
    message: `${input.completed ? 'Ticked' : 'Unticked'} "${LABELS[input.item_key] ?? input.item_key}" for ${channel.channelName}`,
    channel: channel.channelName,
    item: input.item_key,
    completed: input.completed,
  };
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), { status: 500 });
  }

  const { id: clientId } = await Promise.resolve(params);

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { data: clientRow } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', clientId)
    .eq('user_id', session.user.id)
    .single();

  if (!clientRow) {
    return new Response(JSON.stringify({ error: 'Client not found' }), { status: 404 });
  }

  const clientName = clientRow.name;

  const SYSTEM_PROMPT = `You are an AI assistant embedded in the dashboard for client "${clientName}" in PlanPulse.

You are focused exclusively on this client. You have access to their intelligence hub, channel performance, action points, and can take actions to update the dashboard.

**Available actions:**
- complete_action_point — tick off tasks in their To-Do list
- update_media_plan_budget — adjust a channel's planned budget for a specific month
- update_manual_spend — update the actual spend figure on a non-digital channel (OOH, Organic Social, EDM, etc.)
- toggle_ooh_checklist — tick/untick OOH production milestones

**When generating an overview**, always call get_client_intelligence AND get_action_points first to get fresh data. Then call get_channel_performance for spend context. Synthesise into a concise briefing covering: campaign context, health status, spend pacing, outstanding action points, and any urgent concerns.

Be concise, professional, and action-oriented. Use bullet points and bold text. Lead with what needs immediate attention.`;

  const body = await request.json();
  const userMessages: Anthropic.MessageParam[] = body.messages ?? [];

  if (!userMessages.length) {
    return new Response(JSON.stringify({ error: 'No messages provided' }), { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        let messages = [...userMessages];

        while (true) {
          const anthropicStream = anthropic.messages.stream({
            model: 'claude-opus-4-7',
            system: SYSTEM_PROMPT,
            tools: CLIENT_AGENT_TOOLS,
            messages,
            max_tokens: 2048,
          });

          for await (const event of anthropicStream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              send({ type: 'text', text: event.delta.text });
            }
          }

          const finalMsg = await anthropicStream.finalMessage();
          messages.push({ role: 'assistant', content: finalMsg.content });

          if (finalMsg.stop_reason !== 'tool_use') break;

          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const block of finalMsg.content) {
            if (block.type !== 'tool_use') continue;

            send({ type: 'tool_call', tool: block.name });

            const input = block.input as any;
            let result: any;

            if (block.name === 'get_client_intelligence') {
              result = await toolGetClientIntelligence(clientId, request);
            } else if (block.name === 'get_channel_performance') {
              result = await toolGetChannelPerformance(clientId, request, input);
            } else if (block.name === 'get_action_points') {
              result = await toolGetActionPoints(clientId, request);
            } else if (block.name === 'complete_action_point') {
              result = await toolCompleteActionPoint(clientId, input);
            } else if (block.name === 'update_media_plan_budget') {
              result = await toolUpdateMediaPlanBudget(clientId, input);
            } else if (block.name === 'update_manual_spend') {
              result = await toolUpdateManualSpend(clientId, input);
            } else if (block.name === 'toggle_ooh_checklist') {
              result = await toolToggleOohChecklist(clientId, input);
            } else {
              result = { error: `Unknown tool: ${block.name}` };
            }

            const writableTools = ['complete_action_point', 'update_media_plan_budget', 'update_manual_spend', 'toggle_ooh_checklist'];
            if (writableTools.includes(block.name) && result?.success) {
              send({ type: 'action', tool: block.name, data: result });
            }

            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
          }

          messages.push({ role: 'user', content: toolResults });
        }
      } catch (err: any) {
        send({ type: 'error', message: err.message ?? 'Something went wrong' });
      }

      send({ type: 'done' });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
