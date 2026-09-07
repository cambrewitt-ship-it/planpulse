/**
 * Setup Auditor's core engine: fetch a campaign's live config, compare it
 * against its intended spec (platform_campaigns) plus the effective rule set
 * (getEffectiveRules), and upsert the diff into campaign_audit_findings.
 * Never writes to Google Ads / Meta — read + compare + flag only.
 */

import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';
import { fetchGoogleCampaignConfig } from '@/lib/ads/google-ads-config';
import { fetchMetaCampaignConfig } from '@/lib/ads/meta-ads-config';
import { checkUrlLiveness } from '@/lib/setup-auditor/url-liveness';
import { getEffectiveRules } from '@/lib/setup-auditor/rules';
import type { PlatformCampaign, RuleCheckResult, CampaignAuditRunResult } from '@/types/setup-auditor';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

const BUDGET_TOLERANCE = 0.02; // 2% — avoids flagging currency-rounding noise as drift

function withinTolerance(actual: number, expected: number, tolerance: number): boolean {
  if (expected === 0) return actual === 0;
  return Math.abs(actual - expected) / Math.abs(expected) <= tolerance;
}

function urlsMatchIgnoringQuery(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.hostname === ub.hostname && ua.pathname.replace(/\/$/, '') === ub.pathname.replace(/\/$/, '');
  } catch {
    return a === b;
  }
}

async function getAccessTokenAndAccount(
  supabase: AnySupabase,
  nango: Nango,
  campaign: PlatformCampaign,
): Promise<{ accessToken: string; loginCustomerId: string | null }> {
  const { data: connection } = await supabase
    .from('ad_platform_connections')
    .select('connection_id')
    .eq('user_id', campaign.user_id)
    .eq('platform', campaign.platform)
    .eq('connection_status', 'active')
    .eq('client_id', campaign.client_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!connection) throw new Error(`No active ${campaign.platform} connection for this client`);

  const nangoConn = await nango.getConnection(toNangoPlatform(campaign.platform), connection.connection_id);
  const accessToken = (nangoConn.credentials as any)?.access_token;
  if (!accessToken) throw new Error('No access token on connection — reconnect required');

  let loginCustomerId: string | null = null;
  if (campaign.platform === 'google-ads') {
    const { data: account } = await supabase
      .from('google_ads_accounts')
      .select('manager_customer_id')
      .eq('user_id', campaign.user_id)
      .eq('customer_id', campaign.external_account_id)
      .maybeSingle();
    loginCustomerId = account?.manager_customer_id
      ? account.manager_customer_id.replace(/-/g, '')
      : campaign.external_account_id.replace(/-/g, '');
  }

  return { accessToken, loginCustomerId };
}

