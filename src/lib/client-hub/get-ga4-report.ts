/**
 * Aggregates data for the Client Hub "Google Analytics — Traffic" and
 * "Google Analytics — Behaviour" sections — a sibling to
 * get-google-ads-report.ts, same principle: self-fetched by their own
 * section components, not folded into the shared ClientHubData bag.
 *
 * KPI tiles and the daily trend chart read google_analytics_metrics, which
 * the always-on 6h refresh cron already keeps warm (see ga4-live.ts) — no
 * new GA4 API calls. The breakdown readers (channel/device/country/landing
 * page/new-vs-returning/events) read google_analytics_breakdowns, which is
 * only populated on-demand by syncGA4Breakdowns() (ga4-breakdowns.ts) via
 * the section's "Sync" button — see that file for why it isn't on the cron.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { HubMetric } from './get-hub-data';

interface DateRange {
  start: string;
  end: string;
}

export interface GA4DailyPoint {
  date: string;
  totalUsers: number;
  sessions: number;
  conversions: number;
  engagementRate: number;
  bounceRate: number;
  screenPageViews: number;
}

export interface DonutBucket {
  name: string;
  value: number;
}

export interface GA4LandingPageRow {
  page: string;
  sessions: number;
  users: number;
}

export interface GA4EventRow {
  eventName: string;
  eventCount: number;
  conversions: number;
}

// GA4 rate/duration metrics can't be summed across days (or across
// properties, but syncGA4Data already aggregates properties) — average the
// daily values instead. Everything else is a count and sums correctly.
const RATE_METRICS = new Set(['engagementRate', 'bounceRate', 'averageSessionDuration']);

async function readMetrics(supabase: SupabaseClient, clientId: string, { start, end }: DateRange) {
  const { data } = await supabase
    .from('google_analytics_metrics')
    .select('date, metric_name, metric_value')
    .eq('client_id', clientId)
    .gte('date', start).lte('date', end);
  return data ?? [];
}

export async function getGA4KpiTiles(supabase: SupabaseClient, clientId: string, range: DateRange): Promise<HubMetric[]> {
  const rows = await readMetrics(supabase, clientId, range);

  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const r of rows) {
    sums.set(r.metric_name, (sums.get(r.metric_name) ?? 0) + Number(r.metric_value || 0));
    counts.set(r.metric_name, (counts.get(r.metric_name) ?? 0) + 1);
  }
  const valueOf = (metric: string): number => {
    const sum = sums.get(metric) ?? 0;
    if (!RATE_METRICS.has(metric)) return sum;
    const n = counts.get(metric) ?? 0;
    return n > 0 ? sum / n : 0;
  };

  return [
    { key: 'totalUsers', label: 'Users', value: valueOf('totalUsers'), format: 'compact', sub: 'Google Analytics', deltaPct: null },
    { key: 'newUsers', label: 'New users', value: valueOf('newUsers'), format: 'compact', sub: 'Google Analytics', deltaPct: null },
    { key: 'sessions', label: 'Sessions', value: valueOf('sessions'), format: 'compact', sub: 'Google Analytics', deltaPct: null },
    { key: 'engagementRate', label: 'Engagement rate', value: valueOf('engagementRate') * 100, format: 'percent', sub: 'Google Analytics', deltaPct: null },
    { key: 'averageSessionDuration', label: 'Avg. session duration', value: valueOf('averageSessionDuration'), format: 'number', sub: 'Google Analytics', deltaPct: null },
    { key: 'conversions', label: 'Conversions', value: valueOf('conversions'), format: 'compact', sub: 'Google Analytics', deltaPct: null },
  ];
}

/** Raw daily series, no rolling window — mirrors get-google-ads-report.ts's getGoogleAdsDailySeries. */
export async function getGA4DailySeries(supabase: SupabaseClient, clientId: string, range: DateRange): Promise<GA4DailyPoint[]> {
  const rows = await readMetrics(supabase, clientId, range);

  const byDate = new Map<string, GA4DailyPoint>();
  for (const r of rows) {
    const cur = byDate.get(r.date) ?? {
      date: r.date, totalUsers: 0, sessions: 0, conversions: 0, engagementRate: 0, bounceRate: 0, screenPageViews: 0,
    };
    const value = Number(r.metric_value || 0);
    if (r.metric_name === 'totalUsers') cur.totalUsers = value;
    else if (r.metric_name === 'sessions') cur.sessions = value;
    else if (r.metric_name === 'conversions') cur.conversions = value;
    else if (r.metric_name === 'engagementRate') cur.engagementRate = value * 100;
    else if (r.metric_name === 'bounceRate') cur.bounceRate = value * 100;
    else if (r.metric_name === 'screenPageViews') cur.screenPageViews = value;
    byDate.set(r.date, cur);
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function readBreakdown(supabase: SupabaseClient, clientId: string, dimension: string, range?: DateRange) {
  let query = supabase
    .from('google_analytics_breakdowns')
    .select('dimension_value, sessions, users, conversions, engaged_sessions, event_count')
    .eq('client_id', clientId)
    .eq('dimension', dimension);
  if (range) query = query.gte('date', range.start).lte('date', range.end);
  const { data } = await query;
  return data ?? [];
}

/** Traffic by channel (Organic Search, Paid Search, Direct, Referral, Social, Email…), date-range aware. */
export async function getGA4ChannelBreakdown(supabase: SupabaseClient, clientId: string, range: DateRange): Promise<DonutBucket[]> {
  const rows = await readBreakdown(supabase, clientId, 'channel', range);
  const byChannel = new Map<string, number>();
  for (const r of rows) byChannel.set(r.dimension_value, (byChannel.get(r.dimension_value) ?? 0) + Number(r.sessions || 0));
  return [...byChannel.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/** Sessions by device category, date-range aware. */
export async function getGA4DeviceBreakdown(supabase: SupabaseClient, clientId: string, range: DateRange): Promise<DonutBucket[]> {
  const rows = await readBreakdown(supabase, clientId, 'device', range);
  const byDevice = new Map<string, number>();
  for (const r of rows) {
    const label = r.dimension_value.charAt(0).toUpperCase() + r.dimension_value.slice(1);
    byDevice.set(label, (byDevice.get(label) ?? 0) + Number(r.sessions || 0));
  }
  return [...byDevice.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

const NEW_VS_RETURNING_LABELS: Record<string, string> = { new: 'New visitors', returning: 'Returning visitors' };

/** New vs. returning visitors by sessions, date-range aware. */
export async function getGA4NewVsReturningBreakdown(supabase: SupabaseClient, clientId: string, range: DateRange): Promise<DonutBucket[]> {
  const rows = await readBreakdown(supabase, clientId, 'newVsReturning', range);
  const byBucket = new Map<string, number>();
  for (const r of rows) {
    const label = NEW_VS_RETURNING_LABELS[r.dimension_value] ?? r.dimension_value;
    byBucket.set(label, (byBucket.get(label) ?? 0) + Number(r.sessions || 0));
  }
  return [...byBucket.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/** Top countries by sessions — a last-sync snapshot, not date-range filtered (see ga4-breakdowns.ts). */
export async function getGA4TopCountries(supabase: SupabaseClient, clientId: string): Promise<DonutBucket[]> {
  const rows = await readBreakdown(supabase, clientId, 'country');
  const byCountry = new Map<string, number>();
  for (const r of rows) byCountry.set(r.dimension_value, (byCountry.get(r.dimension_value) ?? 0) + Number(r.sessions || 0));
  return [...byCountry.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
}

/** Top landing pages by sessions — a last-sync snapshot, not date-range filtered. */
export async function getGA4TopLandingPages(supabase: SupabaseClient, clientId: string): Promise<GA4LandingPageRow[]> {
  const rows = await readBreakdown(supabase, clientId, 'landingPage');
  const byPage = new Map<string, { sessions: number; users: number }>();
  for (const r of rows) {
    const cur = byPage.get(r.dimension_value) ?? { sessions: 0, users: 0 };
    cur.sessions += Number(r.sessions || 0);
    cur.users += Number(r.users || 0);
    byPage.set(r.dimension_value, cur);
  }
  return [...byPage.entries()]
    .map(([page, v]) => ({ page, sessions: v.sessions, users: v.users }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 20);
}

/** Top named events (including key events/conversions) by event count — a last-sync snapshot. */
export async function getGA4TopEvents(supabase: SupabaseClient, clientId: string): Promise<GA4EventRow[]> {
  const rows = await readBreakdown(supabase, clientId, 'eventName');
  const byEvent = new Map<string, { eventCount: number; conversions: number }>();
  for (const r of rows) {
    const cur = byEvent.get(r.dimension_value) ?? { eventCount: 0, conversions: 0 };
    cur.eventCount += Number(r.event_count || 0);
    cur.conversions += Number(r.conversions || 0);
    byEvent.set(r.dimension_value, cur);
  }
  return [...byEvent.entries()]
    .map(([eventName, v]) => ({ eventName, eventCount: v.eventCount, conversions: v.conversions }))
    .sort((a, b) => b.eventCount - a.eventCount)
    .slice(0, 15);
}
