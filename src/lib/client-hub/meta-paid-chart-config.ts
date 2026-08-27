/**
 * Shared config/constants for the two comparison bar charts in the Client
 * Hub "Meta Ads — Paid" section — "Post comments vs reactions" and the
 * page-likes side of "Page likes vs {metric}". Same
 * jsonb-config-column + defaults-merge pattern as client_hub_config.trend_widget
 * (see trend-widget.ts), used by the authenticated PATCH route, the
 * authenticated GET route, and the public token-gated GET route.
 */

export interface MetaPaidChartConfig {
  commentsEvent: string;
  commentsLabel: string;
  reactionsEvent: string;
  reactionsLabel: string;
  pageLikesEvent: string;
  pageLikesLabel: string;
}

export const DEFAULT_META_PAID_CHART_CONFIG: MetaPaidChartConfig = {
  commentsEvent: 'comment', commentsLabel: 'Comments',
  reactionsEvent: 'post_reaction', reactionsLabel: 'Reactions',
  pageLikesEvent: 'like', pageLikesLabel: 'Page Likes',
};
