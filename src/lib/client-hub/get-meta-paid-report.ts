/**
 * Aggregates data for the Client Hub "Meta Ads — Paid" section — a sibling
 * to get-hub-data.ts (self-fetched by its own section component), same
 * principle as get-demographics.ts / get-google-ads-report.ts.
 *
 * Almost everything here reads meta_actions jsonb already flowing into
 * ad_performance_metrics via the existing 6h cron (see metaActionTotals in
 * get-hub-data.ts for the established pattern of summing by action_type).
 * Action-type strings (post_engagement, post_reaction, comment, like) were
 * confirmed against real production data before writing this file — see the
 * Chunk 4 access-verification note in the report-replication plan.
 *
 * The section's primary metric (default "post_engagement" / "Engagements")
 * is agency-configurable — see client_hub_config.meta_paid_action_type /
 * meta_paid_metric_label, added in 20260827_add_meta_paid_metric_config.sql
 * — so every function that used to hard-code "post_engagement" now takes an
 * explicit actionType param instead. The two comparison bar charts'
 * remaining hard-coded sides (comments/reactions, page likes) are likewise
 * configurable via client_hub_config.meta_paid_chart_config — see
 * meta-paid-chart-config.ts and 20260827_add_meta_paid_chart_config.sql.
 * getMetaTopAdsByEngagement reads net-new data (meta_ad_engagement, backed
 * by an on-demand ad-level sync — see src/lib/ads/meta-ad-level.ts), which
 * stores the full per-ad actions array precisely so metric changes don't
 * require a re-sync.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { HubMetric } from './get-hub-data';

export const DEFAULT_META_PAID_ACTION_TYPE = 'post_engagement';
export const DEFAULT_META_PAID_METRIC_LABEL = 'Engagements';

interface DateRange {
  start: string;
  end: string;
}

interface AdRow {
  date: string;
  reach: number;
  impressions: number;
  spend: number;
  meta_actions: Array<{ action_type: string; value: string }> | null;
}

function actionValue(row: AdRow, actionType: string): number {
  const action = row.meta_actions?.find(a => a.action_type === actionType);
  return action ? parseInt(action.value, 10) || 0 : 0;
}

async function fetchAdRows(supabase: SupabaseClient, clientId: string, { start, end }: DateRange): Promise<AdRow[]> {
  const { data } = await supabase
    .from('ad_performance_metrics')
    .select('date, reach, impressions, spend, meta_actions')
    .eq('client_id', clientId)
    .eq('platform', 'meta-ads')
    .gte('date', start).lte('date', end)
    .not('campaign_id', 'like', 'manual-override-%');

  return (data ?? []).map(r => ({
    date: r.date,
    reach: Number(r.reach || 0),
    impressions: Number(r.impressions || 0),
    spend: Number(r.spend || 0),
    meta_actions: r.meta_actions ?? null,
  }));
}

export async function getMetaPaidKpis(
  supabase: SupabaseClient, clientId: string, range: DateRange,
  actionType: string = DEFAULT_META_PAID_ACTION_TYPE, metricLabel: string = DEFAULT_META_PAID_METRIC_LABEL,
): Promise<HubMetric[]> {
  const rows = await fetchAdRows(supabase, clientId, range);
  const totals = rows.reduce((acc, r) => ({
    reach: acc.reach + r.reach,
    impressions: acc.impressions + r.impressions,
    metric: acc.metric + actionValue(r, actionType),
  }), { reach: 0, impressions: 0, metric: 0 });

  const metricRate = totals.impressions > 0 ? (totals.metric / totals.impressions) * 100 : 0;

  return [
    { key: 'reach', label: 'Reach', value: totals.reach, format: 'compact', sub: 'Meta Ads', deltaPct: null },
    { key: 'impressions', label: 'Impressions', value: totals.impressions, format: 'compact', sub: 'Meta Ads', deltaPct: null },
    { key: 'metric', label: metricLabel, value: totals.metric, format: 'compact', sub: 'Meta Ads', deltaPct: null },
    { key: 'metricRate', label: `${metricLabel} Rate`, value: metricRate, format: 'percent', sub: 'Meta Ads', deltaPct: null },
  ];
}

export interface MonthlyCommentsReactions {
  month: string;
  comments: number;
  reactions: number;
}

export async function getMetaCommentsVsReactionsByMonth(
  supabase: SupabaseClient, clientId: string, range: DateRange,
  commentsEvent: string = 'comment', reactionsEvent: string = 'post_reaction',
): Promise<MonthlyCommentsReactions[]> {
  const rows = await fetchAdRows(supabase, clientId, range);
  const byMonth = new Map<string, { comments: number; reactions: number }>();
  for (const r of rows) {
    const key = r.date.slice(0, 7);
    const cur = byMonth.get(key) ?? { comments: 0, reactions: 0 };
    cur.comments += actionValue(r, commentsEvent);
    cur.reactions += actionValue(r, reactionsEvent);
    byMonth.set(key, cur);
  }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));
}

export interface DailyValuePoint {
  date: string;
  value: number;
}

/** Raw daily cost-per-metric — no smoothing, same principle as the Google Ads Performance daily series. */
export async function getMetaCostPerEngagementSeries(
  supabase: SupabaseClient, clientId: string, range: DateRange, actionType: string = DEFAULT_META_PAID_ACTION_TYPE,
): Promise<DailyValuePoint[]> {
  const rows = await fetchAdRows(supabase, clientId, range);
  const byDate = new Map<string, { spend: number; metric: number }>();
  for (const r of rows) {
    const cur = byDate.get(r.date) ?? { spend: 0, metric: 0 };
    cur.spend += r.spend;
    cur.metric += actionValue(r, actionType);
    byDate.set(r.date, cur);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, value: v.metric > 0 ? v.spend / v.metric : 0 }));
}

