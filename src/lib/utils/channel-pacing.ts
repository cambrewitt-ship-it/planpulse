/**
 * channel-pacing.ts
 *
 * Pure utility functions extracted from MediaChannels.tsx so they can be
 * consumed by dashboard-v2 without importing the full React component.
 *
 * Unit conventions (mirrors MediaChannels):
 *   - weekly_plan.budget_planned  → cents  (integer)
 *   - monthBudget arg             → cents  (integer)
 *   - returned actualSpend / plannedSpend → dollars (float)
 */

import {
  format,
  eachDayOfInterval,
  parseISO,
  isWithinInterval,
  startOfWeek,
  addWeeks,
  differenceInWeeks,
} from 'date-fns';
import type { MediaPlanChannel } from '@/components/legacy-plan-builder/media-plan-grid';

// ---------------------------------------------------------------------------
// Week-commencing <-> month bucketing
// ---------------------------------------------------------------------------

/**
 * Returns the 'yyyy-MM' bucket a Mon-Sun week belongs to, keyed by whichever
 * month holds the majority (>=4) of its 7 days — equivalently, the month
 * containing the week's Thursday. Mirrors the media plan grid's own column
 * assignment (src/components/sandbox/plan-grid.tsx generateWeeksForYear,
 * src/lib/media-plan/sandbox-sync.ts buildWeeksForRange) so a week's budget
 * always lands in the same month column the grid displays it under.
 */
export function getWeekMonthKey(weekStartMonday: Date): string {
  const thursday = new Date(weekStartMonday);
  thursday.setDate(thursday.getDate() + 3);
  return format(thursday, 'yyyy-MM');
}

/**
 * Returns the week-commencing-aligned start/end for a calendar month,
 * matching the grid's column boundaries (e.g. Aug 2026 -> 3 Aug .. 30 Aug):
 * start is the Monday of the first week whose majority of days fall in this
 * month; end is the day before the Monday of the first week whose majority
 * of days fall in the next month.
 */
export function getWeekAlignedMonthRange(monthDate: Date): { start: Date; end: Date } {
  const firstWeekMonday = (year: number, monthIdx0: number): Date => {
    const firstOfMonth = new Date(year, monthIdx0, 1);
    const dow = firstOfMonth.getDay();
    const monday = new Date(firstOfMonth);
    monday.setDate(firstOfMonth.getDate() + (dow === 0 ? -6 : 1 - dow));
    const thursday = new Date(monday);
    thursday.setDate(monday.getDate() + 3);
    if (thursday.getMonth() !== monthIdx0) monday.setDate(monday.getDate() + 7);
    monday.setHours(0, 0, 0, 0);
    return monday;
  };
  const y = monthDate.getFullYear();
  const m = monthDate.getMonth();
  const start = firstWeekMonday(y, m);
  const end = firstWeekMonday(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1);
  end.setDate(end.getDate() - 1);
  return { start, end };
}

// ---------------------------------------------------------------------------
// Channel-name helpers
// ---------------------------------------------------------------------------

export function isMetaAdsChannel(channelName: string): boolean {
  const lower = channelName.toLowerCase();
  return lower.includes('facebook') || lower.includes('meta') || lower.includes('instagram') ||
    lower.includes('paid social') || lower.includes('reels');
}

export function isGoogleAdsChannel(channelName: string): boolean {
  const lower = channelName.toLowerCase();
  if (lower.includes('organic')) return false;
  return lower.includes('google') ||
    lower.includes('search') ||
    lower.includes('sem') ||
    lower.includes('ppc') ||
    lower.includes('performance max') ||
    lower.includes('pmax') ||
    lower.includes('youtube') ||
    lower.includes('shopping');
}

