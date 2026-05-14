import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are an AI assistant embedded in a digital media agency's management platform called PlanPulse. You have real-time access to the agency's client data, campaigns, action points, and channel library. You can also take actions directly in the platform.

You help the team with:
- Daily briefings on client status and health
- Checking outstanding and overdue action points
- Client campaign performance and spend pacing
- Channel-level performance health checks (spend vs plan, KPIs, pacing status)
- Media channel specifications and best practices from the agency library
- Guidance on how to use the platform

You can also take actions:
- Complete action points: Mark tasks as done for specific clients using complete_action_point
- Create new clients: Add new clients to the platform using create_client
- Update budgets: Adjust channel budgets in media plans for specific months using update_media_plan_budget
- View live Meta campaigns: Fetch current campaign data directly from the Meta Ads API using get_live_meta_campaigns

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

Multi-step workflow patterns:
- "Onboard [client]": Use create_client to create them, then explain what to do next (add media plan channels + budgets in the app, connect ad accounts, assign account manager)
- "Health check [client]": Use get_channel_performance + get_action_points, identify issues, offer to complete tasks that are resolved
- "End of month review": Use get_daily_briefing + get_channel_performance for all clients, synthesise and flag issues
- "Sort out tasks for [client]": Use get_action_points to list overdue items, then use complete_action_point for any the user confirms are done
- When completing action points for multiple items, you can call complete_action_point multiple times in parallel

Always confirm what you've done after taking a write action. If a request is ambiguous (e.g. multiple clients or action points match), ask for clarification before acting.

Be concise, professional, and actionable. Use bullet points and bold text to make responses scannable.

Client Intelligence: When working on a specific client, call get_client_intelligence to fetch their campaign brief, goals, handover notes, and documents. Prepend this context to your analysis so your responses are grounded in the client's actual objectives and commitments.`;

