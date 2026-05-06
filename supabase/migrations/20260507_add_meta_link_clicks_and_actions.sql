-- Add link_clicks column for Meta Ads link click tracking
ALTER TABLE ad_performance_metrics
  ADD COLUMN IF NOT EXISTS link_clicks integer;

-- Add meta_actions column to store Meta Ads action breakdown as JSON
-- Used to retrieve specific conversion event counts (e.g. offsite_conversion.fb_pixel_purchase)
ALTER TABLE ad_performance_metrics
  ADD COLUMN IF NOT EXISTS meta_actions jsonb;
