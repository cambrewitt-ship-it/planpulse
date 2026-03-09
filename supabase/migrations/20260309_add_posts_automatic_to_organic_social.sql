-- Migration: Add posts_automatic column to organic_social_actuals
-- Purpose: Track the number of social media posts that are posted automatically

ALTER TABLE organic_social_actuals
ADD COLUMN IF NOT EXISTS posts_automatic INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN organic_social_actuals.posts_automatic IS 'Number of posts published automatically for this week';
