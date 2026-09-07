// Types for the Setup Auditor feature (supabase/migrations/20260906_add_setup_auditor.sql).
// Not part of the generated database.ts — regenerate with `supabase gen types`
// once these tables settle, and this file can be trimmed to re-exports.

export type SetupAuditorPlatform = 'google-ads' | 'meta-ads';
export type FindingSeverity = 'critical' | 'warning' | 'info';
export type FindingStatus = 'open' | 'resolved';

export interface PlatformCampaign {
  id: string;
  client_id: string;
  user_id: string;
  platform: SetupAuditorPlatform;
  external_account_id: string;
  external_campaign_id: string;
  campaign_name: string | null;
  channel_name: string | null;
  expected_geo: string[] | null;
  expected_geo_mode: 'presence' | 'presence_or_interest' | null;
  expected_budget_amount: number | null;
  expected_budget_currency: string | null;
  expected_optimization_goal: string | null;
  expected_destination_url: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CampaignAuditRuleGlobal {
  id: string;
  platform: SetupAuditorPlatform;
  rule_key: string;
  rule_label: string;
  expected_value: Record<string, unknown>;
  severity: FindingSeverity;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignAuditRuleOverride {
  id: string;
  scope: 'client_channel' | 'campaign';
  client_id: string | null;
  channel_name: string | null;
  platform_campaign_id: string | null;
  rule_key: string;
  override_value: Record<string, unknown>;
  reason: string;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignAuditFinding {
  id: string;
  platform_campaign_id: string;
  client_id: string;
  rule_key: string;
  severity: FindingSeverity;
  status: FindingStatus;
  expected_value: unknown;
  actual_value: unknown;
  detail: string | null;
  first_detected_at: string;
  last_checked_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

/** One rule check's outcome, produced by the evaluate step before it's upserted into campaign_audit_findings. */
export interface RuleCheckResult {
  ruleKey: string;
  severity: FindingSeverity;
  compliant: boolean;
  expectedValue: unknown;
  actualValue: unknown;
  detail: string;
}

export interface CampaignAuditRunResult {
  platformCampaignId: string;
  checkedAt: string;
  results: RuleCheckResult[];
  opened: string[]; // rule_keys newly flagged this run
  resolved: string[]; // rule_keys that cleared this run
  stillOpen: string[]; // rule_keys that remain flagged
  error?: string;
}
