-- Migration: Add explanatory subtext + stable ordering for richer per-channel
-- health-check checklists (agency operational checklist redesign — action
-- points are being split into a per-channel checklist system, separate from
-- the ad-hoc To Do list).
-- Purely additive: no existing code reads these columns yet, safe to ship
-- alone ahead of the application code that uses them.

ALTER TABLE action_points
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_action_points_channel_type_category_sort
  ON action_points(channel_type, category, sort_order);
