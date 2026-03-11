-- Migration: Add stamp fields to organic_social_actuals
-- Purpose: Support manual "stamping" of organic social posts as published
-- This keeps a simple, per-week manual confirmation alongside automatic counts.

ALTER TABLE organic_social_actuals
ADD COLUMN IF NOT EXISTS manual_stamp_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN organic_social_actuals.manual_stamp_count IS
'Number of posts manually stamped as published for this week (for dashboard v2 stamp system).';

