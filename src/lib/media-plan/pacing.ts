// Shared "actual spend vs planned budget" pacing math, used by both the
// agency chat tool (get_channel_performance) and the agency Alerts panel.
// Extracted so both stay in sync — pacing must always compare actual spend to
// the PRORATED plan-to-date, never the full-period plan (a channel a week
// into a month otherwise always reads as wildly "underpacing").

export interface ChannelActuals {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  reach: number;
  cpm_sum: number;
  cpm_count: number;
  cpc_sum: number;
  cpc_count: number;
  days: number;
  actionTotals: Map<string, number>;
}

export interface ChannelPacingLineItem {
  name: string;
  id: string | null;
}

export interface ChannelPacingGroup {
  client_id: string;
  client: string;
  line_items: ChannelPacingLineItem[];
  platform: string;
  status: 'live' | 'upcoming' | 'ended' | 'no dates';
  planned_budget_full_period: number | null;
  planned_budget_to_date: number | null;
  actual_spend: number;
  spend_variance_pct: number | null;
  start_date: string | null;
  end_date: string | null;
  actual: ChannelActuals | null;
}

export function channelNameToPlatform(channelName: string): string | null {
  const lower = channelName.toLowerCase();
  if (lower.includes('meta') || lower.includes('facebook') || lower.includes('instagram')) return 'meta-ads';
  if (lower.includes('google')) return 'google-ads';
  if (lower.includes('linkedin')) return 'linkedin-ads';
  if (lower.includes('tiktok')) return 'tiktok-ads';
  return null;
}

// Every `channel_key` the dashboard's channel-performance-card could have
// persisted to client_channel_conversion_config for a given raw media-plan
// channel. Mirrors dashboard/page.tsx's `cardId` exactly: a bare
// `id ?? channelName` when the channel renders as a single card, plus one
// `${id}::${line.id}` per line when it fans out into per-campaign-line cards
// (channel.campaignLines.length > 1) — a compound key a bare id/name lookup
// can never match, which is why conversion-event lookups have to check all
// of these candidates rather than just the channel-level one.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getConversionConfigKeyCandidates(ch: any): string[] {
  const keys = new Set<string>();
  const bareId = ch.id ?? ch.channelName;
  if (bareId != null) keys.add(String(bareId));
  if (ch.channelName) keys.add(ch.channelName);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines: any[] = ch.campaignLines ?? [];
  if (lines.length > 1) {
    for (const line of lines) {
      if (line?.id) keys.add(`${ch.id ?? ch.channelName}::${line.id}`);
    }
  }
  return Array.from(keys);
}

export function getMonthsInRange(startDate: string, endDate: string): Array<{ padded: string; unpadded: string }> {
  const months: Array<{ padded: string; unpadded: string }> = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur.getFullYear() < end.getFullYear() ||
    (cur.getFullYear() === end.getFullYear() && cur.getMonth() <= end.getMonth())) {
    const y = cur.getFullYear();
    const m = cur.getMonth() + 1;
    months.push({ padded: `${y}-${String(m).padStart(2, '0')}`, unpadded: `${y}-${m}` });
    cur = new Date(y, m, 1);
  }
  return months;
}

