-- Migration: Create funnel configuration and metrics cache tables
-- This stores funnel configurations per channel and cached funnel metrics

-- Create media_plan_funnels table
CREATE TABLE IF NOT EXISTS media_plan_funnels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL,  -- References channel ID from client_media_plan_builder.channels JSONB
  name TEXT NOT NULL,
  config JSONB NOT NULL,  -- Stores FunnelConfig including stages
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create funnel_metrics_cache table
CREATE TABLE IF NOT EXISTS funnel_metrics_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id UUID REFERENCES media_plan_funnels(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  metrics JSONB NOT NULL,  -- Cached calculated funnel metrics
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(funnel_id, date)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_funnels_channel ON media_plan_funnels(channel_id);
CREATE INDEX IF NOT EXISTS idx_metrics_funnel_date ON funnel_metrics_cache(funnel_id, date);

-- Add updated_at trigger for media_plan_funnels
CREATE TRIGGER update_media_plan_funnels_updated_at
  BEFORE UPDATE ON media_plan_funnels
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE media_plan_funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_metrics_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies for media_plan_funnels
-- Note: Ownership validation happens in API routes
-- RLS just ensures user is authenticated
CREATE POLICY "Users can view funnels"
  ON media_plan_funnels
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert funnels"
  ON media_plan_funnels
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update funnels"
  ON media_plan_funnels
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can delete funnels"
  ON media_plan_funnels
  FOR DELETE
  USING (auth.role() = 'authenticated');

-- RLS Policies for funnel_metrics_cache
-- Note: Ownership validation happens in API routes
-- RLS just ensures user is authenticated
CREATE POLICY "Users can view funnel metrics cache"
  ON funnel_metrics_cache
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert funnel metrics cache"
  ON funnel_metrics_cache
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update funnel metrics cache"
  ON funnel_metrics_cache
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can delete funnel metrics cache"
  ON funnel_metrics_cache
  FOR DELETE
  USING (auth.role() = 'authenticated');
