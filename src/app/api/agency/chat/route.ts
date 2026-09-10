import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { TOOL_DEFINITIONS, withCacheControl } from '@/lib/agent-tools';
import { buildAuditSummary, buildOutputLinks, TOOL_LABELS, WRITE_TOOLS } from '@/lib/agent-audit';
import type { AgentAuditStep, AgentOutputLink } from '@/lib/agent-audit';
import { channelsToSandboxPlan, patchSandboxPlanFlightBudget, upsertSandboxPlanFlight, snapToWeekCommencing } from '@/lib/media-plan/sandbox-sync';
import { buildActualByClientPlatform, computeChannelPacing, channelNameToPlatform, getConversionConfigKeyCandidates } from '@/lib/media-plan/pacing';
import { nzToday, nzDateKeyOffset, nzStartOfMonth, formatNZ } from '@/lib/timezone';
import { withAnthropicOverloadRetry, friendlyAnthropicErrorMessage } from '@/lib/anthropic-retry';

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are an AI assistant embedded in a digital media agency's management platform called PlanPulse. You have real-time access to the agency's client data, campaigns, action points, and channel library. You can also take actions directly in the platform.

You help the team with:
- Daily briefings on client status, spend pacing, and overdue tasks
- Checking outstanding and overdue action points
- Client campaign performance and spend pacing
- Channel-level performance health checks (spend vs plan, KPIs, pacing status)
- Media channel specifications and best practices from the agency library
- Agency playbooks, SOPs, and process documentation using get_agency_playbooks
- Health Check Agent findings: live campaign configuration that doesn't match its intended setup (wrong geotargeting, dead destination URL, wrong budget/optimization goal, Advantage+ automation left on) using get_setup_audit_findings and list_setup_auditor_campaigns
- Guidance on how to use the platform

You can also take actions:
- Complete action points: Mark tasks as done for specific clients using complete_action_point
- Create new clients: Add new clients to the platform using create_client
- Update budgets: Adjust channel budgets in media plans for a whole calendar month using update_media_plan_budget, or for a specific week-commencing (W/C) date range / flight using update_media_plan_flight — this also works for a channel that isn't in the plan yet, or a totally empty plan; it creates the channel automatically rather than erroring.
- Load several channels at once: Replace a client's ENTIRE plan from a pasted/described multi-channel list using set_media_plan_channels. Only for multi-channel loads or an explicit "replace/start over" request — never for a single channel, even a brand-new one (use update_media_plan_flight for that).
- View live Meta campaigns: Fetch current campaign data directly from the Meta Ads API using get_live_meta_campaigns
- Run a Health Check Agent check: Audit a client's registered campaign(s) against their intended setup right now using run_setup_audit — it only ever reads live campaign config and flags discrepancies, it never modifies the live campaign
- Register a new Health Check Agent campaign: use find_live_ad_campaigns then register_setup_auditor_campaign — see the guided flow below

