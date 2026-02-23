-- Migration: Create google_analytics_metrics table
-- This stores daily performance metrics from Google Analytics 4
-- Used for funnel analysis and performance tracking

CREATE TABLE IF NOT EXISTS google_analytics_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User and client context
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,

  -- Property identification
  property_id TEXT NOT NULL,

  -- Date tracking
  date DATE NOT NULL,

  -- Standard GA4 metrics
  metric_name TEXT NOT NULL,
  metric_value NUMERIC(15, 2) DEFAULT 0,
  users_count BIGINT DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure we don't duplicate metrics for the same property on the same date
  UNIQUE(user_id, property_id, date, metric_name)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_google_analytics_metrics_user_id ON google_analytics_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_google_analytics_metrics_client_id ON google_analytics_metrics(client_id);
CREATE INDEX IF NOT EXISTS idx_google_analytics_metrics_property_id ON google_analytics_metrics(property_id);
CREATE INDEX IF NOT EXISTS idx_google_analytics_metrics_date ON google_analytics_metrics(date);
CREATE INDEX IF NOT EXISTS idx_google_analytics_metrics_metric_name ON google_analytics_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_google_analytics_metrics_user_property_date ON google_analytics_metrics(user_id, property_id, date DESC);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_ga_metrics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_google_analytics_metrics_updated_at
  BEFORE UPDATE ON google_analytics_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_ga_metrics_updated_at();

-- Enable RLS
ALTER TABLE google_analytics_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own Google Analytics metrics
CREATE POLICY "Users can view own google analytics metrics"
  ON google_analytics_metrics FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own Google Analytics metrics
CREATE POLICY "Users can insert own google analytics metrics"
  ON google_analytics_metrics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own Google Analytics metrics
CREATE POLICY "Users can update own google analytics metrics"
  ON google_analytics_metrics FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own Google Analytics metrics
CREATE POLICY "Users can delete own google analytics metrics"
  ON google_analytics_metrics FOR DELETE
  USING (auth.uid() = user_id);

-- Add comments for documentation
COMMENT ON TABLE google_analytics_metrics IS 'Stores daily performance metrics from Google Analytics 4';
COMMENT ON COLUMN google_analytics_metrics.metric_name IS 'GA4 metric name (e.g., activeUsers, conversions, sessions, page_views, etc.)';
COMMENT ON COLUMN google_analytics_metrics.metric_value IS 'Metric value (e.g., conversion count, revenue amount)';
COMMENT ON COLUMN google_analytics_metrics.users_count IS 'Number of unique users associated with this metric';
