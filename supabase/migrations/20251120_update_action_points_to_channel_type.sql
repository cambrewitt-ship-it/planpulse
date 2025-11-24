-- Migration: Create action_points table with channel_type
-- This allows action points to be shared across all clients for the same channel type
-- Action points are stored by channel type (e.g., "Google Ads", "Meta Ads") rather than specific channel instances

CREATE TABLE IF NOT EXISTS action_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_type TEXT NOT NULL,
  text TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT action_points_text_not_empty CHECK (LENGTH(TRIM(text)) > 0)
);

-- Create index for faster lookups by channel_type
CREATE INDEX IF NOT EXISTS idx_action_points_channel_type ON action_points(channel_type);

-- Create index for filtering completed status
CREATE INDEX IF NOT EXISTS idx_action_points_completed ON action_points(completed);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_action_points_updated_at
  BEFORE UPDATE ON action_points
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Step 6: Update RLS policies to work with channel_type
-- Drop old policies
DROP POLICY IF EXISTS "Users can view action points for accessible channels" ON action_points;
DROP POLICY IF EXISTS "Users can insert action points for accessible channels" ON action_points;
DROP POLICY IF EXISTS "Users can update action points for accessible channels" ON action_points;
DROP POLICY IF EXISTS "Users can delete action points for accessible channels" ON action_points;

-- Create new policies - action points are now global per channel type
-- All authenticated users can view/insert/update/delete action points
CREATE POLICY "Users can view action points"
  ON action_points
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert action points"
  ON action_points
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update action points"
  ON action_points
  FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can delete action points"
  ON action_points
  FOR DELETE
  USING (auth.role() = 'authenticated');

