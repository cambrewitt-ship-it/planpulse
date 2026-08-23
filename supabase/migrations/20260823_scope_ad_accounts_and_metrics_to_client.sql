-- Migration: Scope google_ads_accounts and ad_performance_metrics uniqueness to client_id
-- Bug: google_ads_accounts has UNIQUE(user_id, customer_id) and
--   ad_performance_metrics has UNIQUE(user_id, platform, account_id, campaign_id, date)
--   — neither includes client_id, even though both tables have the column.
--   Saving the same Google Ads customer_id under a different client_id silently
--   reassigns the existing account row's client_id (the upsert matches the old
--   constraint), and the next metrics sync for that account then upserts on the
--   old (no-client_id) key too, overwriting the client_id on the existing
--   historical rows — moving one client's Google Ads spend into another
--   client's dashboard. meta_ads_accounts already got the equivalent fix in
--   20260513_add_client_id_to_meta_ads_accounts.sql; this applies the same
--   pattern to google_ads_accounts, and extends it to ad_performance_metrics
--   (shared by both Google Ads and Meta Ads).
-- Date: 2026-08-23

-- ── google_ads_accounts ──────────────────────────────────────────────────

ALTER TABLE google_ads_accounts
  DROP CONSTRAINT IF EXISTS google_ads_accounts_user_id_customer_id_key;

ALTER TABLE google_ads_accounts
  ADD CONSTRAINT google_ads_accounts_client_scope_key
  UNIQUE (user_id, client_id, customer_id);

-- ── ad_performance_metrics ───────────────────────────────────────────────
-- The original UNIQUE(...) was declared inline with no explicit name, so
-- Postgres auto-generated (and possibly truncated) one — look it up rather
-- than guessing, same approach used for policy drops in
-- 20260819_fix_clients_data_isolation.sql.

DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'ad_performance_metrics'
      AND tc.constraint_type = 'UNIQUE'
  LOOP
    EXECUTE format('ALTER TABLE public.ad_performance_metrics DROP CONSTRAINT %I', con.constraint_name);
  END LOOP;
END $$;

ALTER TABLE ad_performance_metrics
  ADD CONSTRAINT ad_performance_metrics_client_scope_key
  UNIQUE (user_id, client_id, platform, account_id, campaign_id, date);

-- ── client_ad_demographics ───────────────────────────────────────────────
-- Same gap: client_id exists (and is NOT NULL here) but isn't part of the
-- unique key, so an upsert for the same user/platform/account/date/breakdown
-- can match — and silently reassign — a DIFFERENT client's row. RLS on this
-- table only checks "does the target client belong to this user", which is
-- still true across all of one agency's own clients, so it doesn't catch
-- this the way it would a genuine cross-account access.

DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'client_ad_demographics'
      AND tc.constraint_type = 'UNIQUE'
  LOOP
    EXECUTE format('ALTER TABLE public.client_ad_demographics DROP CONSTRAINT %I', con.constraint_name);
  END LOOP;
END $$;

ALTER TABLE client_ad_demographics
  ADD CONSTRAINT client_ad_demographics_client_scope_key
  UNIQUE (user_id, client_id, platform, account_id, date, breakdown_type, breakdown_value);

-- ── VERIFY ────────────────────────────────────────────────────────────────
-- SELECT conname FROM pg_constraint WHERE conrelid = 'google_ads_accounts'::regclass AND contype = 'u';
-- SELECT conname FROM pg_constraint WHERE conrelid = 'ad_performance_metrics'::regclass AND contype = 'u';
-- SELECT conname FROM pg_constraint WHERE conrelid = 'client_ad_demographics'::regclass AND contype = 'u';

-- ── EXISTING MISASSIGNED ROWS ─────────────────────────────────────────────
-- This migration prevents the leak going forward; it does not repair rows
-- already reassigned by the bug. Any client currently seeing another
-- client's Google Ads data should have its google_ads_accounts row and the
-- affected ad_performance_metrics rows re-pointed at the correct client_id
-- (or deleted and re-synced) after applying this migration and the
-- accompanying code fix.
