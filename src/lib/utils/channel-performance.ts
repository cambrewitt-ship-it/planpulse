/**
 * Channel Performance Calculator
 *
 * Aggregates and scores advertising channel performance against industry benchmarks.
 * Supports Meta Ads, Google Ads, and arbitrary platforms via a default fallback.
 *
 * Scoring is split equally across three KPIs:
 *   - CTR (33.3%)
 *   - CPC (33.3%, lower is better)
 *   - Conversion Rate (33.3%)
 *
 * Each KPI is scored by comparing the actual value against a benchmark:
 *   >20% above  → 100  |  10-20% above → 90  |  0-10% above → 80
 *   0-10% below → 70   |  10-20% below → 50  |  >20% below  → 30
 * For CPC the direction is inverted (below benchmark is good).
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ChannelMetrics {
  channelId: string
  channelName: string
  /** Platform identifier. Use 'meta-ads' or 'google-ads' to get predefined benchmarks. */
  platform: 'meta-ads' | 'google-ads' | string
  impressions: number
  clicks: number
  conversions: number
  spend: number
  /** Click-through rate as a decimal (e.g. 0.025 = 2.5%) */
  ctr: number
  /** Cost per click in currency units */
  cpc: number
  /** Conversion rate as a decimal (e.g. 0.03 = 3%) */
  conversionRate: number
}

export interface ChannelPerformanceScore {
  channelId: string
  channelName: string
  /** Overall channel score 0–100 */
  score: number
  status: 'excellent' | 'good' | 'needs-attention' | 'poor'
  metrics: ChannelMetrics
  benchmarks: {
    ctr: { value: number; benchmark: number; variance: number }
    cpc: { value: number; benchmark: number; variance: number }
    conversionRate: { value: number; benchmark: number; variance: number }
  }
  /** Human-readable list of detected issues for this channel */
  issues: string[]
}

