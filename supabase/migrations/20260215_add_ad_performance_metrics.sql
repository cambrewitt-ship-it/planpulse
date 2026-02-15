-- Migration: Create ad_performance_metrics table
-- This stores daily performance metrics from ad platforms (Google Ads, Meta Ads, etc.)
-- Separate from budget planning to track actual campaign performance

CREATE TABLE IF NOT EXISTS ad_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User and client context
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,

  -- Platform and account identification
  platform TEXT NOT NULL CHECK (platform IN ('google-ads', 'meta-ads')),
  account_id TEXT NOT NULL,
  account_name TEXT,

  -- Campaign identification
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,

  -- Date tracking
  date DATE NOT NULL,

  -- Financial metrics (in account currency)
  spend NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',

  -- Common performance metrics (available on both platforms)
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  ctr NUMERIC(10, 6) DEFAULT 0, -- Click-through rate as decimal (e.g., 0.0523 = 5.23%)

  -- Platform-specific metrics
  -- Google Ads specific
  average_cpc NUMERIC(12, 6), -- Average cost per click in dollars
  conversions NUMERIC(10, 2), -- Conversion count

  -- Meta Ads specific
  reach BIGINT, -- Unique users reached
  cpc NUMERIC(12, 6), -- Cost per click in dollars
  cpm NUMERIC(12, 6), -- Cost per 1000 impressions in dollars
  frequency NUMERIC(10, 6), -- Average impressions per person

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure we don't duplicate metrics for the same campaign on the same date
  UNIQUE(user_id, platform, account_id, campaign_id, date)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ad_performance_metrics_user_id ON ad_performance_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_performance_metrics_client_id ON ad_performance_metrics(client_id);
CREATE INDEX IF NOT EXISTS idx_ad_performance_metrics_platform ON ad_performance_metrics(platform);
CREATE INDEX IF NOT EXISTS idx_ad_performance_metrics_account_id ON ad_performance_metrics(account_id);
CREATE INDEX IF NOT EXISTS idx_ad_performance_metrics_campaign_id ON ad_performance_metrics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_performance_metrics_date ON ad_performance_metrics(date);
CREATE INDEX IF NOT EXISTS idx_ad_performance_metrics_user_platform_date ON ad_performance_metrics(user_id, platform, date);

-- Add composite index for common query pattern (date range queries by user and platform)
CREATE INDEX IF NOT EXISTS idx_ad_performance_metrics_user_platform_account_date
  ON ad_performance_metrics(user_id, platform, account_id, date DESC);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ad_performance_metrics_updated_at
  BEFORE UPDATE ON ad_performance_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE ad_performance_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own ad performance metrics
CREATE POLICY "Users can view own ad performance metrics"
  ON ad_performance_metrics FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own ad performance metrics
CREATE POLICY "Users can insert own ad performance metrics"
  ON ad_performance_metrics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own ad performance metrics
CREATE POLICY "Users can update own ad performance metrics"
  ON ad_performance_metrics FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own ad performance metrics
CREATE POLICY "Users can delete own ad performance metrics"
  ON ad_performance_metrics FOR DELETE
  USING (auth.uid() = user_id);

-- Add comments for documentation
COMMENT ON TABLE ad_performance_metrics IS 'Stores daily performance metrics from advertising platforms (Google Ads, Meta Ads, etc.)';
COMMENT ON COLUMN ad_performance_metrics.platform IS 'Ad platform: google-ads, meta-ads';
COMMENT ON COLUMN ad_performance_metrics.spend IS 'Amount spent in account currency';
COMMENT ON COLUMN ad_performance_metrics.ctr IS 'Click-through rate as decimal (0.0523 = 5.23%)';
COMMENT ON COLUMN ad_performance_metrics.average_cpc IS 'Google Ads: Average cost per click';
COMMENT ON COLUMN ad_performance_metrics.conversions IS 'Google Ads: Number of conversions';
COMMENT ON COLUMN ad_performance_metrics.reach IS 'Meta Ads: Unique users reached';
COMMENT ON COLUMN ad_performance_metrics.cpc IS 'Meta Ads: Cost per click';
COMMENT ON COLUMN ad_performance_metrics.cpm IS 'Meta Ads: Cost per 1000 impressions';
COMMENT ON COLUMN ad_performance_metrics.frequency IS 'Meta Ads: Average impressions per person';
