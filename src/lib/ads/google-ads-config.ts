/**
 * Live Google Ads CAMPAIGN CONFIG reads for Setup Auditor — geo targeting,
 * budget, bidding strategy, network expansion, final URLs, policy status.
 * Distinct from google-ads-live.ts, which only ever reads spend/performance
 * metrics; nothing in this codebase read setup/config fields before this.
 *
 * Same raw-GAQL-over-REST approach as the rest of the Google Ads
 * integration (no client library). Read-only by construction — only ever
 * issues `googleAds:search`, never `:mutate`, since Google Ads has one
 * all-or-nothing OAuth scope with no read-only variant.
 *
 * NOTE: geo targeting is compared by Geo Target Constant ID (e.g. "1013331"
 * for Wellington), not by name — Google's API returns a resource name
 * ("geoTargetConstants/1013331"), and there is no local name-resolution
 * table in this codebase yet. Agencies must enter the numeric ID(s) in
 * platform_campaigns.expected_geo until a name-lookup picker exists.
 */

export interface GoogleCampaignConfig {
  campaignId: string;
  campaignName: string;
  servingStatus: string | null;
  biddingStrategyType: string | null;
  budgetAmountMicros: number | null;
  budgetDeliveryMethod: string | null;
  geoTargetIds: string[]; // numeric Geo Target Constant IDs, excludes negative (excluded) targets
  geoTargetTypeSetting: string | null; // PRESENCE | PRESENCE_OR_INTEREST | SEARCH_INTEREST
  networkSearchPartners: boolean | null;
  networkContentNetwork: boolean | null;
  networkPartnerSearchNetwork: boolean | null;
  urlExpansionOptOut: boolean | null;
  finalUrls: string[]; // deduped final_urls across all non-removed ads in the campaign
  disapprovedAds: number; // count of ad_group_ad rows with policy approval_status DISAPPROVED
}

interface FetchArgs {
  cleanCustomerId: string;
  loginCustomerId: string | null;
  accessToken: string;
  campaignId: string;
}

function headersFor(accessToken: string, loginCustomerId: string | null): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
    'Content-Type': 'application/json',
    ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}),
  };
}

async function gaqlSearch(customerId: string, headers: Record<string, string>, query: string): Promise<any[]> {
  const response = await fetch(
    `https://googleads.googleapis.com/v25/customers/${customerId}/googleAds:search`,
    { method: 'POST', headers, body: JSON.stringify({ query }) }
  );
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Google Ads API error ${response.status}: ${errText.substring(0, 300)}`);
  }
  const data = await response.json();
  return data.results ?? [];
}

/** Fetches everything Setup Auditor needs for one campaign in a small number of GAQL calls. */
export async function fetchGoogleCampaignConfig(args: FetchArgs): Promise<GoogleCampaignConfig> {
  const { cleanCustomerId, loginCustomerId, accessToken, campaignId } = args;
  const headers = headersFor(accessToken, loginCustomerId);

  const campaignQuery = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.serving_status,
      campaign.bidding_strategy_type,
      campaign_budget.amount_micros,
      campaign_budget.delivery_method,
      campaign.geo_target_type_setting.positive_geo_target_type,
      campaign.network_settings.target_search_network,
      campaign.network_settings.target_content_network,
      campaign.network_settings.target_partner_search_network,
      campaign.url_expansion_opt_out
    FROM campaign
    WHERE campaign.id = ${campaignId}
  `;

  const criterionQuery = `
    SELECT campaign_criterion.location.geo_target_constant, campaign_criterion.negative
    FROM campaign_criterion
    WHERE campaign.id = ${campaignId} AND campaign_criterion.type = 'LOCATION'
  `;

  const adQuery = `
    SELECT ad_group_ad.ad.final_urls, ad_group_ad.policy_summary.approval_status
    FROM ad_group_ad
    WHERE campaign.id = ${campaignId} AND ad_group_ad.status != 'REMOVED'
  `;

  const [campaignRows, criterionRows, adRows] = await Promise.all([
    gaqlSearch(cleanCustomerId, headers, campaignQuery),
    gaqlSearch(cleanCustomerId, headers, criterionQuery),
    gaqlSearch(cleanCustomerId, headers, adQuery),
  ]);

  const c = campaignRows[0]?.campaign ?? {};
  const budget = campaignRows[0]?.campaignBudget ?? {};

  const geoTargetIds: string[] = [];
  for (const row of criterionRows) {
    if (row.campaignCriterion?.negative) continue; // excluded location, not a target
    const resourceName: string | undefined = row.campaignCriterion?.location?.geoTargetConstant;
    const id = resourceName?.split('/')?.[1];
    if (id) geoTargetIds.push(id);
  }

  const finalUrlSet = new Set<string>();
  let disapprovedAds = 0;
  for (const row of adRows) {
    for (const url of (row.adGroupAd?.ad?.finalUrls ?? [])) {
      finalUrlSet.add(url);
    }
    if (row.adGroupAd?.policySummary?.approvalStatus === 'DISAPPROVED') disapprovedAds++;
  }

  return {
    campaignId,
    campaignName: c.name ?? '',
    servingStatus: c.servingStatus ?? null,
    biddingStrategyType: c.biddingStrategyType ?? null,
    budgetAmountMicros: budget.amountMicros != null ? Number(budget.amountMicros) : null,
    budgetDeliveryMethod: budget.deliveryMethod ?? null,
    geoTargetIds,
    geoTargetTypeSetting: c.geoTargetTypeSetting?.positiveGeoTargetType ?? null,
    networkSearchPartners: c.networkSettings?.targetSearchNetwork ?? null,
    networkContentNetwork: c.networkSettings?.targetContentNetwork ?? null,
    networkPartnerSearchNetwork: c.networkSettings?.targetPartnerSearchNetwork ?? null,
    urlExpansionOptOut: c.urlExpansionOptOut ?? null,
    finalUrls: Array.from(finalUrlSet),
    disapprovedAds,
  };
}
