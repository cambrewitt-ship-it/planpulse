/**
 * Aggregates data for the Client Hub "Google Ads — Performance" and
 * "Google Ads — Insights" sections — a sibling to get-hub-data.ts
 * (self-fetched by their own section components, not folded into the
 * shared ClientHubData bag), same principle as get-demographics.ts.
 *
 * Daily-series reads here are intentionally raw (no smoothing) — unlike
 * perf-series.ts's computePerfSeries, which always returns a 7-day rolling
 * aggregate for the trend builder. The Looker-style line charts need real
 * daily points since the AI insight callout cites specific single-day
 * figures.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { HubMetric } from './get-hub-data';

export interface GoogleAdsDailyPoint {
  date: string;
  impressions: number;
  clicks: number;
  ctr: number;
  avgCpc: number;
}

export interface GoogleAdsAdGroupRow {
  adGroupName: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  ctr: number;
  avgCpc: number;
}

export interface GoogleAdsBudgetRow {
  campaignName: string;
  dailyBudget: number;
  sharePct: number;
  explicitlyShared: boolean;
}

interface DateRange {
  start: string;
  end: string;
}

/** Raw daily series from ad_performance_metrics (platform='google-ads'), summed across campaigns per day — no rolling window. */
export async function getGoogleAdsDailySeries(supabase: SupabaseClient, clientId: string, { start, end }: DateRange): Promise<GoogleAdsDailyPoint[]> {
  const { data } = await supabase
    .from('ad_performance_metrics')
    .select('date, impressions, clicks, spend')
    .eq('client_id', clientId)
    .eq('platform', 'google-ads')
    .gte('date', start)
    .lte('date', end)
    .not('campaign_id', 'like', 'manual-override-%');

  const byDate = new Map<string, { impressions: number; clicks: number; spend: number }>();
  for (const r of data ?? []) {
    const cur = byDate.get(r.date) ?? { impressions: 0, clicks: 0, spend: 0 };
    cur.impressions += Number(r.impressions || 0);
    cur.clicks += Number(r.clicks || 0);
    cur.spend += Number(r.spend || 0);
    byDate.set(r.date, cur);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      impressions: v.impressions,
      clicks: v.clicks,
      ctr: v.impressions > 0 ? (v.clicks / v.impressions) * 100 : 0,
      avgCpc: v.clicks > 0 ? v.spend / v.clicks : 0,
    }));
}

export async function getGoogleAdsKpiTiles(supabase: SupabaseClient, clientId: string, { start, end }: DateRange): Promise<HubMetric[]> {
  const series = await getGoogleAdsDailySeries(supabase, clientId, { start, end });
  const totals = series.reduce((acc, p) => ({
    impressions: acc.impressions + p.impressions,
    clicks: acc.clicks + p.clicks,
  }), { impressions: 0, clicks: 0 });

  const { data: spendRows } = await supabase
    .from('ad_performance_metrics')
    .select('spend')
    .eq('client_id', clientId).eq('platform', 'google-ads')
    .gte('date', start).lte('date', end)
    .not('campaign_id', 'like', 'manual-override-%');
  const totalSpend = (spendRows ?? []).reduce((s, r) => s + Number(r.spend || 0), 0);

  const { data: shareRows } = await supabase
    .from('google_ads_search_impression_share')
    .select('search_impression_share')
    .eq('client_id', clientId)
    .gte('date', start).lte('date', end)
    .not('search_impression_share', 'is', null);
  const shareValues = (shareRows ?? []).map(r => Number(r.search_impression_share));
  const avgImpressionShare = shareValues.length > 0 ? shareValues.reduce((s, v) => s + v, 0) / shareValues.length : null;

  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const avgCpc = totals.clicks > 0 ? totalSpend / totals.clicks : 0;

  const metrics: HubMetric[] = [
    { key: 'impressions', label: 'Impressions', value: totals.impressions, format: 'compact', sub: 'Google Ads', deltaPct: null },
    { key: 'clicks', label: 'Clicks', value: totals.clicks, format: 'number', sub: 'Google Ads', deltaPct: null },
    { key: 'ctr', label: 'CTR', value: ctr, format: 'percent', sub: 'Google Ads', deltaPct: null },
    { key: 'avgCpc', label: 'Avg. CPC', value: avgCpc, format: 'currency', sub: 'Google Ads', deltaPct: null },
    { key: 'cost', label: 'Cost', value: totalSpend, format: 'currency', sub: 'Google Ads', deltaPct: null },
  ];
  if (avgImpressionShare != null) {
    metrics.push({ key: 'searchImpressionShare', label: 'Search Impr. share', value: avgImpressionShare, format: 'percent', sub: 'Google Ads', deltaPct: null });
  }
  return metrics;
}