export function getPlatformForChannel(channelName: string): string {
  const lower = channelName.toLowerCase();
  if (lower.includes('organic')) return 'organic-social';
  if (lower.includes('edm') || lower.includes('email')) return 'edm';
  if (lower.includes('ooh') || lower.includes('out of home') || lower.includes('billboard') ||
      lower.includes('outdoor') || lower.includes('transit') || lower.includes('street furniture')) return 'ooh';
  // Meta: explicit platform names and common paid social aliases
  if (lower.includes('meta') || lower.includes('facebook') || lower.includes('instagram') ||
      lower.includes('paid social') || lower.includes('reels')) return 'meta-ads';
  // Google: explicit name plus all common search/SEM/video aliases
  if (lower.includes('google') || lower.includes('search') || lower.includes('sem') ||
      lower.includes('ppc') || lower.includes('performance max') || lower.includes('pmax') ||
      lower.includes('youtube') || lower.includes('shopping')) return 'google-ads';
  if (lower.includes('linkedin')) return 'linkedin-ads';
  if (lower.includes('tiktok') || lower.includes('tik tok')) return 'tiktok-ads';
  if (lower.includes('snapchat') || lower.includes('snap')) return 'snapchat-ads';
  if (lower.includes('pinterest')) return 'pinterest-ads';
  if (lower.includes('twitter') || lower.includes('x ads')) return 'twitter-ads';
  return lower.replace(/\s+/g, '-');
}

export function getChannelDisplayNameFromPlatform(platform?: string): string {
  if (!platform) return 'Unknown Channel';
  const lower = platform.toLowerCase();
  if (lower.includes('meta') || lower.includes('facebook')) return 'Meta Ads';
  if (lower.includes('google')) return 'Google Search';
  if (lower.includes('linkedin')) return 'LinkedIn Ads';
  if (lower.includes('tiktok')) return 'TikTok Ads';
  return platform;
}

// Determine channel category from channelName
export function getChannelCategory(channelName: string): 'paid_digital' | 'organic_social' | 'edm' | 'ooh' | 'display_native' | 'other' | 'fee' {
  if (!channelName) return 'paid_digital';
  const lower = channelName.toLowerCase();
  if (lower.includes('fee') || lower.includes('set up fee') || lower.includes('setup fee') ||
      lower.includes('management fee') || lower.includes('retainer')) return 'fee';
  if (lower.includes('organic')) return 'organic_social';
  if (lower.includes('edm') || lower.includes('email marketing') || lower.includes('e-dm')) return 'edm';
  if (lower.includes('ooh') || lower.includes('out of home') || lower.includes('billboard') ||
      lower.includes('outdoor') || lower.includes('transit') || lower.includes('street furniture')) return 'ooh';
  if (lower.includes('display') || lower.includes('native') || lower.includes('programmatic')) return 'display_native';
  return 'paid_digital';
}

// ---------------------------------------------------------------------------
// Chart data point type
// ---------------------------------------------------------------------------

export interface ChannelChartPoint {
  date: string;
  /** Cumulative actual spend in dollars; null for future dates with no live data */
  actualSpend: number | null;
  /** Cumulative planned spend in dollars */
  plannedSpend: number;
  projectedSpend: null;
  projected: boolean;
}

// ---------------------------------------------------------------------------
// Weekly-plan builder  (extracted from transformMediaPlanBuilderChannels)
// ---------------------------------------------------------------------------

interface WeeklyPlan {
  id: string;
  week_commencing: string; // 'yyyy-MM-dd'
  week_number: number;
  budget_planned: number;  // cents
}

/**
 * Convert a MediaPlanChannel's flights into weekly plan rows, applying the
 * commission discount to each weekly budget (mirrors MediaChannels logic).
 */
export function buildWeeklyPlansFromFlights(
  channel: MediaPlanChannel,
  commission: number, // 0-100
): WeeklyPlan[] {
  const applyCommission = (amount: number) => {
    if (!amount || isNaN(amount) || amount <= 0) return 0;
    if (commission <= 0) return amount;
    return amount * ((100 - commission) / 100);
  };

  const weeklyPlans: WeeklyPlan[] = [];

  channel.flights.forEach((flight, flightIdx) => {
    const startDate = new Date(flight.startWeek);
    const endDate = new Date(flight.endWeek);

    const startMonday = startOfWeek(startDate, { weekStartsOn: 1 });
    const endMonday   = startOfWeek(endDate,   { weekStartsOn: 1 });
    const numWeeks    = differenceInWeeks(endMonday, startMonday) + 1;

    // Group weeks by month to distribute monthly budget evenly across weeks
    const weeksByMonth: Record<string, Date[]> = {};
    for (let i = 0; i < numWeeks; i++) {
      const weekStart = addWeeks(startMonday, i);
      const monthKey  = getWeekMonthKey(weekStart);
      (weeksByMonth[monthKey] ??= []).push(weekStart);
    }

    let weekNumber = 1;
    for (let i = 0; i < numWeeks; i++) {
      const weekStart   = addWeeks(startMonday, i);
      const monthKey    = getWeekMonthKey(weekStart);
      const unpaddedKey = monthKey.replace(/-0+(\d)$/, '-$1');

      const monthlySpend  = flight.monthlySpend[monthKey] ?? flight.monthlySpend[unpaddedKey] ?? 0;
      const weeksInMonth  = weeksByMonth[monthKey]?.length ?? 1;
      const weeklyBudget  = applyCommission(weeksInMonth > 0 ? monthlySpend / weeksInMonth : 0);

      weeklyPlans.push({
        id:             `week-${channel.id}-${flightIdx}-${i}`,
        week_commencing: format(weekStart, 'yyyy-MM-dd'),
        week_number:    weekNumber++,
        budget_planned: Math.round(weeklyBudget * 100), // → cents
      });
    }
  });

  return weeklyPlans;
}

