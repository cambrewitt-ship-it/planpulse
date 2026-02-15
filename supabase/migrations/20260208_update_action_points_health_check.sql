-- Migration: Update action_points categories from ONGOING to HEALTH CHECK
-- Add frequency for HEALTH CHECK and due_date for SET UP

-- Step 1: Drop all existing constraints first
ALTER TABLE action_points
DROP CONSTRAINT IF EXISTS action_points_reset_frequency_check;

ALTER TABLE action_points
DROP CONSTRAINT IF EXISTS action_points_category_check;

-- Step 2: Update existing ONGOING records to HEALTH CHECK
UPDATE action_points
SET category = 'HEALTH CHECK'
WHERE category = 'ONGOING';

-- Step 3: Add frequency column if it doesn't exist (or rename if reset_frequency exists)
DO $$
BEGIN
    -- Check if reset_frequency column exists
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'action_points' 
        AND column_name = 'reset_frequency'
    ) THEN
        -- Rename reset_frequency to frequency
        ALTER TABLE action_points RENAME COLUMN reset_frequency TO frequency;
    ELSE
        -- Add frequency column if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'action_points' 
            AND column_name = 'frequency'
        ) THEN
            ALTER TABLE action_points ADD COLUMN frequency TEXT;
        END IF;
    END IF;
END $$;

-- Step 4: Add due_date column for SET UP items
ALTER TABLE action_points
ADD COLUMN IF NOT EXISTS due_date DATE;

-- Step 5: Add new category constraint with HEALTH CHECK
ALTER TABLE action_points
ADD CONSTRAINT action_points_category_check
CHECK (category IN ('SET UP', 'HEALTH CHECK'));

-- Step 6: Add constraint for frequency values
ALTER TABLE action_points
DROP CONSTRAINT IF EXISTS action_points_frequency_check;

ALTER TABLE action_points
ADD CONSTRAINT action_points_frequency_check
CHECK (frequency IN ('daily', 'weekly', 'fortnightly', 'monthly') OR frequency IS NULL);