const TOOLS: Anthropic.Tool[] = [
  // ── Read tools ───────────────────────────────────────────────────────────────
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

  // ── Write / action tools (Tier 1) ─────────────────────────────────────────
  {
    name: 'complete_action_point',
    description: 'Mark a specific action point as complete for a client. Use when the user says something is done, finished, sorted, or no longer needed. Searches for the action point by partial text match. If multiple match, returns options for clarification.',
    input_schema: {
      type: 'object',
      properties: {
        client_name: {
          type: 'string',
          description: 'The client name (partial match is fine).',
        },
        action_point_description: {
          type: 'string',
          description: 'Partial text of the action point to complete (e.g. "health check", "pixel", "tracking setup").',
        },
        channel_type: {
          type: 'string',
          description: 'Optional: filter to a specific channel (e.g. "Meta", "Google"). Helps disambiguate if multiple action points match.',
        },
      },
      required: ['client_name', 'action_point_description'],
    },
  },
  {
    name: 'create_client',
    description: 'Create a new client in PlanPulse. Use when the user wants to onboard a new client or add a new client to the system.',
    input_schema: {
      type: 'object',
      properties: {
        client_name: {
          type: 'string',
          description: 'The name of the new client.',
        },
      },
      required: ['client_name'],
    },
  },
  {
    name: 'update_media_plan_budget',
    description: 'Update a channel\'s planned budget for a specific month in a client\'s media plan. Use when the user wants to adjust, change, or set a budget for a channel. Month must be in YYYY-MM format (e.g. "2026-06" for June 2026).',
    input_schema: {
      type: 'object',
      properties: {
        client_name: {
          type: 'string',
          description: 'The client name (partial match is fine).',
        },
        channel_name: {
          type: 'string',
          description: 'The channel to update (e.g. "Meta", "Google Ads", "LinkedIn").',
        },
        month: {
          type: 'string',
          description: 'The month to update in YYYY-MM format (e.g. "2026-06").',
        },
        new_budget: {
          type: 'number',
          description: 'The new planned budget amount in dollars.',
        },
      },
      required: ['client_name', 'channel_name', 'month', 'new_budget'],
    },
  },

  {
    name: 'create_action_point',
    description: 'Create a new action point task that will appear for all clients running that channel. Use when the user wants to add a new recurring health check or a new setup task to the agency workflow.',
    input_schema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The task description (e.g. "Check attribution window settings").',
        },
        channel_type: {
          type: 'string',
          description: 'The channel this applies to (e.g. "Meta Ads", "Google Ads", "LinkedIn Ads").',
        },
        category: {
          type: 'string',
          enum: ['SET UP', 'HEALTH CHECK'],
          description: 'SET UP for one-time pre-launch tasks, HEALTH CHECK for recurring checks.',
        },
        days_before_live_due: {
          type: 'number',
          description: 'SET UP only: how many days before channel launch the task is due.',
        },
        frequency: {
          type: 'string',
          enum: ['weekly', 'fortnightly', 'monthly'],
          description: 'HEALTH CHECK only: how often the task recurs.',
        },
      },
      required: ['text', 'channel_type', 'category'],
    },
  },

  // ── Client Intelligence Hub (Tier 2) ─────────────────────────────────────
  {
    name: 'get_client_intelligence',
    description: 'Fetch the Client Intelligence Hub data for a specific client: campaign brief (objectives, KPIs, budget, dates, target audience, brief body, lock status), campaign goals with floor/target/stretch and current actual values, handover notes and client intel (pinned first, then reverse-chronological), and documents on file. Use this whenever you need rich context about a specific client\'s campaign strategy, commitments, or background.',
    input_schema: {
      type: 'object',
      properties: {
        client_name: {
          type: 'string',
          description: 'The client name (partial match is fine).',
        },
      },
      required: ['client_name'],
    },
  },

  // ── Live ad platform data (Tier 3) ────────────────────────────────────────
  {
    name: 'get_live_meta_campaigns',
    description: 'Fetch live campaign data directly from the Meta Ads API. Returns current campaign names, status, and account info. Use when asked about Meta campaigns, what campaigns are running, or to check live Meta campaign status.',
    input_schema: {
      type: 'object',
      properties: {
        status_filter: {
          type: 'string',
          enum: ['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED'],
          description: 'Filter campaigns by effective status. Omit for all.',
        },
        account_name: {
          type: 'string',
          description: 'Filter to campaigns under a specific ad account by partial name match. Omit for all accounts.',
        },
      },
      required: [],
    },
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

async function callInternalApi(path: string, request: NextRequest): Promise<any> {
  const origin = new URL(request.url).origin;
  const cookieHeader = request.headers.get('cookie') ?? '';
  const res = await fetch(`${origin}${path}`, {
    headers: { cookie: cookieHeader },
  });
  if (!res.ok) return { error: `API call failed: ${res.status}` };
  return res.json();
}

// ── Read tool implementations ─────────────────────────────────────────────────

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
          id: ap.id,
          client: client.clientName,
          client_id: client.clientId,
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

  let clients: any[] = Array.isArray(data) ? data : (data.clients ?? []);

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

function channelNameToPlatform(channelName: string): string | null {
  const lower = channelName.toLowerCase();
  if (lower.includes('meta') || lower.includes('facebook') || lower.includes('instagram')) return 'meta-ads';
  if (lower.includes('google')) return 'google-ads';
  if (lower.includes('linkedin')) return 'linkedin-ads';
  if (lower.includes('tiktok')) return 'tiktok-ads';
  return null;
}

function getMonthsInRange(startDate: string, endDate: string): Array<{ padded: string; unpadded: string }> {
  const months: Array<{ padded: string; unpadded: string }> = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur.getFullYear() < end.getFullYear() ||
    (cur.getFullYear() === end.getFullYear() && cur.getMonth() <= end.getMonth())) {
    const y = cur.getFullYear();
    const m = cur.getMonth() + 1;
    months.push({ padded: `${y}-${String(m).padStart(2, '0')}`, unpadded: `${y}-${m}` });
    cur = new Date(y, m, 1);
  }
  return months;
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

  const { data: mediaPlans } = await supabase
    .from('client_media_plan_builder')
    .select('client_id, channels')
    .in('client_id', clientIds);

  const { data: metricsRows } = await supabase
    .from('ad_performance_metrics')
    .select('client_id, platform, spend, impressions, clicks, ctr, conversions, reach, cpc, cpm, average_cpc, frequency, date')
    .eq('user_id', session.user.id)
    .in('client_id', clientIds)
    .gte('date', startDate)
    .lte('date', endDate)
    .not('campaign_id', 'like', 'manual-override-%');

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

  const monthsInRange = getMonthsInRange(startDate, endDate);

  // First pass: collect per-channel data with per-channel planned budgets
  // Key: client::platform — used to aggregate multiple plan lines on the same platform
  const platformGroups = new Map<string, {
    client: string;
    line_items: string[];
    platform: string;
    status: string;
    planned_budget: number;
    actual: typeof actualByClientPlatform extends Map<string, infer V> ? V : never;
    start_date: string | null;
    end_date: string | null;
  }>();

  for (const plan of mediaPlans || []) {
    const clientName = clientMap.get(plan.client_id) || 'Unknown';
    const rawChannels: any[] = (plan.channels as any[]) || [];

    for (const ch of rawChannels) {
      if (!ch.channelName) continue;
      if (input.channel_name && !ch.channelName.toLowerCase().includes(input.channel_name.toLowerCase())) continue;

      const platform = channelNameToPlatform(ch.channelName);

      // Sum planned budget across every month in the requested date range
      let plannedBudget = 0;
      const flights: any[] = ch.flights || [];
      for (const f of flights) {
        if (f.monthlySpend && typeof f.monthlySpend === 'object') {
          for (const { padded, unpadded } of monthsInRange) {
            plannedBudget += Number(f.monthlySpend[padded] || f.monthlySpend[unpadded] || 0);
          }
        }
      }

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

      const actualKey = platform ? `${plan.client_id}::${platform}` : null;
      const actual = (actualKey ? actualByClientPlatform.get(actualKey) : null) as any;

      // Aggregate channels that share a platform (actual spend is always platform-level)
      const groupKey = `${clientName}::${platform ?? ch.channelName}`;
      if (!platformGroups.has(groupKey)) {
        platformGroups.set(groupKey, {
          client: clientName,
          line_items: [ch.channelName],
          platform: platform ?? 'unknown',
          status: channelStatus,
          planned_budget: plannedBudget,
          actual,
          start_date: earliestStart,
          end_date: latestEnd,
        });
      } else {
        const group = platformGroups.get(groupKey)!;
        group.line_items.push(ch.channelName);
        group.planned_budget += plannedBudget;
        if (channelStatus === 'live') group.status = 'live';
        if (earliestStart && (!group.start_date || earliestStart < group.start_date)) group.start_date = earliestStart;
        if (latestEnd && (!group.end_date || latestEnd > group.end_date)) group.end_date = latestEnd;
      }
    }
  }

  const channels: any[] = Array.from(platformGroups.values()).map(group => {
    const actualSpend = group.actual?.spend ?? 0;
    const variancePct = group.planned_budget > 0 ? ((actualSpend - group.planned_budget) / group.planned_budget) * 100 : null;
    const pacingStatus = variancePct === null ? 'no plan'
      : variancePct > 15 ? 'overpacing'
      : variancePct < -15 ? 'underpacing'
      : 'on track';

    const impressions = group.actual?.impressions ?? null;
    const clicks = group.actual?.clicks ?? null;
    const conversions = group.actual?.conversions ?? null;
    const reach = group.actual?.reach ?? null;
    const ctr = impressions && impressions > 0 ? (clicks! / impressions) * 100 : null;
    const cpc = clicks && clicks > 0 ? actualSpend / clicks : null;
    const cpm = impressions && impressions > 0 ? (actualSpend / impressions) * 1000 : null;

    return {
      client: group.client,
      channel: group.line_items.length > 1 ? group.line_items.join(' + ') : group.line_items[0],
      platform: group.platform,
      status: group.status,
      date_range: { start: startDate, end: endDate },
      planned_budget: group.planned_budget > 0 ? Number(group.planned_budget.toFixed(2)) : null,
      actual_spend: Number(actualSpend.toFixed(2)),
      spend_variance_pct: variancePct !== null ? Number(variancePct.toFixed(1)) : null,
      pacing_status: pacingStatus,
      impressions,
      clicks,
      ctr_pct: ctr !== null ? Number(ctr.toFixed(2)) : null,
      cpc: cpc !== null ? Number(cpc.toFixed(2)) : null,
      cpm: cpm !== null ? Number(cpm.toFixed(2)) : null,
      conversions,
      reach,
      start_date: group.start_date,
      end_date: group.end_date,
      ...(group.line_items.length > 1 && {
        plan_lines: group.line_items,
        note: `Planned budget is the combined total of ${group.line_items.length} plan lines. Actual spend is at the platform level.`,
      }),
    };
  });

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

// ── Write / action tool implementations (Tier 1) ──────────────────────────────

async function toolCompleteActionPoint(
  _request: NextRequest,
  input: { client_name: string; action_point_description: string; channel_type?: string }
) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Unauthorized' };

  // Find the client
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .eq('user_id', session.user.id)
    .ilike('name', `%${input.client_name}%`);

  if (!clients?.length) return { error: `No client found matching "${input.client_name}"` };
  if (clients.length > 1) return {
    error: 'Multiple clients matched — be more specific.',
    matches: clients.map((c: any) => c.name),
  };

  const client = clients[0];

  // Search action points by text
  let query = supabase.from('action_points').select('id, text, channel_type, category');
  if (input.channel_type) {
    query = (query as any).ilike('channel_type', `%${input.channel_type}%`);
  }
  const { data: allAps } = await query;

  const matches = (allAps || []).filter((ap: any) =>
    ap.text.toLowerCase().includes(input.action_point_description.toLowerCase())
  );

  if (!matches.length) {
    return { error: `No action point found matching "${input.action_point_description}". Try a different keyword.` };
  }

  if (matches.length > 1) {
    return {
      clarification_needed: true,
      message: 'Multiple action points matched — which one did you mean?',
      matches: matches.map((ap: any) => ({ id: ap.id, text: ap.text, channel_type: ap.channel_type })),
    };
  }

  const ap = matches[0];

  const { error: upsertError } = await (supabase as any)
    .from('client_action_point_completions')
    .upsert(
      {
        client_id: client.id,
        action_point_id: ap.id,
        completed: true,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'client_id,action_point_id' }
    );

  if (upsertError) return { error: 'Failed to mark as complete', details: upsertError.message };

  return {
    success: true,
    message: `Marked "${ap.text}" as complete for ${client.name}`,
    action_point: { id: ap.id, text: ap.text, channel_type: ap.channel_type, category: ap.category },
    client: client.name,
  };
}

