-- ============================================================
-- FIX DATA ISOLATION (clients + account_managers)
-- Run this in the Supabase SQL Editor
-- ============================================================

-- ── CLIENTS ──────────────────────────────────────────────────

-- Drop any permissive read-all policy
DROP POLICY IF EXISTS "clients_read_all" ON clients;
DROP POLICY IF EXISTS "Enable read access for all users" ON clients;

-- Ensure user_id column exists
ALTER TABLE clients ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);

-- Claim all unowned clients as yours (the currently logged-in user)
-- Only run this if you are the original account owner
UPDATE clients SET user_id = auth.uid() WHERE user_id IS NULL;

-- Create user-scoped SELECT policy
DROP POLICY IF EXISTS "clients_select_own" ON clients;
CREATE POLICY "clients_select_own"
ON clients FOR SELECT
USING (auth.uid() = user_id);

-- ── ACCOUNT MANAGERS ─────────────────────────────────────────

-- Drop any permissive read-all policy
DROP POLICY IF EXISTS "account_managers_read_all" ON account_managers;
DROP POLICY IF EXISTS "Enable read access for all users" ON account_managers;

-- Ensure user_id column exists
ALTER TABLE account_managers ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_account_managers_user_id ON account_managers(user_id);

-- Claim all unowned account managers as yours
UPDATE account_managers SET user_id = auth.uid() WHERE user_id IS NULL;

-- Create user-scoped SELECT policy
DROP POLICY IF EXISTS "account_managers_select_own" ON account_managers;
CREATE POLICY "account_managers_select_own"
ON account_managers FOR SELECT
USING (auth.uid() = user_id);

-- Also scope delete to owner
DROP POLICY IF EXISTS "account_managers_delete_own" ON account_managers;
CREATE POLICY "account_managers_delete_own"
ON account_managers FOR DELETE
USING (auth.uid() = user_id);

-- ── VERIFY ───────────────────────────────────────────────────

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('clients', 'account_managers')
ORDER BY tablename, policyname;
