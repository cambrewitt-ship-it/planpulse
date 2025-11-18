-- Migration: Update ad_platform_connections platform constraint
-- 1. Migrate existing 'facebook' entries to 'meta-ads'
-- 2. Update platform CHECK constraint to only allow 'google-ads' and 'meta-ads'

-- Step 1: Update existing rows where platform='facebook' to platform='meta-ads'
UPDATE ad_platform_connections
SET platform = 'meta-ads'
WHERE platform = 'facebook';

-- Step 2: Drop the old CHECK constraint on platform column
-- Note: The constraint name may vary. Find it with:
-- SELECT conname FROM pg_constraint WHERE conrelid = 'ad_platform_connections'::regclass AND contype = 'c';

-- Drop constraint if it exists (constraint name format: tablename_columnname_check)
ALTER TABLE ad_platform_connections
DROP CONSTRAINT IF EXISTS ad_platform_connections_platform_check;

-- Step 3: Add new CHECK constraint with only 'google-ads' and 'meta-ads'
ALTER TABLE ad_platform_connections
ADD CONSTRAINT ad_platform_connections_platform_check
CHECK (platform IN ('google-ads', 'meta-ads'));

