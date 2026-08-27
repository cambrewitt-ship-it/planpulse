-- Migration: Meta Paid Ads section metric config
-- The "Meta Ads — Paid" report section (KPI tiles, cost-per-metric line,
-- page-likes-vs-metric bars, top-ads-by-metric donut) was hard-wired to
-- Meta's "post_engagement" action type. Adds per-client config so the
-- agency can pick any Meta action type (e.g. leads, purchases, link
-- clicks) as the section's primary metric instead — same pattern as
-- conversion_action_type/conversion_label added for the Overview "Leads"
-- card in 20260820_add_client_hub_conversion_metric.sql, but scoped to
-- this section only (client_hub_config.conversion_* remains the separate,
-- site-wide "Leads" metric used by Overview/Trend sections).
-- Also stores the full per-ad actions array (not just post_engagement) so
-- changing the metric selection doesn't require a re-sync of ad-level data.
-- Date: 2026-08-27

ALTER TABLE client_hub_config
  ADD COLUMN IF NOT EXISTS meta_paid_action_type text,
  ADD COLUMN IF NOT EXISTS meta_paid_metric_label text NOT NULL DEFAULT 'Engagements';

ALTER TABLE meta_ad_engagement
  ADD COLUMN IF NOT EXISTS actions jsonb;
