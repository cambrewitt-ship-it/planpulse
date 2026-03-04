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
  startOfMonth,
  endOfMonth,
  parseISO,
  isWithinInterval,
  startOfWeek,
  addWeeks,
  differenceInWeeks,
} from 'date-fns';
import type { MediaPlanChannel } from '@/components/media-plan-builder/media-plan-grid';

// ---------------------------------------------------------------------------
// Channel-name helpers
// ---------------------------------------------------------------------------

export function isMetaAdsChannel(channelName: string): boolean {
  const lower = channelName.toLowerCase();
  return lower.includes('facebook') || lower.includes('meta');
}

export function isGoogleAdsChannel(channelName: string): boolean {
  return channelName.toLowerCase().includes('google');
}

export function getPlatformForChannel(channelName: string): string {
  const lower = channelName.toLowerCase();
  if (lower.includes('meta') || lower.includes('facebook') || lower.includes('instagram')) return 'meta-ads';
  if (lower.includes('google')) return 'google-ads';
  if (lower.includes('linkedin')) return 'linkedin-ads';
  if (lower.includes('tiktok')) return 'tiktok-ads';
  return lower.replace(/\s+/g, '-');
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
      const monthKey  = format(weekStart, 'yyyy-MM');
      (weeksByMonth[monthKey] ??= []).push(weekStart);
    }

    let weekNumber = 1;
    for (let i = 0; i < numWeeks; i++) {
      const weekStart   = addWeeks(startMonday, i);
      const monthKey    = format(weekStart, 'yyyy-MM');
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
  const monthStart = startOfMonth(selectedMonth);
  const monthEnd   = endOfMonth(selectedMonth);

  return weeklyPlans
    .filter(wp => {
      const weekStart = parseISO(wp.week_commencing);
      return isWithinInterval(weekStart, { start: monthStart, end: monthEnd });
    })
    .reduce((sum, wp) => sum + (wp.budget_planned ?? 0), 0);
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
  const monthStart = startOfMonth(month);
  const monthEnd   = endOfMonth(month);
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
    const daysInMonth      = eachDayOfInterval({ start: monthStart, end: monthEnd }).length;
    const monthBudgetInDollars = monthBudget / 100;

    allDays.forEach(date => {
      const dateKey = format(date, 'yyyy-MM-dd');
      if (date >= monthStart && date <= monthEnd) {
        const dayNumber        = Math.floor((date.getTime() - monthStart.getTime()) / 86400000) + 1;
        plannedSpendByDate.set(dateKey, (dayNumber / daysInMonth) * monthBudgetInDollars);
      } else if (date > monthEnd) {
        const daysPast   = Math.floor((date.getTime() - monthEnd.getTime()) / 86400000);
        const dailyRate  = monthBudgetInDollars / daysInMonth;
        plannedSpendByDate.set(dateKey, monthBudgetInDollars + dailyRate * daysPast);
      }
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

    return {
      date:          dateKey,
      actualSpend:   hasLiveSpendData ? cumulativeActual / 100 : null,
      plannedSpend:  cumulativePlanned,
      projectedSpend: null,
      projected:     false,
    };
  });
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
