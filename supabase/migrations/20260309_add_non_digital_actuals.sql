-- Migration: Add non-digital channel actuals tables
-- Purpose: Track actual performance data for organic social and EDM channels

-- Table 1: organic_social_actuals
CREATE TABLE IF NOT EXISTS organic_social_actuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel_name TEXT NOT NULL,
  week_commencing DATE NOT NULL,
  posts_published INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, channel_name, week_commencing)
);

CREATE INDEX IF NOT EXISTS idx_osa_client_id ON organic_social_actuals(client_id);
CREATE INDEX IF NOT EXISTS idx_osa_client_channel ON organic_social_actuals(client_id, channel_name);
CREATE INDEX IF NOT EXISTS idx_osa_week_commencing ON organic_social_actuals(week_commencing);

ALTER TABLE organic_social_actuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read organic social actuals"
  ON organic_social_actuals FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert organic social actuals"
  ON organic_social_actuals FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update organic social actuals"
  ON organic_social_actuals FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete organic social actuals"
  ON organic_social_actuals FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_osa_updated_at
  BEFORE UPDATE ON organic_social_actuals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Table 2: edm_actuals
CREATE TABLE IF NOT EXISTS edm_actuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel_name TEXT NOT NULL,
  send_date DATE NOT NULL,
  subject TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, channel_name, send_date)
);

CREATE INDEX IF NOT EXISTS idx_edm_client_id ON edm_actuals(client_id);
CREATE INDEX IF NOT EXISTS idx_edm_client_channel ON edm_actuals(client_id, channel_name);
CREATE INDEX IF NOT EXISTS idx_edm_send_date ON edm_actuals(send_date);

ALTER TABLE edm_actuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read edm actuals"
  ON edm_actuals FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert edm actuals"
  ON edm_actuals FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update edm actuals"
  ON edm_actuals FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete edm actuals"
  ON edm_actuals FOR DELETE TO authenticated USING (true);
