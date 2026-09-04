-- Migration: Scope google_analytics_accounts to client_id
-- Bug: google_analytics_accounts has UNIQUE(user_id, property_id) with no
--   client_id column at all, even though ad_platform_connections (and every
--   other platform's *_accounts table — meta_ads_accounts, google_ads_accounts)
--   already scope connections/accounts per client. Several read paths
--   (sync-metrics, get-funnel-data, ga4-live, event-names, list-events,
--   fetch-data) already had `client_id` filtering logic written against this
--   table in anticipation of the column existing — it never did, so those
--   filters silently no-op and every route falls back to "first GA4 property
--   found for this user_id", regardless of which client's dashboard is
--   asking. With one connected client this is invisible; connecting a second
--   client's GA4 account surfaces it as wrong-client data leakage, and (via
--   `.single()` on ad_platform_connections in the discover/save routes, fixed
--   in the accompanying code change) a 404 once two active connections exist
--   for the same user.
-- This applies the same client-scoping pattern already used for
--   meta_ads_accounts (20260513_add_client_id_to_meta_ads_accounts.sql) and
--   google_ads_accounts (20260823_scope_ad_accounts_and_metrics_to_client.sql).
-- Existing rows are left with client_id = NULL (treated as legacy / unscoped);
-- read paths fall back to NULL-client_id rows only, never to another
-- client's explicitly-assigned row.
-- Date: 2026-09-03

ALTER TABLE google_analytics_accounts
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE google_analytics_accounts
  DROP CONSTRAINT IF EXISTS google_analytics_accounts_user_id_property_id_key;

ALTER TABLE google_analytics_accounts
  ADD CONSTRAINT google_analytics_accounts_client_scope_key
  UNIQUE (user_id, client_id, property_id);

CREATE INDEX IF NOT EXISTS idx_google_analytics_accounts_client_id
  ON google_analytics_accounts (client_id);
