import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { patchSandboxPlanFlightBudget, upsertSandboxPlanFlight, snapToWeekCommencing } from '@/lib/media-plan/sandbox-sync';
import { nzToday, nzDateKeyOffset, nzStartOfMonth, formatNZ } from '@/lib/timezone';
import { withCacheControl } from '@/lib/agent-tools';

export const maxDuration = 60;

// Marks the boundary between the internal summary and the client-facing update
// in an AI-generated overview. Kept in sync with the frontend split in ai-shared.tsx.
const CLIENT_FACING_DELIMITER = '===CLIENT-FACING===';

const CLIENT_AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_client_intelligence',
    description: "Fetch this client's campaign brief, goals, handover notes, and documents. Always call this first when generating an overview.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_channel_performance',
    description: 'Get channel-level performance and spend pacing for this client. Returns, per channel: planned vs actual spend, variance %, pacing status, impressions, clicks, CTR, CPC, CPA, conversions, reach, and frequency. Always call this for an overview — it is the source of the real numbers to cite.',
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
    description: "Update a channel's planned budget for one whole calendar month in this client's media plan. Use only when the request is genuinely month-scoped. If the user gives ANY specific dates, a date range, or says \"w/c\" / \"week commencing\" (e.g. \"$10,000 on Google from Sep 7th to 21st\", \"100 on meta during w/c 31 Aug until 6 Sep\"), use update_media_plan_flight instead — even if the range falls mostly within one month. Works even if the channel isn't in the plan yet or the plan is empty — it creates the channel automatically rather than erroring.",
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
    name: 'update_media_plan_flight',
    description: "Set a channel's budget for a specific week-commencing (W/C) date range — a single flight/burst — rather than a whole calendar month. Use whenever the user gives specific dates or a W/C range, including when the channel isn't in the plan yet or the plan is empty — this tool creates the channel automatically and never errors on an unrecognised channel name. start_week and end_week should both be Mondays; if the user's dates aren't Mondays, snap each to its week-commencing Monday yourself. An existing flight on this channel that overlaps the given range is replaced; otherwise a new flight is added.",
    input_schema: {
      type: 'object',
      properties: {
        channel_name: { type: 'string', description: 'Channel to update (e.g. "Meta Ads", "Google Ads").' },
        start_week: { type: 'string', description: 'Week-commencing start date, YYYY-MM-DD, must be a Monday.' },
        end_week: { type: 'string', description: 'Week-commencing end date, YYYY-MM-DD, must be a Monday. Inclusive — flight runs through end_week + 6 days.' },
        budget: { type: 'number', description: 'Total budget for this flight, in dollars.' },
        monthly_spend: {
          type: 'object',
          description: 'How the total budget splits across calendar months the flight touches, as { "YYYY-M": amount }, distributed proportionally by weeks-in-month. Must sum to exactly `budget`.',
        },
      },
      required: ['channel_name', 'start_week', 'end_week', 'budget', 'monthly_spend'],
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
      const date = formatNZ(new Date(n.created_at), {}, 'en-AU');
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

function getMonthsInRange(startDate: string, endDate: string): string[] {
  const months: string[] = [];
  const [sy, sm] = startDate.split('-').map(Number);
  const [ey, em] = endDate.split('-').map(Number);
  let y = sy; let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return months;
}

const PLATFORM_LABELS: Record<string, string> = {
  'meta-ads': 'Meta Ads', 'google-ads': 'Google Ads',
  'linkedin-ads': 'LinkedIn Ads', 'tiktok-ads': 'TikTok Ads',
};

async function toolGetChannelPerformance(clientId: string, input: { start_date?: string; end_date?: string }) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Unauthorized' };

  const start_date = input.start_date ?? nzStartOfMonth();
  const end_date = input.end_date ?? nzToday();

  const [metricsRes, mediaPlanRes] = await Promise.all([
    supabase.from('ad_performance_metrics')
      .select('platform, spend, impressions, clicks, conversions, reach, frequency')
      .eq('client_id', clientId)
      .gte('date', start_date)
      .lte('date', end_date)
      .not('campaign_id', 'like', 'manual-override-%'),
    supabase.from('client_media_plan_builder')
      .select('channels')
      .eq('client_id', clientId)
      .maybeSingle(),
  ]);

  const metrics = metricsRes.data ?? [];
  const rawChannels: any[] = ((mediaPlanRes.data as any)?.channels as any[]) ?? [];

  const actualByPlatform = new Map<string, { spend: number; impressions: number; clicks: number; conversions: number; reach: number; freqSum: number; freqCount: number }>();
  for (const m of metrics as any[]) {
    const existing = actualByPlatform.get(m.platform) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0, reach: 0, freqSum: 0, freqCount: 0 };
    existing.spend += Number(m.spend || 0);
    existing.impressions += Number(m.impressions || 0);
    existing.clicks += Number(m.clicks || 0);
    existing.conversions += Number(m.conversions || 0);
    existing.reach += Number(m.reach || 0);
    if (m.frequency != null) { existing.freqSum += Number(m.frequency); existing.freqCount += 1; }
    actualByPlatform.set(m.platform, existing);
  }

  const monthsInRange = getMonthsInRange(start_date, end_date);
  const plannedByChannel = new Map<string, number>();
  for (const ch of rawChannels) {
    let total = 0;
    for (const f of ch.flights ?? []) {
      if (f.monthlySpend) {
        for (const m of monthsInRange) total += Number(f.monthlySpend[m] ?? 0);
      }
    }
    if (total > 0) plannedByChannel.set(ch.channelName, total);
  }

  const channelNames = new Set([
    ...Array.from(actualByPlatform.keys()).map(p => PLATFORM_LABELS[p] ?? p),
    ...Array.from(plannedByChannel.keys()),
  ]);

  const channels = Array.from(channelNames).map(name => {
    const platformKey = Object.entries(PLATFORM_LABELS).find(([, v]) => v === name)?.[0];
    const perf = platformKey ? actualByPlatform.get(platformKey) : null;
    const actual_spend = perf?.spend ?? 0;
    const planned_budget = plannedByChannel.get(name) ?? null;
    const variance_pct = planned_budget && planned_budget > 0
      ? Math.round(((actual_spend - planned_budget) / planned_budget) * 1000) / 10 : null;
    const impressions = perf?.impressions || null;
    const clicks = perf?.clicks || null;
    const conversions = perf?.conversions || null;
    const reach = perf?.reach || null;
    const frequency = perf && perf.freqCount > 0 ? Math.round((perf.freqSum / perf.freqCount) * 100) / 100 : null;
    const ctr = impressions && clicks ? Math.round((clicks / impressions) * 10000) / 100 : null;
    const cpc = clicks ? Math.round((actual_spend / clicks) * 100) / 100 : null;
    const cpa = conversions && conversions > 0 ? Math.round((actual_spend / conversions) * 100) / 100 : null;
    const pacing_status = variance_pct === null ? 'no plan'
      : variance_pct > 15 ? 'overpacing'
      : variance_pct < -15 ? 'underpacing'
      : 'on track';
    return { name, planned_budget, actual_spend, variance_pct, pacing_status, impressions, clicks, ctr, cpc, cpa, conversions, reach, frequency };
  });

  const total_planned_budget = channels.reduce((s, c) => s + (c.planned_budget ?? 0), 0) || null;
  const total_actual_spend = channels.reduce((s, c) => s + c.actual_spend, 0);
  const total_spend_variance_pct = total_planned_budget && total_planned_budget > 0
    ? Math.round(((total_actual_spend - total_planned_budget) / total_planned_budget) * 1000) / 10 : null;

  return {
    date_range: { start: start_date, end: end_date },
    total_planned_budget,
    total_actual_spend,
    total_spend_variance_pct,
    channels,
  };
}

