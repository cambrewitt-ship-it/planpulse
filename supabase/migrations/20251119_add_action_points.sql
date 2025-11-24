-- Migration: Add action_points table for channel action items
-- This table stores action points/tasks for each media channel

CREATE TABLE IF NOT EXISTS action_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT action_points_text_not_empty CHECK (LENGTH(TRIM(text)) > 0)
);

-- Create index for faster lookups by channel_id
CREATE INDEX IF NOT EXISTS idx_action_points_channel_id ON action_points(channel_id);

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

-- Enable RLS (Row Level Security)
ALTER TABLE action_points ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see action points for channels they have access to
-- (via the media plan's client relationship)
CREATE POLICY "Users can view action points for accessible channels"
  ON action_points
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM channels c
      JOIN media_plans mp ON c.plan_id = mp.id
      WHERE c.id = action_points.channel_id
    )
  );

-- Policy: Users can insert action points for accessible channels
CREATE POLICY "Users can insert action points for accessible channels"
  ON action_points
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM channels c
      JOIN media_plans mp ON c.plan_id = mp.id
      WHERE c.id = action_points.channel_id
    )
  );

-- Policy: Users can update action points for accessible channels
CREATE POLICY "Users can update action points for accessible channels"
  ON action_points
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM channels c
      JOIN media_plans mp ON c.plan_id = mp.id
      WHERE c.id = action_points.channel_id
    )
  );

-- Policy: Users can delete action points for accessible channels
CREATE POLICY "Users can delete action points for accessible channels"
  ON action_points
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM channels c
      JOIN media_plans mp ON c.plan_id = mp.id
      WHERE c.id = action_points.channel_id
    )
  );

