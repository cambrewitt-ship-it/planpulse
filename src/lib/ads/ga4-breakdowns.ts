/**
 * On-demand GA4 dimension-breakdown sync for the Client Hub "Google
 * Analytics — Traffic" and "Google Analytics — Behaviour" sections (channel,
 * device, country, landing page, new-vs-returning, event name). Deliberately
 * separate from src/lib/ads/ga4-live.ts: that file's date-series query runs
 * for every connected client every 6 hours via the refresh cron, and adding
 * these dimension queries there would inflate that always-on call with data
 * only this on-demand report needs. Triggered by a manual "Sync" button in
 * the Client Hub (see api/ads/google-analytics/fetch-breakdowns/route.ts),
 * mirroring src/lib/ads/google-ads-performance-extras.ts.
 *
 * channel/device/newVsReturning are queried with a date dimension and
 * upserted per-day, so the Hub's date-range picker can filter them the same
 * way it filters the KPI tiles. country/landingPage/eventName are high-
 * cardinality, so they're queried as a single top-N snapshot over the sync's
 * date range (no date dimension) and replaced wholesale on each sync —
 * deleted then re-inserted, rather than upserted, since there's no date key
 * to naturally overwrite stale rows from a previous sync.
 */

import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';
import { generateInsightNarrative } from '@/lib/client-hub/generate-insight';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

interface DailyBreakdownRow {
  date: string;
  dimensionValue: string;
  sessions: number;
  users: number;
  conversions: number;
  engagedSessions: number;
}

interface SnapshotBreakdownRow {
  dimensionValue: string;
  sessions: number;
  users: number;
  eventCount: number;
  conversions: number;
}

function ga4DateToIso(value: string): string {
  return value.length === 8 && !value.includes('-')
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : value;
}

async function runGA4Report(propertyId: string, accessToken: string, body: Record<string, unknown>): Promise<{ rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }> }> {
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  if (!response.ok) {
    const errorText = await response.text();
    let message = `GA4 Data API error: ${response.status}`;
    try {
      const errorJson = JSON.parse(errorText);
      message = errorJson.error?.message || errorJson.message || message;
    } catch {
      message = errorText.substring(0, 200) || message;
    }
    throw new Error(message);
  }
  return response.json();
}

async function fetchDailyDimension(propertyId: string, accessToken: string, dimensionName: string, startDate: string, endDate: string): Promise<DailyBreakdownRow[]> {
  const json = await runGA4Report(propertyId, accessToken, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'date' }, { name: dimensionName }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'conversions' }, { name: 'engagedSessions' }],
  });
  return (json.rows ?? []).map((row) => {
    const values = (row.metricValues ?? []).map((m) => parseFloat(m.value ?? '0') || 0);
    return {
      date: ga4DateToIso(row.dimensionValues?.[0]?.value ?? ''),
      dimensionValue: row.dimensionValues?.[1]?.value || '(not set)',
      sessions: values[0] ?? 0,
      users: values[1] ?? 0,
      conversions: values[2] ?? 0,
      engagedSessions: values[3] ?? 0,
    };
  });
}

async function fetchSnapshotDimension(
  propertyId: string, accessToken: string, dimensionName: string,
  metricNames: string[], orderByMetric: string, limit: number, startDate: string, endDate: string,
): Promise<SnapshotBreakdownRow[]> {
  const json = await runGA4Report(propertyId, accessToken, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: dimensionName }],
    metrics: metricNames.map((name) => ({ name })),
    orderBys: [{ metric: { metricName: orderByMetric }, desc: true }],
    limit,
  });
  return (json.rows ?? []).map((row) => {
    const values = (row.metricValues ?? []).map((m) => parseFloat(m.value ?? '0') || 0);
    const byName = new Map(metricNames.map((name, i) => [name, values[i] ?? 0]));
    return {
      dimensionValue: row.dimensionValues?.[0]?.value || '(not set)',
      sessions: byName.get('sessions') ?? 0,
      users: byName.get('totalUsers') ?? 0,
      eventCount: byName.get('eventCount') ?? 0,
      conversions: byName.get('conversions') ?? 0,
    };
  });
}

function mergeDaily(map: Map<string, DailyBreakdownRow>, rows: DailyBreakdownRow[]): void {
  for (const r of rows) {
    const key = `${r.date}|${r.dimensionValue}`;
    const cur = map.get(key) ?? { date: r.date, dimensionValue: r.dimensionValue, sessions: 0, users: 0, conversions: 0, engagedSessions: 0 };
    cur.sessions += r.sessions; cur.users += r.users; cur.conversions += r.conversions; cur.engagedSessions += r.engagedSessions;
    map.set(key, cur);
  }
}