export interface MonthlyLikesEngagements {
  month: string;
  pageLikes: number;
  metric: number;
}

/** Page Likes here is the ad-driven "like" action already in paid ad data — see the plan's resolved decision on this ambiguity. Both series are configurable: pageLikesEvent for the left side, actionType (the section's primary metric) for the right. */
export async function getMetaPageLikesVsEngagementsByMonth(
  supabase: SupabaseClient, clientId: string, range: DateRange,
  actionType: string = DEFAULT_META_PAID_ACTION_TYPE, pageLikesEvent: string = 'like',
): Promise<MonthlyLikesEngagements[]> {
  const rows = await fetchAdRows(supabase, clientId, range);
  const byMonth = new Map<string, { pageLikes: number; metric: number }>();
  for (const r of rows) {
    const key = r.date.slice(0, 7);
    const cur = byMonth.get(key) ?? { pageLikes: 0, metric: 0 };
    cur.pageLikes += actionValue(r, pageLikesEvent);
    cur.metric += actionValue(r, actionType);
    byMonth.set(key, cur);
  }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));
}

export interface TopAdRow {
  adName: string;
  campaignName: string;
  value: number;
}

/**
 * Reads the current ad-level snapshot — no date filter, the table always
 * reflects "as of last sync." Uses the stored `engagements` column directly
 * for the default post_engagement metric (cheap, indexed-friendly sort);
 * for any other selected metric, extracts the value from the stored
 * `actions` jsonb array instead — no re-sync needed when the agency changes
 * the metric selector.
 */
export async function getMetaTopAdsByEngagement(
  supabase: SupabaseClient, clientId: string, actionType: string = DEFAULT_META_PAID_ACTION_TYPE,
): Promise<TopAdRow[]> {
  if (actionType === DEFAULT_META_PAID_ACTION_TYPE) {
    const { data } = await supabase
      .from('meta_ad_engagement')
      .select('ad_name, campaign_name, engagements')
      .eq('client_id', clientId)
      .order('engagements', { ascending: false })
      .limit(10);

    return (data ?? []).map(r => ({
      adName: r.ad_name || 'Untitled ad',
      campaignName: r.campaign_name ?? '',
      value: Number(r.engagements || 0),
    }));
  }

  const { data } = await supabase
    .from('meta_ad_engagement')
    .select('ad_name, campaign_name, actions')
    .eq('client_id', clientId);

  const rows = (data ?? []).map(r => {
    const actions = (r.actions ?? []) as Array<{ action_type: string; value: string }>;
    const action = actions.find(a => a.action_type === actionType);
    return {
      adName: r.ad_name || 'Untitled ad',
      campaignName: r.campaign_name ?? '',
      value: action ? parseInt(action.value, 10) || 0 : 0,
    };
  });

  return rows.sort((a, b) => b.value - a.value).slice(0, 10);
}
