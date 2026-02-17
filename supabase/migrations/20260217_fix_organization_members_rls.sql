-- Migration: Fix infinite recursion in organization_members RLS policy
-- Purpose: The RLS policy on organization_members references organization_members
--          itself, causing infinite recursion when any query joins through it.
-- Fix: Replace the recursive policy with a security definer function that
--      breaks the recursion, or use a simpler non-recursive policy.
-- Date: 2026-02-17

-- Drop all existing policies on organization_members
DROP POLICY IF EXISTS "Users can view their organization members" ON organization_members;
DROP POLICY IF EXISTS "Users can view organization members" ON organization_members;
DROP POLICY IF EXISTS "Organization members can view other members" ON organization_members;
DROP POLICY IF EXISTS "Members can view their organization" ON organization_members;
DROP POLICY IF EXISTS "Users can see members of their organizations" ON organization_members;
DROP POLICY IF EXISTS "Authenticated users can read organization members" ON organization_members;
DROP POLICY IF EXISTS "Users can read organization members" ON organization_members;
DROP POLICY IF EXISTS "organization_members_select" ON organization_members;
DROP POLICY IF EXISTS "organization_members_insert" ON organization_members;
DROP POLICY IF EXISTS "organization_members_update" ON organization_members;
DROP POLICY IF EXISTS "organization_members_delete" ON organization_members;

-- Drop any other policies that might exist (catch-all for unknown names)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE tablename = 'organization_members'
    AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON organization_members', pol.policyname);
  END LOOP;
END;
$$;

-- Create a security definer function to check membership without triggering RLS
-- This breaks the recursion by bypassing RLS when checking membership
CREATE OR REPLACE FUNCTION public.is_org_member(org_id UUID, user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = org_id
    AND user_id = user_id
  );
$$;

-- Simple non-recursive policies: users can see rows where they are the user
CREATE POLICY "Users can view their own membership"
  ON organization_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own membership"
  ON organization_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own membership"
  ON organization_members
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own membership"
  ON organization_members
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