export interface CrossChannelPerformanceResult {
  /** Budget-weighted average of all channel scores */
  overallScore: number
  overallStatus: string
  channelBreakdown: ChannelPerformanceScore[]
  /** Summed totals across all channels */
  totalMetrics: ChannelMetrics
  /** Issues from channels with 'poor' status */
  criticalIssues: string[]
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

interface PlatformBenchmarks {
  /** Expected CTR as a decimal */
  ctr: number
  /** Expected CPC in currency units */
  cpc: number
  /** Expected conversion rate as a decimal */
  conversionRate: number
}

/**
 * Industry-average benchmarks per platform.
 * The `default` entry is used for any unrecognised platform string.
 */
export const CHANNEL_BENCHMARKS: Record<string, PlatformBenchmarks> = {
  'meta-ads': { ctr: 0.012, cpc: 0.8, conversionRate: 0.02 },
  'google-ads': { ctr: 0.035, cpc: 1.5, conversionRate: 0.035 },
  default: { ctr: 0.02, cpc: 1.0, conversionRate: 0.025 },
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Scores a metric where **higher is better** (CTR, conversion rate).
 *
 * @param actual - Actual observed value
 * @param benchmark - Industry benchmark value
 * @returns Score 30–100
 */
function scoreHigherIsBetter(actual: number, benchmark: number): number {
  if (benchmark === 0) return 70 // avoid divide-by-zero; treat as neutral
  const variance = (actual - benchmark) / benchmark // positive = above benchmark
  if (variance > 0.2) return 100
  if (variance > 0.1) return 90
  if (variance >= 0) return 80
  if (variance >= -0.1) return 70
  if (variance >= -0.2) return 50
  return 30
}

/**
 * Scores a metric where **lower is better** (CPC).
 *
 * @param actual - Actual observed value
 * @param benchmark - Industry benchmark value
 * @returns Score 30–100
 */
function scoreLowerIsBetter(actual: number, benchmark: number): number {
  if (benchmark === 0) return 70
  const variance = (actual - benchmark) / benchmark // positive = above benchmark (bad)
  if (variance < -0.2) return 100
  if (variance < -0.1) return 90
  if (variance <= 0) return 80
  if (variance <= 0.1) return 70
  if (variance <= 0.2) return 50
  return 30
}

/**
 * Derives a human-readable status label from a numeric score.
 */
function statusFromScore(score: number): ChannelPerformanceScore['status'] {
  if (score >= 85) return 'excellent'
  if (score >= 70) return 'good'
  if (score >= 50) return 'needs-attention'
  return 'poor'
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculates a performance score for a single advertising channel.
 *
 * The overall score is the unweighted average of CTR, CPC, and conversion-rate
 * sub-scores (each contributing ~33.3%). Custom benchmarks can be supplied to
 * override the built-in platform defaults.
 *
 * @param metrics - Raw channel metrics
 * @param customBenchmarks - Optional overrides for benchmark values
 * @returns A full {@link ChannelPerformanceScore} including sub-scores, variance
 *   data, and a list of detected issues.
 */
export function calculateChannelPerformance(
  metrics: ChannelMetrics,
  customBenchmarks?: Partial<PlatformBenchmarks>
): ChannelPerformanceScore {
  const base: PlatformBenchmarks =
    CHANNEL_BENCHMARKS[metrics.platform] ?? CHANNEL_BENCHMARKS['default']

  const benchmarks: PlatformBenchmarks = {
    ctr: customBenchmarks?.ctr ?? base.ctr,
    cpc: customBenchmarks?.cpc ?? base.cpc,
    conversionRate: customBenchmarks?.conversionRate ?? base.conversionRate,
  }

  // --- KPI scores ---
  const ctrScore = scoreHigherIsBetter(metrics.ctr, benchmarks.ctr)
  const cpcScore = scoreLowerIsBetter(metrics.cpc, benchmarks.cpc)
  const convRateScore = scoreHigherIsBetter(metrics.conversionRate, benchmarks.conversionRate)

  const overallScore = Math.round((ctrScore + cpcScore + convRateScore) / 3)

  // --- Variance values (actual vs benchmark, as ratio) ---
  const ctrVariance = benchmarks.ctr > 0 ? (metrics.ctr - benchmarks.ctr) / benchmarks.ctr : 0
  const cpcVariance = benchmarks.cpc > 0 ? (metrics.cpc - benchmarks.cpc) / benchmarks.cpc : 0
  const convVariance =
    benchmarks.conversionRate > 0
      ? (metrics.conversionRate - benchmarks.conversionRate) / benchmarks.conversionRate
      : 0

  // --- Issue detection ---
  const issues: string[] = []

  if (ctrVariance < -0.2) {
    issues.push('Click-through rate significantly below benchmark')
  }
  if (cpcVariance > 0.2) {
    issues.push('Cost per click too high - review targeting')
  }
  if (convVariance < -0.2) {
    issues.push('Conversion rate needs improvement')
  }
  if (metrics.spend > 0 && metrics.impressions < 100) {
    issues.push('Low delivery - campaign may be paused or restricted')
  }

  return {
    channelId: metrics.channelId,
    channelName: metrics.channelName,
    score: overallScore,
    status: statusFromScore(overallScore),
    metrics,
    benchmarks: {
      ctr: { value: metrics.ctr, benchmark: benchmarks.ctr, variance: ctrVariance },
      cpc: { value: metrics.cpc, benchmark: benchmarks.cpc, variance: cpcVariance },
      conversionRate: {
        value: metrics.conversionRate,
        benchmark: benchmarks.conversionRate,
        variance: convVariance,
      },
    },
    issues,
  }
}

/**
 * Aggregates performance scores across multiple channels into a single
 * cross-channel view.
 *
 * The overall score is a budget-weighted average of individual channel scores.
 * If no budget weights are supplied (or all weights are zero) an equal-weight
 * average is used instead.
 *
 * Issues from channels with a `'poor'` status are promoted to `criticalIssues`.
 *
 * @param channelScores - Array of pre-calculated {@link ChannelPerformanceScore} objects
 * @param budgetWeights - Map of channelId → budget allocation (any unit; used for relative weighting)
 * @returns {@link CrossChannelPerformanceResult}
 */
export function aggregateCrossChannelPerformance(
  channelScores: ChannelPerformanceScore[],
  budgetWeights: Record<string, number> = {}
): CrossChannelPerformanceResult {
  if (channelScores.length === 0) {
    const emptyMetrics: ChannelMetrics = {
      channelId: 'aggregate',
      channelName: 'All Channels',
      platform: 'aggregate',
      impressions: 0,
      clicks: 0,
      conversions: 0,
      spend: 0,
      ctr: 0,
      cpc: 0,
      conversionRate: 0,
    }
    return {
      overallScore: 0,
      overallStatus: 'poor',
      channelBreakdown: [],
      totalMetrics: emptyMetrics,
      criticalIssues: [],
    }
  }

  // --- Weighted overall score ---
  const totalBudget = channelScores.reduce(
    (sum, ch) => sum + (budgetWeights[ch.channelId] ?? 0),
    0
  )

  let overallScore: number
  if (totalBudget === 0) {
    // Equal weighting
    overallScore = Math.round(
      channelScores.reduce((sum, ch) => sum + ch.score, 0) / channelScores.length
    )
  } else {
    overallScore = Math.round(
      channelScores.reduce((sum, ch) => {
        const weight = (budgetWeights[ch.channelId] ?? 0) / totalBudget
        return sum + ch.score * weight
      }, 0)
    )
  }

  // --- Aggregate raw metrics ---
  const totalImpressions = channelScores.reduce((s, ch) => s + ch.metrics.impressions, 0)
  const totalClicks = channelScores.reduce((s, ch) => s + ch.metrics.clicks, 0)
  const totalConversions = channelScores.reduce((s, ch) => s + ch.metrics.conversions, 0)
  const totalSpend = channelScores.reduce((s, ch) => s + ch.metrics.spend, 0)

  const totalMetrics: ChannelMetrics = {
    channelId: 'aggregate',
    channelName: 'All Channels',
    platform: 'aggregate',
    impressions: totalImpressions,
    clicks: totalClicks,
    conversions: totalConversions,
    spend: totalSpend,
    ctr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
    cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
    conversionRate: totalClicks > 0 ? totalConversions / totalClicks : 0,
  }

  // --- Collect and triage issues ---
  const criticalIssues: string[] = []
  for (const ch of channelScores) {
    if (ch.status === 'poor') {
      for (const issue of ch.issues) {
        criticalIssues.push(`[${ch.channelName}] ${issue}`)
      }
    }
  }

  return {
    overallScore,
    overallStatus: statusFromScore(overallScore),
    channelBreakdown: channelScores,
    totalMetrics,
    criticalIssues,
  }
}