async function evaluateGoogleCampaign(campaign: PlatformCampaign, accessToken: string, loginCustomerId: string | null, rules: Awaited<ReturnType<typeof getEffectiveRules>>): Promise<RuleCheckResult[]> {
  const cleanCustomerId = campaign.external_account_id.replace(/-/g, '');
  const config = await fetchGoogleCampaignConfig({
    cleanCustomerId,
    loginCustomerId,
    accessToken,
    campaignId: campaign.external_campaign_id,
  });

  const results: RuleCheckResult[] = [];

  if (campaign.expected_geo && campaign.expected_geo.length > 0) {
    const expectedSet = new Set(campaign.expected_geo);
    const actualSet = new Set(config.geoTargetIds);
    const compliant = expectedSet.size === actualSet.size && [...expectedSet].every((id) => actualSet.has(id));
    results.push({
      ruleKey: 'geo_targeting',
      severity: 'critical',
      compliant,
      expectedValue: campaign.expected_geo,
      actualValue: config.geoTargetIds,
      detail: compliant
        ? 'Geo targeting matches the media plan.'
        : `Expected Geo Target Constant ID(s) [${campaign.expected_geo.join(', ')}], found [${config.geoTargetIds.join(', ') || 'none'}].`,
    });
  }

  if (campaign.expected_geo_mode) {
    const compliant = config.geoTargetTypeSetting === campaign.expected_geo_mode.toUpperCase();
    results.push({
      ruleKey: 'geo_target_type_setting',
      severity: 'critical',
      compliant,
      expectedValue: campaign.expected_geo_mode,
      actualValue: config.geoTargetTypeSetting,
      detail: compliant
        ? 'Location targeting mode matches the media plan.'
        : `Expected location targeting mode "${campaign.expected_geo_mode}", found "${config.geoTargetTypeSetting}" — a "presence_or_interest" setting silently expands reach beyond the intended locations.`,
    });
  }

  if (campaign.expected_budget_amount != null && config.budgetAmountMicros != null) {
    const actualAmount = config.budgetAmountMicros / 1_000_000;
    const compliant = withinTolerance(actualAmount, campaign.expected_budget_amount, BUDGET_TOLERANCE);
    results.push({
      ruleKey: 'budget_amount',
      severity: 'warning',
      compliant,
      expectedValue: campaign.expected_budget_amount,
      actualValue: actualAmount,
      detail: compliant ? 'Budget matches the media plan.' : `Expected budget ~${campaign.expected_budget_amount}, found ${actualAmount}.`,
    });
  }

  if (campaign.expected_optimization_goal) {
    const compliant = (config.biddingStrategyType ?? '').toUpperCase() === campaign.expected_optimization_goal.toUpperCase();
    results.push({
      ruleKey: 'optimization_goal',
      severity: 'warning',
      compliant,
      expectedValue: campaign.expected_optimization_goal,
      actualValue: config.biddingStrategyType,
      detail: compliant ? 'Bidding strategy matches the media plan.' : `Expected bidding strategy "${campaign.expected_optimization_goal}", found "${config.biddingStrategyType}".`,
    });
  }

  if (campaign.expected_destination_url) {
    const compliant = config.finalUrls.some((u) => urlsMatchIgnoringQuery(u, campaign.expected_destination_url!));
    results.push({
      ruleKey: 'destination_url_match',
      severity: 'critical',
      compliant,
      expectedValue: campaign.expected_destination_url,
      actualValue: config.finalUrls,
      detail: compliant ? 'Destination URL matches the media plan.' : `Expected destination "${campaign.expected_destination_url}", found [${config.finalUrls.join(', ') || 'none'}].`,
    });

    const liveness = await checkUrlLiveness(campaign.expected_destination_url);
    results.push({
      ruleKey: 'destination_url_liveness',
      severity: 'critical',
      compliant: liveness.live,
      expectedValue: 'reachable (2xx/3xx)',
      actualValue: liveness.statusCode ?? liveness.error,
      detail: liveness.live ? 'Destination URL is live.' : `Destination URL is not live: ${liveness.error ?? `HTTP ${liveness.statusCode}`}.`,
    });
  }

  if (config.disapprovedAds > 0) {
    results.push({
      ruleKey: 'policy_disapproved',
      severity: 'critical',
      compliant: false,
      expectedValue: 0,
      actualValue: config.disapprovedAds,
      detail: `${config.disapprovedAds} ad(s) in this campaign are policy-disapproved.`,
    });
  }

  for (const rule of rules) {
    if (rule.ruleKey === 'network_expansion') {
      const expected = rule.expectedValue as { search_partners?: boolean; display_expansion?: boolean };
      const actualSearchPartners = !!config.networkSearchPartners;
      const actualDisplayExpansion = !!config.networkContentNetwork || !!config.networkPartnerSearchNetwork;
      const compliant = actualSearchPartners === !!expected.search_partners && actualDisplayExpansion === !!expected.display_expansion;
      results.push({
        ruleKey: 'network_expansion', severity: rule.severity, compliant,
        expectedValue: rule.expectedValue,
        actualValue: { search_partners: actualSearchPartners, display_expansion: actualDisplayExpansion },
        detail: compliant ? 'Network expansion matches policy.' : 'Search Partners / Display Network expansion does not match the agency policy for this campaign.',
      });
    } else if (rule.ruleKey === 'url_expansion') {
      const expected = rule.expectedValue as { enabled?: boolean };
      const actualEnabled = config.urlExpansionOptOut === false; // opted OUT of expansion === expansion disabled
      const compliant = actualEnabled === !!expected.enabled;
      results.push({
        ruleKey: 'url_expansion', severity: rule.severity, compliant,
        expectedValue: rule.expectedValue,
        actualValue: { enabled: actualEnabled },
        detail: compliant ? 'Final URL expansion matches policy.' : `Expected Final URL expansion ${expected.enabled ? 'on' : 'off'}, found ${actualEnabled ? 'on' : 'off'}.`,
      });
    }
  }

  return results;
}

