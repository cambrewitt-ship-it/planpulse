/**
 * Utility functions for fetching and combining GA4 analytics data with spend data
 */

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
  clientId?: string
): Promise<{ 
  data: GA4DataPoint[]; 
  error?: string;
  errorDetails?: string;
  activationUrl?: string;
}> {
  console.log('🔵 fetchGA4Data called:', {
    startDate,
    endDate,
    metrics,
    propertyId,
    clientId,
  });

  try {
    const requestBody = {
      startDate,
      endDate,
      metrics,
      propertyId,
      clientId,
    };

    console.log('🔵 Making GA4 API request:', {
      url: '/api/ads/google-analytics/fetch-data',
      body: requestBody,
    });

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

    console.log('GA4 fetch response:', {
      status: response.status,
      ok: response.ok,
      success: data.success,
      dataLength: data.data?.length || 0,
      dataSample: data.data?.[0],
      metrics: data.metrics,
      errors: data.errors,
      error: data.error,
      activationUrl: data.activationUrl,
    });

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
  } = options;

  const errors: string[] = [];

  // Fetch GA4 data
  const ga4Result = await fetchGA4Data(
    startDate,
    endDate,
    metrics,
    propertyId,
    clientId
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

