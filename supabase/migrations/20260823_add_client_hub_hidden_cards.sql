-- Migration: Client Hub per-card visibility
-- Lets an agency hide an individual card within a section that's otherwise
-- toggled on for the client (e.g. hide just the "Top countries" card inside
-- the Audience/demographics section, while age/gender stay visible). Stored
-- as { [sectionKey]: cardKey[] } of hidden card keys, alongside the existing
-- sections/trend_widget config.
-- Date: 2026-08-23

ALTER TABLE client_hub_config
  ADD COLUMN IF NOT EXISTS hidden_cards jsonb NOT NULL DEFAULT '{}'::jsonb;
