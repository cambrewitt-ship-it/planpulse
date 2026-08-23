-- Migration: Per-conversion-action breakdown for Google Ads
-- Mirrors the existing meta_actions jsonb column: stores each day's Google
-- Ads conversions broken down by named conversion action (e.g. "Purchase",
-- "Phone Call Lead"), fetched via a second GAQL query segmented by
-- segments.conversion_action_name. Lets the Client Hub trend builder filter
-- a conversions trend down to one specific Google conversion event, the same
-- way it already can for Meta action types.
-- Date: 2026-08-22

ALTER TABLE ad_performance_metrics
  ADD COLUMN IF NOT EXISTS google_conversion_actions jsonb;
