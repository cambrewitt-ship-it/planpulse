-- Migration: Fix channel_ids type from UUID[] to TEXT[]
-- The channel IDs from client_media_plan_builder are custom strings, not UUIDs

-- Drop the GIN index first
DROP INDEX IF EXISTS idx_funnels_channel_ids;

-- Change column type from UUID[] to TEXT[]
ALTER TABLE media_plan_funnels
  ALTER COLUMN channel_ids TYPE TEXT[] USING channel_ids::TEXT[];

-- Recreate the GIN index for TEXT array
CREATE INDEX idx_funnels_channel_ids ON media_plan_funnels USING GIN(channel_ids);

-- Update the comment
COMMENT ON COLUMN media_plan_funnels.channel_ids IS 'Array of channel ID strings from client_media_plan_builder.channels JSONB. Allows funnels to aggregate data from multiple channels.';