// ---------------------------------------------------------------------------
// Monthly budget helper
// ---------------------------------------------------------------------------

/**
 * Returns total planned budget (cents) for the given month across all weekly
 * plans that fall within that month.
 */
export function getChannelMonthlyBudgetCents(
  weeklyPlans: WeeklyPlan[],
  selectedMonth: Date,
): number {
  const { start: monthStart, end: monthEnd } = getWeekAlignedMonthRange(selectedMonth);

  return weeklyPlans
    .filter(wp => {
      const weekStart = parseISO(wp.week_commencing);
      return isWithinInterval(weekStart, { start: monthStart, end: monthEnd });
    })
    .reduce((sum, wp) => sum + (wp.budget_planned ?? 0), 0);
}

/**
 * Per-day planned-spend rate (dollars) for the linear (Google/Meta) ramp,
 * derived from each week's own weekly_plan budget rather than averaging the
 * whole month into a single flat rate. The ramp stays linear *within* a week
 * (so the line doesn't staircase) but its slope changes at week boundaries to
 * match that week's specific budget — e.g. a lighter first week followed by a
 * heavier one reads as two distinct gradients instead of one blended average.
 *
 * Days outside the flight's active window in this month are left unset.
 */
function getLinearDailyRatesForMonth(
  weeklyPlans: WeeklyPlan[],
  monthStart: Date,
  monthEnd: Date,
): { dailyRateByDate: Map<string, number>; flightStart: Date; flightEnd: Date; lastDailyRate: number } {
  const monthWeeklyPlans = weeklyPlans
    .filter(wp => isWithinInterval(parseISO(wp.week_commencing), { start: monthStart, end: monthEnd }))
    .sort((a, b) => a.week_commencing.localeCompare(b.week_commencing));

  const dailyRateByDate = new Map<string, number>();

  if (monthWeeklyPlans.length === 0) {
    return { dailyRateByDate, flightStart: monthStart, flightEnd: monthStart, lastDailyRate: 0 };
  }

  const flightStart   = parseISO(monthWeeklyPlans[0].week_commencing);
  const lastWeekStart = parseISO(monthWeeklyPlans[monthWeeklyPlans.length - 1].week_commencing);
  const lastWeekEnd   = new Date(lastWeekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() + 6);
  const flightEnd      = lastWeekEnd < monthEnd ? lastWeekEnd : monthEnd;

  let lastDailyRate = 0;

  monthWeeklyPlans.forEach(wp => {
    const weekStart = parseISO(wp.week_commencing);
    const weekEnd   = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const rangeStart = weekStart > flightStart ? weekStart : flightStart;
    const rangeEnd    = weekEnd < flightEnd ? weekEnd : flightEnd;
    const activeDaysInWeek = Math.max(1, Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1);

    const dailyRate = ((wp.budget_planned ?? 0) / 100) / activeDaysInWeek;
    lastDailyRate = dailyRate;

    for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
      dailyRateByDate.set(format(d, 'yyyy-MM-dd'), dailyRate);
    }
  });

  return { dailyRateByDate, flightStart, flightEnd, lastDailyRate };
}

// ---------------------------------------------------------------------------
// Core chart data generator  (extracted verbatim from MediaChannels)
// ---------------------------------------------------------------------------

