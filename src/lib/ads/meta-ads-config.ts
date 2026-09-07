/**
 * Live Meta Ads CAMPAIGN CONFIG reads for Setup Auditor — targeting,
 * placements, Advantage+ Audience/Placements, budget, optimization goal,
 * destination URL, Creative Enhancements, disapproval status. Distinct from
 * meta-ads-live.ts, which only ever reads spend/performance metrics; nothing
 * in this codebase read setup/config fields before this.
 *
 * Same raw-Graph-API-over-REST approach as the rest of the Meta integration
 * (no SDK). Read-only — needs only the `ads_read` scope; confirm the Nango
 * Meta integration config isn't also requesting `ads_management`.
 *
 * NOTE: exact nested field shapes for `is_autoplacement`,
 * `targeting_automation`, and creative `degrees_of_freedom_spec` should be
 * verified against a real connected ad account before this ships — Meta's
 * Graph API has shifted these Advantage+ field names across versions, and
 * this hasn't been tested against live data. See plan verification steps.
 */

const GRAPH_VERSION = 'v26.0';

export interface MetaAdSetConfig {
  id: string;
  name: string;
  optimizationGoal: string | null;
  bidStrategy: string | null;
  dailyBudget: number | null; // account currency minor units (e.g. cents)
  lifetimeBudget: number | null;
  geoLocationNames: string[];
  advantageAudienceEnabled: boolean | null;
  autoPlacementEnabled: boolean | null;
  publisherPlatforms: string[];
}

export interface MetaCampaignConfig {
  campaignId: string;
  campaignName: string;
  effectiveStatus: string | null;
  specialAdCategories: string[];
  smartPromotionType: string | null;
  campaignDailyBudget: number | null;
  campaignLifetimeBudget: number | null;
  adSets: MetaAdSetConfig[];
  destinationUrls: string[]; // deduped across all non-removed ads
  creativeEnhancementsEnabled: boolean | null; // true if ANY ad has standard enhancements opted in
  disapprovedAds: number;
}

async function graphGet(path: string, accessToken: string, fields: string, extraParams: Record<string, string> = {}): Promise<any> {
  const params = new URLSearchParams({ fields, access_token: accessToken, ...extraParams });
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}?${params.toString()}`);
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Meta Marketing API error ${response.status}: ${errText.substring(0, 300)}`);
  }
  return response.json();
}

async function graphGetAllPages(path: string, accessToken: string, fields: string, extraParams: Record<string, string> = {}): Promise<any[]> {
  const all: any[] = [];
  let json = await graphGet(path, accessToken, fields, { limit: '200', ...extraParams });
  if (Array.isArray(json.data)) all.push(...json.data);
  while (json.paging?.next) {
    const res = await fetch(json.paging.next);
    if (!res.ok) break;
    json = await res.json();
    if (Array.isArray(json.data)) all.push(...json.data);
  }
  return all;
}

export async function fetchMetaCampaignConfig(campaignId: string, accessToken: string): Promise<MetaCampaignConfig> {
  const campaignFields = 'name,effective_status,special_ad_categories,smart_promotion_type,daily_budget,lifetime_budget';
  const campaign = await graphGet(campaignId, accessToken, campaignFields);

  const adSetFields = 'id,name,optimization_goal,bid_strategy,daily_budget,lifetime_budget,targeting,is_autoplacement';
  const adSetRows = await graphGetAllPages(`${campaignId}/adsets`, accessToken, adSetFields);

  const adSets: MetaAdSetConfig[] = adSetRows.map((row) => {
    const targeting = row.targeting ?? {};
    const geoLocationNames: string[] = [
      ...(targeting.geo_locations?.cities?.map((c: any) => c.name) ?? []),
      ...(targeting.geo_locations?.regions?.map((r: any) => r.name) ?? []),
      ...(targeting.geo_locations?.countries ?? []),
    ];
    const publisherPlatforms: string[] = targeting.publisher_platforms ?? [];
    // Absence of explicit publisher_platforms is Meta's convention for
    // Advantage+ Placements (automatic) when is_autoplacement isn't returned.
    const autoPlacementEnabled = typeof row.is_autoplacement === 'boolean'
      ? row.is_autoplacement
      : publisherPlatforms.length === 0 ? true : null;
    const advantageAudienceEnabled = typeof targeting.targeting_automation?.advantage_audience === 'number'
      ? targeting.targeting_automation.advantage_audience === 1
      : null;

    return {
      id: row.id,
      name: row.name ?? '',
      optimizationGoal: row.optimization_goal ?? null,
      bidStrategy: row.bid_strategy ?? null,
      dailyBudget: row.daily_budget != null ? Number(row.daily_budget) : null,
      lifetimeBudget: row.lifetime_budget != null ? Number(row.lifetime_budget) : null,
      geoLocationNames,
      advantageAudienceEnabled,
      autoPlacementEnabled,
      publisherPlatforms,
    };
  });

  const adFields = 'effective_status,creative{object_story_spec,asset_feed_spec,degrees_of_freedom_spec}';
  const adRows = await graphGetAllPages(`${campaignId}/ads`, accessToken, adFields);

  const destinationUrlSet = new Set<string>();
  let creativeEnhancementsEnabled: boolean | null = null;
  let disapprovedAds = 0;
  for (const ad of adRows) {
    if (ad.effective_status === 'DISAPPROVED') disapprovedAds++;
    const creative = ad.creative ?? {};
    const link = creative.object_story_spec?.link_data?.link;
    if (link) destinationUrlSet.add(link);
    for (const asset of (creative.asset_feed_spec?.link_urls ?? [])) {
      if (asset?.website_url) destinationUrlSet.add(asset.website_url);
    }
    const enrollStatus = creative.degrees_of_freedom_spec?.creative_features_spec?.standard_enhancements?.enroll_status;
    if (enrollStatus) {
      const optedIn = enrollStatus === 'OPT_IN';
      creativeEnhancementsEnabled = creativeEnhancementsEnabled || optedIn;
    }
  }

  return {
    campaignId,
    campaignName: campaign.name ?? '',
    effectiveStatus: campaign.effective_status ?? null,
    specialAdCategories: campaign.special_ad_categories ?? [],
    smartPromotionType: campaign.smart_promotion_type ?? null,
    campaignDailyBudget: campaign.daily_budget != null ? Number(campaign.daily_budget) : null,
    campaignLifetimeBudget: campaign.lifetime_budget != null ? Number(campaign.lifetime_budget) : null,
    adSets,
    destinationUrls: Array.from(destinationUrlSet),
    creativeEnhancementsEnabled,
    disapprovedAds,
  };
}
