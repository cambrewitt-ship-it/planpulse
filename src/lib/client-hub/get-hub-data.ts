/**
 * Shared data-aggregation for the Client Hub — used by both the
 * agency-authenticated route (api/clients/[id]/hub) and the public
 * token-gated route (api/hub/[token]) so the two surfaces never drift.
 * Returns the full data bag for all sections, unfiltered by section
 * visibility — callers decide what to keep.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { format, startOfMonth, subDays, differenceInCalendarDays, parseISO } from 'date-fns';
import { getPlatformForChannel, getChannelCategory } from '@/lib/utils/channel-pacing';
import { toBenchmarkChannelName } from '@/lib/calculate-performance-health';

const AD_PLATFORMS = ['meta-ads', 'google-ads'] as const;
type AdPlatform = typeof AD_PLATFORMS[number];

export type ConversionPlatform = 'meta-ads' | 'google-ads' | 'ga4';

export interface HubMetric {
  key: string;
  label: string;
  value: number;
  format: 'currency' | 'number' | 'percent' | 'compact';
  sub: string;
  deltaPct: number | null;
}

export interface HubTrendPoint {
  month: string;
  spend: number;
  leads: number;
}

export interface HubChannelActual {
  name: string;
  platform: string;
  spend: number;
  ctr: number | null;
}

export interface HubPacing {
  dayOfMonth: number;
  daysInMonth: number;
  monthElapsedPct: number;
  mtdActual: number;
  monthlyBudget: number;
  budgetSpentPct: number;
  statusLabel: string;
}

export interface HubGoal {
  id: string;
  name: string;
  metric: string;
  direction: 'higher_is_better' | 'lower_is_better' | null;
  floor: number | null;
  target: number | null;
  stretch: number | null;
  current: number | null;
  unit: string;
}

export interface HubBrief {
  objectives: string | null;
  kpis: string | null;
  target_audience: string | null;
  budget: number | null;
  start_date: string | null;
  end_date: string | null;
}

export interface HubNote {
  id: string;
  note_body: string;
  note_type: 'handover' | 'client_intel' | 'general';
  is_pinned: boolean;
  created_at: string;
}

export interface HubDocument {
  id: string;
  file_name: string;
  file_type: string;
  uploaded_at: string;
}

export interface HubSpendRow {
  name: string;
  planned: number;
  actual: number;
  benchmarkLabel: string | null;
  benchmarkGood: boolean | null;
}

export interface HubConversionConfig {
  /** Which platform the "Leads" metric is sourced from. */
  platform: ConversionPlatform;
  /** The event/action actually used to count conversions within that platform (Meta action_type,
   *  Google Ads conversion action name, or GA4 event name), or null if auto-detected/unset. */
  actionType: string | null;
  /** Display label for the conversion metric card (e.g. "Leads"). */
  label: string;
}

export interface ClientHubData {
  client: { id: string; name: string; logo_url: string | null };
  agency: { name: string | null; logo_url: string | null } | null;
  period: { start: string; end: string };
  metrics: HubMetric[];
  monthlyTrend: HubTrendPoint[];
  channelActuals: HubChannelActual[];
  pacing: HubPacing | null;
  goals: HubGoal[];
  brief: HubBrief | null;
  notes: HubNote[];
  documents: HubDocument[];
  spendRows: HubSpendRow[];
  conversion: HubConversionConfig;
}

export interface GetHubDataOptions {
  /** Overrides the default reporting period (campaign-to-date / trailing 150 days). */
  start?: string;
  end?: string;
  /** Which platform the "Leads" metric is sourced from; defaults to 'meta-ads'. */
  conversionPlatform?: ConversionPlatform | null;
  /** Explicit event/action within that platform to count as conversions; null/undefined falls back to auto-detection. */
  conversionActionType?: string | null;
  /** Display label for the conversion metric; defaults to "Leads". */
  conversionLabel?: string;
}

interface AdRow {
  date: string;
  platform: AdPlatform;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  conversions: number | null;
  meta_actions: Array<{ action_type: string; value: string }> | null;
  google_conversion_actions: Array<{ action_type: string; value: string }> | null;
}

interface Ga4Row {
  date: string;
  metric_name: string;
  metric_value: number;
}

