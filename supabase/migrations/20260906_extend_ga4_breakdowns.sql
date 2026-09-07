-- Migration: Extend google_analytics_breakdowns for the Dimension Explorer
-- Adds 'sessionSourceMedium' as a selectable dimension (GA4's dimension for
-- the "Session source / medium" report, i.e. the Traffic acquisition view)
-- and an engagement_duration column (sum of GA4's userEngagementDuration)
-- so per-row "Avg. engagement time per session" can be derived at read time,
-- the same way engagementRate is already derived from engaged_sessions/sessions.
-- Date: 2026-09-06

ALTER TABLE google_analytics_breakdowns
  ADD COLUMN IF NOT EXISTS engagement_duration NUMERIC(15, 2) DEFAULT 0;

ALTER TABLE google_analytics_breakdowns
  DROP CONSTRAINT IF EXISTS google_analytics_breakdowns_dimension_check;

ALTER TABLE google_analytics_breakdowns
  ADD CONSTRAINT google_analytics_breakdowns_dimension_check
  CHECK (dimension IN ('channel', 'device', 'country', 'landingPage', 'newVsReturning', 'eventName', 'sessionSourceMedium'));

COMMENT ON COLUMN google_analytics_breakdowns.engagement_duration IS 'Sum of GA4 userEngagementDuration (seconds) for this row — divide by sessions for avg. engagement time per session';
