-- ============================================
-- VERIFY AND FIX ACCOUNT MANAGER SETUP
-- ============================================
-- Run this in Supabase SQL Editor to verify the account_manager column exists
-- and that RLS policies allow updates

-- Step 1: Check if account_manager column exists
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'clients'
  AND column_name = 'account_manager';

-- Step 2: If the column doesn't exist, add it
ALTER TABLE clients ADD COLUMN IF NOT EXISTS account_manager TEXT;

-- Step 3: Verify RLS policies for UPDATE on clients table
SELECT 
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'clients'
  AND cmd = 'UPDATE'
ORDER BY policyname;

-- Step 4: If no UPDATE policy exists, create one
-- (This should already exist from 20260217_fix_clients_rls.sql, but let's ensure it's there)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'clients' 
    AND policyname = 'Authenticated users can update clients'
  ) THEN
    CREATE POLICY "Authenticated users can update clients"
      ON clients
      FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Step 5: Test update (this should work if everything is set up correctly)
-- Uncomment the line below to test, but make sure to use a valid client ID
-- UPDATE clients SET account_manager = 'Test' WHERE id = 'your-client-id-here' RETURNING id, name, account_manager;

-- Step 6: Final verification - check all policies
SELECT 
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename = 'clients'
ORDER BY policyname, cmd;
