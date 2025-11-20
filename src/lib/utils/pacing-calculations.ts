import {
  parseISO,
  differenceInDays,
  isAfter,
  isBefore,
  isWithinInterval,
} from "date-fns";
import { MediaChannel, TimeFrame } from "../types/media-plan";

/**
 * Calculate the pacing score for a media channel
 * Returns positive number if over-pacing, negative if under-pacing
 */
export function calculatePacingScore(
  channel: MediaChannel,
  currentDate: Date
): number {
  const timeFrames = channel.timeFrames;
  if (!timeFrames || timeFrames.length === 0) {
    return 0;
  }

  // Calculate total planned budget and total actual spend
  let totalPlanned = 0;
  let totalActual = 0;
  let totalDaysInPlan = 0;
  let daysElapsed = 0;

  for (const timeFrame of timeFrames) {
    const startDate = parseISO(timeFrame.startDate);
    const endDate = parseISO(timeFrame.endDate);
    const timeFrameDays = differenceInDays(endDate, startDate) + 1;

    totalPlanned += timeFrame.planned;
    totalActual += timeFrame.actual;
    totalDaysInPlan += timeFrameDays;

    // Calculate days elapsed in this timeframe
    if (isBefore(currentDate, startDate)) {
      // Current date is before this timeframe - no days elapsed
      continue;
    } else if (isAfter(currentDate, endDate)) {
      // Current date is after this timeframe - all days elapsed
      daysElapsed += timeFrameDays;
    } else if (
      isWithinInterval(currentDate, { start: startDate, end: endDate })
    ) {
      // Current date is within this timeframe - partial days elapsed
      daysElapsed += differenceInDays(currentDate, startDate) + 1;
    }
  }

  if (totalPlanned === 0 || totalDaysInPlan === 0) {
    return 0;
  }

  // Calculate expected spend percentage based on time elapsed
  const expectedSpendPercentage = (daysElapsed / totalDaysInPlan) * 100;

  // Calculate actual spend percentage
  const actualSpendPercentage = (totalActual / totalPlanned) * 100;

  // Calculate expected spend amount
  const expectedSpend = (expectedSpendPercentage / 100) * totalPlanned;

  if (expectedSpend === 0) {
    return 0;
  }

  // Return pacing score: ((actual / expected) * 100) - 100
  const pacingScore = (totalActual / expectedSpend) * 100 - 100;

  return pacingScore;
}

/**
 * Get the pacing status based on the pacing score
 * Returns 'on-track' if score is between -10 and +10
 * Returns 'over' if score > 10
 * Returns 'under' if score < -10
 */
export function getPacingStatus(
  pacingScore: number
): "over" | "on-track" | "under" {
  if (pacingScore > 10) {
    return "over";
  } else if (pacingScore < -10) {
    return "under";
  } else {
    return "on-track";
  }
}

/**
 * Calculate projected spend based on current daily spend rate
 * Projects forward to the end of the plan
 */
export function calculateProjectedSpend(
  channel: MediaChannel,
  currentDate: Date
): number {
  const timeFrames = channel.timeFrames;
  if (!timeFrames || timeFrames.length === 0) {
    return 0;
  }

  // Find the earliest start date and latest end date
  const sortedTimeFrames = [...timeFrames].sort(
    (a, b) =>
      parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime()
  );

  const planStartDate = parseISO(sortedTimeFrames[0].startDate);
  const planEndDate = parseISO(
    sortedTimeFrames[sortedTimeFrames.length - 1].endDate
  );

  // Calculate total actual spend and days elapsed
  let totalActual = 0;
  let daysElapsed = 0;

  for (const timeFrame of timeFrames) {
    const startDate = parseISO(timeFrame.startDate);
    const endDate = parseISO(timeFrame.endDate);
    const timeFrameDays = differenceInDays(endDate, startDate) + 1;

    totalActual += timeFrame.actual;

    // Calculate days elapsed in this timeframe
    if (isBefore(currentDate, startDate)) {
      continue;
    } else if (isAfter(currentDate, endDate)) {
      daysElapsed += timeFrameDays;
    } else if (
      isWithinInterval(currentDate, { start: startDate, end: endDate })
    ) {
      daysElapsed += differenceInDays(currentDate, startDate) + 1;
    }
  }

  // If no days have elapsed or no spend yet, return 0
  if (daysElapsed === 0 || totalActual === 0) {
    return totalActual;
  }

  // Calculate daily spend rate
  const dailySpendRate = totalActual / daysElapsed;

  // Calculate total days in plan
  const totalDaysInPlan = differenceInDays(planEndDate, planStartDate) + 1;

  // Calculate projected total spend
  const projectedSpend = dailySpendRate * totalDaysInPlan;

  return projectedSpend;
}

/**
 * Calculate the spend rate as a percentage of total budget
 */
export function calculateSpendRate(
  actualSpend: number,
  totalBudget: number
): number {
  if (totalBudget === 0) {
    return 0;
  }

  return (actualSpend / totalBudget) * 100;
}