/**
 * Generates day-by-day cumulative spend vs planned data for the given month.
 *
 * @param weeklyPlans   Weekly plan rows for the channel (budget_planned in cents)
 * @param monthBudget   Total budget for the month (cents)
 * @param channelId     Channel identifier (used only as a label)
 * @param liveData      Raw spend data rows; each row should have { date, spend } or { dateStart, spend }
 * @param accountId     Optional: filter live data to this account
 * @param hasConnectedAccount  Whether an account is linked (enables account-level filtering)
 * @param selectedMonth Month to generate data for (defaults to current month)
 * @param selectedCampaignId   Optional: 'all' or a specific campaign ID
 * @param channelName   Channel name; used to switch between linear (Google/Meta) vs weekly-plan pacing
 */
export function generateMonthDataFromWeeklyPlans(
  weeklyPlans: WeeklyPlan[],
  monthBudget: number,
  channelId: string,
  liveData?: any[],
  accountId?: string | null,
  hasConnectedAccount?: boolean,
  selectedMonth?: Date,
  selectedCampaignId?: string,
  channelName?: string,
): ChannelChartPoint[] {
  const month      = selectedMonth ?? new Date();
  const { start: monthStart, end: monthEnd } = getWeekAlignedMonthRange(month);
  const today      = new Date();
  today.setHours(0, 0, 0, 0);

  const thirtyDaysAhead = new Date(today);
  thirtyDaysAhead.setDate(thirtyDaysAhead.getDate() + 30);
  const effectiveEndDate = thirtyDaysAhead > monthEnd ? thirtyDaysAhead : monthEnd;

  const allDays = eachDayOfInterval({ start: monthStart, end: effectiveEndDate });

  const useLinearPlannedSpend =
    (channelName && isGoogleAdsChannel(channelName)) ||
    (channelName && isMetaAdsChannel(channelName));

  // ── Live spend aggregation ────────────────────────────────────────────────
  const liveSpendByDate = new Map<string, number>();

  if (liveData && liveData.length > 0) {
    liveData.forEach(item => {
      if (accountId && hasConnectedAccount) {
        let shouldInclude = false;
        if (item.accountId) {
          shouldInclude = String(item.accountId) === String(accountId);
        } else if (item.customerId) {
          const clean1 = String(item.customerId).replace(/-/g, '');
          const clean2 = String(accountId).replace(/-/g, '');
          shouldInclude = clean1 === clean2 || String(item.customerId) === String(accountId);
        }
        if (!shouldInclude) return;
      }

      if (selectedCampaignId && selectedCampaignId !== 'all') {
        if ((item.campaignId ?? '') !== selectedCampaignId) return;
      }

      const dateKey = item.dateStart ?? item.date ?? null;
      if (dateKey && item.spend !== undefined) {
        liveSpendByDate.set(dateKey, (liveSpendByDate.get(dateKey) ?? 0) + (item.spend ?? 0));
      }
    });
  }

  // ── Planned spend per date ────────────────────────────────────────────────
  const plannedSpendByDate = new Map<string, number>();

  if (useLinearPlannedSpend) {
    const { dailyRateByDate, flightEnd, lastDailyRate } = getLinearDailyRatesForMonth(weeklyPlans, monthStart, monthEnd);
    const monthBudgetInDollars = monthBudget / 100;

    let cumulativeRamp = 0;
    allDays.forEach(date => {
      const dateKey = format(date, 'yyyy-MM-dd');
      const rate = dailyRateByDate.get(dateKey);
      if (rate !== undefined) {
        cumulativeRamp += rate;
        plannedSpendByDate.set(dateKey, cumulativeRamp);
      } else if (date > flightEnd && date <= monthEnd) {
        // Weekly-plan boundaries (Monday-based) can land a few days short of
        // the calendar month end. The full month budget is already committed
        // by flightEnd, so hold flat here instead of over-extrapolating —
        // otherwise the planned line overshoots the actual entered budget
        // before the month is even over.
        plannedSpendByDate.set(dateKey, monthBudgetInDollars);
      } else if (date > monthEnd) {
        // Beyond the calendar month: continue the most recent week's daily
        // pace as a forward-looking projection (used by the 30-day lookahead
        // window), anchored from the true month end.
        const daysPast = Math.floor((date.getTime() - monthEnd.getTime()) / 86400000);
        plannedSpendByDate.set(dateKey, monthBudgetInDollars + lastDailyRate * daysPast);
      }
      // date < flightStart: left unset → defaults to 0 (no spend planned before flight starts)
    });
  } else {
    weeklyPlans.forEach(wp => {
      const weekStart = parseISO(wp.week_commencing);
      const weekEnd   = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const dailyPlanned = (wp.budget_planned ?? 0) / 7;

      for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(day.getDate() + i);
        if (isWithinInterval(day, { start: monthStart, end: effectiveEndDate })) {
          const dateKey = format(day, 'yyyy-MM-dd');
          plannedSpendByDate.set(dateKey, (plannedSpendByDate.get(dateKey) ?? 0) + dailyPlanned);
        }
      }
    });
  }

  // ── Build cumulative chart data ───────────────────────────────────────────
  const hasLiveSpendData = (liveData?.length ?? 0) > 0;
  const todayKey = format(today, 'yyyy-MM-dd');

  let cumulativeActual  = 0;
  let cumulativePlanned = 0;

  return allDays.map(date => {
    const dateKey        = format(date, 'yyyy-MM-dd');
    const plannedDaySpend = plannedSpendByDate.get(dateKey) ?? 0;

    if (useLinearPlannedSpend) {
      cumulativePlanned = plannedDaySpend; // already cumulative
    } else {
      cumulativePlanned += plannedDaySpend / 100; // cents → dollars
    }

    const actualDaySpend = liveSpendByDate.get(dateKey) ?? 0;
    cumulativeActual += actualDaySpend * 100; // dollars → cents for accumulation

    // Future days carry no actual spend yet — leave them null so the card's
    // projection logic (and the chart) can distinguish "actual" from
    // "haven't happened", instead of flat-lining the running total forward.
    return {
      date:          dateKey,
      actualSpend:   hasLiveSpendData && dateKey <= todayKey ? cumulativeActual / 100 : null,
      plannedSpend:  cumulativePlanned,
      projectedSpend: null,
      projected:     false,
    };
  });
}

