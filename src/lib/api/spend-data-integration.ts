import { MediaChannel, TimeFrame } from "../types/media-plan";
import { parseISO, format, isWithinInterval } from "date-fns";

/**
 * API response types with performance metrics
 */
interface MetaAdsSpendData {
  accountId: string;
  accountName: string;
  campaignId: string;
  campaignName: string;
  dateStart: string;
  dateStop: string;
  spend: number;
  currency: string;
  // Performance metrics
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
}

interface GoogleAdsSpendData {
  customerId: string;
  accountName: string;
  campaignId: string;
  campaignName: string;
  date: string;
  spend: number;
  currency: string;
  // Performance metrics
  impressions: number;
  clicks: number;
  ctr: number;
  averageCpc: number;
  conversions: number;
}

interface SpendApiResponse {
  success: boolean;
  platform: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  data: (MetaAdsSpendData | GoogleAdsSpendData)[];
  accountsProcessed?: number;
  errors?: Array<{
    accountId?: string;
    customerId?: string;
    accountName: string;
    error: string;
  }>;
  error?: string;
}

/**
 * Result types for loading states and errors
 */
export interface FetchChannelSpendResult {
  success: boolean;
  channel: MediaChannel;
  updatedTimeFrames?: TimeFrame[];
  error?: string;
  loading?: boolean;
}

export interface SyncAllChannelsResult {
  success: boolean;
  channels: MediaChannel[];
  errors: Array<{
    channelId: string;
    channelName: string;
    error: string;
  }>;
}

/**
 * Fetch spend data for a single channel from the appropriate ad platform API
 */
export async function fetchChannelSpendData(
  channel: MediaChannel,
  startDate: string,
  endDate: string
): Promise<FetchChannelSpendResult> {
  // Skip channels that don't have ad platform integration
  if (
    channel.platformType === "organic" ||
    channel.platformType === "other" ||
    !channel.adAccountId
  ) {
    return {
      success: true,
      channel,
      updatedTimeFrames: channel.timeFrames, // No changes for non-integrated channels
    };
  }

  try {
    let apiUrl: string;
    let requestBody: Record<string, string>;

    // Determine which API endpoint to call based on platform type
    if (channel.platformType === "meta-ads") {
      apiUrl = "/api/ads/meta/fetch-spend";
      requestBody = {
        startDate,
        endDate,
      };
    } else if (channel.platformType === "google-ads") {
      apiUrl = "/api/ads/fetch-spend";
      requestBody = {
        platform: "google-ads",
        startDate,
        endDate,
      };
    } else {
      return {
        success: false,
        channel,
        error: `Unsupported platform type: ${channel.platformType}`,
      };
    }

    // Make API request
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `API request failed with status ${response.status}`
      );
    }

    const data: SpendApiResponse = await response.json();

    if (!data.success) {
      throw new Error(data.error || "API returned unsuccessful response");
    }

    // Transform API response to TimeFrame format
    const updatedTimeFrames = transformSpendDataToTimeFrames(
      data.data,
      channel.timeFrames,
      channel.platformType,
      channel.adAccountId
    );

    return {
      success: true,
      channel,
      updatedTimeFrames,
    };
  } catch (error: any) {
    console.error(`Error fetching spend for channel ${channel.name}:`, error);
    return {
      success: false,
      channel,
      error: error.message || "Failed to fetch spend data",
    };
  }
}

/**
 * Interface for aggregated metrics per timeframe
 */
interface TimeFrameMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  reach: number; // Meta only
  frequency: number; // Meta only
}

/**
 * Transform API spend data into TimeFrame format with performance metrics
 * Maps spend data to the correct time periods (months or weeks) and aggregates metrics
 */
