// Auto-seeds a "Demo Client" for brand-new, empty accounts so a new signup
// can see the product working before onboarding their own client. See
// plan-mode-when-a-new-user-inherited-blanket.md for the full design.
//
// Runs lazily from GET /api/agency/clients — idempotent via
// agency_settings.demo_data_seeded_at, and only fires for accounts that have
// zero clients at the time of the check (never retroactively seeded into an
// existing real account).
import { nzToday, nzDateKeyOffset } from '@/lib/timezone';

// Enough daily history to fill the Client Hub CPA widget's 30-point rolling
// series, which needs raw data as far back as (windowDays - 1 + 6) = 35 days
// before today (see src/lib/client-hub/perf-series.ts) — 45 gives margin.
const HISTORY_DAYS = 45;
const FUTURE_DAYS = 75; // keeps the demo campaign "live" well past signup day

// Implied daily budget ($/day) each channel is "supposed to" spend — every
// month's `monthlySpend` figure is derived FROM this rate (see
// coveredDaysInMonth below) so that planned-vs-actual stays proportionally
// consistent across the whole flight, whichever consumer's date window
// (calendar month-to-date for the Alerts panel, full flight-to-date for the
// client card/dashboard) ends up comparing against it.
const GOOGLE_DAILY_PLAN = 200;
const GOOGLE_ACTUAL_RATIO = 0.6; // deliberately underpacing (>15% under every threshold in the app)
const META_DAILY_PLAN = 300;
const META_ACTUAL_RATIO = 0.97; // on track
const EDM_DAILY_PLAN = 50;

const CPA_GOAL = 50;

const GOOGLE_CHANNEL_NAME = 'Demo · Google Search';
const META_CHANNEL_NAME = 'Demo · Meta Ads';
const EDM_CHANNEL_NAME = 'Demo · EDM / Email';

function jitter(base: number, pct: number): number {
  return base * (1 + (Math.random() * 2 - 1) * pct);
}

function daysBetweenInclusive(startDateStr: string, endDateStr: string): number {
  const start = new Date(`${startDateStr}T00:00:00Z`);
  const end = new Date(`${endDateStr}T00:00:00Z`);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function lastDayOfMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${key}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
}

function eachMonthKeyBetween(startDate: string, endDate: string): string[] {
  const [sy, sm] = startDate.split('-').map(Number);
  const [ey, em] = endDate.split('-').map(Number);
  const keys: string[] = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return keys;
}

// Mirrors pacing.ts's proratePlannedForMonth coverage-window math exactly, so
// a monthlySpend value built from `dailyPlan * coveredDaysInMonth(...)`
// always prorates back out to `dailyPlan` per elapsed day — regardless of
// whether the flight starts/ends mid-month.
function coveredDaysInMonth(key: string, flightStart: string, flightEnd: string): number {
  const monthFirst = `${key}-01`;
  const monthLast = lastDayOfMonthKey(key);
  const coverageStart = flightStart > monthFirst ? flightStart : monthFirst;
  const coverageEnd = flightEnd < monthLast ? flightEnd : monthLast;
  if (coverageEnd < coverageStart) return 0;
  return daysBetweenInclusive(coverageStart, coverageEnd);
}

function buildMonthlySpend(dailyPlan: number, flightStart: string, flightEnd: string): Record<string, number> {
  const spend: Record<string, number> = {};
  for (const key of eachMonthKeyBetween(flightStart, flightEnd)) {
    const covered = coveredDaysInMonth(key, flightStart, flightEnd);
    if (covered > 0) spend[key] = Math.round(dailyPlan * covered);
  }
  return spend;
}

function eachDateBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let cur = startDate;
  while (cur <= endDate) {
    dates.push(cur);
    cur = nzDateKeyOffset(1, new Date(`${cur}T12:00:00Z`));
  }
  return dates;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureDemoDataSeeded(supabase: any, userId: string): Promise<void> {
  const { data: settings } = await supabase
    .from('agency_settings')
    .select('demo_data_seeded_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (settings?.demo_data_seeded_at) return; // already handled (seeded, or grandfathered)

  const { count } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  // Mark as handled up-front — an existing account (real clients already
  // present) is grandfathered out with no demo data; a genuinely fresh
  // account gets the seed. Marking first (rather than after the seed
  // completes) means a mid-seed failure never causes an endless retry loop
  // on every future dashboard load.
  await supabase
    .from('agency_settings')
    .upsert({ user_id: userId, demo_data_seeded_at: new Date().toISOString() }, { onConflict: 'user_id' });

  if (count && count > 0) return;

  await seedDemoClient(supabase, userId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedDemoClient(supabase: any, userId: string): Promise<void> {
  const today = nzToday();
  const flightStart = nzDateKeyOffset(-(HISTORY_DAYS - 1));
  const flightEnd = nzDateKeyOffset(FUTURE_DAYS);

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .insert({ name: 'Demo Client', user_id: userId, is_demo: true, logo_url: null })
    .select('id')
    .single();
  if (clientError || !client) throw clientError ?? new Error('Failed to create demo client');
  const clientId = client.id as string;

  // ── Media plan: Meta Ads, Google Ads (Search), EDM / Email ────────────────
  const flightColor = '#4A6580';
  const channels = [
    {
      id: 'demo-channel-meta',
      channelName: META_CHANNEL_NAME,
      format: 'Prospecting + Retargeting',
      percentOfInvestment: 55,
      totalBudget: 0,
      channelCategory: 'paid_digital',
      campaignStatus: 'live',
      flights: [{
        id: 'demo-flight-meta',
        startWeek: new Date(`${flightStart}T00:00:00Z`),
        endWeek: new Date(`${flightEnd}T00:00:00Z`),
        monthlySpend: buildMonthlySpend(META_DAILY_PLAN, flightStart, flightEnd),
        color: flightColor,
      }],
    },
    {
      id: 'demo-channel-google',
      channelName: GOOGLE_CHANNEL_NAME,
      format: 'Search',
      percentOfInvestment: 35,
      totalBudget: 0,
      channelCategory: 'paid_digital',
      campaignStatus: 'live',
      flights: [{
        id: 'demo-flight-google',
        startWeek: new Date(`${flightStart}T00:00:00Z`),
        endWeek: new Date(`${flightEnd}T00:00:00Z`),
        monthlySpend: buildMonthlySpend(GOOGLE_DAILY_PLAN, flightStart, flightEnd),
        color: '#A0442A',
      }],
    },
    {
      id: 'demo-channel-edm',
      channelName: EDM_CHANNEL_NAME,
      format: 'Newsletter',
      percentOfInvestment: 10,
      totalBudget: 0,
      channelCategory: 'edm',
      sendFrequency: 'fortnightly',
      campaignStatus: 'live',
      flights: [{
        id: 'demo-flight-edm',
        startWeek: new Date(`${flightStart}T00:00:00Z`),
        endWeek: new Date(`${flightEnd}T00:00:00Z`),
        monthlySpend: buildMonthlySpend(EDM_DAILY_PLAN, flightStart, flightEnd),
        color: '#4A7C59',
      }],
    },
  ];

  const { error: planError } = await supabase
    .from('client_media_plan_builder')
    .insert({ client_id: clientId, channels });
  if (planError) throw planError;

  // ── Daily spend & metrics: Meta + Google, elapsed days only ───────────────
  const elapsedDates = eachDateBetween(flightStart, today);
  const metricsRows = elapsedDates.map((date, i) => {
    const metaSpend = Math.round(jitter(META_DAILY_PLAN * META_ACTUAL_RATIO, 0.08) * 100) / 100;
    const googleSpend = Math.round(jitter(GOOGLE_DAILY_PLAN * GOOGLE_ACTUAL_RATIO, 0.1) * 100) / 100;

    // 14-day sine cycle in total daily conversions, so the CPA line (spend /
    // conversions, smoothed as a 7-day rolling sum by the hub's CPA widget)
    // visibly crosses back and forth over CPA_GOAL rather than sitting flat.
    const totalConversions = Math.max(2, Math.round(8 + 4 * Math.sin((2 * Math.PI * i) / 14)));
    const metaShare = metaSpend / (metaSpend + googleSpend);
    const metaConversions = Math.max(1, Math.round(totalConversions * metaShare));
    const googleConversions = Math.max(1, totalConversions - metaConversions);

    const metaImpressions = Math.round((metaSpend / 22) * 1000); // ~$22 CPM
    const metaClicks = Math.max(1, Math.round(metaImpressions * 0.015)); // ~1.5% CTR
    const metaReach = Math.round(metaImpressions / 1.3);

    const googleAvgCpc = 1.5;
    const googleClicks = Math.max(1, Math.round(googleSpend / googleAvgCpc));
    const googleImpressions = Math.round(googleClicks / 0.05); // ~5% search CTR

    return [
      {
        user_id: userId,
        client_id: clientId,
        platform: 'meta-ads' as const,
        account_id: 'demo-meta-account',
        account_name: '[DEMO] Meta Ads Account',
        campaign_id: 'demo-meta-campaign-prospecting',
        campaign_name: '[DEMO] Meta Ads - Prospecting',
        date,
        spend: metaSpend,
        currency: 'NZD',
        impressions: metaImpressions,
        clicks: metaClicks,
        ctr: metaImpressions > 0 ? Number(((metaClicks / metaImpressions) * 100).toFixed(2)) : 0,
        reach: metaReach,
        cpc: metaClicks > 0 ? Number((metaSpend / metaClicks).toFixed(2)) : 0,
        cpm: metaImpressions > 0 ? Number(((metaSpend / metaImpressions) * 1000).toFixed(2)) : 0,
        frequency: metaReach > 0 ? Number((metaImpressions / metaReach).toFixed(2)) : 0,
        meta_actions: [{ action_type: 'purchase', value: String(metaConversions) }],
      },
      {
        user_id: userId,
        client_id: clientId,
        platform: 'google-ads' as const,
        account_id: 'demo-google-account',
        account_name: '[DEMO] Google Ads Account',
        campaign_id: 'demo-google-campaign-search',
        campaign_name: '[DEMO] Google Search - Brand',
        date,
        spend: googleSpend,
        currency: 'NZD',
        impressions: googleImpressions,
        clicks: googleClicks,
        ctr: googleImpressions > 0 ? Number(((googleClicks / googleImpressions) * 100).toFixed(2)) : 0,
        average_cpc: googleClicks > 0 ? Number((googleSpend / googleClicks).toFixed(2)) : 0,
        conversions: googleConversions,
      },
    ];
  }).flat();

  const { error: metricsError } = await supabase.from('ad_performance_metrics').insert(metricsRows);
  if (metricsError) throw metricsError;

  // ── CPA goal (drives the Client Hub CPA trend chart's dashed target line) ─
  const { error: goalError } = await supabase.from('client_campaign_goals').insert({
    client_id: clientId,
    channel: 'All Channels',
    metric: 'CPA',
    target_value: CPA_GOAL,
    set_by: userId,
  });
  if (goalError) throw goalError;

  // ── EDM sends (EDM has no spend tracking — it's send-based) ───────────────
  const edmSendDates = [nzDateKeyOffset(-30), nzDateKeyOffset(-16), nzDateKeyOffset(-2)];
  const { error: edmError } = await supabase.from('edm_actuals').insert(
    edmSendDates.map((send_date, i) => ({
      client_id: clientId,
      channel_name: EDM_CHANNEL_NAME,
      send_date,
      subject: `[DEMO] Newsletter #${i + 1}`,
    }))
  );
  if (edmError) throw edmError;

  // ── Geo-targeting finding: intended New York, actually serving Russia ────
  const { data: campaignRow, error: campaignError } = await supabase
    .from('platform_campaigns')
    .insert({
      client_id: clientId,
      user_id: userId,
      platform: 'google-ads',
      external_account_id: 'demo-google-account',
      external_campaign_id: 'demo-google-campaign-search',
      campaign_name: '[DEMO] Google Search - Brand',
      channel_name: GOOGLE_CHANNEL_NAME,
      expected_geo: ['New York, NY, United States'],
      expected_geo_mode: 'presence',
      is_active: true,
    })
    .select('id')
    .single();
  if (campaignError || !campaignRow) throw campaignError ?? new Error('Failed to create demo platform campaign');

  const { error: findingError } = await supabase.from('campaign_audit_findings').insert({
    platform_campaign_id: campaignRow.id,
    client_id: clientId,
    rule_key: 'geo_targeting',
    severity: 'critical',
    status: 'open',
    expected_value: { geo: ['New York, NY, United States'] },
    actual_value: { geo: ['Russia'] },
    detail: '[DEMO] Expected geo targeting "New York, NY, United States", found "Russia" — this campaign is serving in the wrong country entirely.',
  });
  if (findingError) throw findingError;

  // ── Staggered to-dos: due today, +1, +3, +8 days ──────────────────────────
  const todos = [
    { text: '[DEMO] Confirm Q3 budget approval with Demo Client', offset: 0 },
    { text: '[DEMO] Review Google Search underpacing with Demo Client', offset: 1 },
    { text: '[DEMO] Send performance recap to Demo Client', offset: 3 },
    { text: '[DEMO] Renew EDM creative approval for Demo Client', offset: 8 },
  ];
  const { error: todosError } = await supabase.from('action_points').insert(
    todos.map(t => ({
      channel_type: 'General',
      text: t.text,
      category: 'TODO' as const,
      completed: false,
      due_date: nzDateKeyOffset(t.offset),
      client_id: clientId,
    }))
  );
  if (todosError) throw todosError;
}
