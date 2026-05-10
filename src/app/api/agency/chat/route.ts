import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are an AI assistant embedded in a digital media agency's management platform called PlanPulse. You have real-time access to the agency's client data, campaigns, action points, and channel library.

You help the team with:
- Daily briefings on client status and health
- Checking outstanding and overdue action points
- Client campaign performance and spend pacing
- Channel-level performance health checks (spend vs plan, KPIs, pacing status)
- Media channel specifications and best practices from the agency library
- Guidance on how to use the platform

Client health indicators:
- Red: Significant issues (spend variance >15%, overdue setup tasks)
- Amber: Minor concerns requiring attention
- Green: On track

Channel health is based on spend pacing relative to plan:
- Overpacing (>15% above plan): flag as concern
- Underpacing (>15% below plan): flag as concern
- On track: within 15% of planned spend

Action points have due dates calculated from channel start dates — SET UP tasks are due N days before a channel goes live, HEALTH CHECK tasks recur on a schedule. Always fetch fresh data before answering questions about action points or client status.

When asked about channel performance, spend, metrics, or pacing — always use get_channel_performance to pull live data.

Be concise, professional, and actionable. Use bullet points and bold text to make responses scannable.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_daily_briefing',
    description: 'Get a full daily briefing: all clients, health status, overdue action points, upcoming tasks, and pacing issues. Use this for morning briefings or "how are we doing" questions.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_action_points',
    description: 'Get all outstanding action points with their calculated due dates. Returns overdue items, due-soon items, and all outstanding tasks grouped by client. Always use this when asked about tasks, to-dos, action points, or overdue items.',
    input_schema: {
      type: 'object',
      properties: {
        client_name: {
          type: 'string',
          description: 'Filter to a specific client by partial name match. Omit for all clients.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_client_status',
    description: 'Get health status, spend variance, and channel information for all clients or a specific client.',
    input_schema: {
      type: 'object',
      properties: {
        client_name: {
          type: 'string',
          description: 'Filter by partial client name. Omit for all clients.',
        },
        status_filter: {
          type: 'string',
          enum: ['red', 'amber', 'green'],
          description: 'Filter by health status. Omit for all.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_channel_library',
    description: 'Look up media channel specifications, best practices, and notes from the agency library.',
    input_schema: {
      type: 'object',
      properties: {
        channel_type: {
          type: 'string',
          description: 'Filter by channel type (e.g. "Facebook", "Google"). Omit for all entries.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_channel_performance',
    description: 'Get channel-level performance and spend health for a client. Returns per-channel: planned budget, actual spend, spend variance %, pacing status, and performance KPIs (impressions, clicks, CTR, conversions, CPC, CPM). Use this whenever asked about channel performance, spend pacing, channel health, or specific channel metrics.',
    input_schema: {
      type: 'object',
      properties: {
        client_name: {
          type: 'string',
          description: 'Filter to a specific client by partial name match. Omit for all clients.',
        },
        channel_name: {
          type: 'string',
          description: 'Filter to a specific channel (e.g. "Meta", "Google", "LinkedIn"). Omit for all channels.',
        },
        start_date: {
          type: 'string',
          description: 'Start of date range in YYYY-MM-DD format. Defaults to start of current month.',
        },
        end_date: {
          type: 'string',
          description: 'End of date range in YYYY-MM-DD format. Defaults to today.',
        },
      },
      required: [],
    },
  },
];

// ── Tool implementations — call existing API endpoints ──────────────────────

async function callInternalApi(path: string, request: NextRequest): Promise<any> {
  const origin = new URL(request.url).origin;
  const cookieHeader = request.headers.get('cookie') ?? '';
  const res = await fetch(`${origin}${path}`, {
    headers: { cookie: cookieHeader },
  });
  if (!res.ok) return { error: `API call failed: ${res.status}` };
  return res.json();
}

async function toolGetActionPoints(request: NextRequest, clientNameFilter?: string) {
  const data = await callInternalApi('/api/agency/action-points', request);
  if (data.error) return data;

  const today = new Date().toISOString().split('T')[0];
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  let clients: any[] = data.clients ?? [];

  if (clientNameFilter) {
    clients = clients.filter((c: any) =>
      c.clientName.toLowerCase().includes(clientNameFilter.toLowerCase())
    );
  }

  const overdue: any[] = [];
  const dueSoon: any[] = [];
  const upcoming: any[] = [];

  for (const client of clients) {
    for (const channel of client.channels ?? []) {
      for (const ap of channel.actionPoints ?? []) {
        const item = {
          client: client.clientName,
          channel: channel.channelType,
          task: ap.text,
          category: ap.category,
          due_date: ap.due_date,
        };
        if (!ap.due_date) {
          upcoming.push(item);
        } else if (ap.due_date < today) {
          overdue.push(item);
        } else if (ap.due_date <= in7Days) {
          dueSoon.push(item);
        } else {
          upcoming.push(item);
        }
      }
    }
  }

  return {
    today,
    overdue_count: overdue.length,
    due_within_7_days_count: dueSoon.length,
    overdue_items: overdue,
    due_soon_items: dueSoon,
    other_outstanding: upcoming.slice(0, 20),
    total_outstanding: overdue.length + dueSoon.length + upcoming.length,
  };
}

async function toolGetClientStatus(request: NextRequest, input: { client_name?: string; status_filter?: string }) {
  const params = new URLSearchParams();
  if (input.status_filter) params.set('status', input.status_filter);

  const data = await callInternalApi(`/api/agency/clients?${params}`, request);
  if (data.error) return data;

  let clients: any[] = Array.isArray(data) ? data : [];

  if (input.client_name) {
    clients = clients.filter((c: any) =>
      c.name?.toLowerCase().includes(input.client_name!.toLowerCase())
    );
  }

  return clients.map((c: any) => ({
    name: c.name,
    health: c.health?.status ?? 'green',
    health_reason: c.health?.reason ?? null,
    spend_variance_pct: c.spendVariancePct,
    planned_budget: c.plannedBudget,
    actual_spend: c.actualSpend,
    channels: (c.channels ?? []).map((ch: any) => ({
      name: ch.channelName,
      status: ch.status,
      start: ch.startDate,
      end: ch.endDate,
    })),
    outstanding_action_points: c.totalActionPoints,
    completed_action_points: c.completedActionPoints,
    account_manager: c.account_manager,
  }));
}

async function toolGetDailyBriefing(request: NextRequest) {
  const [actionData, clientData] = await Promise.all([
    toolGetActionPoints(request),
    toolGetClientStatus(request, {}),
  ]);

  const clients = Array.isArray(clientData) ? clientData : [];
  const redClients = clients.filter((c: any) => c.health === 'red');
  const amberClients = clients.filter((c: any) => c.health === 'amber');
  const greenClients = clients.filter((c: any) => c.health === 'green');

  const overpacing = clients.filter((c: any) => c.spend_variance_pct !== null && c.spend_variance_pct > 15);
  const underpacing = clients.filter((c: any) => c.spend_variance_pct !== null && c.spend_variance_pct < -15);

  const today = new Date().toISOString().split('T')[0];
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const launchingSoon = clients.flatMap((c: any) =>
    (c.channels ?? [])
      .filter((ch: any) => ch.status === 'upcoming' && ch.start && ch.start >= today && ch.start <= in7Days)
      .map((ch: any) => ({ client: c.name, channel: ch.name, launch_date: ch.start }))
  );

  return {
    date: today,
    client_summary: { total: clients.length, red: redClients.length, amber: amberClients.length, green: greenClients.length },
    red_clients: redClients.map((c: any) => ({ name: c.name, reason: c.health_reason })),
    amber_clients: amberClients.map((c: any) => ({ name: c.name, reason: c.health_reason })),
    overdue_action_points: actionData.overdue_count ?? 0,
    overdue_items: actionData.overdue_items ?? [],
    due_within_7_days: actionData.due_within_7_days_count ?? 0,
    due_soon_items: actionData.due_soon_items ?? [],
    overpacing_clients: overpacing.map((c: any) => ({ name: c.name, variance: `+${c.spend_variance_pct?.toFixed(1)}%` })),
    underpacing_clients: underpacing.map((c: any) => ({ name: c.name, variance: `${c.spend_variance_pct?.toFixed(1)}%` })),
    channels_launching_soon: launchingSoon,
  };
}

function platformToChannelName(platform: string): string {
  if (platform === 'meta-ads') return 'Meta Ads';
  if (platform === 'google-ads') return 'Google Ads';
  if (platform === 'linkedin-ads') return 'LinkedIn Ads';
  if (platform === 'tiktok-ads') return 'TikTok Ads';
  return platform;
}

function channelNameToPlatform(channelName: string): string | null {
  const lower = channelName.toLowerCase();
  if (lower.includes('meta') || lower.includes('facebook') || lower.includes('instagram')) return 'meta-ads';
  if (lower.includes('google')) return 'google-ads';
  if (lower.includes('linkedin')) return 'linkedin-ads';
  if (lower.includes('tiktok')) return 'tiktok-ads';
  return null;
}

async function toolGetChannelPerformance(
  request: NextRequest,
  input: { client_name?: string; channel_name?: string; start_date?: string; end_date?: string }
) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Unauthorized' };

  const today = new Date().toISOString().split('T')[0];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const startDate = input.start_date || monthStart;
  const endDate = input.end_date || today;

  // Resolve clients
  const { data: clientsData } = await supabase
    .from('clients')
    .select('id, name')
    .eq('user_id', session.user.id);

  let clients: { id: string; name: string }[] = clientsData || [];
  if (input.client_name) {
    clients = clients.filter(c => c.name.toLowerCase().includes(input.client_name!.toLowerCase()));
  }
  if (clients.length === 0) return { error: 'No matching clients found' };

  const clientIds = clients.map(c => c.id);
  const clientMap = new Map(clients.map(c => [c.id, c.name]));

  // Get media plans (planned budgets per channel)
  const { data: mediaPlans } = await supabase
    .from('client_media_plan_builder')
    .select('client_id, channels')
    .in('client_id', clientIds);

  // Get actual performance metrics
  const { data: metricsRows } = await supabase
    .from('ad_performance_metrics')
    .select('client_id, platform, spend, impressions, clicks, ctr, conversions, reach, cpc, cpm, average_cpc, frequency, date')
    .eq('user_id', session.user.id)
    .in('client_id', clientIds)
    .gte('date', startDate)
    .lte('date', endDate)
    .not('campaign_id', 'like', 'manual-override-%');

  // Aggregate actual metrics by client + platform
  const actualByClientPlatform = new Map<string, {
    spend: number; impressions: number; clicks: number; conversions: number;
    reach: number; cpm_sum: number; cpm_count: number; cpc_sum: number; cpc_count: number; days: number;
  }>();

  for (const row of metricsRows || []) {
    if (!row.client_id) continue;
    const key = `${row.client_id}::${row.platform}`;
    const existing = actualByClientPlatform.get(key) || {
      spend: 0, impressions: 0, clicks: 0, conversions: 0,
      reach: 0, cpm_sum: 0, cpm_count: 0, cpc_sum: 0, cpc_count: 0, days: 0,
    };
    existing.spend += Number(row.spend || 0);
    existing.impressions += Number(row.impressions || 0);
    existing.clicks += Number(row.clicks || 0);
    existing.conversions += Number(row.conversions || 0);
    existing.reach += Number(row.reach || 0);
    if (row.cpm) { existing.cpm_sum += Number(row.cpm); existing.cpm_count++; }
    if (row.cpc) { existing.cpc_sum += Number(row.cpc); existing.cpc_count++; }
    existing.days++;
    actualByClientPlatform.set(key, existing);
  }

  // Build per-channel results
  const channels: any[] = [];

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthNum = now.getMonth() + 1;
  const unpaddedKey = `${currentYear}-${currentMonthNum}`;
  const paddedKey = `${currentYear}-${String(currentMonthNum).padStart(2, '0')}`;

  for (const plan of mediaPlans || []) {
    const clientName = clientMap.get(plan.client_id) || 'Unknown';
    const rawChannels: any[] = (plan.channels as any[]) || [];

    for (const ch of rawChannels) {
      if (!ch.channelName) continue;

      // Optional filter by channel name
      if (input.channel_name && !ch.channelName.toLowerCase().includes(input.channel_name.toLowerCase())) continue;

      const platform = channelNameToPlatform(ch.channelName);

      // Planned budget for current month from flights
      let plannedBudget = 0;
      const flights: any[] = ch.flights || [];
      for (const f of flights) {
        if (f.monthlySpend && typeof f.monthlySpend === 'object') {
          plannedBudget += Number(f.monthlySpend[paddedKey] || f.monthlySpend[unpaddedKey] || 0);
        }
      }

      // Channel status
      const startDates = flights.map((f: any) => f.startWeek).filter(Boolean).map((s: string) => s.split('T')[0]).sort();
      const endDates = flights.map((f: any) => f.endWeek).filter(Boolean).map((s: string) => s.split('T')[0]).sort();
      const earliestStart = startDates[0] || null;
      const latestEnd = endDates[endDates.length - 1] || null;
      let channelStatus: 'live' | 'upcoming' | 'ended' | 'no dates' = 'no dates';
      if (earliestStart) {
        if (latestEnd && latestEnd < today) channelStatus = 'ended';
        else if (earliestStart <= today) channelStatus = 'live';
        else channelStatus = 'upcoming';
      }

      // Actual metrics
      const actualKey = platform ? `${plan.client_id}::${platform}` : null;
      const actual = actualKey ? actualByClientPlatform.get(actualKey) : null;
      const actualSpend = actual?.spend ?? 0;

      // Spend variance
      const variancePct = plannedBudget > 0 ? ((actualSpend - plannedBudget) / plannedBudget) * 100 : null;

      let pacingStatus: string;
      if (variancePct === null) pacingStatus = 'no plan';
      else if (variancePct > 15) pacingStatus = 'overpacing';
      else if (variancePct < -15) pacingStatus = 'underpacing';
      else pacingStatus = 'on track';

      // Computed KPIs
      const ctr = actual && actual.impressions > 0 ? (actual.clicks / actual.impressions) * 100 : null;
      const cpc = actual && actual.clicks > 0 ? actual.spend / actual.clicks : null;
      const cpm = actual && actual.impressions > 0 ? (actual.spend / actual.impressions) * 1000 : null;

      channels.push({
        client: clientName,
        channel: ch.channelName,
        platform: platform ?? 'unknown',
        status: channelStatus,
        date_range: { start: startDate, end: endDate },
        planned_budget: plannedBudget > 0 ? Number(plannedBudget.toFixed(2)) : null,
        actual_spend: Number(actualSpend.toFixed(2)),
        spend_variance_pct: variancePct !== null ? Number(variancePct.toFixed(1)) : null,
        pacing_status: pacingStatus,
        impressions: actual?.impressions ?? null,
        clicks: actual?.clicks ?? null,
        ctr_pct: ctr !== null ? Number(ctr.toFixed(2)) : null,
        cpc: cpc !== null ? Number(cpc.toFixed(2)) : null,
        cpm: cpm !== null ? Number(cpm.toFixed(2)) : null,
        conversions: actual?.conversions ?? null,
        reach: actual?.reach ?? null,
        start_date: earliestStart,
        end_date: latestEnd,
      });
    }
  }

  if (channels.length === 0) {
    return { message: 'No channel data found for the specified filters.', channels: [] };
  }

  const overpacing = channels.filter(c => c.pacing_status === 'overpacing');
  const underpacing = channels.filter(c => c.pacing_status === 'underpacing');
  const onTrack = channels.filter(c => c.pacing_status === 'on track');
  const noData = channels.filter(c => c.actual_spend === 0 && c.planned_budget);

  return {
    date_range: { start: startDate, end: endDate },
    summary: {
      total_channels: channels.length,
      overpacing: overpacing.length,
      underpacing: underpacing.length,
      on_track: onTrack.length,
      no_spend_data: noData.length,
    },
    channels,
  };
}

async function toolGetChannelLibrary(request: NextRequest, input: { channel_type?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from('media_channel_library')
    .select('title, channel_type, notes')
    .order('channel_type');

  if (input.channel_type) {
    query = query.ilike('channel_type', `%${input.channel_type}%`);
  }

  const { data, error } = await query;
  if (error) return { error: 'Failed to fetch channel library' };

  return { total: (data ?? []).length, entries: (data ?? []).slice(0, 20) };
}

// ── Route handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured' }), { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const body = await request.json();
  const userMessages: Anthropic.MessageParam[] = body.messages ?? [];
  if (!userMessages.length) {
    return new Response(JSON.stringify({ error: 'No messages provided' }), { status: 400 });
  }

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
            tools: TOOLS,
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

            let result: any;
            const input = block.input as any;

            if (block.name === 'get_daily_briefing') {
              result = await toolGetDailyBriefing(request);
            } else if (block.name === 'get_action_points') {
              result = await toolGetActionPoints(request, input.client_name);
            } else if (block.name === 'get_client_status') {
              result = await toolGetClientStatus(request, input);
            } else if (block.name === 'get_channel_library') {
              result = await toolGetChannelLibrary(request, input);
            } else if (block.name === 'get_channel_performance') {
              result = await toolGetChannelPerformance(request, input);
            } else {
              result = { error: `Unknown tool: ${block.name}` };
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
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
