-- Migration: Update funnels to support multiple channels
-- Change channel_id (single) to channel_ids (array)

-- Drop the old index
DROP INDEX IF EXISTS idx_funnels_channel;

-- Rename the old column and create new array column
ALTER TABLE media_plan_funnels
  ADD COLUMN channel_ids UUID[] NOT NULL DEFAULT '{}';

-- For existing rows, convert channel_id to channel_ids array
UPDATE media_plan_funnels
SET channel_ids = ARRAY[channel_id]
WHERE channel_id IS NOT NULL;

-- Drop the old column
ALTER TABLE media_plan_funnels
  DROP COLUMN channel_id;

-- Create new index for array column using GIN
CREATE INDEX idx_funnels_channel_ids ON media_plan_funnels USING GIN(channel_ids);

-- Add a comment explaining the structure
COMMENT ON COLUMN media_plan_funnels.channel_ids IS 'Array of channel IDs from client_media_plan_builder.channels JSONB. Allows funnels to aggregate data from multiple channels.';
