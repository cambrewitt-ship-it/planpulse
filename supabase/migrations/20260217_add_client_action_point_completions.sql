-- Migration: Add client_action_point_completions table
-- Purpose: Track per-client completion state for action points
--          (action_points table stores the templates; this table tracks who has done what)

CREATE TABLE IF NOT EXISTS client_action_point_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  action_point_id UUID NOT NULL REFERENCES action_points(id) ON DELETE CASCADE,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, action_point_id)
);

CREATE INDEX IF NOT EXISTS idx_capc_client_id ON client_action_point_completions(client_id);
CREATE INDEX IF NOT EXISTS idx_capc_action_point_id ON client_action_point_completions(action_point_id);
CREATE INDEX IF NOT EXISTS idx_capc_client_completed ON client_action_point_completions(client_id, completed);

ALTER TABLE client_action_point_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read completions"
  ON client_action_point_completions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert completions"
  ON client_action_point_completions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update completions"
  ON client_action_point_completions FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete completions"
  ON client_action_point_completions FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_capc_updated_at
  BEFORE UPDATE ON client_action_point_completions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