function metaActionTotals(rows: AdRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.platform !== 'meta-ads' || !row.meta_actions) continue;
    for (const act of row.meta_actions) {
      totals.set(act.action_type, (totals.get(act.action_type) ?? 0) + (parseInt(act.value, 10) || 0));
    }
  }
  return totals;
}

function detectMetaConversionType(totals: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [type, count] of totals) {
    if (/^offsite_conversion|^mobile_app_install/.test(type) && count > bestCount) {
      best = type; bestCount = count;
    }
  }
  if (!best) {
    const vanity = /^video_view$|^page_engagement$|^post_engagement$|^photo_view$|^comment$|^like$/;
    for (const [type, count] of totals) {
      if (!vanity.test(type) && count > bestCount) { best = type; bestCount = count; }
    }
  }
  return best;
}

/** Conversions contributed by one ad_performance_metrics row, given the configured Leads source. */
function conversionsFor(row: AdRow, platform: ConversionPlatform, actionType: string | null): number {
  if (platform === 'ga4' || row.platform !== platform) return 0;
  if (platform === 'meta-ads') {
    if (!actionType || !row.meta_actions) return 0;
    return row.meta_actions
      .filter(a => a.action_type === actionType)
      .reduce((s, a) => s + (parseInt(a.value, 10) || 0), 0);
  }
  // google-ads
  if (actionType && row.google_conversion_actions) {
    return row.google_conversion_actions
      .filter(a => a.action_type === actionType)
      .reduce((s, a) => s + (parseInt(a.value, 10) || 0), 0);
  }
  return row.conversions ?? 0;
}

/** Sum of a GA4 metric across rows for the configured event name (defaults to 'conversions'). */
function ga4ConversionsFor(rows: Ga4Row[], eventName: string | null): number {
  const target = eventName || 'conversions';
  return rows.filter(r => r.metric_name === target).reduce((s, r) => s + r.metric_value, 0);
}

function aggregate(rows: AdRow[], platform: ConversionPlatform, actionType: string | null, ga4Rows: Ga4Row[]) {
  let spend = 0, impressions = 0, clicks = 0;
  for (const r of rows) {
    spend += r.spend;
    impressions += r.impressions;
    clicks += r.clicks;
  }
  const conversions = platform === 'ga4' ? ga4ConversionsFor(ga4Rows, actionType) : rows.reduce((s, r) => s + conversionsFor(r, platform, actionType), 0);
  return { spend, impressions, clicks, conversions };
}

/** Prorates a MediaPlanChannel's flights.monthlySpend across [start, end]. */
function plannedSpendForChannel(channel: any, start: Date, end: Date): number {
  let total = 0;
  for (const flight of channel.flights ?? []) {
    const monthlySpend = flight.monthlySpend ?? {};
    for (const [key, amount] of Object.entries(monthlySpend)) {
      const [yStr, mStr] = key.split('-');
      const year = Number(yStr), month = Number(mStr); // month 1-based
      if (!year || !month) continue;
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0);
      if (monthEnd < start || monthStart > end) continue;
      const daysInMonth = monthEnd.getDate();
      const overlapStart = monthStart < start ? start : monthStart;
      const overlapEnd = monthEnd > end ? end : monthEnd;
      const overlapDays = differenceInCalendarDays(overlapEnd, overlapStart) + 1;
      if (overlapDays <= 0) continue;
      total += (Number(amount) || 0) * (overlapDays / daysInMonth);
    }
  }
  return total;
}

