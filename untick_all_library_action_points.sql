-- ============================================
-- UNTICK ALL ACTION POINTS IN THE LIBRARY
-- ============================================
-- Run this in Supabase SQL Editor to set all action points
-- in the Library (action_points table) to completed = false

UPDATE action_points
SET completed = false
WHERE completed = true;

-- Verify the update
SELECT 
  COUNT(*) as total_action_points,
  COUNT(*) FILTER (WHERE completed = true) as completed_count,
  COUNT(*) FILTER (WHERE completed = false) as uncompleted_count
FROM action_points;