async function toolCreateClient(
  _request: NextRequest,
  input: { client_name: string }
) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Unauthorized' };

  if (!input.client_name?.trim()) return { error: 'client_name is required' };

  // Check for duplicates
  const { data: existing } = await supabase
    .from('clients')
    .select('id, name')
    .eq('user_id', session.user.id)
    .ilike('name', input.client_name.trim());

  if (existing?.length) {
    return {
      error: `A client named "${existing[0].name}" already exists`,
      existing_client_id: existing[0].id,
    };
  }

  const { data, error } = await supabase
    .from('clients')
    .insert({ name: input.client_name.trim(), user_id: session.user.id })
    .select()
    .single();

  if (error) return { error: 'Failed to create client', details: error.message };

  return {
    success: true,
    message: `Created new client "${data.name}"`,
    client: { id: data.id, name: data.name },
    next_steps: [
      'Open the client in PlanPulse to build their media plan (add channels, budgets, and flight dates)',
      'Connect their ad accounts (Meta Ads, Google Ads, LinkedIn) via Settings → Integrations',
      'Assign an account manager in the client settings',
    ],
  };
}

async function toolUpdateMediaPlanBudget(
  _request: NextRequest,
  input: { client_name: string; channel_name: string; month: string; new_budget: number }
) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Unauthorized' };

  // Find client
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .eq('user_id', session.user.id)
    .ilike('name', `%${input.client_name}%`);

  if (!clients?.length) return { error: `No client found matching "${input.client_name}"` };
  if (clients.length > 1) return { error: 'Multiple clients matched', matches: clients.map((c: any) => c.name) };

  const client = clients[0];

  // Fetch media plan
  const { data: mediaPlan } = await supabase
    .from('client_media_plan_builder')
    .select('client_id, channels')
    .eq('client_id', client.id)
    .maybeSingle();

  if (!mediaPlan) {
    return { error: `No media plan found for ${client.name}. Create one in the app first.` };
  }

  const channels: any[] = JSON.parse(JSON.stringify(mediaPlan.channels || []));

  // Find the matching channel
  const channelIdx = channels.findIndex((ch: any) =>
    ch.channelName?.toLowerCase().includes(input.channel_name.toLowerCase())
  );

  if (channelIdx === -1) {
    return {
      error: `Channel "${input.channel_name}" not found in ${client.name}'s media plan`,
      available_channels: channels.map((ch: any) => ch.channelName).filter(Boolean),
    };
  }

  const channel = channels[channelIdx];
  const flights: any[] = channel.flights || [];

  if (!flights.length) {
    return { error: `No flights found for ${channel.channelName}. Add flight dates in the media plan builder first.` };
  }

  // Update the primary (first) flight's monthlySpend
  const oldBudget = flights[0].monthlySpend?.[input.month] ?? 0;
  if (!flights[0].monthlySpend) flights[0].monthlySpend = {};
  flights[0].monthlySpend[input.month] = input.new_budget;
  channels[channelIdx] = { ...channel, flights };

  const { error: updateError } = await supabase
    .from('client_media_plan_builder')
    .update({ channels })
    .eq('client_id', client.id);

  if (updateError) return { error: 'Failed to save budget update', details: updateError.message };

  return {
    success: true,
    message: `Updated ${channel.channelName} budget for ${input.month}: $${Number(oldBudget).toLocaleString()} → $${Number(input.new_budget).toLocaleString()} for ${client.name}`,
    client: client.name,
    channel: channel.channelName,
    month: input.month,
    previous_budget: oldBudget,
    new_budget: input.new_budget,
    ...(flights.length > 1 && { note: `${client.name} has ${flights.length} flights for this channel — updated the primary flight.` }),
  };
}

