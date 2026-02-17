-- ============================================
-- ADD USER_ID TO CLIENTS TABLE
-- ============================================
-- This adds proper user ownership to the clients table
-- Run this in Supabase SQL Editor

-- Step 1: Add user_id column
ALTER TABLE clients
ADD COLUMN user_id uuid REFERENCES auth.users(id);

-- Step 2: Update existing clients to assign to current user
-- IMPORTANT: If you have existing test data, you'll need to assign it to a user
-- Option A: If you're the only user and want to claim all existing clients:
-- UPDATE clients SET user_id = auth.uid() WHERE user_id IS NULL;

-- Option B: If you have multiple test clients and don't care about them:
-- DELETE FROM clients WHERE user_id IS NULL;

-- For now, we'll leave existing clients unassigned
-- You can manually assign them later or delete them

-- Step 3: Make user_id required for NEW clients (optional but recommended)
-- Uncomment this after you've assigned all existing clients:
-- ALTER TABLE clients ALTER COLUMN user_id SET NOT NULL;

-- Step 4: Create index for performance
CREATE INDEX idx_clients_user_id ON clients(user_id);

-- Step 5: Update the RLS policy
DROP POLICY IF EXISTS "clients_read_all" ON clients;

CREATE POLICY "clients_select_own"
ON clients FOR SELECT
USING (auth.uid() = user_id);

-- Step 6: Verify the changes
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'clients'
  AND column_name = 'user_id';

-- Step 7: Verify policies
SELECT
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename = 'clients'
ORDER BY policyname;

-- ============================================
-- EXPECTED RESULTS:
-- ============================================
-- Query 6 should show: user_id | uuid | YES
-- Query 7 should show 4 policies including "clients_select_own"
