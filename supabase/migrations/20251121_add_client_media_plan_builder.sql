-- Migration: Create client_media_plan_builder table
-- This stores the draft media plan builder state for each client

CREATE TABLE IF NOT EXISTS client_media_plan_builder (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  commission NUMERIC(5, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id)
);

-- Create index for faster lookups by client_id
CREATE INDEX IF NOT EXISTS idx_client_media_plan_builder_client_id ON client_media_plan_builder(client_id);

-- Add updated_at trigger
CREATE TRIGGER update_client_media_plan_builder_updated_at
  BEFORE UPDATE ON client_media_plan_builder
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE client_media_plan_builder ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view media plan builder data for clients they have access to
CREATE POLICY "Users can view client media plan builder"
  ON client_media_plan_builder
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Users can insert media plan builder data for clients
CREATE POLICY "Users can insert client media plan builder"
  ON client_media_plan_builder
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Users can update media plan builder data for clients
CREATE POLICY "Users can update client media plan builder"
  ON client_media_plan_builder
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Users can delete media plan builder data for clients
CREATE POLICY "Users can delete client media plan builder"
  ON client_media_plan_builder
  FOR DELETE
  USING (auth.role() = 'authenticated');