async function toolCreateActionPoint(
  request: NextRequest,
  input: { text: string; channel_type: string; category: 'SET UP' | 'HEALTH CHECK'; days_before_live_due?: number; frequency?: string }
) {
  const origin = new URL(request.url).origin;
  const cookieHeader = request.headers.get('cookie') ?? '';

  const body: any = {
    text: input.text.trim(),
    channel_type: input.channel_type,
    category: input.category,
  };
  if (input.category === 'HEALTH CHECK' && input.frequency) body.frequency = input.frequency;
  if (input.category === 'SET UP' && input.days_before_live_due !== undefined) body.days_before_live_due = input.days_before_live_due;

  const res = await fetch(`${origin}/api/action-points`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) return { error: `Failed to create action point: ${res.status}` };
  const data = await res.json();

  return {
    success: true,
    message: `Created "${input.text}" action point for ${input.channel_type}`,
    action_point: {
      id: data.data?.id,
      text: input.text,
      channel_type: input.channel_type,
      category: input.category,
    },
    note: 'This action point will now appear for all clients running this channel.',
  };
}

// ── Live ad platform tool implementations (Tier 3) ────────────────────────────

async function toolGetLiveMetaCampaigns(
  request: NextRequest,
  input: { status_filter?: string; account_name?: string }
) {
  const data = await callInternalApi('/api/ads/meta/campaigns', request);
  if (data.error) return data;

  let campaigns: any[] = data.campaigns || [];

  if (input.status_filter) {
    campaigns = campaigns.filter((c: any) =>
      c.effectiveStatus?.toUpperCase() === input.status_filter?.toUpperCase()
    );
  }

  if (input.account_name) {
    campaigns = campaigns.filter((c: any) =>
      c.accountName?.toLowerCase().includes(input.account_name!.toLowerCase())
    );
  }

  if (!campaigns.length) {
    return {
      message: input.status_filter
        ? `No ${input.status_filter} campaigns found. Meta Ads may not be connected, or no campaigns match the filter.`
        : 'No campaigns found. Make sure Meta Ads is connected in Settings.',
      total_campaigns: 0,
    };
  }

  // Group by account
  const grouped: Record<string, any[]> = {};
  for (const c of campaigns) {
    const acct = c.accountName || 'Unknown Account';
    if (!grouped[acct]) grouped[acct] = [];
    grouped[acct].push({
      id: c.id,
      name: c.name,
      status: c.status,
      effective_status: c.effectiveStatus,
    });
  }

  return {
    total_campaigns: campaigns.length,
    active_count: campaigns.filter((c: any) => c.effectiveStatus === 'ACTIVE').length,
    paused_count: campaigns.filter((c: any) => c.effectiveStatus === 'PAUSED').length,
    by_account: Object.entries(grouped).map(([account, cams]) => ({ account, campaign_count: cams.length, campaigns: cams })),
  };
}

