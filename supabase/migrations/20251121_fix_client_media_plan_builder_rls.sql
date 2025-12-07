-- Migration: Fix RLS policies for client_media_plan_builder table
-- The previous policies used auth.role() which doesn't work properly with server-side clients
-- We'll use auth.uid() IS NOT NULL to check if user is authenticated

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view client media plan builder" ON client_media_plan_builder;
DROP POLICY IF EXISTS "Users can insert client media plan builder" ON client_media_plan_builder;
DROP POLICY IF EXISTS "Users can update client media plan builder" ON client_media_plan_builder;
DROP POLICY IF EXISTS "Users can delete client media plan builder" ON client_media_plan_builder;

-- Create new policies using auth.uid() check
-- Users can view media plan builder data for clients if authenticated
CREATE POLICY "Users can view client media plan builder"
  ON client_media_plan_builder
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can insert media plan builder data for clients if authenticated
CREATE POLICY "Users can insert client media plan builder"
  ON client_media_plan_builder
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users can update media plan builder data for clients if authenticated
CREATE POLICY "Users can update client media plan builder"
  ON client_media_plan_builder
  FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users can delete media plan builder data for clients if authenticated
CREATE POLICY "Users can delete client media plan builder"
  ON client_media_plan_builder
  FOR DELETE
  USING (auth.uid() IS NOT NULL);

