import { MediaChannel, TimeFrame } from "../types/media-plan";
import { parseISO, format, isWithinInterval } from "date-fns";

/**
 * API response types
 */
interface MetaAdsSpendData {
  accountId: string;
  accountName: string;
  dateStart: string;
  dateStop: string;
  spend: number;
  currency: string;
}

interface GoogleAdsSpendData {
  customerId: string;
  accountName: string;
  campaignId: string;
  campaignName: string;
  date: string;
  spend: number;
  currency: string;
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
 * Transform API spend data into TimeFrame format
 * Maps spend data to the correct time periods (months or weeks)
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

  // Create a map of timeframe periods to accumulated spend
  const spendByPeriod = new Map<string, number>();

  // Process each spend data point
  for (const item of filteredData) {
    let itemDate: Date;

    // Extract date from the API response
    if (platformType === "meta-ads") {
      const metaItem = item as MetaAdsSpendData;
      // Use the start date of the period
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
        const currentSpend = spendByPeriod.get(timeFrame.period) || 0;
        spendByPeriod.set(timeFrame.period, currentSpend + item.spend);
        break; // Move to next item once we've found the matching timeframe
      }
    }
  }

  // Update timeframes with actual spend data
  return existingTimeFrames.map((timeFrame) => ({
    ...timeFrame,
    actual: spendByPeriod.get(timeFrame.period) || 0,
  }));
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

