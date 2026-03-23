import type { ChannelBenchmark, MetricPreset, ClientChannelPreset } from '@/types/database';

export interface ChannelWithMetrics {
  name: string;
  platform: string;
  metrics: {
    impressions: number;
    clicks: number;
    ctr: number;   // 0–1 decimal (same format as channel cards)
    cpc: number;
    conversions: number;
  };
}

export interface PerformanceHealthResult {
  score: number;   // 0–100 (percentage of benchmarks met)
  met: number;     // count of benchmarks met
  total: number;   // count of benchmarks with real data to compare
  status: 'good' | 'caution' | 'at-risk' | 'no-data';
}

/**
 * Maps a platform/channel name to the channel_name value used in channel_benchmarks.
 * Must stay in sync with inferBenchmarkChannelName in channel-performance-card.tsx.
 */
function toBenchmarkChannelName(platform: string, channelName: string): string {
  const lower = (platform + ' ' + channelName).toLowerCase();
  if (lower.includes('meta') || lower.includes('facebook')) return 'Meta Ads';
  if (lower.includes('display')) return 'Google Display';
  if (lower.includes('google')) return 'Google Ads';
  return channelName;
}

/**
 * Returns the real metric value for a given benchmark metric_key.
 * CTR is stored as a 0–1 decimal in channel data but benchmarks use percentage,
 * so we multiply by 100. All other metrics are used as-is.
 */
function getRealValue(
  metricKey: string,
  metrics: ChannelWithMetrics['metrics'],
): number | null {
  switch (metricKey) {
    case 'ctr':         return metrics.ctr * 100;
    case 'cpc':         return metrics.cpc;
    case 'impressions': return metrics.impressions;
    case 'clicks':      return metrics.clicks;
    case 'conversions': return metrics.conversions;
    default:            return null;
  }
}

/**
 * Calculates the performance health score based on how many tracked benchmarks
 * the client is currently meeting or beating across all active paid channels.
 *
 * Rules:
 * - Only channels that have a matching preset in client_channel_presets (or a
 *   default preset from metric_presets) are evaluated.
 * - Only benchmarks whose metric_key maps to an available real value are counted;
 *   metrics with zero real data are excluded (not treated as failing).
 * - Score = (met / total) * 100
 * - Status thresholds: ≥70% → good, ≥40% → caution, <40% → at-risk, 0 data → no-data
 *
 * @param channels   Paid-digital channel cards with aggregated metric totals
 * @param benchmarks All rows from channel_benchmarks
 * @param presets    All rows from metric_presets
 * @param clientChannelPresets Saved per-client preset selections
 */
export function calculatePerformanceHealth(
  channels: ChannelWithMetrics[],
  benchmarks: ChannelBenchmark[],
  presets: MetricPreset[],
  clientChannelPresets: ClientChannelPreset[],
): PerformanceHealthResult {
  let totalMet = 0;
  let totalTracked = 0;

  for (const channel of channels) {
    const benchmarkChannel = toBenchmarkChannelName(channel.platform, channel.name);

    // Find which preset is active for this channel
    const savedPreset = clientChannelPresets.find(p => p.channel_name === channel.name);
    const activePresetName = savedPreset?.preset_name ?? null;

    const channelPresets = presets.filter(p => p.channel_name === benchmarkChannel);
    const activePreset = activePresetName
      ? channelPresets.find(p => p.name === activePresetName) ?? channelPresets[0] ?? null
      : channelPresets[0] ?? null;

    // Get the benchmarks for this channel, filtered by preset metric list when applicable
    const channelBenchmarks = benchmarks.filter(b => b.channel_name === benchmarkChannel);
    const scopedBenchmarks =
      activePreset && activePreset.metrics.length > 0
        ? channelBenchmarks.filter(b => activePreset.metrics.includes(b.metric_key))
        : channelBenchmarks;

    for (const benchmark of scopedBenchmarks) {
      const realValue = getRealValue(benchmark.metric_key, channel.metrics);

      // Exclude metrics with no real data — they do not count as failing
      if (realValue === null || realValue <= 0) continue;

      totalTracked++;

      const isMet =
        benchmark.direction === 'higher_is_better'
          ? realValue >= benchmark.benchmark_value
          : realValue <= benchmark.benchmark_value;

      if (isMet) totalMet++;
    }
  }

  if (totalTracked === 0) {
    return { score: 50, met: 0, total: 0, status: 'no-data' };
  }

  const score = Math.round((totalMet / totalTracked) * 100);
  const status: PerformanceHealthResult['status'] =
    score >= 70 ? 'good' : score >= 40 ? 'caution' : 'at-risk';

  return { score, met: totalMet, total: totalTracked, status };
}
