-- Migration: Client Hub conversion metric config
-- The Client Hub "Leads" card was hard-wired to a heuristic that guesses which
-- Meta Ads action_type counts as a conversion. Adds per-client config so the
-- agency can pick the exact conversion event (and its display label) instead.
-- Date: 2026-08-20

ALTER TABLE client_hub_config
  ADD COLUMN IF NOT EXISTS conversion_action_type text,
  ADD COLUMN IF NOT EXISTS conversion_label text NOT NULL DEFAULT 'Leads';