export async function getClientHubData(
  supabase: SupabaseClient,
  clientId: string,
  options: GetHubDataOptions = {},
): Promise<ClientHubData | null> {
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, logo_url, user_id')
    .eq('id', clientId)
    .maybeSingle();

  if (!client) return null;

  let agency: ClientHubData['agency'] = null;
  if (client.user_id) {
    const { data: agencyRow } = await supabase
      .from('agency_settings')
      .select('agency_name, logo_url')
      .eq('user_id', client.user_id)
      .maybeSingle();
    if (agencyRow) agency = { name: agencyRow.agency_name ?? null, logo_url: agencyRow.logo_url ?? null };
  }

  const { data: briefRow } = await supabase
    .from('client_briefs')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const brief: HubBrief | null = briefRow ? {
    objectives: briefRow.objectives ?? null,
    kpis: briefRow.kpis ?? null,
    target_audience: briefRow.target_audience ?? null,
    budget: briefRow.budget ?? null,
    start_date: briefRow.start_date ?? null,
    end_date: briefRow.end_date ?? null,
  } : null;

  const today = new Date();
  let periodStartClamped: Date;
  let periodEndClamped: Date;
  if (options.start && options.end) {
    periodStartClamped = parseISO(options.start);
    const requestedEnd = parseISO(options.end);
    periodEndClamped = requestedEnd > today ? today : requestedEnd;
  } else {
    const periodStart = brief?.start_date ? parseISO(brief.start_date) : subDays(today, 150);
    periodStartClamped = periodStart > today ? subDays(today, 1) : periodStart;
    periodEndClamped = today;
  }
  const period = { start: format(periodStartClamped, 'yyyy-MM-dd'), end: format(periodEndClamped, 'yyyy-MM-dd') };

  // ── Media plan channels ────────────────────────────────────────────────
  const { data: planRow } = await supabase
    .from('client_media_plan_builder')
    .select('channels')
    .eq('client_id', clientId)
    .maybeSingle();

  const rawChannels: any[] = (planRow?.channels as any[]) ?? [];
  const channels = rawChannels.filter(ch => ch.channelName);

  // ── Ad performance metrics over the period ─────────────────────────────
  const { data: adRowsRaw } = await supabase
    .from('ad_performance_metrics')
    .select('date, platform, spend, impressions, clicks, ctr, conversions, meta_actions, google_conversion_actions')
    .eq('client_id', clientId)
    .in('platform', AD_PLATFORMS as unknown as string[])
    .gte('date', period.start)
    .lte('date', period.end)
    .not('campaign_id', 'like', 'manual-override-%');

  const adRows: AdRow[] = (adRowsRaw ?? []).map((r: any) => ({
    date: r.date,
    platform: r.platform,
    spend: Number(r.spend || 0),
    impressions: Number(r.impressions || 0),
    clicks: Number(r.clicks || 0),
    ctr: r.ctr != null ? Number(r.ctr) : null,
    conversions: r.conversions != null ? Number(r.conversions) : null,
    meta_actions: r.meta_actions ?? null,
    google_conversion_actions: r.google_conversion_actions ?? null,
  }));

  const conversionPlatform: ConversionPlatform = options.conversionPlatform || 'meta-ads';
  const metaActionCounts = metaActionTotals(adRows);
  const explicitConversionEvent = options.conversionActionType || null;
  const conversionEvent = conversionPlatform === 'meta-ads'
    ? (explicitConversionEvent || detectMetaConversionType(metaActionCounts))
    : explicitConversionEvent;
  const conversionLabel = options.conversionLabel || 'Leads';

  // Prior period of equal length, for delta comparisons
  const periodDays = differenceInCalendarDays(periodEndClamped, periodStartClamped) + 1;
  const priorStart = format(subDays(periodStartClamped, periodDays), 'yyyy-MM-dd');
  const priorEnd = format(subDays(periodStartClamped, 1), 'yyyy-MM-dd');
  const { data: priorRowsRaw } = await supabase
    .from('ad_performance_metrics')
    .select('date, platform, spend, impressions, clicks, ctr, conversions, meta_actions, google_conversion_actions')
    .eq('client_id', clientId)
    .in('platform', AD_PLATFORMS as unknown as string[])
    .gte('date', priorStart)
    .lte('date', priorEnd)
    .not('campaign_id', 'like', 'manual-override-%');
  const priorAdRows: AdRow[] = (priorRowsRaw ?? []).map((r: any) => ({
    date: r.date, platform: r.platform, spend: Number(r.spend || 0),
    impressions: Number(r.impressions || 0), clicks: Number(r.clicks || 0),
    ctr: r.ctr != null ? Number(r.ctr) : null,
    conversions: r.conversions != null ? Number(r.conversions) : null,
    meta_actions: r.meta_actions ?? null,
    google_conversion_actions: r.google_conversion_actions ?? null,
  }));

  // GA4 rows — only fetched when GA4 is the configured Leads source
  let ga4Rows: Ga4Row[] = [];
  let priorGa4Rows: Ga4Row[] = [];
  if (conversionPlatform === 'ga4') {
    const [{ data: ga4RowsRaw }, { data: priorGa4RowsRaw }] = await Promise.all([
      supabase.from('google_analytics_metrics').select('date, metric_name, metric_value')
        .eq('client_id', clientId).gte('date', period.start).lte('date', period.end),
      supabase.from('google_analytics_metrics').select('date, metric_name, metric_value')
        .eq('client_id', clientId).gte('date', priorStart).lte('date', priorEnd),
    ]);
    ga4Rows = (ga4RowsRaw ?? []).map((r: any) => ({ date: r.date, metric_name: r.metric_name, metric_value: Number(r.metric_value || 0) }));
    priorGa4Rows = (priorGa4RowsRaw ?? []).map((r: any) => ({ date: r.date, metric_name: r.metric_name, metric_value: Number(r.metric_value || 0) }));
  }

  const totals = aggregate(adRows, conversionPlatform, conversionEvent, ga4Rows);
  const priorTotals = aggregate(priorAdRows, conversionPlatform, conversionEvent, priorGa4Rows);

  const pctDelta = (curr: number, prev: number): number | null =>
    prev > 0 ? ((curr - prev) / prev) * 100 : null;

  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  const cpl = totals.conversions > 0 ? totals.spend / totals.conversions : 0;
  const priorCtr = priorTotals.impressions > 0 ? (priorTotals.clicks / priorTotals.impressions) * 100 : 0;
  const priorCpc = priorTotals.clicks > 0 ? priorTotals.spend / priorTotals.clicks : 0;
  const priorCpl = priorTotals.conversions > 0 ? priorTotals.spend / priorTotals.conversions : 0;

  const metrics: HubMetric[] = [
    { key: 'spend', label: 'Total Spend', value: totals.spend, format: 'currency', sub: `${format(periodStartClamped, 'MMM')}–${format(periodEndClamped, 'MMM')}`, deltaPct: pctDelta(totals.spend, priorTotals.spend) },
    { key: 'leads', label: conversionLabel, value: totals.conversions, format: 'number', sub: 'qualified, period to date', deltaPct: pctDelta(totals.conversions, priorTotals.conversions) },
    { key: 'cpl', label: `Cost per ${conversionLabel.replace(/s$/i, '')}`, value: cpl, format: 'currency', sub: `blended cost per ${conversionLabel.toLowerCase()}`, deltaPct: cpl && priorCpl ? -pctDelta(cpl, priorCpl)! : null },
    { key: 'ctr', label: 'CTR', value: ctr, format: 'percent', sub: 'blended, paid channels', deltaPct: pctDelta(ctr, priorCtr) },
    { key: 'cpc', label: 'Avg. CPC', value: cpc, format: 'currency', sub: 'blended, paid channels', deltaPct: cpc && priorCpc ? -pctDelta(cpc, priorCpc)! : null },
    { key: 'impressions', label: 'Impressions', value: totals.impressions, format: 'compact', sub: 'paid channels', deltaPct: pctDelta(totals.impressions, priorTotals.impressions) },
  ];

  // ── Monthly trend (spend + leads) ───────────────────────────────────────
  const byMonth = new Map<string, { spend: number; leads: number }>();
  for (const r of adRows) {
    const key = r.date.slice(0, 7);
    const cur = byMonth.get(key) ?? { spend: 0, leads: 0 };
    cur.spend += r.spend;
    cur.leads += conversionsFor(r, conversionPlatform, conversionEvent);
    byMonth.set(key, cur);
  }
  if (conversionPlatform === 'ga4') {
    for (const r of ga4Rows) {
      if (r.metric_name !== (conversionEvent || 'conversions')) continue;
      const key = r.date.slice(0, 7);
      const cur = byMonth.get(key) ?? { spend: 0, leads: 0 };
      cur.leads += r.metric_value;
      byMonth.set(key, cur);
    }
  }
  const monthlyTrend: HubTrendPoint[] = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({ month: format(parseISO(`${key}-01`), 'MMM'), spend: v.spend, leads: v.leads }));

  // ── Per-channel actuals (for spend donut / CTR-by-channel / spend table) ─
  const byPlatform = new Map<AdPlatform, { spend: number; impressions: number; clicks: number }>();
  for (const r of adRows) {
    const cur = byPlatform.get(r.platform) ?? { spend: 0, impressions: 0, clicks: 0 };
    cur.spend += r.spend; cur.impressions += r.impressions; cur.clicks += r.clicks;
    byPlatform.set(r.platform, cur);
  }

  // Deduped per-platform actuals for the donut/CTR chart — built from byPlatform
  // rather than per media-plan-channel, so two channel rows sharing an ad
  // platform (e.g. "Meta Ads — Prospecting" + "Meta Ads — Retargeting") don't
  // each claim the platform's full spend and blow past 100% on the donut.
  const platformChannelNames = new Map<AdPlatform, string>();
  for (const ch of channels) {
    const p = getPlatformForChannel(ch.channelName);
    if (AD_PLATFORMS.includes(p as AdPlatform) && !platformChannelNames.has(p as AdPlatform)) {
      platformChannelNames.set(p as AdPlatform, ch.channelName);
    }
  }
  const channelActuals: HubChannelActual[] = [...byPlatform.entries()].map(([platform, agg]) => ({
    name: platformChannelNames.get(platform) ?? (platform === 'meta-ads' ? 'Meta Ads' : 'Google Ads'),
    platform,
    spend: agg.spend,
    ctr: agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : null,
  }));

  const spendRows: HubSpendRow[] = [];

  const benchmarkChannelNames = [...new Set(
    channels.map(ch => toBenchmarkChannelName(getPlatformForChannel(ch.channelName), ch.channelName)),
  )];
  let benchmarks: any[] = [];
  if (benchmarkChannelNames.length > 0) {
    const { data } = await supabase
      .from('channel_benchmarks')
      .select('*')
      .in('channel_name', benchmarkChannelNames);
    benchmarks = data ?? [];
  }

  for (const ch of channels) {
    const category = ch.channelCategory || getChannelCategory(ch.channelName);
    if (category === 'fee') continue;

    const platform = getPlatformForChannel(ch.channelName);
    const planned = plannedSpendForChannel(ch, periodStartClamped, periodEndClamped);

    let actual = 0;
    if (AD_PLATFORMS.includes(platform as AdPlatform)) {
      actual = byPlatform.get(platform as AdPlatform)?.spend ?? 0;
    } else {
      actual = Number(ch.manualActualSpend ?? 0);
    }

    // Benchmark comparison — pick the first benchmark metric with real data
    let benchmarkLabel: string | null = null;
    let benchmarkGood: boolean | null = null;
    const benchmarkChannel = toBenchmarkChannelName(platform, ch.channelName);
    const channelBenchmarks = benchmarks.filter(b => b.channel_name === benchmarkChannel);
    const agg = byPlatform.get(platform as AdPlatform);
    for (const b of channelBenchmarks) {
      let real: number | null = null;
      if (b.metric_key === 'ctr' && agg && agg.impressions > 0) real = (agg.clicks / agg.impressions) * 100;
      else if (b.metric_key === 'cpc' && agg && agg.clicks > 0) real = agg.spend / agg.clicks;
      else if (b.metric_key === 'impressions' && agg) real = agg.impressions;
      else if (b.metric_key === 'clicks' && agg) real = agg.clicks;
      if (real === null || real <= 0) continue;
      const met = b.direction === 'higher_is_better' ? real >= b.benchmark_value : real <= b.benchmark_value;
      benchmarkGood = met;
      benchmarkLabel = `${b.metric_label} ${real.toFixed(real < 10 ? 2 : 0)}${b.unit === 'percent' ? '%' : ''} vs ${b.benchmark_value}${b.unit === 'percent' ? '%' : ''} bmk`;
      break;
    }

    spendRows.push({ name: ch.channelName, planned, actual, benchmarkLabel, benchmarkGood });
  }

  // ── Pacing (current month elapsed vs budget spent) ──────────────────────
  const { data: healthStatus } = await supabase
    .from('client_health_status')
    .select('mtd_actual_spend')
    .eq('client_id', clientId)
    .maybeSingle();

  const monthStart = startOfMonth(today);
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dayOfMonth = today.getDate();
  const monthlyBudget = channels
    .filter(ch => (ch.channelCategory || getChannelCategory(ch.channelName)) !== 'fee')
    .reduce((sum, ch) => sum + plannedSpendForChannel(ch, monthStart, new Date(today.getFullYear(), today.getMonth() + 1, 0)), 0);

  const mtdFromAdRows = adRows
    .filter(r => r.date >= format(monthStart, 'yyyy-MM-dd'))
    .reduce((s, r) => s + r.spend, 0);
  const mtdActual = healthStatus?.mtd_actual_spend != null ? Number(healthStatus.mtd_actual_spend) : mtdFromAdRows;

  const pacing: HubPacing | null = monthlyBudget > 0 || mtdActual > 0 ? {
    dayOfMonth,
    daysInMonth,
    monthElapsedPct: Math.min(100, (dayOfMonth / daysInMonth) * 100),
    mtdActual,
    monthlyBudget,
    budgetSpentPct: monthlyBudget > 0 ? Math.min(100, (mtdActual / monthlyBudget) * 100) : 0,
    statusLabel: monthlyBudget > 0 && mtdActual / monthlyBudget > (dayOfMonth / daysInMonth) + 0.1 ? 'Ahead of pace'
      : monthlyBudget > 0 && mtdActual / monthlyBudget < (dayOfMonth / daysInMonth) - 0.1 ? 'Behind pace'
      : 'On pace',
  } : null;

  // ── Goals ────────────────────────────────────────────────────────────────
  const { data: goalRows } = await supabase
    .from('client_campaign_goals')
    .select('*')
    .eq('client_id', clientId)
    .order('is_primary', { ascending: false })
    .order('set_at', { ascending: false });

  const metricAliases: Record<string, keyof ReturnType<typeof aggregate> | 'ctr' | 'cpc' | 'cpl'> = {
    cpl: 'cpl', cost_per_lead: 'cpl', cpa: 'cpl', cost_per_acquisition: 'cpl',
    ctr: 'ctr', cpc: 'cpc', leads: 'conversions', conversions: 'conversions',
  };
  const goals: HubGoal[] = (goalRows ?? []).map((g: any) => {
    const channelAgg = channelActuals.find(c => c.name === g.channel);
    const aliasKey = metricAliases[(g.metric ?? '').toLowerCase().replace(/\s+/g, '_')];
    let current: number | null = null;
    if (aliasKey === 'ctr') current = channelAgg?.ctr ?? null;
    else if (aliasKey === 'conversions') current = totals.conversions;
    else if (aliasKey === 'cpl') current = cpl || null;
    else if (aliasKey === 'cpc') current = channelAgg ? cpc : null;
    const floor: number | null = g.floor_value ?? null;
    const stretch: number | null = g.stretch_value ?? null;
    return {
      id: g.id,
      name: `${g.channel} — ${g.metric}`,
      metric: g.metric,
      direction: floor != null && stretch != null ? (stretch >= floor ? 'higher_is_better' : 'lower_is_better') : null,
      floor,
      target: g.target_value ?? null,
      stretch,
      current,
      unit: aliasKey === 'ctr' ? '%' : aliasKey === 'cpl' || aliasKey === 'cpc' ? '$' : '',
    };
  });

  // ── Notes ────────────────────────────────────────────────────────────────
  const { data: noteRows } = await supabase
    .from('client_notes')
    .select('id, note_body, note_type, is_pinned, created_at')
    .eq('client_id', clientId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  const notes: HubNote[] = (noteRows ?? []) as HubNote[];

  // ── Documents ────────────────────────────────────────────────────────────
  const { data: docRows } = await supabase
    .from('client_documents')
    .select('id, file_name, file_type, uploaded_at')
    .eq('client_id', clientId)
    .order('uploaded_at', { ascending: false });

  const documents: HubDocument[] = (docRows ?? []) as HubDocument[];

  return {
    client: { id: client.id, name: client.name, logo_url: client.logo_url ?? null },
    agency,
    period,
    metrics,
    monthlyTrend,
    channelActuals,
    pacing,
    goals,
    brief,
    notes,
    documents,
    spendRows,
    conversion: {
      platform: conversionPlatform,
      actionType: conversionEvent,
      label: conversionLabel,
    },
  };
}
