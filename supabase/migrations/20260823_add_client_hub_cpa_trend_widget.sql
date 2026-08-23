-- Migration: Client Hub CPA trend widget config
-- Adds a per-client config blob for the CPA trend section's settings gear
-- (which platform/conversion event feeds the CPA calculation), stored
-- alongside the existing trend_widget column on client_hub_config.
-- Date: 2026-08-23

ALTER TABLE client_hub_config
  ADD COLUMN IF NOT EXISTS cpa_trend_widget jsonb NOT NULL DEFAULT '{
    "platform": "all", "event": null
  }'::jsonb;
