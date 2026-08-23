-- Migration: Track last successful live-fetch time per platform connection
-- Backs the 6-hour ad spend / GA4 cache: the dashboard reads cached data
-- (ad_performance_metrics / google_analytics_metrics) instead of always
-- hitting the live ad APIs, and only re-fetches live when this timestamp is
-- missing or older than 6 hours. Manual "Refresh Data" actions stamp it on
-- success, which resets the 6-hour window; a cron job also refreshes any
-- connection whose stamp has gone stale.
-- Date: 2026-08-22

ALTER TABLE ad_platform_connections
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
