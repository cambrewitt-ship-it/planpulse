-- Migration: Client ad audience demographics (age/gender/country breakdowns)
-- Net-new data collection — no demographic breakdowns were fetched/stored
-- anywhere before this. Account-level grain (not per-campaign): the use
-- case is a single audience-composition chart in the Client Hub, not a
-- per-campaign drill-down.
-- Date: 2026-08-22

CREATE TABLE IF NOT EXISTS client_ad_demographics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform        text NOT NULL,          -- 'meta-ads' | 'google-ads'
  account_id      text NOT NULL,
  date            date NOT NULL,
  breakdown_type  text NOT NULL,          -- 'age_gender' | 'country'
  breakdown_value text NOT NULL,          -- e.g. '25-34|female', 'US'
  spend           numeric,
  impressions     integer,
  clicks          integer,
  reach           integer,                -- Meta only
  conversions     numeric,                -- Google only
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, account_id, date, breakdown_type, breakdown_value)
);

CREATE INDEX IF NOT EXISTS idx_client_ad_demographics_client_lookup
  ON client_ad_demographics(client_id, platform, date, breakdown_type);

ALTER TABLE client_ad_demographics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_ad_demographics_owner_all" ON client_ad_demographics FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_ad_demographics.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_ad_demographics.client_id AND c.user_id = auth.uid()));
