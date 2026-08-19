-- Migration: Fix cross-account data isolation for clients and related tables
-- Bug: "clients" (and several client-scoped child tables) had RLS policies of
--   USING (true) / auth.uid() IS NOT NULL — i.e. ANY authenticated user could
--   read/write ALL clients regardless of who owns them. This is why users on
--   different accounts could see each other's client lists in Settings.
-- Fix: scope every policy to the owning user via clients.user_id = auth.uid(),
--   joining through client_id for the child tables.
-- Date: 2026-08-19

-- For every affected table we drop ALL existing policies by querying
-- pg_policies (rather than DROP POLICY IF EXISTS "<guessed name>"), because
-- this project has a history of ad-hoc policies applied directly via the
-- Supabase SQL editor that aren't reflected in earlier migration files. A
-- leftover permissive policy would silently defeat this fix, since Postgres
-- OR's multiple permissive policies together.

DO $$
DECLARE
  pol RECORD;
  affected_tables TEXT[] := ARRAY[
    'clients',
    'account_managers',
    'client_health_status',
    'client_tasks',
    'client_action_point_completions',
    'client_channel_presets',
    'client_media_plan_builder'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY affected_tables LOOP
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- ── CLIENTS ────────────────────────────────────────────────────────────────

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_select_own"
    ON clients FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "clients_insert_own"
    ON clients FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "clients_update_own"
    ON clients FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "clients_delete_own"
    ON clients FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- ── ACCOUNT MANAGERS ─────────────────────────────────────────────────────

ALTER TABLE account_managers ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_account_managers_user_id ON account_managers(user_id);
ALTER TABLE account_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_managers_select_own"
    ON account_managers FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "account_managers_insert_own"
    ON account_managers FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "account_managers_update_own"
    ON account_managers FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "account_managers_delete_own"
    ON account_managers FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- ── CLIENT-SCOPED CHILD TABLES ───────────────────────────────────────────
-- No user_id column of their own — ownership flows through clients.user_id.

CREATE POLICY "client_health_status_owner_all"
    ON client_health_status FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_health_status.client_id AND c.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_health_status.client_id AND c.user_id = auth.uid()));

CREATE POLICY "client_tasks_owner_all"
    ON client_tasks FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_tasks.client_id AND c.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_tasks.client_id AND c.user_id = auth.uid()));

CREATE POLICY "client_action_point_completions_owner_all"
    ON client_action_point_completions FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_action_point_completions.client_id AND c.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_action_point_completions.client_id AND c.user_id = auth.uid()));

CREATE POLICY "client_channel_presets_owner_all"
    ON client_channel_presets FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_channel_presets.client_id AND c.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_channel_presets.client_id AND c.user_id = auth.uid()));

CREATE POLICY "client_media_plan_builder_owner_all"
    ON client_media_plan_builder FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_media_plan_builder.client_id AND c.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_media_plan_builder.client_id AND c.user_id = auth.uid()));

-- ── VERIFY ────────────────────────────────────────────────────────────────
-- Run after applying to confirm no permissive policy survived:
-- SELECT tablename, policyname, cmd, qual FROM pg_policies
-- WHERE tablename IN ('clients','account_managers','client_health_status',
--   'client_tasks','client_action_point_completions','client_channel_presets',
--   'client_media_plan_builder')
-- ORDER BY tablename, policyname;

-- ── ORPHANED ROWS ─────────────────────────────────────────────────────────
-- Any existing clients/account_managers with a NULL user_id become invisible
-- to everyone under this policy (safer default than guessing an owner).
-- Find them and assign manually:
-- SELECT id, name, created_at FROM clients WHERE user_id IS NULL;
-- SELECT id, name, created_at FROM account_managers WHERE user_id IS NULL;
-- UPDATE clients SET user_id = '<correct-owner-uuid>' WHERE id = '<client-id>';