async function evaluateMetaCampaign(campaign: PlatformCampaign, accessToken: string, rules: Awaited<ReturnType<typeof getEffectiveRules>>): Promise<RuleCheckResult[]> {
  const config = await fetchMetaCampaignConfig(campaign.external_campaign_id, accessToken);
  const results: RuleCheckResult[] = [];

  if (campaign.expected_geo && campaign.expected_geo.length > 0) {
    const expectedSet = new Set(campaign.expected_geo.map((g) => g.toLowerCase()));
    const actualNames = config.adSets.flatMap((a) => a.geoLocationNames.map((n) => n.toLowerCase()));
    const actualSet = new Set(actualNames);
    const compliant = expectedSet.size === actualSet.size && [...expectedSet].every((n) => actualSet.has(n));
    results.push({
      ruleKey: 'geo_targeting',
      severity: 'critical',
      compliant,
      expectedValue: campaign.expected_geo,
      actualValue: Array.from(new Set(actualNames)),
      detail: compliant
        ? 'Geo targeting matches the media plan.'
        : `Expected targeting [${campaign.expected_geo.join(', ')}], found [${Array.from(new Set(actualNames)).join(', ') || 'none'}].`,
    });
  }

  if (campaign.expected_budget_amount != null) {
    const expectedMinorUnits = campaign.expected_budget_amount * 100;
    const actualAmount = config.campaignDailyBudget ?? config.campaignLifetimeBudget
      ?? config.adSets.reduce((sum, a) => sum + (a.dailyBudget ?? a.lifetimeBudget ?? 0), 0);
    if (actualAmount > 0) {
      const compliant = withinTolerance(actualAmount, expectedMinorUnits, BUDGET_TOLERANCE);
      results.push({
        ruleKey: 'budget_amount',
        severity: 'warning',
        compliant,
        expectedValue: campaign.expected_budget_amount,
        actualValue: actualAmount / 100,
        detail: compliant ? 'Budget matches the media plan.' : `Expected budget ~${campaign.expected_budget_amount}, found ${actualAmount / 100}.`,
      });
    }
  }

  if (campaign.expected_optimization_goal) {
    const actualGoal = config.adSets[0]?.optimizationGoal ?? null;
    const compliant = (actualGoal ?? '').toUpperCase() === campaign.expected_optimization_goal.toUpperCase();
    results.push({
      ruleKey: 'optimization_goal',
      severity: 'warning',
      compliant,
      expectedValue: campaign.expected_optimization_goal,
      actualValue: actualGoal,
      detail: compliant ? 'Optimization goal matches the media plan.' : `Expected optimization goal "${campaign.expected_optimization_goal}", found "${actualGoal}".`,
    });
  }

  if (campaign.expected_destination_url) {
    const compliant = config.destinationUrls.some((u) => urlsMatchIgnoringQuery(u, campaign.expected_destination_url!));
    results.push({
      ruleKey: 'destination_url_match',
      severity: 'critical',
      compliant,
      expectedValue: campaign.expected_destination_url,
      actualValue: config.destinationUrls,
      detail: compliant ? 'Destination URL matches the media plan.' : `Expected destination "${campaign.expected_destination_url}", found [${config.destinationUrls.join(', ') || 'none'}].`,
    });

    const liveness = await checkUrlLiveness(campaign.expected_destination_url);
    results.push({
      ruleKey: 'destination_url_liveness',
      severity: 'critical',
      compliant: liveness.live,
      expectedValue: 'reachable (2xx/3xx)',
      actualValue: liveness.statusCode ?? liveness.error,
      detail: liveness.live ? 'Destination URL is live.' : `Destination URL is not live: ${liveness.error ?? `HTTP ${liveness.statusCode}`}.`,
    });
  }

  if (config.disapprovedAds > 0) {
    results.push({
      ruleKey: 'policy_disapproved',
      severity: 'critical',
      compliant: false,
      expectedValue: 0,
      actualValue: config.disapprovedAds,
      detail: `${config.disapprovedAds} ad(s) in this campaign are policy-disapproved.`,
    });
  }

  for (const rule of rules) {
    if (rule.ruleKey === 'advantage_placements') {
      const expected = rule.expectedValue as { enabled?: boolean };
      const actualEnabled = config.adSets.some((a) => a.autoPlacementEnabled === true);
      const compliant = actualEnabled === !!expected.enabled;
      results.push({
        ruleKey: 'advantage_placements', severity: rule.severity, compliant,
        expectedValue: rule.expectedValue, actualValue: { enabled: actualEnabled },
        detail: compliant ? 'Advantage+ Placements matches policy.' : `Expected Advantage+ Placements ${expected.enabled ? 'on' : 'off'}, found ${actualEnabled ? 'on' : 'off'}.`,
      });
    } else if (rule.ruleKey === 'advantage_audience') {
      const expected = rule.expectedValue as { enabled?: boolean };
      const actualEnabled = config.adSets.some((a) => a.advantageAudienceEnabled === true);
      const compliant = actualEnabled === !!expected.enabled;
      results.push({
        ruleKey: 'advantage_audience', severity: rule.severity, compliant,
        expectedValue: rule.expectedValue, actualValue: { enabled: actualEnabled },
        detail: compliant ? 'Advantage+ Audience matches policy.' : `Expected Advantage+ Audience ${expected.enabled ? 'on' : 'off'}, found ${actualEnabled ? 'on' : 'off'}.`,
      });
    } else if (rule.ruleKey === 'creative_enhancements') {
      const expected = rule.expectedValue as { enabled?: boolean };
      const actualEnabled = !!config.creativeEnhancementsEnabled;
      const compliant = actualEnabled === !!expected.enabled;
      results.push({
        ruleKey: 'creative_enhancements', severity: rule.severity, compliant,
        expectedValue: rule.expectedValue, actualValue: { enabled: actualEnabled },
        detail: compliant ? 'Creative Enhancements matches policy.' : `Expected Creative Enhancements ${expected.enabled ? 'on' : 'off'}, found ${actualEnabled ? 'on' : 'off'}.`,
      });
    }
  }

  return results;
}