export async function getGoogleAdsAdGroupBreakdown(supabase: SupabaseClient, clientId: string, { start, end }: DateRange): Promise<GoogleAdsAdGroupRow[]> {
  const { data } = await supabase
    .from('google_ads_ad_group_metrics')
    .select('ad_group_name, campaign_name, impressions, clicks, spend')
    .eq('client_id', clientId)
    .gte('date', start).lte('date', end);

  const byAdGroup = new Map<string, { campaignName: string; impressions: number; clicks: number; spend: number }>();
  for (const r of data ?? []) {
    const key = `${r.campaign_name}|${r.ad_group_name}`;
    const cur = byAdGroup.get(key) ?? { campaignName: r.campaign_name ?? '', impressions: 0, clicks: 0, spend: 0 };
    cur.impressions += Number(r.impressions || 0);
    cur.clicks += Number(r.clicks || 0);
    cur.spend += Number(r.spend || 0);
    byAdGroup.set(key, cur);
  }

  return [...byAdGroup.entries()]
    .map(([key, v]) => ({
      adGroupName: key.split('|')[1] ?? '',
      campaignName: v.campaignName,
      impressions: v.impressions,
      clicks: v.clicks,
      ctr: v.impressions > 0 ? (v.clicks / v.impressions) * 100 : 0,
      avgCpc: v.clicks > 0 ? v.spend / v.clicks : 0,
    }))
    .sort((a, b) => b.impressions - a.impressions);
}

/** Reads the current campaign budget snapshot — no date filter, the table always reflects "as of last sync." */
export async function getGoogleAdsBudgetSplit(supabase: SupabaseClient, clientId: string): Promise<GoogleAdsBudgetRow[]> {
  const { data } = await supabase
    .from('google_ads_campaign_budgets')
    .select('campaign_name, daily_budget_micros, explicitly_shared')
    .eq('client_id', clientId);

  const rows = data ?? [];
  const total = rows.reduce((s, r) => s + Number(r.daily_budget_micros || 0), 0);

  return rows
    .map(r => ({
      campaignName: r.campaign_name ?? '',
      dailyBudget: Number(r.daily_budget_micros || 0) / 1_000_000,
      sharePct: total > 0 ? (Number(r.daily_budget_micros || 0) / total) * 100 : 0,
      explicitlyShared: !!r.explicitly_shared,
    }))
    .sort((a, b) => b.dailyBudget - a.dailyBudget);
}

// ── Insights page ────────────────────────────────────────────────────────────

