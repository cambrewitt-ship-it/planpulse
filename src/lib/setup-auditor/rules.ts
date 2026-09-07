/**
 * Rule hierarchy resolution for Setup Auditor: agency-wide global defaults
 * (campaign_audit_rules_global) + per-client-channel or per-campaign
 * overrides (campaign_audit_rule_overrides), mirroring the existing
 * channel_benchmarks / client_channel_presets pattern.
 *
 * Precedence: campaign-specific override (unexpired) > client+channel
 * override (unexpired) > agency-wide global default. Expired overrides fall
 * through automatically — no manual cleanup needed.
 */

import type { CampaignAuditRuleGlobal, CampaignAuditRuleOverride, SetupAuditorPlatform, FindingSeverity } from '@/types/setup-auditor';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export interface EffectiveRule {
  ruleKey: string;
  expectedValue: Record<string, unknown>;
  severity: FindingSeverity;
  source: 'override_campaign' | 'override_client_channel' | 'global';
}

function isExpired(override: CampaignAuditRuleOverride): boolean {
  return !!override.expires_at && new Date(override.expires_at).getTime() < Date.now();
}

export async function getEffectiveRules(
  supabase: AnySupabase,
  params: { platform: SetupAuditorPlatform; clientId: string; channelName: string | null; platformCampaignId: string },
): Promise<EffectiveRule[]> {
  const { platform, clientId, channelName, platformCampaignId } = params;

  const [{ data: globalRules }, { data: campaignOverrides }, { data: channelOverrides }] = await Promise.all([
    supabase
      .from('campaign_audit_rules_global')
      .select('*')
      .eq('platform', platform),
    supabase
      .from('campaign_audit_rule_overrides')
      .select('*')
      .eq('scope', 'campaign')
      .eq('platform_campaign_id', platformCampaignId),
    channelName
      ? supabase
          .from('campaign_audit_rule_overrides')
          .select('*')
          .eq('scope', 'client_channel')
          .eq('client_id', clientId)
          .eq('channel_name', channelName)
      : Promise.resolve({ data: [] }),
  ]);

  const campaignOverrideByRule = new Map<string, CampaignAuditRuleOverride>();
  for (const o of (campaignOverrides ?? []) as CampaignAuditRuleOverride[]) {
    if (!isExpired(o)) campaignOverrideByRule.set(o.rule_key, o);
  }
  const channelOverrideByRule = new Map<string, CampaignAuditRuleOverride>();
  for (const o of (channelOverrides ?? []) as CampaignAuditRuleOverride[]) {
    if (!isExpired(o)) channelOverrideByRule.set(o.rule_key, o);
  }

  return ((globalRules ?? []) as CampaignAuditRuleGlobal[]).map((rule) => {
    const campaignOverride = campaignOverrideByRule.get(rule.rule_key);
    if (campaignOverride) {
      return {
        ruleKey: rule.rule_key,
        expectedValue: campaignOverride.override_value,
        severity: rule.severity,
        source: 'override_campaign',
      };
    }
    const channelOverride = channelOverrideByRule.get(rule.rule_key);
    if (channelOverride) {
      return {
        ruleKey: rule.rule_key,
        expectedValue: channelOverride.override_value,
        severity: rule.severity,
        source: 'override_client_channel',
      };
    }
    return {
      ruleKey: rule.rule_key,
      expectedValue: rule.expected_value,
      severity: rule.severity,
      source: 'global',
    };
  });
}
