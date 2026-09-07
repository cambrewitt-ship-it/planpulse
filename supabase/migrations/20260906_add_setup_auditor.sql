-- Setup Auditor: audits LIVE Google Ads / Meta Ads campaigns against what
-- they were supposed to be configured as, and flags discrepancies. Never
-- auto-corrects — flag only. See plan-mode-planpulse-dreamy-koala.md for the
-- full design rationale.
--
-- Table shapes deliberately mirror the existing global-default / per-client-
-- override pattern already proven by channel_benchmarks + client_channel_presets
-- (20260323_add_benchmarks.sql, 20260323_add_client_channel_presets.sql), and
-- reuse their "USING (true) for authenticated" RLS convention.

-- ─── 1. platform_campaigns ───────────────────────────────────────────────────
-- The missing registry: links a live Google Ads / Meta campaign ID to the
-- client it belongs to, plus the per-campaign "intended spec" fields that
-- have no home anywhere else in the data model (client_briefs is one row per
-- CLIENT; client_campaign_goals is per client+channel STRING, not a real
-- platform campaign ID). Populated by manually linking a campaign at setup
-- time, reusing the existing campaign-picker endpoints
-- (/api/ads/google-ads/campaigns, /api/ads/meta/campaigns).

CREATE TABLE IF NOT EXISTS platform_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('google-ads', 'meta-ads')),
  external_account_id TEXT NOT NULL,
  external_campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  channel_name TEXT,

  -- Intended spec — what this specific campaign is supposed to look like.
  expected_geo TEXT[],
  expected_geo_mode TEXT CHECK (expected_geo_mode IN ('presence', 'presence_or_interest')),
  expected_budget_amount NUMERIC,
  expected_budget_currency TEXT DEFAULT 'NZD',
  expected_optimization_goal TEXT,
  expected_destination_url TEXT,
  notes TEXT,

  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, platform, external_campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_campaigns_client_id ON platform_campaigns(client_id);
CREATE INDEX IF NOT EXISTS idx_platform_campaigns_active ON platform_campaigns(is_active) WHERE is_active;

ALTER TABLE platform_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read platform_campaigns"
  ON platform_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated users to insert platform_campaigns"
  ON platform_campaigns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated users to update platform_campaigns"
  ON platform_campaigns FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated users to delete platform_campaigns"
  ON platform_campaigns FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_platform_campaigns_updated_at
  BEFORE UPDATE ON platform_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── 2. campaign_audit_rules_global ──────────────────────────────────────────
-- Agency-wide constants that apply to every campaign on a platform unless
-- overridden (mirrors channel_benchmarks). Things that should never vary by
-- client, e.g. "Advantage+ Placements off", "Creative Enhancements off".

CREATE TABLE IF NOT EXISTS campaign_audit_rules_global (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('google-ads', 'meta-ads')),
  rule_key TEXT NOT NULL,
  rule_label TEXT NOT NULL,
  expected_value JSONB NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')) DEFAULT 'warning',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, rule_key)
);

ALTER TABLE campaign_audit_rules_global ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read campaign_audit_rules_global"
  ON campaign_audit_rules_global FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated users to insert campaign_audit_rules_global"
  ON campaign_audit_rules_global FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated users to update campaign_audit_rules_global"
  ON campaign_audit_rules_global FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated users to delete campaign_audit_rules_global"
  ON campaign_audit_rules_global FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_campaign_audit_rules_global_updated_at
  BEFORE UPDATE ON campaign_audit_rules_global
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed the agency-wide defaults that map directly onto the existing manual
-- checklist's "Advantage Plus" item ("Turn off Creative Enhancements") plus
-- its Google network-expansion equivalent, so Setup Auditor starts out
-- automating exactly what account managers already check by hand.
INSERT INTO campaign_audit_rules_global (platform, rule_key, rule_label, expected_value, severity, description)
VALUES
  ('meta-ads', 'advantage_placements', 'Advantage+ Placements', '{"enabled": false}',
   'warning', 'Placements should be manually selected per the media schedule, not left to Advantage+ Placements automation.'),
  ('meta-ads', 'advantage_audience', 'Advantage+ Audience', '{"enabled": false}',
   'warning', 'Audience should be manually targeted per the media schedule, not left to Advantage+ Audience automation.'),
  ('meta-ads', 'creative_enhancements', 'Creative Enhancements', '{"enabled": false}',
   'warning', 'Turn off Creative Enhancements — matches the existing manual health-check checklist item.'),
  ('google-ads', 'network_expansion', 'Search/Display Network Expansion', '{"search_partners": false, "display_expansion": false}',
   'warning', 'Search Partners and Display Network expansion should be off unless the media plan explicitly calls for them.'),
  ('google-ads', 'url_expansion', 'Final URL Expansion', '{"enabled": false}',
   'warning', 'Final URL expansion should be off so traffic only lands on the destination URL set in the media plan.')
