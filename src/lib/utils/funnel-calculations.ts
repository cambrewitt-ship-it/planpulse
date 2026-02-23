import { FunnelStage, FunnelConfig, CombinedMetric } from '@/lib/types/funnel';

interface RawFunnelData {
  metaMetrics?: { impressions: number; clicks: number; spend: number };
  googleMetrics?: { impressions: number; clicks: number; spend: number };
  ga4Metrics?: { 
    standardMetrics?: { activeUsers: number; conversions: number; sessions: number };
    events?: Array<{ name: string; count: number; users: number }>;
  };
  totalSpend: number;
}

export function calculateFunnelMetrics(
  config: FunnelConfig,
  rawData: RawFunnelData
): FunnelStage[] {
  return config.stages.map((stage, index) => {
    // Get value from appropriate source
    let value = 0;
    
    // If stage has combined metrics, sum them all
    if (stage.combinedMetrics && stage.combinedMetrics.length > 0) {
      value = stage.combinedMetrics.reduce((sum, combinedMetric) => {
        return sum + calculateCombinedMetricValue(combinedMetric, rawData);
      }, 0);
    } else {
      // Single metric (original behavior)
      if (stage.source === 'meta' && rawData.metaMetrics) {
        value = rawData.metaMetrics[stage.metricKey as keyof typeof rawData.metaMetrics] || 0;
      } 
      else if (stage.source === 'google' && rawData.googleMetrics) {
        value = rawData.googleMetrics[stage.metricKey as keyof typeof rawData.googleMetrics] || 0;
      }
      else if (stage.source === 'ga4') {
        if (stage.eventName && rawData.ga4Metrics?.events) {
          // Event-based metric (e.g., first_open, purchase)
          const event = rawData.ga4Metrics.events.find(e => e.name === stage.eventName);
          value = event?.count || 0;
        } else if (rawData.ga4Metrics?.standardMetrics) {
          // Standard metric (e.g., activeUsers, conversions)
          value = rawData.ga4Metrics.standardMetrics[stage.metricKey as keyof typeof rawData.ga4Metrics.standardMetrics] || 0;
        }
      }
    }

    // Calculate conversion rate from previous stage
    const previousStage = index > 0 ? config.stages[index - 1] : null;
    const previousValue = previousStage ? calculateValue(previousStage, rawData) : null;
    const conversionRate = previousValue && previousValue > 0 
      ? (value / previousValue) * 100 
      : undefined;

    // Calculate cost per action
    const costPerAction = value > 0 ? rawData.totalSpend / value : undefined;

    return {
      ...stage,
      value,
      conversionRate,
      costPerAction
    };
  });
}

// Helper to calculate value for a single combined metric
function calculateCombinedMetricValue(combinedMetric: CombinedMetric, rawData: RawFunnelData): number {
  if (combinedMetric.source === 'meta' && rawData.metaMetrics) {
    return rawData.metaMetrics[combinedMetric.metricKey as keyof typeof rawData.metaMetrics] || 0;
  }
  if (combinedMetric.source === 'google' && rawData.googleMetrics) {
    return rawData.googleMetrics[combinedMetric.metricKey as keyof typeof rawData.googleMetrics] || 0;
  }
  if (combinedMetric.source === 'ga4') {
    if (combinedMetric.eventName && rawData.ga4Metrics?.events) {
      const event = rawData.ga4Metrics.events.find(e => e.name === combinedMetric.eventName);
      return event?.count || 0;
    }
    if (rawData.ga4Metrics?.standardMetrics) {
      return rawData.ga4Metrics.standardMetrics[combinedMetric.metricKey as keyof typeof rawData.ga4Metrics.standardMetrics] || 0;
    }
  }
  return 0;
}

// Helper to get value without duplication
function calculateValue(stage: FunnelStage, rawData: RawFunnelData): number {
  // If stage has combined metrics, sum them all
  if (stage.combinedMetrics && stage.combinedMetrics.length > 0) {
    return stage.combinedMetrics.reduce((sum, combinedMetric) => {
      return sum + calculateCombinedMetricValue(combinedMetric, rawData);
    }, 0);
  }
  
  // Single metric (original behavior)
  if (stage.source === 'meta' && rawData.metaMetrics) {
    return rawData.metaMetrics[stage.metricKey as keyof typeof rawData.metaMetrics] || 0;
  }
  if (stage.source === 'google' && rawData.googleMetrics) {
    return rawData.googleMetrics[stage.metricKey as keyof typeof rawData.googleMetrics] || 0;
  }
  if (stage.source === 'ga4') {
    if (stage.eventName && rawData.ga4Metrics?.events) {
      const event = rawData.ga4Metrics.events.find(e => e.name === stage.eventName);
      return event?.count || 0;
    }
    if (rawData.ga4Metrics?.standardMetrics) {
      return rawData.ga4Metrics.standardMetrics[stage.metricKey as keyof typeof rawData.ga4Metrics.standardMetrics] || 0;
    }
  }
  return 0;
}

export function formatConversionRate(rate?: number): string {
  if (rate === undefined || rate === null) return '-';
  return `${rate.toFixed(2)}%`;
}

export function formatCostPerAction(cost?: number): string {
  if (cost === undefined || cost === null) return '-';
  return `$${cost.toFixed(2)}`;
}

export function formatLargeNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}