// Inclusive day count between two 'YYYY-MM-DD' strings.
export function daysBetweenInclusive(startDateStr: string, endDateStr: string): number {
  const start = new Date(`${startDateStr}T00:00:00Z`);
  const end = new Date(`${endDateStr}T00:00:00Z`);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

export function lastDayOfMonth(padded: string): string {
  const [y, m] = padded.split('-').map(Number);
  return `${padded}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

// How much of a month's planned budget should have been spent by now, given
// the flight's own start/end dates and how far into the requested date range
// `today` actually is. Without this, a channel a week into a month reads as
// wildly "underpacing" against the FULL month's plan even when it's exactly
// on schedule — pacing has to compare like-for-like (spend to date vs plan
// to date), not partial actuals against a whole-period target.
export function proratePlannedForMonth(
  amount: number, padded: string, flightStart: string | null, flightEnd: string | null,
  rangeStart: string, rangeEnd: string, today: string,
): number {
  if (amount <= 0) return 0;
  const monthFirst = `${padded}-01`;
  const monthLast = lastDayOfMonth(padded);

  let coverageStart = flightStart && flightStart > monthFirst ? flightStart : monthFirst;
  let coverageEnd = flightEnd && flightEnd < monthLast ? flightEnd : monthLast;
  if (coverageEnd < coverageStart) { coverageStart = monthFirst; coverageEnd = monthLast; } // malformed dates — fall back to whole month

  const totalCoverageDays = daysBetweenInclusive(coverageStart, coverageEnd);
  if (totalCoverageDays <= 0) return 0;

  const elapsedCap = rangeEnd < today ? rangeEnd : today;
  const elapsedStart = coverageStart > rangeStart ? coverageStart : rangeStart;
  const elapsedEnd = coverageEnd < elapsedCap ? coverageEnd : elapsedCap;
  if (elapsedEnd < elapsedStart) return 0;

  const elapsedDays = daysBetweenInclusive(elapsedStart, elapsedEnd);
  return amount * (elapsedDays / totalCoverageDays);
}

// Aggregates raw ad_performance_metrics rows into per client+platform totals.
// Keyed by `${client_id}::${platform}` — actual spend is only ever tracked at
// the platform level, never per media-plan line item.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildActualByClientPlatform(metricsRows: any[] | null | undefined): Map<string, ChannelActuals> {
  const map = new Map<string, ChannelActuals>();
  for (const row of metricsRows || []) {
    if (!row.client_id) continue;
    const key = `${row.client_id}::${row.platform}`;
    const existing = map.get(key) || {
      spend: 0, impressions: 0, clicks: 0, conversions: 0,
      reach: 0, cpm_sum: 0, cpm_count: 0, cpc_sum: 0, cpc_count: 0, days: 0,
      actionTotals: new Map<string, number>(),
    };
    existing.spend += Number(row.spend || 0);
    existing.impressions += Number(row.impressions || 0);
    existing.clicks += Number(row.clicks || 0);
    existing.conversions += Number(row.conversions || 0);
    existing.reach += Number(row.reach || 0);
    if (row.cpm) { existing.cpm_sum += Number(row.cpm); existing.cpm_count++; }
    if (row.cpc) { existing.cpc_sum += Number(row.cpc); existing.cpc_count++; }
    existing.days++;
    const rawActions = row.meta_actions as Array<{ action_type: string; value: string }> | null;
    if (Array.isArray(rawActions)) {
      for (const a of rawActions) {
        if (!a?.action_type) continue;
        existing.actionTotals.set(a.action_type, (existing.actionTotals.get(a.action_type) ?? 0) + (parseFloat(a.value) || 0));
      }
    }
    map.set(key, existing);
  }
  return map;
}

// Groups a set of clients' media-plan channels by client+platform (actual
// spend is platform-level) and computes prorated pacing for each group.
// spend_variance_pct always compares actual_spend to planned_budget_to_date
// (never planned_budget_full_period) — see proratePlannedForMonth above.
export function computeChannelPacing(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mediaPlans: Array<{ client_id: string; channels: any }>,
  actualByClientPlatform: Map<string, ChannelActuals>,
  clientMap: Map<string, string>,
  range: { startDate: string; endDate: string; today: string },
  channelNameFilter?: string,
): ChannelPacingGroup[] {
  const { startDate, endDate, today } = range;
  const monthsInRange = getMonthsInRange(startDate, endDate);

  const platformGroups = new Map<string, {
    client_id: string;
    client: string;
    line_items: ChannelPacingLineItem[];
    platform: string;
    status: 'live' | 'upcoming' | 'ended' | 'no dates';
    planned_budget: number;
    planned_budget_to_date: number;
    actual: ChannelActuals | null;
    start_date: string | null;
    end_date: string | null;
  }>();

  for (const plan of mediaPlans || []) {
    const clientName = clientMap.get(plan.client_id) || 'Unknown';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawChannels: any[] = (plan.channels as any[]) || [];

    for (const ch of rawChannels) {
      if (!ch.channelName) continue;
      if (channelNameFilter && !ch.channelName.toLowerCase().includes(channelNameFilter.toLowerCase())) continue;

      const platform = channelNameToPlatform(ch.channelName);

      let plannedBudget = 0;
      let plannedBudgetToDate = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const flights: any[] = ch.flights || [];
      for (const f of flights) {
        const flightStart = f.startWeek ? String(f.startWeek).split('T')[0] : null;
        const flightEnd = f.endWeek ? String(f.endWeek).split('T')[0] : null;
        if (f.monthlySpend && typeof f.monthlySpend === 'object') {
          for (const { padded, unpadded } of monthsInRange) {
            const amt = Number(f.monthlySpend[padded] || f.monthlySpend[unpadded] || 0);
            plannedBudget += amt;
            plannedBudgetToDate += proratePlannedForMonth(amt, padded, flightStart, flightEnd, startDate, endDate, today);
          }
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const startDates = flights.map((f: any) => f.startWeek).filter(Boolean).map((s: string) => s.split('T')[0]).sort();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const endDates = flights.map((f: any) => f.endWeek).filter(Boolean).map((s: string) => s.split('T')[0]).sort();
      const earliestStart = startDates[0] || null;
      const latestEnd = endDates[endDates.length - 1] || null;
      let channelStatus: 'live' | 'upcoming' | 'ended' | 'no dates' = 'no dates';
      if (earliestStart) {
        if (latestEnd && latestEnd < today) channelStatus = 'ended';
        else if (earliestStart <= today) channelStatus = 'live';
        else channelStatus = 'upcoming';
      }

      const actualKey = platform ? `${plan.client_id}::${platform}` : null;
      const actual = (actualKey ? actualByClientPlatform.get(actualKey) : null) ?? null;

      const lineItem: ChannelPacingLineItem = { name: ch.channelName, id: ch.id ?? null };

      // Aggregate channels that share a platform (actual spend is always platform-level)
      const groupKey = `${clientName}::${platform ?? ch.channelName}`;
      if (!platformGroups.has(groupKey)) {
        platformGroups.set(groupKey, {
          client_id: plan.client_id,
          client: clientName,
          line_items: [lineItem],
          platform: platform ?? 'unknown',
          status: channelStatus,
          planned_budget: plannedBudget,
          planned_budget_to_date: plannedBudgetToDate,
          actual,
          start_date: earliestStart,
          end_date: latestEnd,
        });
      } else {
        const group = platformGroups.get(groupKey)!;
        group.line_items.push(lineItem);
        group.planned_budget += plannedBudget;
        group.planned_budget_to_date += plannedBudgetToDate;
        if (channelStatus === 'live') group.status = 'live';
        if (earliestStart && (!group.start_date || earliestStart < group.start_date)) group.start_date = earliestStart;
        if (latestEnd && (!group.end_date || latestEnd > group.end_date)) group.end_date = latestEnd;
      }
    }
  }

  return Array.from(platformGroups.values()).map(group => {
    const actualSpend = group.actual?.spend ?? 0;
    const plannedToDate = group.planned_budget_to_date;
    const variancePct = plannedToDate > 0 ? ((actualSpend - plannedToDate) / plannedToDate) * 100 : null;

    return {
      client_id: group.client_id,
      client: group.client,
      line_items: group.line_items,
      platform: group.platform,
      status: group.status,
      planned_budget_full_period: group.planned_budget > 0 ? Number(group.planned_budget.toFixed(2)) : null,
      planned_budget_to_date: plannedToDate > 0 ? Number(plannedToDate.toFixed(2)) : null,
      actual_spend: Number(actualSpend.toFixed(2)),
      spend_variance_pct: variancePct !== null ? Number(variancePct.toFixed(1)) : null,
      start_date: group.start_date,
      end_date: group.end_date,
      actual: group.actual,
    };
  });
}
