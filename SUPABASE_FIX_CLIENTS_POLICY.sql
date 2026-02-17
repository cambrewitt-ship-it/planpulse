-- ============================================
-- FIX CLIENTS TABLE POLICY
-- ============================================
-- This ensures users can ONLY see their own clients
-- Run this in Supabase SQL Editor NOW before deploying

-- Remove the existing "read all" policy
DROP POLICY IF EXISTS "clients_read_all" ON clients;

-- Add user-scoped SELECT policy
CREATE POLICY "clients_select_own"
ON clients FOR SELECT
USING (auth.uid() = user_id);

-- Verify the fix worked
-- This should show your new policy
SELECT
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'clients'
ORDER BY policyname;

-- ============================================
-- EXPECTED RESULT AFTER RUNNING:
-- ============================================
-- You should see 4 policies for clients table:
-- 1. clients_select_own (SELECT) - NEW, with user_id check
-- 2. clients_insert_via_channel_owner (INSERT)
-- 3. clients_update_via_channel_owner (UPDATE)
-- 4. clients_delete_via_channel_owner (DELETE)
