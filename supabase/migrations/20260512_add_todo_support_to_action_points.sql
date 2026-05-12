-- Add TODO category support and optional client_id to action_points.

-- 1. Widen the category CHECK constraint to allow 'TODO'
ALTER TABLE action_points
  DROP CONSTRAINT IF EXISTS action_points_category_check;

ALTER TABLE action_points
  ADD CONSTRAINT action_points_category_check
  CHECK (category IN ('SET UP', 'HEALTH CHECK', 'ONGOING', 'TODO'));

-- 2. Add client_id for client-specific TODO items (NULL = applies to all clients)
ALTER TABLE action_points
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;
