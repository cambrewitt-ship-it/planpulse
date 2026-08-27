-- Migration: Meta ad-level engagement — powers the "Top Performing Paid
-- Ads by Engagements" report widget. Net-new: the existing 6h cron only
-- pulls Meta Ads Insights at level=campaign (ad_performance_metrics), never
-- level=ad, so there's no per-ad breakdown anywhere today. Period-scoped
-- snapshot (delete-then-insert per sync via the "Sync paid ads data"
-- button), not a time series — "top ads for this period" doesn't need
-- day-level history.
-- Date: 2026-08-27

CREATE TABLE IF NOT EXISTS meta_ad_engagement (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id),
  client_id     uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  account_id    text NOT NULL,
  campaign_id   text,
  campaign_name text,
  ad_id         text NOT NULL,
  ad_name       text,
  impressions   integer NOT NULL DEFAULT 0,
  spend         numeric NOT NULL DEFAULT 0,
  engagements   integer NOT NULL DEFAULT 0,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  synced_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id, account_id, ad_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_meta_ad_engagement_client_lookup
  ON meta_ad_engagement(client_id);

ALTER TABLE meta_ad_engagement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_ad_engagement_owner_all" ON meta_ad_engagement FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = meta_ad_engagement.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = meta_ad_engagement.client_id AND c.user_id = auth.uid()));