export interface GoogleAdsSearchTermRow {
  searchTerm: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

export interface GoogleAdsGeoRow {
  regionName: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  ctr: number;
  averageCpc: number;
}

export interface DonutBucket {
  name: string;
  value: number;
}

/** Reads the current search-term snapshot — no date filter, the table always reflects "as of last sync." */
export async function getGoogleAdsSearchTerms(supabase: SupabaseClient, clientId: string): Promise<GoogleAdsSearchTermRow[]> {
  const { data } = await supabase
    .from('google_ads_search_terms')
    .select('search_term, campaign_name, impressions, clicks, ctr')
    .eq('client_id', clientId)
    .order('impressions', { ascending: false })
    .limit(100);

  return (data ?? []).map(r => ({
    searchTerm: r.search_term,
    campaignName: r.campaign_name ?? '',
    impressions: Number(r.impressions || 0),
    clicks: Number(r.clicks || 0),
    ctr: Number(r.ctr || 0),
  }));
}

/** Reads the current region breakdown snapshot, aggregated by region across campaigns. */
export async function getGoogleAdsGeoBreakdown(supabase: SupabaseClient, clientId: string): Promise<GoogleAdsGeoRow[]> {
  const { data } = await supabase
    .from('google_ads_geo_breakdown')
    .select('region_name, region_criterion_id, campaign_name, impressions, clicks, average_cpc')
    .eq('client_id', clientId);

  const byRegion = new Map<string, { campaignNames: Set<string>; impressions: number; clicks: number; spend: number }>();
  for (const r of data ?? []) {
    const key = r.region_name ?? `Region ${r.region_criterion_id}`;
    const cur = byRegion.get(key) ?? { campaignNames: new Set<string>(), impressions: 0, clicks: 0, spend: 0 };
    cur.campaignNames.add(r.campaign_name ?? '');
    cur.impressions += Number(r.impressions || 0);
    cur.clicks += Number(r.clicks || 0);
    cur.spend += Number(r.clicks || 0) * Number(r.average_cpc || 0);
    byRegion.set(key, cur);
  }

  return [...byRegion.entries()]
    .map(([regionName, v]) => ({
      regionName,
      campaignName: v.campaignNames.size > 1 ? `${v.campaignNames.size} campaigns` : [...v.campaignNames][0] ?? '',
      impressions: v.impressions,
      clicks: v.clicks,
      ctr: v.impressions > 0 ? (v.clicks / v.impressions) * 100 : 0,
      averageCpc: v.clicks > 0 ? v.spend / v.clicks : 0,
    }))
    .sort((a, b) => b.impressions - a.impressions);
}

const DEVICE_LABELS: Record<string, string> = {
  MOBILE: 'Mobile', DESKTOP: 'Desktop', TABLET: 'Tablet', CONNECTED_TV: 'Connected TV', OTHER: 'Other', UNKNOWN: 'Unknown',
};

/** Reads the current device breakdown snapshot, aggregated by device across campaigns/dates. */
export async function getGoogleAdsDeviceDonut(supabase: SupabaseClient, clientId: string): Promise<DonutBucket[]> {
  const { data } = await supabase.from('google_ads_device_breakdown').select('device, impressions').eq('client_id', clientId);

  const byDevice = new Map<string, number>();
  for (const r of data ?? []) {
    const label = DEVICE_LABELS[r.device] ?? r.device;
    byDevice.set(label, (byDevice.get(label) ?? 0) + Number(r.impressions || 0));
  }
  return [...byDevice.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Derives a day-of-week donut from ad_performance_metrics — no new table or fetch, just date math on data already synced by the 6h cron. */
export async function getGoogleAdsDayOfWeekDonut(supabase: SupabaseClient, clientId: string, { start, end }: DateRange): Promise<DonutBucket[]> {
  const { data } = await supabase
    .from('ad_performance_metrics')
    .select('date, impressions')
    .eq('client_id', clientId).eq('platform', 'google-ads')
    .gte('date', start).lte('date', end)
    .not('campaign_id', 'like', 'manual-override-%');

  const byDay = new Array(7).fill(0);
  for (const r of data ?? []) {
    const day = new Date(`${r.date}T00:00:00Z`).getUTCDay();
    byDay[day] += Number(r.impressions || 0);
  }
  return DAY_LABELS.map((name, i) => ({ name, value: byDay[i] })).filter(d => d.value > 0);
}

function normalizeAgeLabel(raw: string): string {
  const m = /^AGE_RANGE_(\d+)_(\d+|UP)$/.exec(raw);
  if (m) return m[2] === 'UP' ? `${m[1]}+` : `${m[1]}-${m[2]}`;
  return 'Unknown';
}

function normalizeGenderLabel(raw: string): string {
  const v = raw.toUpperCase();
  if (v === 'MALE' || v === 'FEMALE') return v.charAt(0) + v.slice(1).toLowerCase();
  return 'Unknown';
}

/**
 * Google-Ads-only, impressions-weighted age/gender view for the Insights
 * donuts — deliberately separate from get-demographics.ts's
 * getClientDemographics, which blends Meta+Google and weights by spend when
 * available. This view is Google-only and always weights by impressions,
 * matching the Looker Studio "Age by Impressions"/"Gender by Impressions" charts.
 */
export async function getGoogleAdsAgeGenderByImpressions(supabase: SupabaseClient, clientId: string, { start, end }: DateRange): Promise<{ age: DonutBucket[]; gender: DonutBucket[] }> {
  const { data } = await supabase
    .from('client_ad_demographics')
    .select('breakdown_type, breakdown_value, impressions')
    .eq('client_id', clientId).eq('platform', 'google-ads')
    .gte('date', start).lte('date', end);

  const ageMap = new Map<string, number>();
  const genderMap = new Map<string, number>();
  for (const r of data ?? []) {
    if (r.breakdown_type === 'age') {
      const label = normalizeAgeLabel(r.breakdown_value);
      ageMap.set(label, (ageMap.get(label) ?? 0) + Number(r.impressions || 0));
    } else if (r.breakdown_type === 'gender') {
      const label = normalizeGenderLabel(r.breakdown_value);
      genderMap.set(label, (genderMap.get(label) ?? 0) + Number(r.impressions || 0));
    }
  }

  return {
    age: [...ageMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    gender: [...genderMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
  };
}
