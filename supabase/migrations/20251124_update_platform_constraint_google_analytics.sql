-- Migration: Update ad_platform_connections platform constraint to include 'google-analytics'

-- Step 1: Drop the old CHECK constraint on platform column
ALTER TABLE ad_platform_connections
DROP CONSTRAINT IF EXISTS ad_platform_connections_platform_check;

-- Step 2: Add new CHECK constraint with 'google-ads', 'meta-ads', and 'google-analytics'
ALTER TABLE ad_platform_connections
ADD CONSTRAINT ad_platform_connections_platform_check
CHECK (platform IN ('google-ads', 'meta-ads', 'google-analytics'));