function mergeSnapshot(map: Map<string, SnapshotBreakdownRow>, rows: SnapshotBreakdownRow[]): void {
  for (const r of rows) {
    const cur = map.get(r.dimensionValue) ?? { dimensionValue: r.dimensionValue, sessions: 0, users: 0, eventCount: 0, conversions: 0 };
    cur.sessions += r.sessions; cur.users += r.users; cur.eventCount += r.eventCount; cur.conversions += r.conversions;
    map.set(r.dimensionValue, cur);
  }
}

async function saveInsight(supabase: AnySupabase, clientId: string, clientName: string, sectionKey: string, startDate: string, endDate: string, facts: string[]): Promise<void> {
  if (facts.length === 0) return;
  const insightText = await generateInsightNarrative({ clientName, periodStart: startDate, periodEnd: endDate, facts });
  if (!insightText) return;
  await supabase.from('client_hub_insights').upsert({
    client_id: clientId, section_key: sectionKey, insight_text: insightText,
    period_start: startDate, period_end: endDate, generated_at: new Date().toISOString(),
  }, { onConflict: 'client_id,section_key' });
}

export interface SyncGA4BreakdownsResult {
  success: boolean;
  rowsSaved: number;
  propertiesProcessed: number;
  error?: string;
  errors?: Array<{ propertyId: string; error: string }>;
}

