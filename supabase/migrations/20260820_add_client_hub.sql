-- Migration: Client Hub (client-facing shareable performance portal)
-- a) Fixes cross-account data isolation on the client-intelligence-hub tables
--    (client_briefs, client_brief_versions, client_documents, client_notes,
--    client_campaign_goals) — they were left on permissive
--    USING (auth.role() = 'authenticated') policies, the same cross-account
--    leak pattern fixed for `clients` et al in 20260819_fix_clients_data_isolation.sql.
--    Any authenticated user could read/write any other account's client
--    briefs, notes, documents, and goals. Fixing this before adding a public
--    token-gated surface on top of these tables.
-- b) Adds client_hub_config (per-client section visibility) and
--    client_hub_share_links (per-client "anyone with the link" token).
-- Date: 2026-08-20

-- ── a) RLS fix for client-intelligence-hub tables ───────────────────────────

DO $$
DECLARE
  pol RECORD;
  affected_tables TEXT[] := ARRAY[
    'client_briefs',
    'client_brief_versions',
    'client_documents',
    'client_notes',
    'client_campaign_goals'
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

CREATE POLICY "client_briefs_owner_all" ON client_briefs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_briefs.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_briefs.client_id AND c.user_id = auth.uid()));

CREATE POLICY "client_brief_versions_owner_all" ON client_brief_versions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_brief_versions.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_brief_versions.client_id AND c.user_id = auth.uid()));

CREATE POLICY "client_documents_owner_all" ON client_documents FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_documents.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_documents.client_id AND c.user_id = auth.uid()));

CREATE POLICY "client_notes_owner_all" ON client_notes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_notes.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_notes.client_id AND c.user_id = auth.uid()));

CREATE POLICY "client_campaign_goals_owner_all" ON client_campaign_goals FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_campaign_goals.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_campaign_goals.client_id AND c.user_id = auth.uid()));

-- ── VERIFY ────────────────────────────────────────────────────────────────
-- SELECT tablename, policyname, cmd, qual FROM pg_policies
-- WHERE tablename IN ('client_briefs','client_brief_versions','client_documents',
--   'client_notes','client_campaign_goals')
-- ORDER BY tablename, policyname;

-- ── b) client_hub_config ─────────────────────────────────────────────────
-- Per-client section visibility for the shareable Client Hub.

CREATE TABLE IF NOT EXISTS client_hub_config (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  uuid NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  sections   jsonb NOT NULL DEFAULT '{
    "snapshot": true, "charts": true, "pacing": true, "goals": true,
    "brief": true, "notes": true, "documents": true, "spend": true
  }'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_hub_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_hub_config_owner_all" ON client_hub_config FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_hub_config.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_hub_config.client_id AND c.user_id = auth.uid()));

-- ── c) client_hub_share_links ────────────────────────────────────────────
-- One "anyone with the link" token per client. The public /hub/[token] route
-- reads this table with the service-role key (bypassing RLS by design —
-- possession of the token is the access gate for that surface), so RLS here
-- only governs the authenticated agency-side management API.

CREATE TABLE IF NOT EXISTS client_hub_share_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE,
  is_enabled  boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_client_hub_share_links_token ON client_hub_share_links(token);

ALTER TABLE client_hub_share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_hub_share_links_owner_all" ON client_hub_share_links FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_hub_share_links.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_hub_share_links.client_id AND c.user_id = auth.uid()));