// ── Client Intelligence tool implementation (Tier 2) ─────────────────────────

async function toolGetClientIntelligence(
  request: NextRequest,
  input: { client_name: string }
) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Unauthorized' };

  // Find client by partial name match
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .eq('user_id', session.user.id)
    .ilike('name', `%${input.client_name}%`);

  if (!clients?.length) return { error: `No client found matching "${input.client_name}"` };
  if (clients.length > 1) return {
    error: 'Multiple clients matched — be more specific.',
    matches: clients.map((c: any) => c.name),
  };

  const client = clients[0];
  const origin = new URL(request.url).origin;
  const cookieHeader = request.headers.get('cookie') ?? '';

  async function get(path: string) {
    const res = await fetch(`${origin}${path}`, { headers: { cookie: cookieHeader } });
    return res.ok ? res.json() : null;
  }

  const [briefRes, notesRes, goalsRes, docsRes] = await Promise.all([
    get(`/api/clients/${client.id}/brief`),
    get(`/api/clients/${client.id}/notes`),
    get(`/api/clients/${client.id}/goals`),
    get(`/api/clients/${client.id}/documents`),
  ]);

  const brief = briefRes?.brief ?? null;
  const notes: any[] = notesRes?.notes ?? [];
  const goals: any[] = goalsRes?.goals ?? [];
  const channelActuals = goalsRes?.channelActuals ?? {};
  const benchmarks: any[] = goalsRes?.benchmarks ?? [];
  const documents: any[] = docsRes?.documents ?? [];

  // Build the formatted context block
  const lines: string[] = [
    '---',
    `CLIENT INTELLIGENCE — ${client.name}`,
    '',
  ];

  // Brief
  if (brief) {
    lines.push('Campaign Brief:');
    if (brief.objectives) lines.push(`Objectives: ${brief.objectives}`);
    if (brief.kpis) lines.push(`KPIs: ${brief.kpis}`);
    if (brief.budget != null) lines.push(`Budget: $${Number(brief.budget).toLocaleString()}`);
    if (brief.start_date || brief.end_date) lines.push(`Campaign Dates: ${brief.start_date ?? 'TBD'} to ${brief.end_date ?? 'TBD'}`);
    if (brief.target_audience) lines.push(`Target Audience: ${brief.target_audience}`);
    if (brief.brief_body) lines.push(`Brief: ${brief.brief_body}`);
    const lockStatus = brief.is_locked
      ? `Locked — locked by ${brief.locked_by_name ?? 'Team member'} on ${brief.locked_at ? new Date(brief.locked_at).toLocaleDateString('en-AU') : 'unknown date'}`
      : 'Draft';
    lines.push(`Brief Status: ${lockStatus}`);
    lines.push('');
  }

  // Client Goals — primary first, then secondary
  const overarchingGoals = goals.filter((g: any) => g.channel === 'overarching');
  const primaryGoal = overarchingGoals.find((g: any) => g.is_primary) ?? null;
  const secondaryGoals = overarchingGoals.filter((g: any) => !g.is_primary);
  const channelGoals = goals.filter((g: any) => g.channel !== 'overarching');

  if (primaryGoal) {
    lines.push('PRIMARY CLIENT GOAL:');
    const pg = primaryGoal;
    const parts = [
      `${pg.goal_type ?? 'Goal'} via ${pg.metric}`,
      pg.target_value != null ? `| Target: ${pg.target_value}` : null,
      pg.stretch_value != null ? `| Stretch: ${pg.stretch_value} (best case)` : null,
      pg.floor_value != null ? `| Floor: ${pg.floor_value} (minimum acceptable)` : null,
    ].filter(Boolean).join(' ');
    lines.push(parts);
    lines.push('');
  }

  if (secondaryGoals.length > 0) {
    lines.push('Secondary Goals:');
    for (const g of secondaryGoals) {
      const parts = [
        `${g.goal_type ?? 'Goal'} via ${g.metric}`,
        g.target_value != null ? `| Target: ${g.target_value}` : null,
        g.stretch_value != null ? `| Stretch: ${g.stretch_value}` : null,
        g.floor_value != null ? `| Floor: ${g.floor_value}` : null,
      ].filter(Boolean).join(' ');
      lines.push(`  - ${parts}`);
    }
    lines.push('');
  }

  if (channelGoals.length > 0) {
    lines.push('Channel Goals:');
    for (const g of channelGoals) {
      const metricKey = g.metric?.toLowerCase();
      const actual = channelActuals?.[g.channel]?.[metricKey] ?? null;
      const bm = benchmarks.find((b: any) => b.metric_key === metricKey);
      const direction = bm?.direction ?? 'lower_is_better';

      let status = 'No Data';
      if (actual != null) {
        const floorOk = g.floor_value == null || (direction === 'lower_is_better' ? actual <= g.floor_value : actual >= g.floor_value);
        const targetOk = g.target_value == null || (direction === 'lower_is_better' ? actual <= g.target_value : actual >= g.target_value);
        const stretchOk = g.stretch_value != null && (direction === 'lower_is_better' ? actual <= g.stretch_value : actual >= g.stretch_value);
        if (!floorOk) status = 'Below Floor';
        else if (!targetOk) status = 'At Risk';
        else if (stretchOk) status = 'At Stretch';
        else status = 'On Track';
      }

      const parts = [
        `${g.channel} — ${g.metric}:`,
        g.floor_value != null ? `Floor ${g.floor_value}` : null,
        g.target_value != null ? `/ Target ${g.target_value}` : null,
        g.stretch_value != null ? `/ Stretch ${g.stretch_value}` : null,
        actual != null ? `| Current: ${Number(actual).toFixed(2)}` : '| Current: N/A',
        `| Status: ${status}`,
      ].filter(Boolean).join(' ');

      lines.push(parts);
    }
    lines.push('');
  }

  // Notes
  const pinnedNotes = notes.filter(n => n.is_pinned);
  const otherNotes = notes.filter(n => !n.is_pinned);
  const allNotes = [...pinnedNotes, ...otherNotes];

  if (allNotes.length > 0) {
    lines.push('Handover Notes & Client Intel:');
    for (const n of allNotes) {
      const typeLabel = n.note_type === 'handover' ? 'Handover' : n.note_type === 'client_intel' ? 'Client Intel' : 'General';
      const date = new Date(n.created_at).toLocaleDateString('en-AU');
      lines.push(`[${typeLabel}] ${n.author_name} (${date}): ${n.note_body}`);
    }
    lines.push('');
  }

  // Documents — include full content for text docs, filename for files
  if (documents.length > 0) {
    const textDocs = documents.filter((d: any) => d.is_text_doc && d.text_content);
    const fileDocs = documents.filter((d: any) => !d.is_text_doc);

    if (textDocs.length > 0) {
      lines.push('Client Context Documents:');
      for (const d of textDocs) {
        lines.push(`[${d.file_type ?? 'other'}] ${d.file_name}:`);
        lines.push(d.text_content);
        lines.push('');
      }
    }

    if (fileDocs.length > 0) {
      const fileList = fileDocs.map((d: any) => `${d.file_name} [${d.file_type ?? 'other'}]`).join(', ');
      lines.push(`Files on Record: ${fileList}`);
      lines.push('');
    }
  }

  lines.push('---');

  return {
    client: client.name,
    context_block: lines.join('\n'),
    summary: {
      has_brief: !!brief,
      brief_locked: brief?.is_locked ?? false,
      goal_count: goals.length,
      primary_goal: primaryGoal ? `${primaryGoal.goal_type ?? 'Goal'} via ${primaryGoal.metric}` : null,
      note_count: notes.length,
      document_count: documents.length,
    },
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

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

            // Read tools
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
            // Write / action tools (Tier 1)
            } else if (block.name === 'complete_action_point') {
              result = await toolCompleteActionPoint(request, input);
            } else if (block.name === 'create_action_point') {
              result = await toolCreateActionPoint(request, input);
            } else if (block.name === 'create_client') {
              result = await toolCreateClient(request, input);
            } else if (block.name === 'update_media_plan_budget') {
              result = await toolUpdateMediaPlanBudget(request, input);
            // Client Intelligence Hub (Tier 2)
            } else if (block.name === 'get_client_intelligence') {
              result = await toolGetClientIntelligence(request, input);
            // Live ad platform tools (Tier 3)
            } else if (block.name === 'get_live_meta_campaigns') {
              result = await toolGetLiveMetaCampaigns(request, input);
            } else {
              result = { error: `Unknown tool: ${block.name}` };
            }

            // Emit structured action event so the UI can trigger animations
            const writableTools = ['complete_action_point', 'create_action_point', 'create_client', 'update_media_plan_budget'];
            if (writableTools.includes(block.name) && result?.success) {
              send({ type: 'action', tool: block.name, data: result });
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
