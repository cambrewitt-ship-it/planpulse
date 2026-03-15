/**
 * Client Health Score Calculator
 *
 * Calculates an overall health score (0-100) for a client based on three weighted dimensions:
 * - Budget Pacing (~44%): How closely actual spend tracks planned spend
 * - Action Completion (~28%): Progress on planned actions/tasks
 * - Performance (~28%): Weighted average channel performance scores
 */

export interface HealthScoreResult {
  overallScore: number
  status: 'healthy' | 'caution' | 'at-risk'
  statusColor: 'green' | 'amber' | 'red'
  breakdown: {
    budgetPacing: { score: number; weight: number; details: string }
    actionCompletion: { score: number; weight: number; details: string }
    performance: { score: number; weight: number; details: string }
  }
}

/**
 * Calculates the budget pacing score based on how closely current spend
 * tracks the planned spend at this point in the campaign.
 *
 * @param pacingRatio - currentSpend / plannedSpend
 * @returns Score from 20–100
 */
function calcBudgetPacingScore(pacingRatio: number): number {
  const pct = pacingRatio * 100
  if (pct >= 95 && pct <= 105) return 100
  if ((pct >= 85 && pct < 95) || (pct > 105 && pct <= 115)) return 80
  if ((pct >= 75 && pct < 85) || (pct > 115 && pct <= 125)) return 60
  if ((pct >= 65 && pct < 75) || (pct > 125 && pct <= 135)) return 40
  return 20
}

/**
 * Calculates the action completion score based on the ratio of completed
 * actions to total planned actions.
 *
 * @param completionRate - completedActions / totalActions (0–1)
 * @returns Score from 20–100
 */
function calcActionCompletionScore(completionRate: number): number {
  const pct = completionRate * 100
  if (pct >= 100) return 100
  if (pct >= 75) return 80
  if (pct >= 50) return 60
  if (pct >= 25) return 40
  return 20
}

/**
 * Calculates the weighted average performance score across channels,
 * using each channel's budget allocation as its weight.
 *
 * @param channelPerformanceScores - Array of channels with score (0–100) and budget
 * @returns Weighted average score, or 0 if no channels provided
 */
function calcPerformanceScore(
  channelPerformanceScores: Array<{ channelId: string; score: number; budget: number }>
): number {
  if (channelPerformanceScores.length === 0) return 0

  const totalBudget = channelPerformanceScores.reduce((sum, ch) => sum + ch.budget, 0)
  if (totalBudget === 0) {
    // Equal weighting if no budget data
    const avg =
      channelPerformanceScores.reduce((sum, ch) => sum + ch.score, 0) /
      channelPerformanceScores.length
    return avg
  }

  const weightedSum = channelPerformanceScores.reduce(
    (sum, ch) => sum + ch.score * (ch.budget / totalBudget),
    0
  )
  return weightedSum
}

/**
 * Calculates the overall client health score from key campaign metrics.
 *
 * Overall score = (budgetPacing × 4/9) + (actionCompletion × 2.5/9) + (performance × 2.5/9)
 *
 * Status thresholds:
 * - 80–100 → healthy (green)
 * - 60–79  → caution (amber)
 * - <60    → at-risk (red)
 *
 * @param currentSpend - Actual spend to date
 * @param plannedSpend - Expected spend by now based on days elapsed
 * @param totalBudget - Total campaign budget
 * @param daysElapsed - Number of days into the campaign
 * @param totalDays - Total campaign duration in days
 * @param completedActions - Number of actions/tasks completed
 * @param totalActions - Total number of planned actions/tasks
 * @param channelPerformanceScores - Per-channel performance scores (0–100) and budgets
 */
export function calculateHealthScore(
  currentSpend: number,
  plannedSpend: number,
  totalBudget: number,
  daysElapsed: number,
  totalDays: number,
  completedActions: number,
  totalActions: number,
  channelPerformanceScores: Array<{ channelId: string; score: number; budget: number }>
): HealthScoreResult {
  // --- Budget Pacing ---
  const pacingRatio = plannedSpend > 0 ? currentSpend / plannedSpend : 0
  const budgetPacingScore = calcBudgetPacingScore(pacingRatio)
  const pacingPct = Math.round(pacingRatio * 100)
  const budgetPacingDetails =
    plannedSpend > 0
      ? `Spending at ${pacingPct}% of planned pace (${currentSpend.toLocaleString()} of ${plannedSpend.toLocaleString()} planned)`
      : 'No planned spend data available'

  // --- Action Completion ---
  const completionRate = totalActions > 0 ? completedActions / totalActions : 0
  const actionCompletionScore = calcActionCompletionScore(completionRate)
  const completionPct = Math.round(completionRate * 100)
  const actionCompletionDetails =
    totalActions > 0
      ? `${completedActions} of ${totalActions} actions completed (${completionPct}%)`
      : 'No actions tracked'

  // --- Performance ---
  const performanceScore = calcPerformanceScore(channelPerformanceScores)
  const channelCount = channelPerformanceScores.length
  const performanceDetails =
    channelCount > 0
      ? `Weighted average score of ${Math.round(performanceScore)} across ${channelCount} channel${channelCount !== 1 ? 's' : ''}`
      : 'No channel performance data available'

  // --- Overall Score ---
  const overallScore = Math.round(
    budgetPacingScore * (4 / 9) + // ~44.4%
      actionCompletionScore * (2.5 / 9) + // ~27.8%
      performanceScore * (2.5 / 9) // ~27.8%
  )

  // --- Status ---
  let status: HealthScoreResult['status']
  let statusColor: HealthScoreResult['statusColor']
  if (overallScore >= 80) {
    status = 'healthy'
    statusColor = 'green'
  } else if (overallScore >= 60) {
    status = 'caution'
    statusColor = 'amber'
  } else {
    status = 'at-risk'
    statusColor = 'red'
  }

  return {
    overallScore,
    status,
    statusColor,
    breakdown: {
      budgetPacing: { score: budgetPacingScore, weight: 4 / 9, details: budgetPacingDetails },
      actionCompletion: {
        score: actionCompletionScore,
        weight: 2.5 / 9,
        details: actionCompletionDetails,
      },
      performance: {
        score: Math.round(performanceScore),
        weight: 2.5 / 9,
        details: performanceDetails,
      },
    },
  }
}