/** Upserts this run's results into campaign_audit_findings, resolving anything that cleared and reopening anything that regressed. */
async function persistFindings(
  supabase: AnySupabase,
  campaign: PlatformCampaign,
  results: RuleCheckResult[],
): Promise<{ opened: string[]; resolved: string[]; stillOpen: string[] }> {
  const { data: existingRows } = await supabase
    .from('campaign_audit_findings')
    .select('rule_key, status')
    .eq('platform_campaign_id', campaign.id);

  const existingByRule = new Map<string, { status: string }>((existingRows ?? []).map((r: any) => [r.rule_key, r]));
  const nowIso = new Date().toISOString();

  const opened: string[] = [];
  const resolved: string[] = [];
  const stillOpen: string[] = [];

  for (const result of results) {
    const existing = existingByRule.get(result.ruleKey);

    if (!result.compliant) {
      const reopening = existing?.status === 'resolved';
      if (existing && existing.status === 'open') stillOpen.push(result.ruleKey);
      else opened.push(result.ruleKey);

      await supabase.from('campaign_audit_findings').upsert(
        {
          platform_campaign_id: campaign.id,
          client_id: campaign.client_id,
          rule_key: result.ruleKey,
          severity: result.severity,
          status: 'open',
          expected_value: result.expectedValue,
          actual_value: result.actualValue,
          detail: result.detail,
          last_checked_at: nowIso,
          ...((!existing || reopening) ? { first_detected_at: nowIso } : {}),
          resolved_at: null,
        },
        { onConflict: 'platform_campaign_id,rule_key' },
      );
    } else if (existing && existing.status === 'open') {
      resolved.push(result.ruleKey);
      await supabase
        .from('campaign_audit_findings')
        .update({ status: 'resolved', resolved_at: nowIso, last_checked_at: nowIso, actual_value: result.actualValue })
        .eq('platform_campaign_id', campaign.id)
        .eq('rule_key', result.ruleKey);
    }
  }

  return { opened, resolved, stillOpen };
}

export async function runCampaignAudit(
  supabase: AnySupabase,
  nango: Nango,
  campaign: PlatformCampaign,
): Promise<CampaignAuditRunResult> {
  const checkedAt = new Date().toISOString();
  try {
    const { accessToken, loginCustomerId } = await getAccessTokenAndAccount(supabase, nango, campaign);
    const rules = await getEffectiveRules(supabase, {
      platform: campaign.platform,
      clientId: campaign.client_id,
      channelName: campaign.channel_name,
      platformCampaignId: campaign.id,
    });

    const results = campaign.platform === 'google-ads'
      ? await evaluateGoogleCampaign(campaign, accessToken, loginCustomerId, rules)
      : await evaluateMetaCampaign(campaign, accessToken, rules);

    const { opened, resolved, stillOpen } = await persistFindings(supabase, campaign, results);

    return { platformCampaignId: campaign.id, checkedAt, results, opened, resolved, stillOpen };
  } catch (error: any) {
    return { platformCampaignId: campaign.id, checkedAt, results: [], opened: [], resolved: [], stillOpen: [], error: error.message };
  }
}
