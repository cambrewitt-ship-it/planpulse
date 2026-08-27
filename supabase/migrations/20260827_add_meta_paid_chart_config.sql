-- Migration: Meta Paid Ads section — comparison chart metric config
-- The "Post comments vs reactions" and "Page likes vs {metric}" bar charts
-- in the Meta Ads — Paid section still had one or both series hard-coded to
-- specific Meta action types (comment, post_reaction, like), unlike the
-- section's primary metric (meta_paid_action_type, added in
-- 20260827_add_meta_paid_metric_config.sql). Adds a jsonb config column so
-- the agency can repoint each series at any Meta action type — same
-- jsonb-config-column + defaults-merge pattern as client_hub_config.trend_widget
-- (see src/lib/client-hub/trend-widget.ts), scoped to this section's two
-- charts rather than trend_widget's generic cross-platform metric picker.
-- Date: 2026-08-27

ALTER TABLE client_hub_config
  ADD COLUMN IF NOT EXISTS meta_paid_chart_config jsonb;
