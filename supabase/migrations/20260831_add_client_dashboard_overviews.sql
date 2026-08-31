-- Migration: Client dashboard AI overview cache
-- Caches the AI-generated account overview (internal summary + client-facing
-- update) shown on a client's dashboard, keyed by client. Generated at most
-- once per 12h (server-side check in the ai-agent route) so every dashboard
-- visit doesn't trigger a fresh claude-opus-4-7 multi-tool call; a manual
-- "Generate Summary" refresh bypasses the cache.
-- Date: 2026-08-31

CREATE TABLE IF NOT EXISTS client_dashboard_overviews (
  client_id     uuid PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  overview_text text NOT NULL,
  generated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_dashboard_overviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_dashboard_overviews_owner_all" ON client_dashboard_overviews FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_dashboard_overviews.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_dashboard_overviews.client_id AND c.user_id = auth.uid()));