async function toolGetActionPoints(clientId: string, req: NextRequest) {
  const data = await callInternal('/api/agency/action-points', req);
  if (data.error) return data;

  const today = nzToday();
  const in7Days = nzDateKeyOffset(7);

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
    .select('client_id, channels, sandbox_plan')
    .eq('client_id', clientId)
    .maybeSingle();

  const channels: any[] = JSON.parse(JSON.stringify(mediaPlan?.channels || []));
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
    flights.push({ id: `flight-${Date.now()}`, startWeek, endWeek, monthlySpend: {} });
  }

  const oldBudget = flights[0].monthlySpend?.[input.month] ?? 0;
  if (!flights[0].monthlySpend) flights[0].monthlySpend = {};
  flights[0].monthlySpend[input.month] = input.new_budget;
  const updatedChannel = { ...channel, flights };
  if (isNewChannel) channels.push(updatedChannel);
  else channels[channelIdx] = updatedChannel;

  // The visible grid renders from sandbox_plan, not channels — keep both in sync.
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
    .upsert({ client_id: clientId, channels, sandbox_plan: updatedSandboxPlan }, { onConflict: 'client_id' });

  if (updateError) return { error: 'Failed to save budget update', details: updateError.message };

  return {
    success: true,
    message: `${isNewChannel || isNewFlight ? 'Added' : 'Updated'} ${channel.channelName} budget for ${input.month}: $${Number(oldBudget).toLocaleString()} → $${Number(input.new_budget).toLocaleString()}`,
    channel: channel.channelName,
    is_new_channel: isNewChannel,
    month: input.month,
    previous_budget: oldBudget,
    new_budget: input.new_budget,
  };
}

