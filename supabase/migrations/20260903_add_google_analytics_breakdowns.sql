-- Migration: Create google_analytics_breakdowns table
-- Generic dimension-breakdown cache for the Client Hub's GA4 Traffic/Behaviour
-- sections (channel, device, country, landing page, new-vs-returning, event
-- name) — one table for every dimension since GA4 breakdowns all share the
-- same metric shape, unlike Google Ads' per-dimension breakdown tables.
-- Populated on-demand by syncGA4Breakdowns() (src/lib/ads/ga4-breakdowns.ts),
-- never by the always-on 6h refresh cron.

CREATE TABLE IF NOT EXISTS google_analytics_breakdowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL,

  date DATE NOT NULL,
  dimension TEXT NOT NULL CHECK (dimension IN ('channel', 'device', 'country', 'landingPage', 'newVsReturning', 'eventName')),
  dimension_value TEXT NOT NULL,

  sessions NUMERIC(15, 2) DEFAULT 0,
  users NUMERIC(15, 2) DEFAULT 0,
  conversions NUMERIC(15, 2) DEFAULT 0,
  engaged_sessions NUMERIC(15, 2) DEFAULT 0,
  event_count NUMERIC(15, 2) DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, property_id, date, dimension, dimension_value)
);

CREATE INDEX IF NOT EXISTS idx_google_analytics_breakdowns_client_dimension
  ON google_analytics_breakdowns(client_id, dimension, date DESC);

CREATE OR REPLACE FUNCTION update_ga_breakdowns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_google_analytics_breakdowns_updated_at
  BEFORE UPDATE ON google_analytics_breakdowns
  FOR EACH ROW
  EXECUTE FUNCTION update_ga_breakdowns_updated_at();

ALTER TABLE google_analytics_breakdowns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own google analytics breakdowns"
  ON google_analytics_breakdowns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own google analytics breakdowns"
  ON google_analytics_breakdowns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own google analytics breakdowns"
  ON google_analytics_breakdowns FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own google analytics breakdowns"
  ON google_analytics_breakdowns FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE google_analytics_breakdowns IS 'GA4 dimension breakdowns (channel/device/country/landingPage/newVsReturning/eventName) for the Client Hub GA4 sections';
COMMENT ON COLUMN google_analytics_breakdowns.dimension IS 'Which GA4 dimension this row breaks down by';
COMMENT ON COLUMN google_analytics_breakdowns.dimension_value IS 'The dimension''s value for this row, e.g. "Organic Search", "mobile", "US"';
