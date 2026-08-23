-- Migration: Client Hub conversion metric — platform selection
-- The Client Hub "Leads" metric (Overview snapshot + Spend & leads trend) was
-- locked to Meta Ads action types. Adds a platform column so the agency can
-- pick Meta Ads, Google Ads, or GA4 as the source, with conversion_action_type
-- reused as the event/action name within whichever platform is selected
-- (Meta action_type, Google Ads conversion action name, or GA4 event name).
-- Date: 2026-08-23

ALTER TABLE client_hub_config
  ADD COLUMN IF NOT EXISTS conversion_platform text NOT NULL DEFAULT 'meta-ads';

ALTER TABLE client_hub_config
  ADD CONSTRAINT client_hub_config_conversion_platform_check
  CHECK (conversion_platform IN ('meta-ads', 'google-ads', 'ga4'));