ON CONFLICT (platform, rule_key) DO NOTHING;

-- ─── 3. campaign_audit_rule_overrides ────────────────────────────────────────
-- Legitimate exceptions to a global rule, scoped either to a whole client+
-- channel or to one specific campaign (mirrors client_channel_presets).
-- `reason` is required — it's what turns "silently ignoring the rule" into
-- "a documented, accountable exception."

CREATE TABLE IF NOT EXISTS campaign_audit_rule_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('client_channel', 'campaign')),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  channel_name TEXT,
  platform_campaign_id UUID REFERENCES platform_campaigns(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  override_value JSONB NOT NULL,
  reason TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT campaign_audit_rule_overrides_scope_shape CHECK (
    (scope = 'client_channel' AND client_id IS NOT NULL AND channel_name IS NOT NULL AND platform_campaign_id IS NULL)
    OR
    (scope = 'campaign' AND platform_campaign_id IS NOT NULL AND client_id IS NULL AND channel_name IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_campaign_audit_rule_overrides_client_channel
  ON campaign_audit_rule_overrides(client_id, channel_name) WHERE scope = 'client_channel';
CREATE INDEX IF NOT EXISTS idx_campaign_audit_rule_overrides_campaign
  ON campaign_audit_rule_overrides(platform_campaign_id) WHERE scope = 'campaign';

ALTER TABLE campaign_audit_rule_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read campaign_audit_rule_overrides"
  ON campaign_audit_rule_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated users to insert campaign_audit_rule_overrides"
  ON campaign_audit_rule_overrides FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated users to update campaign_audit_rule_overrides"
  ON campaign_audit_rule_overrides FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated users to delete campaign_audit_rule_overrides"
  ON campaign_audit_rule_overrides FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_campaign_audit_rule_overrides_updated_at
  BEFORE UPDATE ON campaign_audit_rule_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── 4. campaign_audit_findings ──────────────────────────────────────────────
-- Current audit result per campaign+rule. Only rows for rules that have ever
-- failed exist here (a rule that's always passed never gets a row) — this is
-- a discrepancy log, not an exhaustive per-rule status table. `client_id` is
-- denormalized from platform_campaigns so the health-status integration can
-- query findings without a join.

CREATE TABLE IF NOT EXISTS campaign_audit_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_campaign_id UUID NOT NULL REFERENCES platform_campaigns(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')) DEFAULT 'open',
  expected_value JSONB,
  actual_value JSONB,
  detail TEXT,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform_campaign_id, rule_key)
);

CREATE INDEX IF NOT EXISTS idx_campaign_audit_findings_client_open
  ON campaign_audit_findings(client_id, status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_campaign_audit_findings_campaign
  ON campaign_audit_findings(platform_campaign_id);

ALTER TABLE campaign_audit_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read campaign_audit_findings"
  ON campaign_audit_findings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated users to insert campaign_audit_findings"
  ON campaign_audit_findings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated users to update campaign_audit_findings"
  ON campaign_audit_findings FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated users to delete campaign_audit_findings"
  ON campaign_audit_findings FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_campaign_audit_findings_updated_at
  BEFORE UPDATE ON campaign_audit_findings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── 5. campaign_audit_cursor ─────────────────────────────────────────────────
-- One row per platform, tracking the last-processed campaign in the
-- scheduled scan (/api/cron/setup-audit-scan). Lets a mid-run Vercel
-- serverless timeout resume from where it left off instead of silently
-- skipping the remaining clients in that tick.

CREATE TABLE IF NOT EXISTS campaign_audit_cursor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL UNIQUE CHECK (platform IN ('google-ads', 'meta-ads')),
  last_platform_campaign_id UUID,
  last_run_started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE campaign_audit_cursor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read campaign_audit_cursor"
  ON campaign_audit_cursor FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated users to insert campaign_audit_cursor"
  ON campaign_audit_cursor FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated users to update campaign_audit_cursor"
  ON campaign_audit_cursor FOR UPDATE TO authenticated USING (true);
