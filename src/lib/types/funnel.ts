export interface CombinedMetric {
  source: 'meta' | 'google' | 'ga4';
  metricKey: string;
  eventName?: string;
  platformName?: string; // Display name for the platform (e.g., "Meta", "Google Search")
}

export interface FunnelStage {
  id: string;
  name: string;
  displayName: string;
  value: number;
  conversionRate?: number;
  costPerAction?: number;
  source: 'meta' | 'google' | 'ga4';
  metricKey: string;  // For ad platforms: 'impressions', 'clicks', etc.
  eventName?: string; // For GA4: specific event name like 'first_open'
  combinedMetrics?: CombinedMetric[]; // When present, this stage combines multiple metrics
}

export interface FunnelConfig {
  id: string;
  name: string;
  channelIds: string[]; // Changed from channelId to support multiple channels
  stages: FunnelStage[];
  totalCost: number;
  dateRange: { startDate: string; endDate: string };
}

export interface MediaPlanFunnel {
  id: string;
  channelIds: string[]; // Changed from channelId to support multiple channels
  name: string;
  config: FunnelConfig;
  createdAt: string;
  updatedAt: string;
}