// ---------------------------------------------------------------------------
// Multi-month range chart data generator
// ---------------------------------------------------------------------------

/**
 * Generates cumulative planned vs actual spend for an arbitrary date range
 * (may span multiple months). The cumulative values reset at the start of
 * the range (not at each month boundary), so the chart shows total progress
 * across the full period.
 */
export function generateChannelChartDataForRange(
  channel: MediaPlanChannel,
  startDate: string,
  endDate: string,
  spendData: any[],
  commission: number,
): ChannelChartPoint[] {
  const weeklyPlans     = buildWeeklyPlansFromFlights(channel, commission);
  const channelPlatform = getPlatformForChannel(channel.channelName);
  const channelKeyword  = channel.channelName.toLowerCase().split(' ')[0];
  const useLinear       = isGoogleAdsChannel(channel.channelName) || isMetaAdsChannel(channel.channelName);

  const channelLiveData = spendData.filter((p: any) => {
    if (p.platform && p.platform === channelPlatform) return true;
    if (p.channelName && p.channelName.toLowerCase().includes(channelKeyword)) return true;
    return false;
  });

  const start   = parseISO(startDate);
  const end     = parseISO(endDate);
  const allDays = eachDayOfInterval({ start, end });

  // Live spend by date (dollars)
  const liveSpendByDate = new Map<string, number>();
  channelLiveData.forEach((item: any) => {
    const dateKey = item.dateStart ?? item.date ?? null;
    if (dateKey && item.spend !== undefined) {
      liveSpendByDate.set(dateKey, (liveSpendByDate.get(dateKey) ?? 0) + (item.spend ?? 0));
    }
  });

  // Daily planned spend (dollars per day) across the full range
  const dailyPlannedByDate = new Map<string, number>();

  if (useLinear) {
    // Group days by the week-commencing-aligned month of their containing
    // week (not the calendar month), distribute each month's budget evenly
    const monthGroups = new Map<string, { monthStart: Date; days: Date[] }>();
    allDays.forEach(day => {
      const weekMonday = startOfWeek(day, { weekStartsOn: 1 });
      const key = getWeekMonthKey(weekMonday);
      if (!monthGroups.has(key)) {
        const [y, m] = key.split('-').map(Number);
        monthGroups.set(key, { monthStart: new Date(y, m - 1, 1), days: [] });
      }
      monthGroups.get(key)!.days.push(day);
    });
    monthGroups.forEach(({ monthStart: ms, days }) => {
      const { start: flightWindowStart, end: monthEndForMs } = getWeekAlignedMonthRange(ms);
      const { dailyRateByDate } = getLinearDailyRatesForMonth(weeklyPlans, flightWindowStart, monthEndForMs);
      days.forEach(day => {
        const rate = dailyRateByDate.get(format(day, 'yyyy-MM-dd'));
        if (rate !== undefined) {
          dailyPlannedByDate.set(format(day, 'yyyy-MM-dd'), rate);
        }
        // days outside the flight's active window: left unset → 0 (no spend planned)
      });
    });
  } else {
    // Weekly plan: distribute each week's budget evenly across its 7 days
    const allDaysSet = new Set(allDays.map(d => format(d, 'yyyy-MM-dd')));
    weeklyPlans.forEach(wp => {
      const weekStart  = parseISO(wp.week_commencing);
      const dailyRate  = (wp.budget_planned ?? 0) / 7 / 100; // cents → dollars
      for (let i = 0; i < 7; i++) {
        const day     = new Date(weekStart);
        day.setDate(day.getDate() + i);
        const dateKey = format(day, 'yyyy-MM-dd');
        if (allDaysSet.has(dateKey)) {
          dailyPlannedByDate.set(dateKey, (dailyPlannedByDate.get(dateKey) ?? 0) + dailyRate);
        }
      }
    });
  }

  // Accumulate into chart points
  const hasLiveData       = channelLiveData.length > 0;
  let cumulativeActual    = 0;
  let cumulativePlanned   = 0;

  const points = allDays.map(day => {
    const dateKey         = format(day, 'yyyy-MM-dd');
    cumulativePlanned    += dailyPlannedByDate.get(dateKey) ?? 0;
    cumulativeActual     += liveSpendByDate.get(dateKey) ?? 0;
    return {
      date:          dateKey,
      actualSpend:   hasLiveData ? cumulativeActual : null,
      plannedSpend:  cumulativePlanned,
      projectedSpend: null as null,
      projected:     false,
    };
  });

  // No live data → show 0 baseline for past/today dates
  if (!hasLiveData) {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return points.map(p => ({ ...p, actualSpend: p.date <= todayStr ? 0 : null }));
  }

  return points;
}

