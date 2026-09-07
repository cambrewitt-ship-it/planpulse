import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// platform_campaigns isn't in the generated database.ts types yet — cast to
// `any` for these queries, same workaround used elsewhere in the codebase
// for tables added ahead of a `supabase gen types` regen (e.g. meta_ads_accounts
// in src/app/api/ads/meta/campaigns/route.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

// GET /api/setup-auditor/campaigns?clientId=... — list registered campaigns for a client
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as AnySupabase;

  const clientId = request.nextUrl.searchParams.get('clientId');
  if (!clientId) return NextResponse.json({ error: 'clientId is required' }, { status: 400 });

  const { data, error } = await db
    .from('platform_campaigns')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data ?? [] });
}

// POST /api/setup-auditor/campaigns — register a live campaign for auditing,
// with its intended spec. This is the "manual link at setup" flow — the
// user picks a live campaign from the existing account/campaign picker
// endpoints (/api/ads/google-ads/campaigns, /api/ads/meta/campaigns) and
// confirms what it's supposed to look like.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = supabase as AnySupabase;

  const body = await request.json();
  const {
    clientId, platform, externalAccountId, externalCampaignId, campaignName, channelName,
    expectedGeo, expectedGeoMode, expectedBudgetAmount, expectedBudgetCurrency,
    expectedOptimizationGoal, expectedDestinationUrl, notes,
  } = body ?? {};

  if (!clientId || !platform || !externalAccountId || !externalCampaignId) {
    return NextResponse.json({ error: 'clientId, platform, externalAccountId, and externalCampaignId are required' }, { status: 400 });
  }
  if (platform !== 'google-ads' && platform !== 'meta-ads') {
    return NextResponse.json({ error: 'platform must be google-ads or meta-ads' }, { status: 400 });
  }

  const { data, error } = await db
    .from('platform_campaigns')
    .insert({
      client_id: clientId,
      user_id: user.id,
      platform,
      external_account_id: externalAccountId,
      external_campaign_id: externalCampaignId,
      campaign_name: campaignName ?? null,
      channel_name: channelName ?? null,
      expected_geo: expectedGeo ?? null,
      expected_geo_mode: expectedGeoMode ?? null,
      expected_budget_amount: expectedBudgetAmount ?? null,
      expected_budget_currency: expectedBudgetCurrency ?? 'NZD',
      expected_optimization_goal: expectedOptimizationGoal ?? null,
      expected_destination_url: expectedDestinationUrl ?? null,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') { // unique_violation
      return NextResponse.json({ error: 'This campaign is already registered with Setup Auditor.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ campaign: data }, { status: 201 });
}
