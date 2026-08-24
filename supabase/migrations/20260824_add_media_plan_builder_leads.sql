-- Migration: Beta signup capture for the public /media-plan-builder tool.
-- Public, unauthenticated visitors submit name + email; nobody but a future
-- admin view can read it back (no SELECT policy for anon/authenticated).
-- Date: 2026-08-24

CREATE TABLE IF NOT EXISTS media_plan_builder_leads (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text,
  email      text NOT NULL,
  source     text NOT NULL DEFAULT 'media-plan-builder',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE media_plan_builder_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "media_plan_builder_leads_public_insert"
  ON media_plan_builder_leads FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ── VERIFY ────────────────────────────────────────────────────────────────
-- SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'media_plan_builder_leads';
