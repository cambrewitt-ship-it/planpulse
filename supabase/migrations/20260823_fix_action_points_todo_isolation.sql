-- Migration: Fix cross-account data isolation for TODO action points
-- Bug: action_points has RLS of USING (true) / WITH CHECK (true) for every
--   operation (see 20260217_fix_all_rls_policies.sql), so ANY authenticated
--   user can read/write ALL rows. For 'SET UP' / 'HEALTH CHECK' rows this is
--   intentional — they are a shared template library matched against each
--   user's own clients by channel_type. But 'TODO' rows are ad-hoc personal/
--   agency tasks (added via the Kanban board, see KanbanBoard.tsx createTask),
--   and those were leaking across accounts: a user could see every other
--   account's To Do items in the Agency dashboard "To Do" tab.
-- Fix: add action_points.user_id for agency-wide TODOs (client_id IS NULL,
--   the "known agency-wide-TODO schema gap" already called out in
--   KanbanBoard.tsx), and scope client-linked TODOs through clients.user_id
--   like every other client-scoped table. SET UP / HEALTH CHECK rows keep
--   their existing shared-template behavior untouched.
-- Date: 2026-08-23

ALTER TABLE action_points ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_action_points_user_id ON action_points(user_id);

-- Backfill: client-linked TODOs derive ownership from their client, so no
-- backfill is needed for them (policy joins through clients.user_id below).
-- Agency-wide TODOs (client_id IS NULL) have no other signal for who created
-- them, so they are left with user_id = NULL below — same "safer default
-- than guessing an owner" call made for orphaned rows in
-- 20260819_fix_clients_data_isolation.sql. They become invisible to everyone
-- until manually reassigned:
--   SELECT id, text, created_at FROM action_points WHERE category = 'TODO' AND client_id IS NULL;
--   UPDATE action_points SET user_id = '<correct-owner-uuid>' WHERE id = '<action-point-id>';

-- Drop ALL existing policies by querying pg_policies (rather than guessing
-- names), matching the approach in 20260819_fix_clients_data_isolation.sql —
-- this project has ad-hoc policies applied outside migrations, and a
-- leftover permissive one would silently defeat this fix.
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'action_points'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.action_points', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE action_points ENABLE ROW LEVEL SECURITY;

-- SET UP / HEALTH CHECK rows stay globally readable/writable (shared
-- template library). TODO rows are scoped: client-linked ones through the
-- owning client, agency-wide ones through action_points.user_id directly.

CREATE POLICY "action_points_select"
    ON action_points FOR SELECT TO authenticated
    USING (
      category <> 'TODO'
      OR (client_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM clients c WHERE c.id = action_points.client_id AND c.user_id = auth.uid()
          ))
      OR (client_id IS NULL AND user_id = auth.uid())
    );

CREATE POLICY "action_points_insert"
    ON action_points FOR INSERT TO authenticated
    WITH CHECK (
      category <> 'TODO'
      OR (client_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM clients c WHERE c.id = action_points.client_id AND c.user_id = auth.uid()
          ))
      OR (client_id IS NULL AND user_id = auth.uid())
    );

CREATE POLICY "action_points_update"
    ON action_points FOR UPDATE TO authenticated
    USING (
      category <> 'TODO'
      OR (client_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM clients c WHERE c.id = action_points.client_id AND c.user_id = auth.uid()
          ))
      OR (client_id IS NULL AND user_id = auth.uid())
    )
    WITH CHECK (
      category <> 'TODO'
      OR (client_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM clients c WHERE c.id = action_points.client_id AND c.user_id = auth.uid()
          ))
      OR (client_id IS NULL AND user_id = auth.uid())
    );

CREATE POLICY "action_points_delete"
    ON action_points FOR DELETE TO authenticated
    USING (
      category <> 'TODO'
      OR (client_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM clients c WHERE c.id = action_points.client_id AND c.user_id = auth.uid()
          ))
      OR (client_id IS NULL AND user_id = auth.uid())
    );

-- ── VERIFY ────────────────────────────────────────────────────────────────
-- SELECT tablename, policyname, cmd, qual FROM pg_policies
-- WHERE tablename = 'action_points' ORDER BY policyname;