function transformSpendDataToTimeFrames(
  apiData: (MetaAdsSpendData | GoogleAdsSpendData)[],
  existingTimeFrames: TimeFrame[],
  platformType: "meta-ads" | "google-ads",
  adAccountId: string
): TimeFrame[] {
  // Filter data for the specific ad account
  const filteredData = apiData.filter((item) => {
    if (platformType === "meta-ads") {
      return (item as MetaAdsSpendData).accountId === adAccountId;
    } else {
      return (item as GoogleAdsSpendData).customerId === adAccountId;
    }
  });

  // Create a map of timeframe periods to accumulated metrics
  const metricsByPeriod = new Map<string, TimeFrameMetrics>();

  // Process each spend data point and aggregate metrics
  for (const item of filteredData) {
    let itemDate: Date;

    // Extract date from the API response
    if (platformType === "meta-ads") {
      const metaItem = item as MetaAdsSpendData;
      itemDate = parseISO(metaItem.dateStart);
    } else {
      const googleItem = item as GoogleAdsSpendData;
      itemDate = parseISO(googleItem.date);
    }

    // Find which timeframe this spend belongs to
    for (const timeFrame of existingTimeFrames) {
      const timeFrameStart = parseISO(timeFrame.startDate);
      const timeFrameEnd = parseISO(timeFrame.endDate);

      if (
        isWithinInterval(itemDate, { start: timeFrameStart, end: timeFrameEnd })
      ) {
        // Get or initialize metrics for this period
        const currentMetrics = metricsByPeriod.get(timeFrame.period) || {
          spend: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          reach: 0,
          frequency: 0,
        };

        // Aggregate metrics based on platform type
        if (platformType === "meta-ads") {
          const metaItem = item as MetaAdsSpendData;
          currentMetrics.spend += metaItem.spend;
          currentMetrics.impressions += metaItem.impressions || 0;
          currentMetrics.clicks += metaItem.clicks || 0;
          currentMetrics.reach += metaItem.reach || 0;
          // For frequency, we'll calculate weighted average later
          currentMetrics.frequency += (metaItem.frequency || 0) * (metaItem.impressions || 1);
        } else {
          const googleItem = item as GoogleAdsSpendData;
          currentMetrics.spend += googleItem.spend;
          currentMetrics.impressions += googleItem.impressions || 0;
          currentMetrics.clicks += googleItem.clicks || 0;
          currentMetrics.conversions += googleItem.conversions || 0;
        }

        metricsByPeriod.set(timeFrame.period, currentMetrics);
        break; // Move to next item once we've found the matching timeframe
      }
    }
  }

  // Update timeframes with actual spend data and performance metrics
  return existingTimeFrames.map((timeFrame) => {
    const metrics = metricsByPeriod.get(timeFrame.period);

    if (!metrics) {
      // No data for this timeframe
      return {
        ...timeFrame,
        actual: 0,
      };
    }

    // Calculate derived metrics
    const ctr = metrics.impressions > 0
      ? metrics.clicks / metrics.impressions
      : 0;

    const cpc = metrics.clicks > 0
      ? metrics.spend / metrics.clicks
      : 0;

    const cpm = metrics.impressions > 0
      ? (metrics.spend / metrics.impressions) * 1000
      : 0;

    // For Meta Ads, calculate weighted average frequency
    const frequency = platformType === "meta-ads" && metrics.impressions > 0
      ? metrics.frequency / metrics.impressions
      : undefined;

    // Build the updated timeframe with metrics
    const updatedTimeFrame: TimeFrame = {
      ...timeFrame,
      actual: metrics.spend,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      ctr: ctr,
      cpc: cpc,
    };

    // Add platform-specific metrics
    if (platformType === "meta-ads") {
      updatedTimeFrame.reach = metrics.reach;
      updatedTimeFrame.cpm = cpm;
      updatedTimeFrame.frequency = frequency;
    } else {
      updatedTimeFrame.conversions = metrics.conversions;
    }

    return updatedTimeFrame;
  });
}

/**
 * Sync spend data for all channels
 * Fetches spend data for each channel and returns updated channels array
 */
export async function syncAllChannelSpend(
  channels: MediaChannel[],
  startDate: string,
  endDate: string
): Promise<SyncAllChannelsResult> {
  const errors: Array<{
    channelId: string;
    channelName: string;
    error: string;
  }> = [];

  const updatedChannels: MediaChannel[] = [];

  // Fetch spend data for each channel
  for (const channel of channels) {
    const result = await fetchChannelSpendData(channel, startDate, endDate);

    if (result.success && result.updatedTimeFrames) {
      // Update channel with new spend data
      updatedChannels.push({
        ...channel,
        timeFrames: result.updatedTimeFrames,
      });
    } else {
      // Keep original channel data and log error
      updatedChannels.push(channel);
      if (result.error) {
        errors.push({
          channelId: channel.id,
          channelName: channel.name,
          error: result.error,
        });
      }
    }
  }

  return {
    success: errors.length === 0,
    channels: updatedChannels,
    errors,
  };
}

/**
 * Sync spend data for multiple channels in parallel
 * More efficient for bulk updates
 */
export async function syncAllChannelSpendParallel(
  channels: MediaChannel[],
  startDate: string,
  endDate: string
): Promise<SyncAllChannelsResult> {
  const errors: Array<{
    channelId: string;
    channelName: string;
    error: string;
  }> = [];

  // Fetch all channels in parallel
  const results = await Promise.all(
    channels.map((channel) =>
      fetchChannelSpendData(channel, startDate, endDate)
    )
  );

  // Process results
  const updatedChannels = results.map((result, index) => {
    const channel = channels[index];

    if (result.success && result.updatedTimeFrames) {
      return {
        ...channel,
        timeFrames: result.updatedTimeFrames,
      };
    } else {
      if (result.error) {
        errors.push({
          channelId: channel.id,
          channelName: channel.name,
          error: result.error,
        });
      }
      return channel;
    }
  });

  return {
    success: errors.length === 0,
    channels: updatedChannels,
    errors,
  };
}

/**
 * Helper to format date for API calls
 */
export function formatDateForApi(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