Budget edit tool choice — this matters, don't default to the monthly tool out of habit:
- The user gives a whole month ("set June to $5,000") → update_media_plan_budget.
- The user gives ANY specific dates, or says "w/c" / "week commencing" ("$10,000 on Google from Sep 7th to 21st", "week commencing the 7th through the 28th", "100 on meta during w/c 31 Aug until 6 Sep") → update_media_plan_flight, even if the range falls mostly or entirely within one calendar month. "w/c" always means the flight tool. start_week/end_week must be Mondays — snap each to its week-commencing Monday yourself (don't ask first, just do it and state the snapped W/C range plus the real end date, end_week + 6 days, in your confirmation afterwards). Compute monthly_spend proportionally by weeks-in-month across the range.
- No year given in the dates → use the plan year stated in the conversation's client-context message. Never assume today's real-world year and never ask — it's already in context.

Default to adding, without asking for confirmation first, whenever: the client's plan is empty, the channel mentioned isn't already in the plan, or the user's message says "add" (or similar). Just call the write tool. Only ask first if budget or dates are genuinely missing, or the change would overwrite an existing flight/budget with different numbers the user didn't ask to change.

There's no single client health score. When asked how a client's doing, synthesise from: overdue action points (2+ is worth flagging), client-level spend variance (>15% off plan is worth flagging), and open Health Check Agent findings (get_setup_audit_findings) — report the actual numbers and findings rather than inventing a grade.

Channel health is based on spend pacing relative to plan-to-date, not the full-period plan — get_channel_performance already does this proration server-side and returns both planned_budget_to_date (what should have been spent by now) and planned_budget_full_period (the whole period's plan) alongside spend_variance_pct, which is always actual vs to-date. Always describe pacing using the to-date comparison — never say a channel a week into the month is "underpacing" by comparing its spend to the full month's budget:
- Overpacing (>15% above plan-to-date): flag as concern
- Underpacing (>15% below plan-to-date): flag as concern
- On track: within 15% of plan-to-date

Action points have due dates calculated from channel start dates — SET UP tasks are due N days before a channel goes live, HEALTH CHECK tasks recur on a schedule. Always fetch fresh data before answering questions about action points or client status.

When asked about channel performance, spend, metrics, or pacing — always use get_channel_performance to pull live data.

Meta has no single canonical "conversions" number the way Google Ads does — get_channel_performance's conversions field for a Meta channel reflects whichever event the agency configured in that channel's "Conv. Events" picker, and conversion_event_label names it (e.g. "Registrations"). Report the label alongside the number (e.g. "144 Registrations", not a bare "144 conversions"). If a Meta channel has no conversion_event_label and carries a conversion_note, say so plainly — don't report the 0 as if it were a real conversion count.

Multi-step workflow patterns:
- "Onboard [client]": Use create_client to create them, then ask for their media plan details (channels, budgets, dates). Once provided, call set_media_plan_channels to load the plan immediately. Then explain next steps (connect ad accounts, assign account manager).
- "Load plan for [client]" / user pastes a full multi-channel plan: Call set_media_plan_channels with the extracted channels. If key details (dates, budgets) are missing, ask for them first.
- Single channel/flight mentioned, or the user says "add" (e.g. "facebook ads, $3000 31 aug to 21 sep"): call update_media_plan_flight directly, whether or not that channel is already in the plan. Never ask "add or replace the whole plan?" — update_media_plan_flight is always additive and safe.
- "Health check [client]": Use get_channel_performance + get_action_points, identify issues, offer to complete tasks that are resolved
- "End of month review": Use get_daily_briefing + get_channel_performance for all clients, synthesise and flag issues
- "Sort out tasks for [client]": Use get_action_points to list overdue items, then use complete_action_point for any the user confirms are done
- When completing action points for multiple items, you can call complete_action_point multiple times in parallel
- "Set up the Health Check Agent for [client]" / "audit [client]'s campaign": this is a guided flow — (1) which client, if not already clear; (2) Google Ads or Meta Ads; (3) call list_setup_auditor_campaigns for that client FIRST to see what's already registered; (4) call find_live_ad_campaigns and show the real live campaigns grouped by account so the user picks one (never invent a campaign name) — if the campaign they pick (or already named) matches one from list_setup_auditor_campaigns, skip straight to (6), don't ask setup questions again or re-register it; (5) for a genuinely new campaign, ask what its intended setup should be — geo targeting, budget, optimization goal, destination URL — making clear every one of these is optional and can be skipped — then call register_setup_auditor_campaign with what you gathered; (6) call run_setup_audit for that campaign to run the check; (7) report the result, critical findings first

After a write action, confirm what happened in 1-2 short lines — channel, budget, dates. No restating the request back, no walls of text. If a request is ambiguous (e.g. multiple clients or action points match), ask for clarification before acting.

Be concise, professional, and actionable. Use bullet points and bold text to make responses scannable, not paragraphs.

Client Intelligence: When working on a specific client, call get_client_intelligence to fetch their campaign brief, goals, handover notes, and documents. Prepend this context to your analysis so your responses are grounded in the client's actual objectives and commitments.`;

const TOOLS = TOOL_DEFINITIONS;

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

async function postInternalApi(path: string, request: NextRequest, body?: object): Promise<any> {
  const origin = new URL(request.url).origin;
  const cookieHeader = request.headers.get('cookie') ?? '';
  const res = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error || `API call failed: ${res.status}` };
  return data;
}

// ── Read tool implementations ─────────────────────────────────────────────────

async function toolGetActionPoints(request: NextRequest, clientNameFilter?: string) {
  // Ad-hoc TODOs and the per-channel SET UP/HEALTH CHECK checklist now live
  // in two separate feeds (the checklist was moved out of the To Do list to
  // stop it flooding /agency — see /api/agency/channel-health) — merge both
  // so the AI still sees the full picture.
  const [todoData, checklistData] = await Promise.all([
    callInternalApi('/api/agency/action-points', request),
    callInternalApi('/api/agency/channel-health', request),
  ]);
  if (todoData.error && checklistData.error) return todoData;

  const today = nzToday();
  const in7Days = nzDateKeyOffset(7);

  let todoClients: any[] = todoData.clients ?? [];
  let checklistClients: any[] = checklistData.clients ?? [];

  if (clientNameFilter) {
    todoClients = todoClients.filter((c: any) =>
      c.clientName.toLowerCase().includes(clientNameFilter.toLowerCase())
    );
    checklistClients = checklistClients.filter((c: any) =>
      c.clientName.toLowerCase().includes(clientNameFilter.toLowerCase())
    );
  }

  const overdue: any[] = [];
  const dueSoon: any[] = [];
  const upcoming: any[] = [];

  for (const client of todoClients) {
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

  for (const client of checklistClients) {
    for (const channel of client.channels ?? []) {
      for (const item of channel.items ?? []) {
        if (item.category === 'HEALTH CHECK' && item.completed && !item.stale) continue; // fresh, nothing to surface
        const entry = {
          id: item.id,
          client: client.clientName,
          client_id: client.clientId,
          channel: channel.channelType,
          task: item.text,
          category: item.category,
          due_date: item.dueDate,
          checklist_status: item.completed ? (item.stale ? 'stale — needs recheck' : 'checked') : 'not yet checked',
        };
        if (!item.completed) {
          if (!item.dueDate) upcoming.push(entry);
          else if (item.dueDate < today) overdue.push(entry);
          else if (item.dueDate <= in7Days) dueSoon.push(entry);
          else upcoming.push(entry);
        } else {
          dueSoon.push(entry); // stale health-check items — surfaced but not urgent
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

async function toolGetClientStatus(request: NextRequest, input: { client_name?: string }) {
  const data = await callInternalApi('/api/agency/clients', request);
  if (data.error) return data;

  let clients: any[] = Array.isArray(data) ? data : (data.clients ?? []);

  if (input.client_name) {
    clients = clients.filter((c: any) =>
      c.name?.toLowerCase().includes(input.client_name!.toLowerCase())
    );
  }

  return clients.map((c: any) => ({
    name: c.name,
    overdue_tasks: c.spendCache?.total_overdue_tasks ?? 0,
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

  const overpacing = clients.filter((c: any) => c.spend_variance_pct !== null && c.spend_variance_pct > 15);
  const underpacing = clients.filter((c: any) => c.spend_variance_pct !== null && c.spend_variance_pct < -15);

  // Clients needing attention: 2+ overdue tasks, or spend pacing >15% off plan
  const needingAttention = clients
    .map((c: any) => {
      const reasons: string[] = [];
      if (c.overdue_tasks >= 2) reasons.push(`${c.overdue_tasks} overdue tasks`);
      if (c.spend_variance_pct !== null && Math.abs(c.spend_variance_pct) > 15) {
        reasons.push(`Spend variance ${c.spend_variance_pct > 0 ? '+' : ''}${c.spend_variance_pct.toFixed(1)}%`);
      }
      return { name: c.name, reasons };
    })
    .filter((c: any) => c.reasons.length > 0);

  const today = nzToday();
  const in7Days = nzDateKeyOffset(7);

  const launchingSoon = clients.flatMap((c: any) =>
    (c.channels ?? [])
      .filter((ch: any) => ch.status === 'upcoming' && ch.start && ch.start >= today && ch.start <= in7Days)
      .map((ch: any) => ({ client: c.name, channel: ch.name, launch_date: ch.start }))
  );

  return {
    date: today,
    client_summary: { total: clients.length, needing_attention: needingAttention.length },
    clients_needing_attention: needingAttention,
    overdue_action_points: actionData.overdue_count ?? 0,
    overdue_items: actionData.overdue_items ?? [],
    due_within_7_days: actionData.due_within_7_days_count ?? 0,
    due_soon_items: actionData.due_soon_items ?? [],
    overpacing_clients: overpacing.map((c: any) => ({ name: c.name, variance: `+${c.spend_variance_pct?.toFixed(1)}%` })),
    underpacing_clients: underpacing.map((c: any) => ({ name: c.name, variance: `${c.spend_variance_pct?.toFixed(1)}%` })),
    channels_launching_soon: launchingSoon,
  };
}

async function toolGetChannelPerformance(
  request: NextRequest,
  input: { client_name?: string; channel_name?: string; start_date?: string; end_date?: string }
) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Unauthorized' };

  const today = nzToday();
  const monthStart = nzStartOfMonth();
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
    .select('client_id, platform, spend, impressions, clicks, ctr, conversions, reach, cpc, cpm, average_cpc, frequency, date, meta_actions')
    .eq('user_id', session.user.id)
    .in('client_id', clientIds)
    .gte('date', startDate)
    .lte('date', endDate)
    .not('campaign_id', 'like', 'manual-override-%');

  // Meta has no single canonical "conversions" number the way Google Ads
  // does — ad_performance_metrics.conversions is always NULL for meta-ads
  // rows, with the raw per-action-type breakdown stored in meta_actions
  // instead. client_channel_conversion_config (not yet in the generated
  // Supabase types — cast to `any`, same workaround as platform_campaigns in
  // src/app/api/setup-auditor/campaigns/route.ts) holds which action_type the
  // agency picked to represent "conversions" for each channel, so it can be
  // summed from meta_actions below instead of reporting a false zero.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: conversionConfigRows } = await (supabase as any)
    .from('client_channel_conversion_config')
    .select('client_id, channel_key, conversion_action_type, conversion_label')
    .in('client_id', clientIds);
  const conversionConfigMap = new Map<string, { actionType: string; label: string }>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (conversionConfigRows ?? []).map((r: any) => [`${r.client_id}::${r.channel_key}`, { actionType: r.conversion_action_type, label: r.conversion_label }])
  );

  const actualByClientPlatform = buildActualByClientPlatform(metricsRows);

  // Resolve, per client+platform, whichever Meta conversion-event mapping (if
  // any) the agency configured on ANY of that platform's channel cards —
  // checked against every key-candidate a card could have persisted,
  // including compound per-campaign-line keys (see getConversionConfigKeyCandidates)
  // that computeChannelPacing's bare-id line_items can't represent.
  const conversionMappingByClientPlatform = new Map<string, { actionType: string; label: string }>();
  for (const plan of mediaPlans || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawChannels: any[] = (plan.channels as any[]) || [];
    for (const ch of rawChannels) {
      if (!ch.channelName || channelNameToPlatform(ch.channelName) !== 'meta-ads') continue;
      const mapKey = `${plan.client_id}::meta-ads`;
      if (conversionMappingByClientPlatform.has(mapKey)) continue;
      for (const key of getConversionConfigKeyCandidates(ch)) {
        const mapping = conversionConfigMap.get(`${plan.client_id}::${key}`);
        if (mapping) { conversionMappingByClientPlatform.set(mapKey, mapping); break; }
      }
    }
  }

  const pacingGroups = computeChannelPacing(
    mediaPlans || [],
    actualByClientPlatform,
    clientMap,
    { startDate, endDate, today },
    input.channel_name,
  );

  const channels: any[] = pacingGroups.map(group => {
    const actualSpend = group.actual_spend;
    const variancePct = group.spend_variance_pct;
    const pacingStatus = variancePct === null ? 'no plan'
      : variancePct > 15 ? 'overpacing'
      : variancePct < -15 ? 'underpacing'
      : 'on track';

    const impressions = group.actual?.impressions ?? null;
    const clicks = group.actual?.clicks ?? null;

    // If this channel has a configured Meta conversion event, resolve its
    // total from the shared actionTotals for the client+platform (Meta
    // actuals are only ever tracked at that granularity, same as spend).
    let conversionOverride: number | null = null;
    let conversionLabel: string | null = null;
    if (group.platform === 'meta-ads') {
      const mapping = conversionMappingByClientPlatform.get(`${group.client_id}::${group.platform}`);
      if (mapping) {
        conversionOverride = group.actual?.actionTotals?.get(mapping.actionType) ?? 0;
        conversionLabel = mapping.label;
      }
    }
    // For Meta, ad_performance_metrics.conversions is always NULL — there's no
    // single canonical "conversion" the way Google Ads has. conversionOverride
    // is the sum of whichever action_type the agency configured as this channel's
    // conversion event; use it whenever set, even if it's 0, since 0 is a real
    // answer once an event IS configured.
    const conversions = conversionOverride !== null ? conversionOverride : (group.actual?.conversions ?? null);
    const reach = group.actual?.reach ?? null;
    const ctr = impressions && impressions > 0 ? (clicks! / impressions) * 100 : null;
    const cpc = clicks && clicks > 0 ? actualSpend / clicks : null;
    const cpm = impressions && impressions > 0 ? (actualSpend / impressions) * 1000 : null;
    const lineItemNames = group.line_items.map(li => li.name);

    return {
      client: group.client,
      channel: lineItemNames.length > 1 ? lineItemNames.join(' + ') : lineItemNames[0],
      platform: group.platform,
      status: group.status,
      date_range: { start: startDate, end: endDate },
      planned_budget_full_period: group.planned_budget_full_period,
      planned_budget_to_date: group.planned_budget_to_date,
      actual_spend: actualSpend,
      spend_variance_pct: variancePct,
      pacing_status: pacingStatus,
      pacing_note: 'spend_variance_pct and pacing_status compare actual_spend against planned_budget_to_date (the prorated plan for the days elapsed so far), not planned_budget_full_period — never describe pacing using the full-period figure.',
      impressions,
      clicks,
      ctr_pct: ctr !== null ? Number(ctr.toFixed(2)) : null,
      cpc: cpc !== null ? Number(cpc.toFixed(2)) : null,
      cpm: cpm !== null ? Number(cpm.toFixed(2)) : null,
      conversions,
      conversion_event_label: conversionLabel,
      ...(group.platform === 'meta-ads' && !conversionLabel && {
        conversion_note: 'No conversion event is configured for this Meta channel yet, so "conversions" is not meaningful — Meta has no single canonical conversion number. Tell the user to pick one in the channel card\'s "Conv. Events" selector, then re-ask; don\'t report this 0 as a real conversion count.',
      }),
      reach,
      start_date: group.start_date,
      end_date: group.end_date,
      ...(lineItemNames.length > 1 && {
        plan_lines: lineItemNames,
        note: `Planned budget is the combined total of ${lineItemNames.length} plan lines. Actual spend is at the platform level.`,
      }),
    };
  });

  if (channels.length === 0) {
    return { message: 'No channel data found for the specified filters.', channels: [] };
  }

  const overpacing = channels.filter(c => c.pacing_status === 'overpacing');
  const underpacing = channels.filter(c => c.pacing_status === 'underpacing');
  const onTrack = channels.filter(c => c.pacing_status === 'on track');
  const noData = channels.filter(c => c.actual_spend === 0 && c.planned_budget_full_period);

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

async function toolGetAgencyPlaybooks(
  _request: NextRequest,
  input: { category?: string; search?: string }
) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Unauthorized' };

  let query = supabase
    .from('library_documents')
    .select('file_name, doc_category, text_content, is_text_doc, uploaded_at')
    .eq('user_id', session.user.id)
    .order('uploaded_at', { ascending: false });

  if (input.category) {
    query = query.eq('doc_category', input.category);
  }

  if (input.search) {
    query = query.ilike('file_name', `%${input.search}%`);
  }

  const { data, error } = await query;
  if (error) return { error: 'Failed to fetch playbooks' };

  const MAX_DOC_CHARS = 3000;
  const MAX_DOCS = 15;

  const allDocs = data ?? [];
  const docs = allDocs.slice(0, MAX_DOCS).map(d => {
    const text = d.text_content ?? '(no extracted text available)';
    const truncated = text.length > MAX_DOC_CHARS;
    return {
      name: d.file_name,
      category: d.doc_category,
      type: d.is_text_doc ? 'text' : 'file',
      uploaded: d.uploaded_at?.split('T')[0],
      content: truncated ? `${text.slice(0, MAX_DOC_CHARS)}...[truncated]` : text,
    };
  });

  return { total: allDocs.length, returned: docs.length, documents: docs };
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
    .select('client_id, channels, sandbox_plan')
    .eq('client_id', client.id)
    .maybeSingle();

  const channels: any[] = JSON.parse(JSON.stringify(mediaPlan?.channels || []));

  // Find the matching channel
  const channelIdx = channels.findIndex((ch: any) =>
    ch.channelName?.toLowerCase().includes(input.channel_name.toLowerCase())
  );

  // No matching channel (including a totally empty/nonexistent plan) — create it,
  // same as update_media_plan_flight, so a brand-new channel never hard-errors here.
  const isNewChannel = channelIdx === -1;
  const channel = isNewChannel
    ? { id: `channel-${Date.now()}`, channelName: input.channel_name, customChannelName: '', format: '', totalBudget: 0, percentOfInvestment: 0, flights: [] as any[] }
    : channels[channelIdx];

  const flights: any[] = channel.flights || [];
  const isNewFlight = !flights.length;
  const startWeek = snapToWeekCommencing(`${input.month}-01`);
  const endWeek = snapToWeekCommencing(monthEndISO(input.month));
  if (isNewFlight) {
    // No flights yet on this channel — create one spanning just this month so the
    // budget has somewhere to land, instead of erroring.
    flights.push({ id: `flight-${Date.now()}`, startWeek, endWeek, monthlySpend: {}, color: getHex(channel.channelName) });
  }

  // Update the primary (first) flight's monthlySpend
  const oldBudget = flights[0].monthlySpend?.[input.month] ?? 0;
  if (!flights[0].monthlySpend) flights[0].monthlySpend = {};
  flights[0].monthlySpend[input.month] = input.new_budget;
  const updatedChannel = { ...channel, flights };
  if (isNewChannel) channels.push(updatedChannel);
  else channels[channelIdx] = updatedChannel;

  // The visible grid renders from sandbox_plan, not channels — keep both in sync
  // so the edit actually shows up, instead of only updating the hidden column.
  const budgetDelta = input.new_budget - Number(oldBudget);
  const updatedSandboxPlan = (!isNewChannel && !isNewFlight && mediaPlan?.sandbox_plan)
    ? patchSandboxPlanFlightBudget(mediaPlan.sandbox_plan as any, channel.channelName, input.month, budgetDelta)
    : upsertSandboxPlanFlight(
        (mediaPlan?.sandbox_plan as any) ?? null,
        channel.channelName,
        { startWeek, endWeek, budget: input.new_budget },
        { isOrganic: channel.channelCategory === 'organic_social', detail: channel.channelSubType }
      );

  const { error: updateError } = await supabase
    .from('client_media_plan_builder')
    .upsert({ client_id: client.id, channels, sandbox_plan: updatedSandboxPlan }, { onConflict: 'client_id' });

  if (updateError) return { error: 'Failed to save budget update', details: updateError.message };

  return {
    success: true,
    message: `${isNewChannel || isNewFlight ? 'Added' : 'Updated'} ${channel.channelName} budget for ${input.month}: $${Number(oldBudget).toLocaleString()} → $${Number(input.new_budget).toLocaleString()} for ${client.name}`,
    client: client.name,
    client_id: client.id,
    channel: channel.channelName,
    is_new_channel: isNewChannel,
    month: input.month,
    previous_budget: oldBudget,
    new_budget: input.new_budget,
    ...(flights.length > 1 && { note: `${client.name} has ${flights.length} flights for this channel — updated the primary flight.` }),
  };
}

async function toolUpdateMediaPlanFlight(
  _request: NextRequest,
  input: {
    client_name: string;
    channel_name: string;
    start_week: string;
    end_week: string;
    budget: number;
    monthly_spend: Record<string, number>;
  }
) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Unauthorized' };

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .eq('user_id', session.user.id)
    .ilike('name', `%${input.client_name}%`);

  if (!clients?.length) return { error: `No client found matching "${input.client_name}"` };
  if (clients.length > 1) return { error: 'Multiple clients matched', matches: clients.map((c: any) => c.name) };

  const client = clients[0];

  const { data: mediaPlan } = await supabase
    .from('client_media_plan_builder')
    .select('client_id, channels, sandbox_plan')
    .eq('client_id', client.id)
    .maybeSingle();

  const startWeek = snapToWeekCommencing(input.start_week);
  const endWeek = snapToWeekCommencing(input.end_week);

  const channels: any[] = JSON.parse(JSON.stringify(mediaPlan?.channels || []));
  const channelIdx = channels.findIndex((ch: any) =>
    ch.channelName?.toLowerCase().includes(input.channel_name.toLowerCase())
  );

  // No matching channel (including a totally empty/nonexistent plan) — add it as a
  // new channel rather than erroring, so a single-channel "add" never has to fall
  // back to the destructive set_media_plan_channels replace path.
  const isNewChannel = channelIdx === -1;
  const channel = isNewChannel
    ? { id: `channel-${Date.now()}`, channelName: input.channel_name, customChannelName: '', format: '', totalBudget: 0, percentOfInvestment: 0, flights: [] as any[] }
    : channels[channelIdx];

  const flights: any[] = [...(channel.flights || [])];
  const startMs = new Date(startWeek).getTime();
  const endMs = new Date(endWeek).getTime();
  const overlapIdx = flights.findIndex((f: any) => {
    const fStart = new Date(f.startWeek).getTime();
    const fEnd = new Date(f.endWeek).getTime();
    return fStart <= endMs && fEnd >= startMs;
  });

  const newFlight = { id: overlapIdx >= 0 ? flights[overlapIdx].id : `flight-${Date.now()}`, startWeek, endWeek, monthlySpend: input.monthly_spend, color: getHex(channel.channelName) };
  if (overlapIdx >= 0) flights[overlapIdx] = newFlight;
  else flights.push(newFlight);

  const totalBudget = flights.reduce((s: number, f: any) => {
    const monthValues: number[] = Object.values(f.monthlySpend || {});
    return s + monthValues.reduce((a, b) => a + Number(b), 0);
  }, 0);
  const updatedChannel = { ...channel, flights, totalBudget };
  if (isNewChannel) channels.push(updatedChannel);
  else channels[channelIdx] = updatedChannel;

  const updatedSandboxPlan = upsertSandboxPlanFlight(
    (mediaPlan?.sandbox_plan as any) ?? null,
    channel.channelName,
    { startWeek, endWeek, budget: input.budget },
    { isOrganic: channel.channelCategory === 'organic_social', detail: channel.channelSubType }
  );

  const { error: updateError } = await supabase
    .from('client_media_plan_builder')
    .upsert({ client_id: client.id, channels, sandbox_plan: updatedSandboxPlan }, { onConflict: 'client_id' });

  if (updateError) return { error: 'Failed to save flight update', details: updateError.message };

  return {
    success: true,
    message: `${isNewChannel ? 'Added' : 'Set'} ${channel.channelName} to $${Number(input.budget).toLocaleString()} for W/C ${startWeek} – ${endWeek} for ${client.name}`,
    client: client.name,
    client_id: client.id,
    channel: channel.channelName,
    is_new_channel: isNewChannel,
    start_week: startWeek,
    end_week: endWeek,
    budget: input.budget,
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

// ── Invoice & Report tool implementations ────────────────────────────────────

async function toolGenerateInvoice(
  request: NextRequest,
  input: { client_name: string; start_date: string; end_date: string; spend_type?: string }
) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Unauthorized' };

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .eq('user_id', session.user.id)
    .ilike('name', `%${input.client_name}%`);

  if (!clients?.length) return { error: `No client found matching "${input.client_name}"` };
  if (clients.length > 1) return { error: 'Multiple clients matched — be more specific.', matches: clients.map((c: any) => c.name) };

  const client = clients[0];
  const origin = new URL(request.url).origin;
  const cookieHeader = request.headers.get('cookie') ?? '';

  const res = await fetch(`${origin}/api/clients/${client.id}/invoice`, {
    method: 'POST',
    headers: { cookie: cookieHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start_date: input.start_date,
      end_date: input.end_date,
      spend_type: input.spend_type ?? 'actual',
    }),
  });

  if (!res.ok) return { error: `Invoice generation failed: ${res.status}` };
  const invoiceData = await res.json();
  return { ...invoiceData, client_id: client.id };
}

async function toolGenerateReport(
  request: NextRequest,
  input: { client_name: string; start_date: string; end_date: string; sections?: string[] }
) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Unauthorized' };

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .eq('user_id', session.user.id)
    .ilike('name', `%${input.client_name}%`);

  if (!clients?.length) return { error: `No client found matching "${input.client_name}"` };
  if (clients.length > 1) return { error: 'Multiple clients matched — be more specific.', matches: clients.map((c: any) => c.name) };

  const client = clients[0];
  const sections = (input.sections ?? ['summary', 'spend', 'channels', 'actions']).join(',');
  const origin = new URL(request.url).origin;
  const cookieHeader = request.headers.get('cookie') ?? '';

  const res = await fetch(
    `${origin}/api/clients/${client.id}/report-data?start_date=${input.start_date}&end_date=${input.end_date}&sections=${sections}`,
    { headers: { cookie: cookieHeader } }
  );

  if (!res.ok) return { error: `Report data fetch failed: ${res.status}` };
  const data = await res.json();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? origin;
  return {
    ...data,
    client_id: client.id,
    download_url: `${appUrl}/api/clients/${client.id}/report?start_date=${input.start_date}&end_date=${input.end_date}`,
  };
}

// ── Media plan onboarding tool implementation ─────────────────────────────────

function snapToMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString();
}

function snapToEndOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  // Snap to Monday of that week then go forward to Sunday
  const day = d.getDay();
  const toMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + toMonday + 6);
  return d.toISOString();
}

/** Last calendar day of a "YYYY-MM" month, as "YYYY-MM-DD". */
function monthEndISO(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m, 0); // day 0 of next month = last day of this month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CHANNEL_HEX_COLORS: Record<string, string> = {
  'meta ads': '#3B82F6', 'google ads': '#EF4444', 'display ads': '#06B6D4',
  'native ads': '#14B8A6', 'linkedin ads': '#6366F1', 'tiktok ads': '#6B7280',
  'instagram ads': '#EC4899', 'twitter ads': '#0EA5E9', 'youtube ads': '#DC2626',
  'snapchat ads': '#EAB308', 'reddit ads': '#EA580C',
  'instagram (organic)': '#F472B6', 'facebook (organic)': '#60A5FA', 'linkedin (organic)': '#22D3EE',
  'edm / email': '#A855F7', 'ooh': '#F97316', 'radio': '#F59E0B',
  'linear tv': '#7C3AED', 'svod': '#9333EA', 'bvod': '#D946EF',
};

function getHex(channelName: string): string {
  const lower = channelName.toLowerCase();
  return CHANNEL_HEX_COLORS[lower] ?? (lower.startsWith('ooh') ? '#F97316' : '#6B7280');
}

async function toolSetMediaPlanChannels(
  _request: NextRequest,
  input: {
    client_name: string;
    channels: Array<{
      channelName: string;
      customChannelName?: string;
      format?: string;
      totalBudget: number;
      flights: Array<{ startDate: string; endDate: string; monthlySpend: Record<string, number> }>;
    }>;
  }
) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Unauthorized' };

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .eq('user_id', session.user.id)
    .ilike('name', `%${input.client_name}%`);

  if (!clients?.length) return { error: `No client found matching "${input.client_name}"` };
  if (clients.length > 1) return { error: 'Multiple clients matched — be more specific.', matches: clients.map((c: any) => c.name) };

  const client = clients[0];
  const grandTotal = input.channels.reduce((s, c) => s + (c.totalBudget || 0), 0);

  const mediaChannels = input.channels.map((ch, idx) => {
    const hex = getHex(ch.channelName);
    const pct = grandTotal > 0 ? Math.round((ch.totalBudget / grandTotal) * 100) : 0;

    const flights = (ch.flights || []).map(f => ({
      id: `flight-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      startWeek: snapToMonday(f.startDate),
      endWeek: snapToEndOfWeek(f.endDate),
      monthlySpend: f.monthlySpend || {},
      color: hex,
    }));

    if (flights.length === 0) {
      const nowYear = nzToday().slice(0, 4);
      flights.push({
        id: `flight-${Date.now()}-${idx}-0`,
        startWeek: snapToMonday(`${nowYear}-01-01`),
        endWeek: snapToEndOfWeek(`${nowYear}-12-31`),
        monthlySpend: {},
        color: hex,
      });
    }

    return {
      id: `channel-${Date.now()}-${idx}`,
      channelName: ch.channelName,
      customChannelName: ch.customChannelName || '',
      format: ch.format || '',
      totalBudget: ch.totalBudget || 0,
      percentOfInvestment: pct,
      flights,
    };
  });

  const sandboxPlan = channelsToSandboxPlan(mediaChannels as any);

  const { error: upsertError } = await supabase
    .from('client_media_plan_builder')
    .upsert(
      { client_id: client.id, channels: mediaChannels, commission: 0, sandbox_plan: sandboxPlan },
      { onConflict: 'client_id' }
    );

  if (upsertError) return { error: 'Failed to save media plan', details: upsertError.message };

  return {
    success: true,
    message: `Loaded ${mediaChannels.length} channel${mediaChannels.length !== 1 ? 's' : ''} into ${client.name}'s media plan`,
    client: client.name,
    client_id: client.id,
    channels_added: mediaChannels.map(c => ({ name: c.channelName, budget: c.totalBudget, flights: c.flights.length })),
    total_budget: grandTotal,
    note: 'Open the media plan builder to review, adjust flights, and add monthly budget breakdowns.',
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

// ── Setup Auditor tools ───────────────────────────────────────────────────────
// Thin wrappers over /api/setup-auditor/* — the deterministic engine (rule
// resolution, live GAQL/Graph reads, findings persistence) lives in
// src/lib/setup-auditor/, not here. These just resolve client_name → clientId
// (same partial-match convention as every other tool) and call those routes.

// status=active restricts to campaigns actually delivering right now (Google
// ENABLED / Meta effective_status ACTIVE) — Setup Auditor only ever audits
// live campaigns, never the full history of everything an account has run.
function setupAuditorPickerEndpoint(platform: string, clientId: string): string {
  return platform === 'google-ads'
    ? `/api/ads/google-ads/campaigns?clientId=${clientId}&status=active`
    : `/api/ads/meta/campaigns?clientId=${clientId}&status=active`;
}

async function toolFindLiveAdCampaigns(request: NextRequest, input: { client_name: string; platform: string }) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Unauthorized' };

  if (input.platform !== 'google-ads' && input.platform !== 'meta-ads') {
    return { error: 'platform must be "google-ads" or "meta-ads"' };
  }

  const { data: clientsData } = await supabase
    .from('clients').select('id, name').eq('user_id', session.user.id).ilike('name', `%${input.client_name}%`);
  if (!clientsData?.length) return { error: `No client found matching "${input.client_name}"` };
  if (clientsData.length > 1) {
    return { error: 'Multiple clients matched — be more specific.', matches: clientsData.map((c: any) => c.name) };
  }
  const client = clientsData[0];

  const data = await callInternalApi(setupAuditorPickerEndpoint(input.platform, client.id), request);
  if (data.error) return { error: data.error, client: client.name, client_id: client.id };

  const campaigns: any[] = data.campaigns ?? [];
  if (campaigns.length === 0) {
    return {
      client: client.name,
      client_id: client.id,
      platform: input.platform,
      message: `No live campaigns found for ${client.name} on ${input.platform}. Make sure that platform is connected for this client in Platform Connections.`,
      by_account: [],
    };
  }

  // Group by account so "which account" and "which campaign" can be answered in one step.
  const grouped = new Map<string, { id: string; name: string }[]>();
  for (const c of campaigns) {
    const acctLabel = input.platform === 'google-ads' ? (c.customerId ?? 'Unknown account') : (c.accountName ?? 'Unknown account');
    const arr = grouped.get(acctLabel) ?? [];
    arr.push({ id: c.id, name: c.name });
    grouped.set(acctLabel, arr);
  }

  return {
    client: client.name,
    client_id: client.id,
    platform: input.platform,
    total_campaigns: campaigns.length,
    by_account: Array.from(grouped.entries()).map(([account, cams]) => ({ account, campaigns: cams })),
  };
}

async function toolRegisterSetupAuditorCampaign(
  request: NextRequest,
  input: {
    client_name: string; platform: string; campaign_name: string; channel_name?: string;
    expected_geo?: string[]; expected_geo_mode?: string; expected_budget_amount?: number;
    expected_optimization_goal?: string; expected_destination_url?: string; notes?: string;
  }
) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Unauthorized' };

  if (input.platform !== 'google-ads' && input.platform !== 'meta-ads') {
    return { error: 'platform must be "google-ads" or "meta-ads"' };
  }
  if (!input.campaign_name) {
    return { error: 'campaign_name is required — call find_live_ad_campaigns first if you don\'t have the exact name.' };
  }

  const { data: clientsData } = await supabase
    .from('clients').select('id, name').eq('user_id', session.user.id).ilike('name', `%${input.client_name}%`);
  if (!clientsData?.length) return { error: `No client found matching "${input.client_name}"` };
  if (clientsData.length > 1) {
    return { error: 'Multiple clients matched — be more specific.', matches: clientsData.map((c: any) => c.name) };
  }
  const client = clientsData[0];

  const liveData = await callInternalApi(setupAuditorPickerEndpoint(input.platform, client.id), request);
  const liveCampaigns: any[] = liveData.campaigns ?? [];
  const matches = liveCampaigns.filter((c: any) => c.name.toLowerCase().includes(input.campaign_name.toLowerCase()));

  if (matches.length === 0) {
    return { error: `No live ${input.platform} campaign matching "${input.campaign_name}" found for ${client.name}. Use find_live_ad_campaigns to see what's actually available.` };
  }
  if (matches.length > 1) {
    return {
      clarification_needed: true,
      message: 'Multiple live campaigns matched — which one did you mean?',
      matches: matches.map((c: any) => ({ name: c.name, account: input.platform === 'google-ads' ? c.customerId : c.accountName })),
    };
  }

  const selected = matches[0];
  const externalAccountId = input.platform === 'google-ads' ? selected.customerId : selected.accountId;
  if (!externalAccountId) {
    return { error: 'This campaign is missing its account ID — call find_live_ad_campaigns again and retry.' };
  }

  const result = await postInternalApi('/api/setup-auditor/campaigns', request, {
    clientId: client.id,
    platform: input.platform,
    externalAccountId,
    externalCampaignId: selected.id,
    campaignName: selected.name,
    channelName: input.channel_name ?? null,
    expectedGeo: input.expected_geo?.length ? input.expected_geo : null,
    expectedGeoMode: input.platform === 'google-ads' ? (input.expected_geo_mode ?? null) : null,
    expectedBudgetAmount: input.expected_budget_amount ?? null,
    expectedOptimizationGoal: input.expected_optimization_goal ?? null,
    expectedDestinationUrl: input.expected_destination_url ?? null,
    notes: input.notes ?? null,
  });
  if (result.error) return { error: result.error, client: client.name, client_id: client.id };

  return {
    success: true,
    message: `Registered "${selected.name}" for ${client.name} with the Health Check Agent.`,
    client: client.name,
    client_id: client.id,
    campaign_name: selected.name,
    platform: input.platform,
    platform_campaign_id: result.campaign?.id,
  };
}

async function toolListSetupAuditorCampaigns(request: NextRequest, input: { client_name?: string }) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Unauthorized' };

  const { data: clientsData } = await supabase.from('clients').select('id, name').eq('user_id', session.user.id);
  let clients: { id: string; name: string }[] = clientsData || [];
  if (input.client_name) {
    clients = clients.filter(c => c.name.toLowerCase().includes(input.client_name!.toLowerCase()));
  }
  if (clients.length === 0) return { error: `No client found matching "${input.client_name}"` };

  const perClient = await Promise.all(clients.map(async (client) => {
    const [campaignsData, findingsData] = await Promise.all([
      callInternalApi(`/api/setup-auditor/campaigns?clientId=${client.id}`, request),
      callInternalApi(`/api/setup-auditor/findings?clientId=${client.id}`, request),
    ]);
    const campaigns: any[] = campaignsData.campaigns ?? [];
    const findings: any[] = findingsData.findings ?? [];
    const findingsByCampaign = new Map<string, any[]>();
    for (const f of findings) {
      const arr = findingsByCampaign.get(f.platform_campaign_id) ?? [];
      arr.push(f);
      findingsByCampaign.set(f.platform_campaign_id, arr);
    }
    return {
      client: client.name,
      client_id: client.id,
      campaigns: campaigns.map((c: any) => {
        const campaignFindings = findingsByCampaign.get(c.id) ?? [];
        return {
          id: c.id,
          platform: c.platform,
          campaign_name: c.campaign_name,
          channel_name: c.channel_name,
          open_findings: campaignFindings.length,
          worst_severity: campaignFindings.some((f: any) => f.severity === 'critical') ? 'critical'
            : campaignFindings.some((f: any) => f.severity === 'warning') ? 'warning' : null,
        };
      }),
    };
  }));

  const totalCampaigns = perClient.reduce((sum, c) => sum + c.campaigns.length, 0);
  const result: any = { clients: perClient, total_campaigns: totalCampaigns };
  if (perClient.length === 1) result.client_id = perClient[0].client_id;
  if (totalCampaigns === 0) result.message = 'No campaigns registered with the Health Check Agent yet.';
  return result;
}

async function toolRunSetupAudit(request: NextRequest, input: { client_name: string; campaign_name?: string }) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Unauthorized' };

  const { data: clientsData } = await supabase
    .from('clients').select('id, name').eq('user_id', session.user.id).ilike('name', `%${input.client_name}%`);
  if (!clientsData?.length) return { error: `No client found matching "${input.client_name}"` };
  if (clientsData.length > 1) {
    return { error: 'Multiple clients matched — be more specific.', matches: clientsData.map((c: any) => c.name) };
  }
  const client = clientsData[0];

  const campaignsData = await callInternalApi(`/api/setup-auditor/campaigns?clientId=${client.id}`, request);
  let campaigns: any[] = campaignsData.campaigns ?? [];
  if (input.campaign_name) {
    campaigns = campaigns.filter((c: any) => (c.campaign_name || '').toLowerCase().includes(input.campaign_name!.toLowerCase()));
  }
  if (campaigns.length === 0) {
    return {
      error: input.campaign_name
        ? `No registered campaign matching "${input.campaign_name}" for ${client.name}.`
        : `${client.name} has no campaigns registered with the Health Check Agent yet.`,
    };
  }

  const runs = await Promise.all(campaigns.map(async (c: any) => {
    const data = await postInternalApi(`/api/setup-auditor/campaigns/${c.id}/run`, request);
    return { campaign_name: c.campaign_name, platform: c.platform, ...data };
  }));

  const failed = runs.filter((r: any) => r.error);

  return {
    success: failed.length < runs.length,
    client: client.name,
    client_id: client.id,
    campaigns_checked: runs.length,
    newly_flagged: runs.reduce((sum: number, r: any) => sum + (r.result?.opened?.length ?? 0), 0),
    resolved: runs.reduce((sum: number, r: any) => sum + (r.result?.resolved?.length ?? 0), 0),
    still_open: runs.reduce((sum: number, r: any) => sum + (r.result?.stillOpen?.length ?? 0), 0),
    failures: failed.length ? failed.map((r: any) => ({ campaign_name: r.campaign_name, error: r.error })) : undefined,
    runs,
  };
}

async function toolGetSetupAuditFindings(request: NextRequest, input: { client_name?: string; severity?: string }) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Unauthorized' };

  const { data: clientsData } = await supabase.from('clients').select('id, name').eq('user_id', session.user.id);
  let clients: { id: string; name: string }[] = clientsData || [];
  if (input.client_name) {
    clients = clients.filter(c => c.name.toLowerCase().includes(input.client_name!.toLowerCase()));
  }
  if (clients.length === 0) return { error: `No client found matching "${input.client_name}"` };

  const perClient = await Promise.all(clients.map(async (client) => {
    const data = await callInternalApi(`/api/setup-auditor/findings?clientId=${client.id}`, request);
    let findings: any[] = data.findings ?? [];
    if (input.severity) findings = findings.filter((f: any) => f.severity === input.severity);
    return {
      client: client.name,
      client_id: client.id,
      findings: findings.map((f: any) => ({
        campaign_name: f.platform_campaigns?.campaign_name,
        platform: f.platform_campaigns?.platform,
        rule_key: f.rule_key,
        severity: f.severity,
        detail: f.detail,
        first_detected_at: f.first_detected_at,
      })),
    };
  }));

  const totalFindings = perClient.reduce((sum, c) => sum + c.findings.length, 0);
  const result: any = { clients: perClient, total_findings: totalFindings };
  if (perClient.length === 1) result.client_id = perClient[0].client_id;
  if (totalFindings === 0) result.message = 'No open Health Check Agent findings.';
  return result;
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
      ? `Locked — locked by ${brief.locked_by_name ?? 'Team member'} on ${brief.locked_at ? formatNZ(new Date(brief.locked_at), {}, 'en-AU') : 'unknown date'}`
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
      const date = formatNZ(new Date(n.created_at), {}, 'en-AU');
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

  const { agentId, runId } = body as { agentId?: string; runId?: string };

  // Load agent config if agentId provided
  let effectiveSystemPrompt = SYSTEM_PROMPT;
  let effectiveTools = TOOLS;
  let agentRunId: string | null = runId ?? null;
  let agentName: string | null = null;

  if (agentId) {
    const { data: agent } = await supabase
      .from('user_agents')
      .select('*')
      .eq('id', agentId)
      .eq('user_id', session.user.id)
      .single();

    if (agent) {
      agentName = agent.name;
      effectiveSystemPrompt = agent.system_prompt + '\n\n---\nPlatform Context:\n' + SYSTEM_PROMPT;
      effectiveTools = TOOLS.filter(t => agent.enabled_tools.includes(t.name));

      if (!agentRunId) {
        const lastUserMsg = userMessages.filter(m => m.role === 'user').pop();
        const msgText = typeof lastUserMsg?.content === 'string'
          ? lastUserMsg.content
          : Array.isArray(lastUserMsg?.content)
            ? lastUserMsg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ')
            : '';

        const { data: run } = await supabase
          .from('agent_runs')
          .insert({
            user_id: session.user.id,
            agent_id: agent.id,
            agent_name: agent.name,
            user_message: msgText,
            status: 'running',
          })
          .select()
          .single();

        agentRunId = run?.id ?? null;
      }
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      const auditSteps: AgentAuditStep[] = [];
      const outputLinks: AgentOutputLink[] = [];
      let contextClientId: string | null = null;
      let finalTextBuffer = '';

      try {
        let messages = [...userMessages];

        while (true) {
          // Text deltas are streamed live to the client, so a retry is only
          // safe while this turn's attempt hasn't sent anything yet — once
          // the first chunk goes out, an overload error is reported as-is
          // rather than retried, to avoid duplicating partial output.
          let sentAnyThisAttempt = false;
          const finalMsg = await withAnthropicOverloadRetry(
            async () => {
              sentAnyThisAttempt = false;
              const anthropicStream = anthropic.messages.stream({
                model: 'claude-opus-4-7',
                system: [{ type: 'text', text: effectiveSystemPrompt, cache_control: { type: 'ephemeral' } }],
                tools: withCacheControl(effectiveTools),
                messages,
                max_tokens: 2048,
              });

              for await (const event of anthropicStream) {
                if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                  finalTextBuffer += event.delta.text;
                  send({ type: 'text', text: event.delta.text });
                  sentAnyThisAttempt = true;
                }
              }

              return anthropicStream.finalMessage();
            },
            { canRetry: () => !sentAnyThisAttempt }
          );
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
            } else if (block.name === 'get_channel_library') {
              result = await toolGetChannelLibrary(request, input);
            } else if (block.name === 'get_agency_playbooks') {
              result = await toolGetAgencyPlaybooks(request, input);
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
            } else if (block.name === 'update_media_plan_flight') {
              result = await toolUpdateMediaPlanFlight(request, input);
            } else if (block.name === 'set_media_plan_channels') {
              result = await toolSetMediaPlanChannels(request, input);
            // Client Intelligence Hub (Tier 2)
            } else if (block.name === 'get_client_intelligence') {
              result = await toolGetClientIntelligence(request, input);
            // Invoice & Reports
            } else if (block.name === 'generate_invoice') {
              result = await toolGenerateInvoice(request, input);
            } else if (block.name === 'generate_report') {
              result = await toolGenerateReport(request, input);
            // Live ad platform tools (Tier 3)
            } else if (block.name === 'get_live_meta_campaigns') {
              result = await toolGetLiveMetaCampaigns(request, input);
            // Setup Auditor
            } else if (block.name === 'find_live_ad_campaigns') {
              result = await toolFindLiveAdCampaigns(request, input);
            } else if (block.name === 'register_setup_auditor_campaign') {
              result = await toolRegisterSetupAuditorCampaign(request, input);
            } else if (block.name === 'list_setup_auditor_campaigns') {
              result = await toolListSetupAuditorCampaigns(request, input);
            } else if (block.name === 'run_setup_audit') {
              result = await toolRunSetupAudit(request, input);
            } else if (block.name === 'get_setup_audit_findings') {
              result = await toolGetSetupAuditFindings(request, input);
            } else {
              result = { error: `Unknown tool: ${block.name}` };
            }

            // Track client context for output links
            if (result?.client_id) contextClientId = result.client_id;

            // Emit audit step
            const auditStep: AgentAuditStep = {
              tool: block.name,
              label: TOOL_LABELS[block.name] ?? block.name,
              summary: buildAuditSummary(block.name, input, result),
              timestamp: new Date().toISOString(),
              is_write: WRITE_TOOLS.includes(block.name),
              is_error: !!result?.error,
            };
            auditSteps.push(auditStep);
            send({ type: 'audit_step', step: auditStep });

            // Collect output links for write tools that produce navigable outputs
            const links = buildOutputLinks(block.name, input, result, contextClientId);
            for (const link of links) {
              if (!outputLinks.some(l => l.href === link.href)) {
                outputLinks.push(link);
              }
            }

            // Emit structured action event so the UI can trigger animations
            const writableTools = ['complete_action_point', 'create_action_point', 'create_client', 'update_media_plan_budget', 'update_media_plan_flight', 'set_media_plan_channels', 'run_setup_audit', 'register_setup_auditor_campaign'];
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
        send({ type: 'error', message: friendlyAnthropicErrorMessage(err) });

        if (agentRunId) {
          await supabase
            .from('agent_runs')
            .update({ status: 'error', completed_at: new Date().toISOString(), audit_trail: auditSteps })
            .eq('id', agentRunId);
        }
      }

      if (outputLinks.length > 0) {
        send({ type: 'output_links', links: outputLinks });
      }

      send({ type: 'done' });

      if (agentRunId) {
        await supabase
          .from('agent_runs')
          .update({
            audit_trail: auditSteps,
            final_output: finalTextBuffer || null,
            output_links: outputLinks,
            completed_at: new Date().toISOString(),
            status: 'completed',
          })
          .eq('id', agentRunId);
      }

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
