-- Migration: Add client_id to media_plan_funnels for client-scoped queries
ALTER TABLE media_plan_funnels
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;

-- Create index for client lookups
CREATE INDEX IF NOT EXISTS idx_funnels_client_id ON media_plan_funnels(client_id);
