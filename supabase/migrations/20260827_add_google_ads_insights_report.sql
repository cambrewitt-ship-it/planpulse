-- Migration: Google Ads "Insights" report — search terms, region breakdown,
-- device breakdown. Net-new data collection, fetched on-demand via a manual
-- "Sync insights data" button in the Client Hub (never the always-on 6h
-- cron). All three tables are period-scoped snapshots (delete-then-insert
-- per sync), not time series re-aggregated across arbitrary ranges — a
-- fresh sync makes each table reflect exactly the last-synced period.
-- Date: 2026-08-27

CREATE TABLE IF NOT EXISTS google_ads_search_terms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  account_id      text NOT NULL,
  campaign_id     text NOT NULL,
  campaign_name   text,
  search_term     text NOT NULL,
  impressions     integer NOT NULL DEFAULT 0,
  clicks          integer NOT NULL DEFAULT 0,
  ctr             numeric,
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  synced_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_ads_search_terms_client_lookup
  ON google_ads_search_terms(client_id);

CREATE TABLE IF NOT EXISTS google_ads_geo_breakdown (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id),
  client_id             uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  account_id            text NOT NULL,
  campaign_id           text NOT NULL,
  campaign_name         text,
  region_criterion_id   text NOT NULL,
  region_name           text,
  impressions           integer NOT NULL DEFAULT 0,
  clicks                integer NOT NULL DEFAULT 0,
  ctr                   numeric,
  average_cpc           numeric,
  period_start          date NOT NULL,
  period_end            date NOT NULL,
  synced_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_ads_geo_breakdown_client_lookup
  ON google_ads_geo_breakdown(client_id);

CREATE TABLE IF NOT EXISTS google_ads_device_breakdown (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  account_id      text NOT NULL,
  campaign_id     text NOT NULL,
  campaign_name   text,
  device          text NOT NULL,
  date            date NOT NULL,
  impressions     integer NOT NULL DEFAULT 0,
  clicks          integer NOT NULL DEFAULT 0,
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  synced_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_ads_device_breakdown_client_lookup
  ON google_ads_device_breakdown(client_id);

ALTER TABLE google_ads_search_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_geo_breakdown ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_device_breakdown ENABLE ROW LEVEL SECURITY;

CREATE POLICY "google_ads_search_terms_owner_all" ON google_ads_search_terms FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = google_ads_search_terms.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = google_ads_search_terms.client_id AND c.user_id = auth.uid()));

CREATE POLICY "google_ads_geo_breakdown_owner_all" ON google_ads_geo_breakdown FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = google_ads_geo_breakdown.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = google_ads_geo_breakdown.client_id AND c.user_id = auth.uid()));

CREATE POLICY "google_ads_device_breakdown_owner_all" ON google_ads_device_breakdown FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = google_ads_device_breakdown.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = google_ads_device_breakdown.client_id AND c.user_id = auth.uid()));
