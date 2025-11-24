-- Migration: Add category and reset_frequency to action_points table
-- Categories: 'SET UP' (one-time setup tasks) or 'ONGOING' (recurring tasks)
-- Reset frequency: 'weekly', 'fortnightly', or 'monthly' (only for ONGOING)

ALTER TABLE action_points
ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('SET UP', 'ONGOING'));

ALTER TABLE action_points
ADD COLUMN IF NOT EXISTS reset_frequency TEXT CHECK (reset_frequency IN ('weekly', 'fortnightly', 'monthly'));

-- Set default category to 'SET UP' for existing records
UPDATE action_points
SET category = 'SET UP'
WHERE category IS NULL;

-- Make category NOT NULL after setting defaults
ALTER TABLE action_points
ALTER COLUMN category SET NOT NULL;

-- Add constraint: reset_frequency is required for ONGOING, null for SET UP
ALTER TABLE action_points
DROP CONSTRAINT IF EXISTS action_points_reset_frequency_check;

ALTER TABLE action_points
ADD CONSTRAINT action_points_reset_frequency_check
CHECK (
  (category = 'SET UP' AND reset_frequency IS NULL) OR
  (category = 'ONGOING' AND reset_frequency IS NOT NULL)
);