/** Last calendar day of a "YYYY-MM" month, as "YYYY-MM-DD". */
function monthEndISO(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m, 0); // day 0 of next month = last day of this month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function toolUpdateMediaPlanFlight(
  clientId: string,
  input: { channel_name: string; start_week: string; end_week: string; budget: number; monthly_spend: Record<string, number> }
) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Unauthorized' };

  const { data: mediaPlan } = await supabase
    .from('client_media_plan_builder')
    .select('client_id, channels, sandbox_plan')
    .eq('client_id', clientId)
    .maybeSingle();

  const startWeek = snapToWeekCommencing(input.start_week);
  const endWeek = snapToWeekCommencing(input.end_week);

  const channels: any[] = JSON.parse(JSON.stringify(mediaPlan?.channels || []));
  const channelIdx = channels.findIndex((ch: any) =>
    ch.channelName?.toLowerCase().includes(input.channel_name.toLowerCase())
  );

  // No matching channel (including a totally empty/nonexistent plan) — add it as a
  // new channel rather than erroring, so a single-channel "add" never needs a
  // separate replace-the-whole-plan tool.
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

  const newFlight = { id: overlapIdx >= 0 ? flights[overlapIdx].id : `flight-${Date.now()}`, startWeek, endWeek, monthlySpend: input.monthly_spend };
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
    .upsert({ client_id: clientId, channels, sandbox_plan: updatedSandboxPlan }, { onConflict: 'client_id' });

  if (updateError) return { error: 'Failed to save flight update', details: updateError.message };

  return {
    success: true,
    message: `${isNewChannel ? 'Added' : 'Set'} ${channel.channelName} to $${Number(input.budget).toLocaleString()} for W/C ${startWeek} – ${endWeek}`,
    channel: channel.channelName,
    is_new_channel: isNewChannel,
    start_week: startWeek,
    end_week: endWeek,
    budget: input.budget,
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

  // client_dashboard_overviews isn't in the generated Database types yet
  // (new table — types are regenerated separately from migrations), so it's
  // queried through an untyped handle. Same workaround as generate-insight.ts
  // uses for client_hub_insights.
  const untypedSupabase: SupabaseClient = supabase;

  const SYSTEM_PROMPT = `You are an AI assistant embedded in the dashboard for client "${clientName}" in PlanPulse. Today's date is ${nzToday()}.

You are focused exclusively on this client. You have access to their intelligence hub, channel performance, action points, and can take actions to update the dashboard.

**Available actions:**
- complete_action_point — tick off tasks in their To-Do list
- update_media_plan_budget — adjust a channel's planned budget for a whole calendar month, only when no specific dates are given at all. Also creates the channel automatically if it's not in the plan yet.
- update_media_plan_flight — set a channel's budget for a specific week-commencing (W/C) date range instead of a whole month. Use this whenever the user gives ANY specific dates or says "w/c" / "week commencing" (e.g. "$10,000 on Google from Sep 7th to 21st", "facebook ads, $3000 31 aug to 21 sep", "100 on meta during w/c 31 Aug until 6 Sep") — not update_media_plan_budget, even if the range falls entirely within one month. "w/c" always means this tool. Use it even if the channel isn't in the plan yet or the plan is completely empty, it creates the channel automatically rather than erroring. start_week/end_week must be Mondays — snap each to its week-commencing Monday yourself (don't ask first), and state the snapped W/C range plus the real end date (end_week + 6 days, since end_week is inclusive) in your confirmation afterwards. Compute monthly_spend proportionally by weeks-in-month across the range. If no year is given, use the plan year from the conversation's client context — never assume today's real-world year, never ask.
- update_manual_spend — update the actual spend figure on a non-digital channel (OOH, Organic Social, EDM, etc.)
- toggle_ooh_checklist — tick/untick OOH production milestones

Default to adding, without asking for confirmation first, whenever: the plan is empty, the channel mentioned isn't already in it, or the user's message says "add". Just call the write tool — only ask first if budget or dates are genuinely missing, or you'd be overwriting an existing flight/budget with different numbers the user didn't ask to change. After a write action, confirm what happened in 1-2 short lines — no restating the request, no walls of text.

**Never output narration, preamble, or commentary before or between tool calls** (e.g. never say things like "I'll pull the latest data first" or "Let me check that"). The interface already shows the user a loading indicator while tools run. Call whatever tools you need with no text output at all, and only write prose once you're producing your actual answer.

**When generating an overview** (the user asks for a general status, summary, or overview of the account), always call get_client_intelligence AND get_action_points first to get fresh data. Then call get_channel_performance for real spend and KPI numbers — you MUST use it, not the request text, as the source of every metric you cite. Produce your reply as exactly two sections and nothing else — no preamble, no closing remarks — in this order, separated by a line containing only \`${CLIENT_FACING_DELIMITER}\`:

1. **Internal summary** — for our team only, never seen by the client. ALL bullet points, nothing else — no introductory sentence, no heading, the reply starts directly on the first bullet. One blank line between each bullet, no bold text. Each bullet is grounded in the real numbers get_channel_performance returned — pacing vs. budget (cite the actual $ figures and % variance), CPA/CTR/CPC movement vs. target, overdue or at-risk action points, anything needing attention. Be direct about problems.
   Keep every bullet terse — a short fragment, not a full sentence with clauses stitched together. Hard cap ~12 words per bullet. Lead with the channel/metric and the number, cut every word that isn't load-bearing (no "with the flight plan at", "though it", "well under the", "worth a look" — just the fact). Split anything that needs two facts into two bullets rather than joining them with "and"/"though"/"while". Match this style exactly:
   - Feijoa: 127% over $49k budget — spend $62,090, flight 100% complete.
   - CPA $10.31, well under $15 target.
   - CPA up 12.3% in last 24h — watch.
   - 2 overdue: check Meta Pixel firing, refresh creatives (frequency >3.0).
   - LinkedIn reach under 50,000.
2. **Client-facing update** — everything after the delimiter. One flowing paragraph, no bullets, no headers, no bold — ready to paste straight into an email. It MUST reference at least 2-3 specific numbers pulled from get_channel_performance (spend, reach, frequency, CPA, CTR, conversions, impressions, etc.) — a vague update with no figures is a failed answer. Never fabricate a number or win the data doesn't support — if a metric isn't available from the tools, don't invent one, just leave it out.
   Before writing, work out where the campaign actually is: compare today's date against the campaign brief's start/end dates (or the media plan channel flight dates if the brief has none). Never default to "off to a good start" / "tracking well" opening language — that phrasing is only true in the first couple of weeks of a flight. If the flight is midway through, describe it as being in progress and report performance to date. If it's in its final weeks or already past its end date, frame it as a wrap-up of results, not a start. Lead with a genuine win backed by the data, state it plainly with the number attached, then a brief progress note appropriate to that stage, closing with a forward-looking note (drop the forward-looking note if the flight has already ended — summarize final results instead). Never mention internal risks, overdue tasks, or anything not appropriate to share externally.
   Match this style exactly for an early-stage flight (first 1-2 weeks):
   Feijoa's campaign is off to a strong start. In the first two weeks we've reached 82,000 people with an average frequency of 2.4. Cost per acquisition is already at $10.31, well inside the $15 target. We're tightening frequency on a few Meta ad sets and expanding LinkedIn targeting as we head into the next phase.
   For a flight that's midway through or later, adjust accordingly — for example:
   Feijoa's campaign is now past the halfway mark and performing well. We've reached 82,000 people with an average frequency of 2.4, and cost per acquisition sits at $10.31, well inside the $15 target. With a few weeks of the flight remaining, we're tightening frequency on a few Meta ad sets and expanding LinkedIn targeting to close out strong.

For any other question that isn't a full account overview, just answer normally in a single response — do not use the delimiter.

Be concise, professional, and action-oriented. Use bullet points and bold text. Lead with what needs immediate attention.`;

  const body = await request.json();
  const userMessages: Anthropic.MessageParam[] = body.messages ?? [];
  const overviewRequest = body.overviewRequest === true;
  const forceRefresh = body.forceRefresh === true;

  if (!userMessages.length) {
    return new Response(JSON.stringify({ error: 'No messages provided' }), { status: 400 });
  }

  // Auto-generated dashboard overview: served from a 12h server-side cache
  // (shared across every viewer of this client) unless a manual refresh was
  // requested, so a plain page load never re-runs the opus-4-7 tool loop below.
  if (overviewRequest && !forceRefresh) {
    const { data: cached } = await untypedSupabase
      .from('client_dashboard_overviews')
      .select('overview_text, generated_at')
      .eq('client_id', clientId)
      .maybeSingle();

    if (cached && Date.now() - new Date(cached.generated_at).getTime() < 12 * 60 * 60 * 1000) {
      const cacheEncoder = new TextEncoder();
      const cachedStream = new ReadableStream({
        start(controller) {
          const send = (data: object) => controller.enqueue(cacheEncoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          send({ type: 'text', text: cached.overview_text });
          send({ type: 'done' });
          controller.close();
        },
      });
      return new Response(cachedStream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      });
    }
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
            system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
            tools: withCacheControl(CLIENT_AGENT_TOOLS),
            messages,
            max_tokens: 2048,
          });

          // Buffer this turn's text rather than streaming it live — a turn that
          // ends in tool_use may carry narration ("I'll pull the latest data…")
          // ahead of the tool call, which we never want to surface to the user.
          // Only the final, tool-free turn's text is actually sent.
          let turnText = '';
          for await (const event of anthropicStream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              turnText += event.delta.text;
            }
          }

          const finalMsg = await anthropicStream.finalMessage();
          messages.push({ role: 'assistant', content: finalMsg.content });

          if (finalMsg.stop_reason !== 'tool_use') {
            if (turnText) send({ type: 'text', text: turnText });
            if (overviewRequest && turnText) {
              await untypedSupabase
                .from('client_dashboard_overviews')
                .upsert({ client_id: clientId, overview_text: turnText, generated_at: new Date().toISOString() });
            }
            break;
          }

          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const block of finalMsg.content) {
            if (block.type !== 'tool_use') continue;

            send({ type: 'tool_call', tool: block.name });

            const input = block.input as any;
            let result: any;

            if (block.name === 'get_client_intelligence') {
              result = await toolGetClientIntelligence(clientId, request);
            } else if (block.name === 'get_channel_performance') {
              result = await toolGetChannelPerformance(clientId, input);
            } else if (block.name === 'get_action_points') {
              result = await toolGetActionPoints(clientId, request);
            } else if (block.name === 'complete_action_point') {
              result = await toolCompleteActionPoint(clientId, input);
            } else if (block.name === 'update_media_plan_budget') {
              result = await toolUpdateMediaPlanBudget(clientId, input);
            } else if (block.name === 'update_media_plan_flight') {
              result = await toolUpdateMediaPlanFlight(clientId, input);
            } else if (block.name === 'update_manual_spend') {
              result = await toolUpdateManualSpend(clientId, input);
            } else if (block.name === 'toggle_ooh_checklist') {
              result = await toolToggleOohChecklist(clientId, input);
            } else {
              result = { error: `Unknown tool: ${block.name}` };
            }

            const writableTools = ['complete_action_point', 'update_media_plan_budget', 'update_media_plan_flight', 'update_manual_spend', 'toggle_ooh_checklist'];
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
