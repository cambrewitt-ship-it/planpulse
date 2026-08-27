-- Migration: Google Ads "Performance" report extras — ad group breakdown,
-- current campaign budget split, and search impression share.
-- Net-new data collection, fetched on-demand via a manual "Sync performance
-- data" button in the Client Hub (never the always-on 6h cron) — none of
-- this existed anywhere before this migration.
-- Date: 2026-08-27

-- Ad-group/day grain — a genuine daily time series, upserted on re-sync.
CREATE TABLE IF NOT EXISTS google_ads_ad_group_metrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  account_id      text NOT NULL,
  campaign_id     text NOT NULL,
  campaign_name   text,
  ad_group_id     text NOT NULL,
  ad_group_name   text,
  date            date NOT NULL,
  impressions     integer NOT NULL DEFAULT 0,
  clicks          integer NOT NULL DEFAULT 0,
  ctr             numeric,
  average_cpc     numeric,
  spend           numeric NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id, account_id, ad_group_id, date)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_ad_group_metrics_client_lookup
  ON google_ads_ad_group_metrics(client_id, date);

-- Current-snapshot grain (no date column) — deleted-then-reinserted per sync,
-- not upserted, since this represents "budgets as of last sync," not history.
-- Shared budgets (explicitly_shared = true) mean per-campaign amounts can sum
-- above the account's real spend cap — surfaced as a caveat in the UI, not
-- corrected here.
CREATE TABLE IF NOT EXISTS google_ads_campaign_budgets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id),
  client_id           uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  account_id          text NOT NULL,
  campaign_id         text NOT NULL,
  campaign_name       text,
  budget_id           text,
  daily_budget_micros bigint,
  explicitly_shared   boolean NOT NULL DEFAULT false,
  synced_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id, account_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_campaign_budgets_client_lookup
  ON google_ads_campaign_budgets(client_id);

-- Campaign/day grain — a genuine daily time series, upserted on re-sync.
CREATE TABLE IF NOT EXISTS google_ads_search_impression_share (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id),
  client_id                uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  account_id               text NOT NULL,
  campaign_id              text NOT NULL,
  campaign_name            text,
  date                     date NOT NULL,
  search_impression_share  numeric,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id, account_id, campaign_id, date)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_search_impression_share_client_lookup
  ON google_ads_search_impression_share(client_id, date);

ALTER TABLE google_ads_ad_group_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_campaign_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_search_impression_share ENABLE ROW LEVEL SECURITY;

CREATE POLICY "google_ads_ad_group_metrics_owner_all" ON google_ads_ad_group_metrics FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = google_ads_ad_group_metrics.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = google_ads_ad_group_metrics.client_id AND c.user_id = auth.uid()));

CREATE POLICY "google_ads_campaign_budgets_owner_all" ON google_ads_campaign_budgets FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = google_ads_campaign_budgets.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = google_ads_campaign_budgets.client_id AND c.user_id = auth.uid()));

CREATE POLICY "google_ads_search_impression_share_owner_all" ON google_ads_search_impression_share FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = google_ads_search_impression_share.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = google_ads_search_impression_share.client_id AND c.user_id = auth.uid()));