export async function syncGA4Breakdowns(params: {
  supabase: AnySupabase;
  nango: Nango;
  userId: string;
  clientId: string;
  clientName: string;
  connectionId: string;
  startDate: string;
  endDate: string;
}): Promise<SyncGA4BreakdownsResult> {
  const { supabase, nango, userId, clientId, clientName, connectionId, startDate, endDate } = params;

  let nangoConnection;
  try {
    nangoConnection = await nango.getConnection(toNangoPlatform('google-analytics'), connectionId);
  } catch (e: unknown) {
    return { success: false, rowsSaved: 0, propertiesProcessed: 0, error: `Failed to retrieve OAuth credentials: ${e instanceof Error ? e.message : String(e)}` };
  }
  const accessToken = (nangoConnection.credentials as { access_token?: string })?.access_token;
  if (!accessToken) {
    return { success: false, rowsSaved: 0, propertiesProcessed: 0, error: 'No access token found in Nango connection. Please reconnect your Google Analytics account.' };
  }

  // google_analytics_accounts has no client_id column — scoped by user_id only, mirroring syncGA4Data in ga4-live.ts.
  const { data: gaAccounts } = await supabase
    .from('google_analytics_accounts')
    .select('property_id, property_name')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!gaAccounts || gaAccounts.length === 0) {
    return { success: false, rowsSaved: 0, propertiesProcessed: 0, error: 'No active Google Analytics properties found for this user.' };
  }

  const errors: Array<{ propertyId: string; error: string }> = [];
  const channelByKey = new Map<string, DailyBreakdownRow>();
  const deviceByKey = new Map<string, DailyBreakdownRow>();
  const newVsReturningByKey = new Map<string, DailyBreakdownRow>();
  const countryByValue = new Map<string, SnapshotBreakdownRow>();
  const landingPageByValue = new Map<string, SnapshotBreakdownRow>();
  const eventByValue = new Map<string, SnapshotBreakdownRow>();

  await Promise.all(gaAccounts.map(async (account: { property_id: string }) => {
    const propId = account.property_id;
    try {
      const [channel, device, newVsReturning, country, landingPage, events] = await Promise.all([
        fetchDailyDimension(propId, accessToken, 'sessionDefaultChannelGroup', startDate, endDate),
        fetchDailyDimension(propId, accessToken, 'deviceCategory', startDate, endDate),
        fetchDailyDimension(propId, accessToken, 'newVsReturning', startDate, endDate),
        fetchSnapshotDimension(propId, accessToken, 'country', ['sessions', 'totalUsers'], 'sessions', 20, startDate, endDate),
        fetchSnapshotDimension(propId, accessToken, 'landingPage', ['sessions', 'totalUsers'], 'sessions', 20, startDate, endDate),
        fetchSnapshotDimension(propId, accessToken, 'eventName', ['eventCount', 'conversions'], 'eventCount', 30, startDate, endDate),
      ]);
      mergeDaily(channelByKey, channel);
      mergeDaily(deviceByKey, device);
      mergeDaily(newVsReturningByKey, newVsReturning);
      mergeSnapshot(countryByValue, country);
      mergeSnapshot(landingPageByValue, landingPage);
      mergeSnapshot(eventByValue, events);
    } catch (e: unknown) {
      errors.push({ propertyId: propId, error: e instanceof Error ? e.message : String(e) });
    }
  }));

  if (errors.length === gaAccounts.length) {
    return { success: false, rowsSaved: 0, propertiesProcessed: gaAccounts.length, error: errors.map((e) => e.error).join('; '), errors };
  }

  // All properties collapse into the first property's id, mirroring syncGA4Data's existing multi-property aggregation.
  const primaryPropertyId = gaAccounts[0].property_id;
  let rowsSaved = 0;

  const dailyRows: Array<Record<string, unknown>> = [];
  const pushDaily = (dimension: string, map: Map<string, DailyBreakdownRow>) => {
    for (const r of map.values()) {
      dailyRows.push({
        user_id: userId, client_id: clientId, property_id: primaryPropertyId, date: r.date,
        dimension, dimension_value: r.dimensionValue,
        sessions: r.sessions, users: r.users, conversions: r.conversions, engaged_sessions: r.engagedSessions, event_count: 0,
      });
    }
  };
  pushDaily('channel', channelByKey);
  pushDaily('device', deviceByKey);
  pushDaily('newVsReturning', newVsReturningByKey);

  if (dailyRows.length > 0) {
    const { error } = await supabase.from('google_analytics_breakdowns')
      .upsert(dailyRows, { onConflict: 'user_id,property_id,date,dimension,dimension_value' });
    if (!error) rowsSaved += dailyRows.length;
  }

  const snapshotDate = endDate;
  async function replaceSnapshot(dimension: string, map: Map<string, SnapshotBreakdownRow>) {
    await supabase.from('google_analytics_breakdowns').delete()
      .eq('user_id', userId).eq('property_id', primaryPropertyId).eq('dimension', dimension);
    const rows = [...map.values()].map((r) => ({
      user_id: userId, client_id: clientId, property_id: primaryPropertyId, date: snapshotDate,
      dimension, dimension_value: r.dimensionValue,
      sessions: r.sessions, users: r.users, conversions: r.conversions, engaged_sessions: 0, event_count: r.eventCount,
    }));
    if (rows.length > 0) {
      const { error } = await supabase.from('google_analytics_breakdowns').insert(rows);
      if (!error) rowsSaved += rows.length;
    }
  }
  await replaceSnapshot('country', countryByValue);
  await replaceSnapshot('landingPage', landingPageByValue);
  await replaceSnapshot('eventName', eventByValue);

  // AI insight callouts — generated once per sync, not per page load.
  const channelTotals = new Map<string, number>();
  for (const r of channelByKey.values()) channelTotals.set(r.dimensionValue, (channelTotals.get(r.dimensionValue) ?? 0) + r.sessions);
  const topChannel = [...channelTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  const totalChannelSessions = [...channelTotals.values()].reduce((s, v) => s + v, 0);

  const deviceTotals = new Map<string, number>();
  for (const r of deviceByKey.values()) deviceTotals.set(r.dimensionValue, (deviceTotals.get(r.dimensionValue) ?? 0) + r.sessions);
  const topDevice = [...deviceTotals.entries()].sort((a, b) => b[1] - a[1])[0];

  const perfFacts: string[] = [];
  if (topChannel && totalChannelSessions > 0) {
    perfFacts.push(`Top traffic channel: ${topChannel[0]} with ${Math.round((topChannel[1] / totalChannelSessions) * 100)}% of sessions`);
  }
  if (topDevice) perfFacts.push(`Most sessions came from ${topDevice[0].toLowerCase()} devices`);

  const topLandingPage = [...landingPageByValue.values()].sort((a, b) => b.sessions - a.sessions)[0];
  const topCountry = [...countryByValue.values()].sort((a, b) => b.sessions - a.sessions)[0];
  const topEvent = [...eventByValue.values()].sort((a, b) => b.eventCount - a.eventCount)[0];

  const insightFacts: string[] = [];
  if (topLandingPage) insightFacts.push(`Top landing page: "${topLandingPage.dimensionValue}" with ${Math.round(topLandingPage.sessions)} sessions`);
  if (topCountry) insightFacts.push(`Top country: ${topCountry.dimensionValue} with ${Math.round(topCountry.sessions)} sessions`);
  if (topEvent) insightFacts.push(`Most frequent event: "${topEvent.dimensionValue}" with ${Math.round(topEvent.eventCount)} occurrences`);

  await Promise.all([
    saveInsight(supabase, clientId, clientName, 'ga4Performance', startDate, endDate, perfFacts),
    saveInsight(supabase, clientId, clientName, 'ga4Insights', startDate, endDate, insightFacts),
  ]);

  return { success: true, rowsSaved, propertiesProcessed: gaAccounts.length, errors: errors.length > 0 ? errors : undefined };
}
