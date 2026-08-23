/**
 * Utility functions for fetching and combining GA4 analytics data with spend data
 */

export type MetricSource = 'ga4' | 'meta' | 'google';

export interface PlatformEventOption {
  source: MetricSource;
  key: string;
  label: string;
  count?: number;
}

// Human-readable labels for Meta action types
const META_ACTION_LABELS: Record<string, string> = {
  link_click: 'Link Clicks',
  landing_page_view: 'Landing Page Views',
  purchase: 'Purchases',
  lead: 'Leads',
  complete_registration: 'Registrations',
  add_to_cart: 'Add to Cart',
  initiate_checkout: 'Checkout Initiated',
  view_content: 'View Content',
  video_view: 'Video Views',
  post_engagement: 'Post Engagements',
  page_engagement: 'Page Engagements',
  comment: 'Comments',
  like: 'Likes',
  share: 'Shares',
  click: 'All Clicks',
  reach: 'Reach',
};

export function getMetaActionLabel(actionType: string): string {
  return META_ACTION_LABELS[actionType] || actionType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Valid GA4 metrics that can be used for cost calculations
export const VALID_METRICS = [
  'conversions',
  'activeUsers',
  'totalUsers',
  'newUsers',
  'sessions',
  'engagedSessions',
  'eventCount',
  'bounceRate',
  'pageViews',
  'engagementRate',
] as const;

export type ValidMetric = typeof VALID_METRICS[number];

export interface CostMetricPoint {
  date: string;
  dailyCost: number | null;
  cost_7d: number | null;
  cost_14d: number | null;
  cost_30d: number | null;
  spend: number;
  metricValue: number;
}

// Legacy alias for backward compatibility
export type CACMetricPoint = CostMetricPoint;

export interface GA4DataPoint {
  date: string;
  [metric: string]: string | number;
}

export interface SpendDataPoint {
  date: string;
  spend: number;
  platform?: string;
  accountName?: string;
  impressions?: number;
  clicks?: number;
  ctr?: number;
  cpc?: number;
  conversions?: number;
  campaignId?: string;
  campaignName?: string;
  actions?: Array<{ action_type: string; value: string }>;
}

export interface FetchAnalyticsDataOptions {
  startDate: string;
  endDate: string;
  metrics?: string[];
  propertyId?: string;
  clientId?: string;
  includeSpendData?: boolean;
  eventName?: string;
}

export interface AnalyticsDataResponse {
  ga4Data: GA4DataPoint[];
  spendData: SpendDataPoint[];
  errors?: string[];
}

/**
 * Fetch GA4 analytics data
 */
export async function fetchGA4Data(
  startDate: string,
  endDate: string,
  metrics?: string[],
  propertyId?: string,
  clientId?: string,
  eventName?: string
): Promise<{ 
  data: GA4DataPoint[]; 
  error?: string;
  errorDetails?: string;
  activationUrl?: string;
}> {
  // Note: propertyId is optional - the API route will fetch active properties from
  // google_analytics_accounts table if not provided

  try {
    const requestBody = {
      startDate,
      endDate,
      metrics,
      propertyId,
      clientId,
      eventName,
    };

    const response = await fetch('/api/ads/google-analytics/fetch-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    // Parse response regardless of status to get error details
    const data = await response.json().catch(() => ({}));

    // Handle non-OK responses (like 403, 500, etc.)
    if (!response.ok) {
      return { 
        data: [], 
        error: data.error || `API request failed with status ${response.status}`,
        errorDetails: data.errorDetails || data.error || `HTTP ${response.status}`,
        activationUrl: data.activationUrl,
      };
    }

    // Handle success: false responses (API returned error in body)
    if (!data.success) {
      // Return error with details for UI display
      return { 
        data: [], 
        error: data.error || 'Failed to fetch GA4 data',
        errorDetails: data.errorDetails || data.error,
        activationUrl: data.activationUrl,
      };
    }

    const ga4Data = data.data || [];
    
    if (ga4Data.length === 0) {
      console.warn('GA4 API returned empty data array', {
        response: data,
        requestedMetrics: metrics,
        startDate,
        endDate,
        success: data.success,
        metrics: data.metrics,
        propertiesProcessed: data.propertiesProcessed,
        errors: data.errors,
      });
    }

    return { data: ga4Data };
  } catch (error: any) {
    console.error('❌ Error fetching GA4 data:', {
      error,
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    return { 
      data: [], 
      error: error.message || 'Failed to fetch GA4 data',
      errorDetails: error.message,
    };
  }
}

/**
 * Fetch spend data from Meta and Google Ads
 */
export async function fetchSpendData(
  startDate: string,
  endDate: string,
  clientId?: string
): Promise<{ data: SpendDataPoint[]; errors?: string[] }> {
  const spendData: SpendDataPoint[] = [];
  const errors: string[] = [];

  const [metaResult, googleResult] = await Promise.allSettled([
    fetch('/api/ads/meta/fetch-spend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate, clientId }),
    }).then(r => r.json().catch(() => ({}))),
    fetch('/api/ads/fetch-spend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'google-ads', startDate, endDate, clientId }),
    }).then(r => r.json().catch(() => ({}))),
  ]);

  // Process Meta result
  if (metaResult.status === 'fulfilled') {
    const metaData = metaResult.value;
    if (metaData.success && metaData.data) {
      metaData.data.forEach((item: any) => {
        const dateStr = item.dateStart || item.dateStop || '';
        const normalizedDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
        spendData.push({
          date: normalizedDate,
          spend: item.spend || 0,
          platform: 'meta-ads',
          accountName: item.accountName,
          impressions: item.impressions || 0,
          clicks: item.clicks || 0,
          ctr: item.ctr || 0,
          cpc: item.cpc || 0,
          conversions: item.conversions || 0,
          campaignId: item.campaignId || '',
          campaignName: item.campaignName || '',
          actions: item.actions || [],
        });
      });
      if (metaData.errors?.length) {
        metaData.errors.forEach((err: any) => {
          errors.push(`Meta Ads (${err.accountName || err.accountId}): ${err.error}`);
        });
      }
    } else if (metaData.error) {
      errors.push(`Meta Ads: ${metaData.error}`);
    }
  } else {
    errors.push(`Meta Ads: ${metaResult.reason?.message || 'Unknown error'}`);
  }

  // Process Google Ads result
  if (googleResult.status === 'fulfilled') {
    const googleData = googleResult.value;
    if (googleData.success && googleData.data) {
      googleData.data.forEach((item: any) => {
        const dateStr = item.date || item.dateStart || '';
        const normalizedDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
        spendData.push({
          date: normalizedDate,
          spend: item.spend || 0,
          platform: 'google-ads',
          accountName: item.accountName,
          impressions: item.impressions || 0,
          clicks: item.clicks || 0,
          ctr: item.ctr || 0,
          cpc: item.cpc || 0,
          conversions: item.conversions || 0,
          campaignId: item.campaignId || '',
          campaignName: item.campaignName || '',
        });
      });
      if (googleData.errors?.length) {
        googleData.errors.forEach((err: any) => {
          errors.push(`Google Ads (${err.accountName || err.customerId}): ${err.error}`);
        });
      }
    } else if (googleData.error) {
      errors.push(`Google Ads: ${googleData.error}`);
    }
  } else {
    errors.push(`Google Ads: ${googleResult.reason?.message || 'Unknown error'}`);
  }

  return { data: spendData, errors: errors.length > 0 ? errors : undefined };
}

/**
 * Fetch combined analytics and spend data
 */
export async function fetchAnalyticsData(
  options: FetchAnalyticsDataOptions
): Promise<AnalyticsDataResponse> {
  const {
    startDate,
    endDate,
    metrics,
    propertyId,
    clientId,
    includeSpendData = true,
    eventName,
  } = options;

  const errors: string[] = [];

  const [ga4Result, spendResult] = await Promise.all([
    fetchGA4Data(startDate, endDate, metrics, propertyId, clientId, eventName),
    includeSpendData
      ? fetchSpendData(startDate, endDate, clientId)
      : Promise.resolve({ data: [] as SpendDataPoint[], errors: undefined }),
  ]);

  if (ga4Result.error) {
    errors.push(ga4Result.error);
  }
  if (spendResult.errors) {
    errors.push(...spendResult.errors);
  }

  return {
    ga4Data: ga4Result.data,
    spendData: spendResult.data,
    errors: errors.length > 0 ? errors : undefined,
    ga4Error: ga4Result.error,
    ga4ErrorDetails: ga4Result.errorDetails,
    ga4ActivationUrl: ga4Result.activationUrl,
  } as any;
}

export interface PlatformSyncStatus {
  connected: boolean;
  lastSyncedAt: string | null;
  refreshed: boolean;
  error?: string;
}

export interface CachedAnalyticsDataResponse extends AnalyticsDataResponse {
  syncStatus?: Record<'google-ads' | 'meta-ads' | 'google-analytics', PlatformSyncStatus>;
}

/**
 * Cache-first counterpart to fetchAnalyticsData, used by the main client
 * dashboard. Reads ad spend / GA4 data from the DB cache instead of the live
 * platform APIs on every load — the cache is kept fresh by a 6-hour cron
 * (src/app/api/cron/refresh-ad-data) and by manual "Refresh Data" actions
 * (pass `force: true`). See src/app/api/clients/[id]/analytics-data/route.ts.
 */
export async function fetchCachedAnalyticsData(
  clientId: string,
  options: { startDate: string; endDate: string; metrics?: string[]; eventName?: string; force?: boolean },
): Promise<CachedAnalyticsDataResponse> {
  const params = new URLSearchParams({ startDate: options.startDate, endDate: options.endDate });
  if (options.metrics?.length) params.set('metrics', options.metrics.join(','));
  if (options.eventName) params.set('eventName', options.eventName);
  if (options.force) params.set('force', '1');

  const response = await fetch(`/api/clients/${clientId}/analytics-data?${params.toString()}`);
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.success) {
    return {
      ga4Data: [],
      spendData: [],
      errors: [data.error || `Failed to load analytics data (${response.status})`],
    };
  }

  return {
    ga4Data: data.ga4Data || [],
    spendData: data.spendData || [],
    errors: data.errors,
    syncStatus: data.syncStatus,
  };
}

/**
 * Calculate moving average for an array of values
 * @param data Array of objects with numeric values
 * @param windowSize Number of days for the moving average window
 * @param getValue Function to extract the numeric value from each data point
 * @returns Array of moving average values (null if insufficient data for window)
 */
function calculateMovingAverage<T>(
  data: T[],
  windowSize: number,
  getValue: (item: T) => number | null
): (number | null)[] {
  return data.map((_, index) => {
    // Need at least windowSize data points ending at current index
    if (index < windowSize - 1) {
      return null;
    }

    // Get values for the window
    const windowValues: number[] = [];
    for (let i = index - windowSize + 1; i <= index; i++) {
      const value = getValue(data[i]);
      if (value !== null) {
        windowValues.push(value);
      }
    }

    // If no valid values in window, return null
    if (windowValues.length === 0) {
      return null;
    }

    // Calculate average
    const sum = windowValues.reduce((acc, val) => acc + val, 0);
    return sum / windowValues.length;
  });
}

/**
 * Result type for cost per metric calculation with error handling
 */
export interface CostCalculationResult {
  data: CostMetricPoint[];
  error?: string;
  errorDetails?: string;
}

// Legacy alias for backward compatibility
export type CACCalculationResult = CostCalculationResult;

/**
 * Calculate Cost Per Metric by merging spend and GA4 data
 * @param spendData Array of spend data points with date and spend
 * @param gaData Array of GA4 data points with date and metric values
 * @param metricKey The GA4 metric key to use for calculation (e.g., 'conversions', 'activeUsers', 'sessions')
 * @returns Object containing calculated metrics and any error information
 */
export function calculateCostPerMetric(
  spendData: Array<{ date: string; spend: number }>,
  gaData: Array<{ date: string; [key: string]: string | number }>,
  metricKey: string = 'conversions'
): CostCalculationResult {
  try {
    // Validate input data
    if (!Array.isArray(spendData)) {
      console.error('❌ Cost Calculation Error: spendData is not an array', { spendData });
      return {
        data: [],
        error: 'Invalid spend data format',
        errorDetails: 'spendData must be an array',
      };
    }

    if (!Array.isArray(gaData)) {
      console.error('❌ Cost Calculation Error: gaData is not an array', { gaData });
      return {
        data: [],
        error: 'Invalid GA4 data format',
        errorDetails: 'gaData must be an array',
      };
    }

    if (!metricKey || typeof metricKey !== 'string') {
      console.error('❌ Cost Calculation Error: invalid metricKey', { metricKey });
      return {
        data: [],
        error: 'Invalid metric key',
        errorDetails: 'metricKey must be a non-empty string',
      };
    }

    // Validate that metricKey is a supported metric
    if (!VALID_METRICS.includes(metricKey as ValidMetric)) {
      console.error('❌ Cost Calculation Error: unsupported metricKey', { metricKey, validMetrics: VALID_METRICS });
      return {
        data: [],
        error: 'Unsupported metric',
        errorDetails: `"${metricKey}" is not a supported GA4 metric. Valid metrics: ${VALID_METRICS.join(', ')}`,
      };
    }

    // Check if the metricKey exists in the GA4 data
    if (gaData.length > 0) {
      const samplePoint = gaData[0];
      const hasMetric = metricKey in samplePoint || gaData.some(point => metricKey in point);
      
      if (!hasMetric) {
        console.error('❌ Cost Calculation Error: metricKey not found in GA4 data', { 
          metricKey, 
          availableKeys: Object.keys(samplePoint).filter(k => k !== 'date'),
        });
        return {
          data: [],
          error: 'Metric not available in GA4 data',
          errorDetails: `The metric "${metricKey}" was not found in the GA4 response. This may indicate the metric is not configured in your Google Analytics property, or there is no data for this metric in the selected date range.`,
        };
      }
    }

    // Create maps for quick lookup
    const spendByDate = new Map<string, number>();
    const metricByDate = new Map<string, number>();

    // Aggregate spend by date with validation
    spendData.forEach((point, index) => {
      try {
        if (!point.date) {
          console.warn(`⚠️ Cost: Skipping spend point ${index} - missing date`);
          return;
        }
        const spend = typeof point.spend === 'number' && !isNaN(point.spend) ? point.spend : 0;
        const currentSpend = spendByDate.get(point.date) || 0;
        spendByDate.set(point.date, currentSpend + spend);
      } catch (err) {
        console.warn(`⚠️ Cost: Error processing spend point ${index}:`, err);
      }
    });

    // Aggregate metric values by date with validation
    gaData.forEach((point, index) => {
      try {
        if (!point.date) {
          console.warn(`⚠️ Cost: Skipping GA4 point ${index} - missing date`);
          return;
        }
        const rawValue = point[metricKey];
        const metricValue = typeof rawValue === 'number' && !isNaN(rawValue) 
          ? rawValue 
          : (typeof rawValue === 'string' ? parseFloat(rawValue) || 0 : 0);
        const currentMetric = metricByDate.get(point.date) || 0;
        metricByDate.set(point.date, currentMetric + metricValue);
      } catch (err) {
        console.warn(`⚠️ Cost: Error processing GA4 point ${index}:`, err);
      }
    });

    // Get all unique dates
    const allDates = new Set<string>([
      ...spendByDate.keys(),
      ...metricByDate.keys(),
    ]);

    if (allDates.size === 0) {
      console.warn('⚠️ Cost Calculation: No dates found in data');
      return {
        data: [],
        error: 'No data available',
        errorDetails: 'No valid dates found in spend or GA4 data',
      };
    }

    // Calculate daily cost for each date (intermediate step)
    const dailyData: Array<{
      date: string;
      spend: number;
      metricValue: number;
      dailyCost: number | null;
    }> = [];

    allDates.forEach(date => {
      const spend = spendByDate.get(date) || 0;
      const metricValue = metricByDate.get(date) || 0;

      // Safely calculate cost per metric, handling edge cases
      let dailyCost: number | null = null;
      if (metricValue > 0 && spend >= 0) {
        dailyCost = spend / metricValue;
        // Check for unreasonable values (potential data issues)
        if (!isFinite(dailyCost) || dailyCost < 0) {
          console.warn(`⚠️ Cost: Invalid dailyCost calculated for ${date}:`, { spend, metricValue, dailyCost });
          dailyCost = null;
        }
      }

      dailyData.push({
        date,
        spend,
        metricValue,
        dailyCost,
      });
    });

    // Sort by date before calculating moving averages
    dailyData.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate moving averages with error handling
    let cost7d: (number | null)[] = [];
    let cost14d: (number | null)[] = [];
    let cost30d: (number | null)[] = [];

    try {
      cost7d = calculateMovingAverage(dailyData, 7, item => item.dailyCost);
      cost14d = calculateMovingAverage(dailyData, 14, item => item.dailyCost);
      cost30d = calculateMovingAverage(dailyData, 30, item => item.dailyCost);
    } catch (err) {
      console.error('❌ Cost: Error calculating moving averages:', err);
      // Continue with empty moving averages rather than failing completely
      cost7d = dailyData.map(() => null);
      cost14d = dailyData.map(() => null);
      cost30d = dailyData.map(() => null);
    }

    // Build final results with moving averages
    const results: CostMetricPoint[] = dailyData.map((item, index) => ({
      date: item.date,
      spend: item.spend,
      metricValue: item.metricValue,
      dailyCost: item.dailyCost,
      cost_7d: cost7d[index] ?? null,
      cost_14d: cost14d[index] ?? null,
      cost_30d: cost30d[index] ?? null,
    }));

    return { data: results };
  } catch (error: any) {
    console.error('❌ Cost Calculation Error:', {
      error: error.message,
      stack: error.stack,
      spendDataLength: spendData?.length,
      gaDataLength: gaData?.length,
      metricKey,
    });

    return {
      data: [],
      error: 'Failed to calculate cost per metric',
      errorDetails: error.message || 'Unknown error occurred during cost calculation',
    };
  }
}

// Legacy alias for backward compatibility
export const calculateCACMetrics = calculateCostPerMetric;

/**
 * Calculate Cost Per Platform Metric using spend data native metrics.
 * Used for Meta/Google events like "cost per link click" or "cost per impression".
 * @param spendData Raw spend data points (already channel-filtered)
 * @param metricKey Standard field ('clicks', 'impressions', 'conversions') or Meta action_type
 * @param platform 'meta' or 'google'
 */
export function calculateCostPerPlatformMetric(
  spendData: SpendDataPoint[],
  metricKey: string,
  platform: 'meta' | 'google'
): CostCalculationResult {
  try {
    const platformFilter = platform === 'meta' ? 'meta-ads' : 'google-ads';
    const filteredSpend = spendData.filter(p => p.platform === platformFilter);

    if (filteredSpend.length === 0) {
      return {
        data: [],
        error: `No ${platform === 'meta' ? 'Meta Ads' : 'Google Ads'} data available`,
        errorDetails: `Connect ${platform === 'meta' ? 'a Meta Ads account' : 'a Google Ads account'} to measure platform events.`,
      };
    }

    const standardFields = ['clicks', 'impressions', 'conversions'];
    const isActionType = !standardFields.includes(metricKey);

    const spendByDate = new Map<string, number>();
    const metricByDate = new Map<string, number>();

    filteredSpend.forEach(point => {
      if (!point.date) return;
      const spend = typeof point.spend === 'number' && !isNaN(point.spend) ? point.spend : 0;
      spendByDate.set(point.date, (spendByDate.get(point.date) || 0) + spend);

      let metricValue = 0;
      if (isActionType && point.actions) {
        const action = point.actions.find(a => a.action_type === metricKey);
        metricValue = action ? parseFloat(action.value) || 0 : 0;
      } else {
        const raw = (point as any)[metricKey];
        metricValue = typeof raw === 'number' ? raw : parseFloat(raw) || 0;
      }
      metricByDate.set(point.date, (metricByDate.get(point.date) || 0) + metricValue);
    });

    const allDates = new Set<string>([...spendByDate.keys(), ...metricByDate.keys()]);

    if (allDates.size === 0) {
      return { data: [], error: 'No data available', errorDetails: 'No valid dates in spend data' };
    }

    const dailyData: Array<{ date: string; spend: number; metricValue: number; dailyCost: number | null }> = [];

    allDates.forEach(date => {
      const spend = spendByDate.get(date) || 0;
      const metricValue = metricByDate.get(date) || 0;
      let dailyCost: number | null = null;
      if (metricValue > 0 && spend >= 0) {
        dailyCost = spend / metricValue;
        if (!isFinite(dailyCost) || dailyCost < 0) dailyCost = null;
      }
      dailyData.push({ date, spend, metricValue, dailyCost });
    });

    dailyData.sort((a, b) => a.date.localeCompare(b.date));

    const cost7d = calculateMovingAverage(dailyData, 7, item => item.dailyCost);
    const cost14d = calculateMovingAverage(dailyData, 14, item => item.dailyCost);
    const cost30d = calculateMovingAverage(dailyData, 30, item => item.dailyCost);

    const results: CostMetricPoint[] = dailyData.map((item, index) => ({
      date: item.date,
      spend: item.spend,
      metricValue: item.metricValue,
      dailyCost: item.dailyCost,
      cost_7d: cost7d[index] ?? null,
      cost_14d: cost14d[index] ?? null,
      cost_30d: cost30d[index] ?? null,
    }));

    return { data: results };
  } catch (error: any) {
    return {
      data: [],
      error: 'Failed to calculate cost per platform metric',
      errorDetails: error.message,
    };
  }
}

/**
 * Extract available platform event options from loaded spend data.
 * Returns Meta and Google metrics that have actual data in the spend points.
 */
export function extractPlatformEventOptions(spendData: SpendDataPoint[]): PlatformEventOption[] {
  const options: PlatformEventOption[] = [];

  const metaSpend = spendData.filter(p => p.platform === 'meta-ads');
  if (metaSpend.length > 0) {
    const totalClicks = metaSpend.reduce((s, p) => s + (p.clicks || 0), 0);
    const totalImpressions = metaSpend.reduce((s, p) => s + (p.impressions || 0), 0);
    const totalConversions = metaSpend.reduce((s, p) => s + (p.conversions || 0), 0);

    if (totalClicks > 0) options.push({ source: 'meta', key: 'clicks', label: 'Clicks', count: totalClicks });
    if (totalImpressions > 0) options.push({ source: 'meta', key: 'impressions', label: 'Impressions', count: totalImpressions });
    if (totalConversions > 0) options.push({ source: 'meta', key: 'conversions', label: 'Conversions', count: totalConversions });

    // Extract action types with counts
    const actionCounts = new Map<string, number>();
    metaSpend.forEach(point => {
      point.actions?.forEach(action => {
        const val = parseFloat(action.value) || 0;
        actionCounts.set(action.action_type, (actionCounts.get(action.action_type) || 0) + val);
      });
    });

    actionCounts.forEach((count, actionType) => {
      if (count > 0) {
        options.push({
          source: 'meta',
          key: actionType,
          label: getMetaActionLabel(actionType),
          count: Math.round(count),
        });
      }
    });
  }

  const googleSpend = spendData.filter(p => p.platform === 'google-ads');
  if (googleSpend.length > 0) {
    const totalClicks = googleSpend.reduce((s, p) => s + (p.clicks || 0), 0);
    const totalImpressions = googleSpend.reduce((s, p) => s + (p.impressions || 0), 0);
    const totalConversions = googleSpend.reduce((s, p) => s + (p.conversions || 0), 0);

    if (totalClicks > 0) options.push({ source: 'google', key: 'clicks', label: 'Clicks', count: totalClicks });
    if (totalImpressions > 0) options.push({ source: 'google', key: 'impressions', label: 'Impressions', count: totalImpressions });
    if (totalConversions > 0) options.push({ source: 'google', key: 'conversions', label: 'Conversions', count: totalConversions });
  }

  return options;
}

