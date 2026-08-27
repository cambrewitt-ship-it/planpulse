-- Migration: Client Hub AI-generated insight callouts
-- Stores one narrative per section per client, overwritten on each sync —
-- generated once per sync (not per page load) since the public token-gated
-- hub route is unauthenticated and gets hit repeatedly by clients.
-- Date: 2026-08-27

CREATE TABLE IF NOT EXISTS client_hub_insights (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  section_key   text NOT NULL,
  insight_text  text NOT NULL,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  generated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, section_key)
);

CREATE INDEX IF NOT EXISTS idx_client_hub_insights_client_lookup
  ON client_hub_insights(client_id, section_key);

ALTER TABLE client_hub_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_hub_insights_owner_all" ON client_hub_insights FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_hub_insights.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_hub_insights.client_id AND c.user_id = auth.uid()));
