-- Migration: Client Hub trend builder widget config
-- Adds a per-client config blob for the customizable metric-trend builder
-- section (agency picks metric/platform pair + chart type + period), stored
-- alongside the existing conversion_action_type/conversion_label columns on
-- client_hub_config.
-- Date: 2026-08-22

ALTER TABLE client_hub_config
  ADD COLUMN IF NOT EXISTS trend_widget jsonb NOT NULL DEFAULT '{
    "metricA": "spend", "platformA": "all",
    "metricB": "clicks", "platformB": "all",
    "chartType": "dual_line", "period": "30d"
  }'::jsonb;
