/**
 * Utility functions for fetching and combining GA4 analytics data with spend data
 */

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
  console.log('');
  console.log('════════════════════════════════════════════════════════');
  console.log('🔵 fetchGA4Data CALLED');
  console.log('════════════════════════════════════════════════════════');
  console.log('Start Date:', startDate);
  console.log('End Date:', endDate);
  console.log('Metrics:', metrics);
  console.log('Property ID:', propertyId || '(will use active properties from database)');
  console.log('Client ID:', clientId);
  console.log('Event Name:', eventName || '(all events)');
  console.log('════════════════════════════════════════════════════════');
  console.log('');

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

    console.log('🔵 Making GA4 API request to:', '/api/ads/google-analytics/fetch-data');
    console.log('🔵 Request body:', JSON.stringify(requestBody, null, 2));

    const response = await fetch('/api/ads/google-analytics/fetch-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('🔵 GA4 API response received:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
    });

    // Parse response regardless of status to get error details
    const data = await response.json().catch(() => ({}));

    console.log('');
    console.log('════════════════════════════════════════════════════════');
    console.log('📊 GA4 FETCH RESPONSE DEBUG');
    console.log('════════════════════════════════════════════════════════');
    console.log('Response status:', response.status);
    console.log('Response OK:', response.ok);
    console.log('Data success:', data.success);
    console.log('Data length:', data.data?.length || 0);
    console.log('First data point:', JSON.stringify(data.data?.[0], null, 2));
    console.log('Metrics requested:', data.metrics);
    console.log('Properties processed:', data.propertiesProcessed);
    console.log('Errors:', data.errors);
    console.log('Error message:', data.error);
    console.log('Error details:', data.errorDetails);
    console.log('Activation URL:', data.activationUrl);
    console.log('Full response data:', JSON.stringify(data, null, 2));
    console.log('════════════════════════════════════════════════════════');
    console.log('');

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
    } else {
      console.log('GA4 data retrieved successfully:', {
        dataPoints: ga4Data.length,
        samplePoint: ga4Data[0],
        metricsInData: ga4Data[0] ? Object.keys(ga4Data[0]).filter(k => k !== 'date' && k !== 'propertyId' && k !== 'propertyName') : [],
      });
    }

    console.log('✅ fetchGA4Data success:', {
      dataPoints: ga4Data.length,
      hasError: false,
    });

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

  // Fetch Meta Ads spend
  try {
    const metaResponse = await fetch('/api/ads/meta/fetch-spend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        clientId,
      }),
    });

    if (metaResponse.ok) {
      const metaData = await metaResponse.json();
      if (metaData.success && metaData.data) {
        metaData.data.forEach((item: any) => {
          // Meta returns dateStart/dateStop, use dateStart
          // Normalize date format to YYYY-MM-DD
          const dateStr = item.dateStart || item.dateStop || '';
          const normalizedDate = dateStr.includes('T') 
            ? dateStr.split('T')[0] 
            : dateStr;
          
          spendData.push({
            date: normalizedDate,
            spend: item.spend || 0,
            platform: 'meta-ads',
            accountName: item.accountName,
          });
        });
      }
    }
  } catch (error: any) {
    errors.push(`Meta Ads: ${error.message}`);
  }

  // Fetch Google Ads spend
  try {
    const googleResponse = await fetch('/api/ads/fetch-spend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        platform: 'google-ads',
        startDate,
        endDate,
        clientId,
      }),
    });

    if (googleResponse.ok) {
      const googleData = await googleResponse.json();
      if (googleData.success && googleData.data) {
        googleData.data.forEach((item: any) => {
          // Normalize date format to YYYY-MM-DD
          const dateStr = item.date || item.dateStart || '';
          const normalizedDate = dateStr.includes('T') 
            ? dateStr.split('T')[0] 
            : dateStr;
          
          spendData.push({
            date: normalizedDate,
            spend: item.spend || 0,
            platform: 'google-ads',
            accountName: item.accountName,
          });
        });
      }
    }
  } catch (error: any) {
    errors.push(`Google Ads: ${error.message}`);
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

  // Fetch GA4 data
  const ga4Result = await fetchGA4Data(
    startDate,
    endDate,
    metrics,
    propertyId,
    clientId,
    eventName
  );

  if (ga4Result.error) {
    errors.push(ga4Result.error);
  }
  
  // Store GA4-specific error details if API not enabled
  const ga4Error = ga4Result.error;
  const ga4ErrorDetails = ga4Result.errorDetails;
  const ga4ActivationUrl = ga4Result.activationUrl;

  // Fetch spend data if requested
  let spendData: SpendDataPoint[] = [];
  if (includeSpendData) {
    const spendResult = await fetchSpendData(startDate, endDate, clientId);
    spendData = spendResult.data;
    if (spendResult.errors) {
      errors.push(...spendResult.errors);
    }
  }

  return {
    ga4Data: ga4Result.data,
    spendData,
    errors: errors.length > 0 ? errors : undefined,
    ga4Error: ga4Error,
    ga4ErrorDetails: ga4ErrorDetails,
    ga4ActivationUrl: ga4ActivationUrl,
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

    console.log('📊 Cost Per Metric Calculation starting:', {
      spendDataPoints: spendData.length,
      gaDataPoints: gaData.length,
      metricKey,
    });

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

    console.log('✅ Cost Per Metric Calculation complete:', {
      dataPoints: results.length,
      metricKey,
      daysWithCost: results.filter(r => r.dailyCost !== null).length,
      daysWithoutCost: results.filter(r => r.dailyCost === null).length,
    });

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