// ---------------------------------------------------------------------------
// Convenience wrapper for dashboard-v2
// ---------------------------------------------------------------------------

/**
 * One-stop function for dashboard-v2 channelCards memo.
 * Builds weekly plans from the channel's flights, looks up the selected month
 * budget, filters the global spend data to this channel, and returns chart
 * points ready for ChannelPerformanceCard.
 *
 * Matching strategy (in priority order):
 *  1. `p.platform` === channel's platform (e.g. 'meta-ads') — always reliable
 *  2. `p.channelName` keyword match — derived field, used as fallback
 */
export function generateChannelChartData(
  channel: MediaPlanChannel,
  selectedMonth: Date,
  spendData: any[],
  commission: number,
): ChannelChartPoint[] {
  const weeklyPlans    = buildWeeklyPlansFromFlights(channel, commission);
  const monthBudget    = getChannelMonthlyBudgetCents(weeklyPlans, selectedMonth);
  const channelPlatform = getPlatformForChannel(channel.channelName);
  const channelKeyword  = channel.channelName.toLowerCase().split(' ')[0];

  const channelLiveData = spendData.filter((p: any) => {
    // Primary: match by the platform field that SpendDataPoint always carries
    if (p.platform && p.platform === channelPlatform) return true;
    // Fallback: match by derived channelName keyword (added by loadAnalyticsData)
    if (p.channelName && p.channelName.toLowerCase().includes(channelKeyword)) return true;
    return false;
  });

  const points = generateMonthDataFromWeeklyPlans(
    weeklyPlans,
    monthBudget,
    channel.id,
    channelLiveData,
    null,      // accountId — not filtered at this level
    false,     // hasConnectedAccount
    selectedMonth,
    undefined, // selectedCampaignId — show all campaigns
    channel.channelName,
  );

  // When there is no live data for this channel, actualSpend comes back as null
  // for every point. Replace null with 0 for past/today dates so the chart always
  // renders a baseline line instead of being completely absent.
  if (channelLiveData.length === 0) {
    const today = format(new Date(), 'yyyy-MM-dd');
    return points.map(p => ({
      ...p,
      actualSpend: p.date <= today ? 0 : null,
    }));
  }

  return points;
}
