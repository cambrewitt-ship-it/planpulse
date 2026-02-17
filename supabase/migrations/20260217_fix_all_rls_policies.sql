-- Migration: Fix all RLS policies using auth.role()
-- Purpose: Replace auth.role() = 'authenticated' with proper TO authenticated syntax
-- Date: 2026-02-17
-- Tables affected: media_plan_funnels, funnel_metrics_cache, media_channel_library, action_points

-- ====================
-- media_plan_funnels
-- ====================
DROP POLICY IF EXISTS "Users can view funnels" ON media_plan_funnels;
DROP POLICY IF EXISTS "Users can insert funnels" ON media_plan_funnels;
DROP POLICY IF EXISTS "Users can update funnels" ON media_plan_funnels;
DROP POLICY IF EXISTS "Users can delete funnels" ON media_plan_funnels;

CREATE POLICY "Users can view funnels"
  ON media_plan_funnels
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert funnels"
  ON media_plan_funnels
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update funnels"
  ON media_plan_funnels
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete funnels"
  ON media_plan_funnels
  FOR DELETE
  TO authenticated
  USING (true);

-- ====================
-- funnel_metrics_cache
-- ====================
DROP POLICY IF EXISTS "Users can view funnel metrics cache" ON funnel_metrics_cache;
DROP POLICY IF EXISTS "Users can insert funnel metrics cache" ON funnel_metrics_cache;
DROP POLICY IF EXISTS "Users can update funnel metrics cache" ON funnel_metrics_cache;
DROP POLICY IF EXISTS "Users can delete funnel metrics cache" ON funnel_metrics_cache;

CREATE POLICY "Users can view funnel metrics cache"
  ON funnel_metrics_cache
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert funnel metrics cache"
  ON funnel_metrics_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update funnel metrics cache"
  ON funnel_metrics_cache
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete funnel metrics cache"
  ON funnel_metrics_cache
  FOR DELETE
  TO authenticated
  USING (true);

-- ====================
-- media_channel_library
-- ====================
DROP POLICY IF EXISTS "Users can view media channel library" ON media_channel_library;
DROP POLICY IF EXISTS "Users can insert media channel library" ON media_channel_library;
DROP POLICY IF EXISTS "Users can update media channel library" ON media_channel_library;
DROP POLICY IF EXISTS "Users can delete media channel library" ON media_channel_library;

CREATE POLICY "Users can view media channel library"
  ON media_channel_library
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert media channel library"
  ON media_channel_library
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update media channel library"
  ON media_channel_library
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete media channel library"
  ON media_channel_library
  FOR DELETE
  TO authenticated
  USING (true);

-- ====================
-- action_points
-- ====================
DROP POLICY IF EXISTS "Users can view action points" ON action_points;
DROP POLICY IF EXISTS "Users can insert action points" ON action_points;
DROP POLICY IF EXISTS "Users can update action points" ON action_points;
DROP POLICY IF EXISTS "Users can delete action points" ON action_points;

CREATE POLICY "Users can view action points"
  ON action_points
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert action points"
  ON action_points
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update action points"
  ON action_points
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete action points"
  ON action_points
  FOR DELETE
  TO authenticated
  USING (true);
