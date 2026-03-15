'use client';

import MediaChannelCard from './MediaChannelCard';
import { Facebook, Search, Linkedin, Music, Instagram } from 'lucide-react';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, parseISO, isWithinInterval, addDays, startOfWeek, addWeeks, differenceInWeeks } from 'date-fns';
import { useState, useEffect } from 'react';
import { MediaPlanChannel, MediaFlight } from '@/components/media-plan-builder/media-plan-grid';
import { getChannelLogo } from '@/lib/utils/channel-icons';

interface ActivePlan {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  channels: Array<{
    id: string;
    channel: string;
    detail: string;
    type: string;
    weekly_plans: Array<{
      id: string;
      week_commencing: string;
      week_number: number;
      budget_planned: number;
      budget_actual: number;
      posts_planned: number;
      posts_actual: number;
    }>;
  }>;
}

interface MediaChannelsProps {
  activePlan: ActivePlan | null;
  clientId?: string;
  mediaPlanBuilderChannels?: MediaPlanChannel[];
  commission?: number;
  actionPointsRefetchTrigger?: number;
  onActionPointsChange?: () => void;
  onTotalActualSpendChange?: (totalActualSpend: number) => void;
}

export default function MediaChannels({ activePlan, clientId, mediaPlanBuilderChannels = [], commission = 0, actionPointsRefetchTrigger = 0, onActionPointsChange, onTotalActualSpendChange }: MediaChannelsProps) {
  const [liveSpendData, setLiveSpendData] = useState<Record<string, any[]>>({});
  const [fetchingSpend, setFetchingSpend] = useState<Record<string, boolean>>({});
  const [spendErrors, setSpendErrors] = useState<Record<string, string>>({});
  const [actionPoints, setActionPoints] = useState<Record<string, any[]>>({});
  const [connectedAccounts, setConnectedAccounts] = useState<Record<string, string | null>>({});
  const [connectedAccountIds, setConnectedAccountIds] = useState<Record<string, string | null>>({});
  const [selectedMonths, setSelectedMonths] = useState<Record<string, Date>>({});
  const [selectedCampaigns, setSelectedCampaigns] = useState<Record<string, string>>({}); // channelId -> campaignId ('all' means all campaigns)
  const [channelActualSpend, setChannelActualSpend] = useState<Record<string, number>>({}); // channelId -> actualSpend

  // Handle actual spend change from a channel card
  const handleActualSpendChange = (channelId: string, actualSpend: number) => {
    setChannelActualSpend(prev => ({
      ...prev,
      [channelId]: actualSpend,
    }));
  };

  // Calculate total actual spend whenever channelActualSpend changes and notify parent
  useEffect(() => {
    const total = Object.values(channelActualSpend).reduce((sum, spend) => sum + (spend || 0), 0);
    onTotalActualSpendChange?.(total);
  }, [channelActualSpend, onTotalActualSpendChange]);

  // Helper function to find the earliest month with budget > 0 for a channel
  const findEarliestMonthWithBudget = (channelId: string): Date | null => {
    // First, check mediaPlanBuilderChannels (most reliable source)
    if (mediaPlanBuilderChannels && mediaPlanBuilderChannels.length > 0) {
      const channel = mediaPlanBuilderChannels.find(c => c.id === channelId);
      if (channel && channel.flights) {
        const monthsWithBudget: Array<{ year: number; month: number; key: string }> = [];
        
        // Collect all months with budget > 0 from all flights
        channel.flights.forEach((flight) => {
          if (flight.monthlySpend) {
            Object.entries(flight.monthlySpend).forEach(([monthKey, amount]) => {
              if (amount && amount > 0) {
                // Parse month key (format: "2024-12" or "2024-1")
                const parts = monthKey.split('-');
                if (parts.length === 2) {
                  const year = parseInt(parts[0], 10);
                  const month = parseInt(parts[1], 10);
                  if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                    monthsWithBudget.push({ year, month, key: monthKey });
                  }
                }
              }
            });
          }
        });
        
        // Find the earliest month
        if (monthsWithBudget.length > 0) {
          monthsWithBudget.sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            return a.month - b.month;
          });
          
          const earliest = monthsWithBudget[0];
          return new Date(earliest.year, earliest.month - 1, 1); // month is 0-indexed in Date
        }
      }
    }
    
    // Fallback: check activePlan channels (from weekly plans)
    if (activePlan && activePlan.channels) {
      const channel = activePlan.channels.find(c => c.id === channelId);
      if (channel && channel.weekly_plans) {
        const monthsWithBudget: Array<{ year: number; month: number }> = [];
        
        channel.weekly_plans.forEach((wp) => {
          if (wp.budget_planned && wp.budget_planned > 0 && wp.week_commencing) {
            const weekStart = parseISO(wp.week_commencing);
            const year = weekStart.getFullYear();
            const month = weekStart.getMonth() + 1;
            
            // Check if this month is already in the list
            const exists = monthsWithBudget.some(m => m.year === year && m.month === month);
            if (!exists) {
              monthsWithBudget.push({ year, month });
            }
          }
        });
        
        if (monthsWithBudget.length > 0) {
          monthsWithBudget.sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            return a.month - b.month;
          });
          
          const earliest = monthsWithBudget[0];
          return new Date(earliest.year, earliest.month - 1, 1);
        }
      }
    }
    
    return null;
  };

  // Initialize selectedMonths with current month for each channel
  useEffect(() => {
    if (!mediaPlanBuilderChannels && !activePlan) return;
    
    const initialSelectedMonths: Record<string, Date> = {};
    const currentMonth = startOfMonth(new Date()); // Default to current month
    
    // Get all channel IDs
    const channelIds: string[] = [];
    if (mediaPlanBuilderChannels && mediaPlanBuilderChannels.length > 0) {
      mediaPlanBuilderChannels.forEach(ch => {
        if (ch.id) channelIds.push(ch.id);
      });
    } else if (activePlan && activePlan.channels) {
      activePlan.channels.forEach(ch => {
        if (ch.id) channelIds.push(ch.id);
      });
    }
    
    // Set current month as default for each channel
    channelIds.forEach(channelId => {
      initialSelectedMonths[channelId] = currentMonth;
    });
    
    // Update state if we found any channels, preserving existing selections
    if (Object.keys(initialSelectedMonths).length > 0) {
      setSelectedMonths(prev => {
        const updated = { ...prev };
        // Only set if not already set (preserve user selection)
        Object.entries(initialSelectedMonths).forEach(([channelId, month]) => {
          if (!updated[channelId]) {
            updated[channelId] = month;
          }
        });
        return updated;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaPlanBuilderChannels, activePlan?.id]); // Only run when channels change

  // Helper function to apply commission to a budget amount
  // Commission is a percentage (e.g., 20 means 20%)
  // Returns the amount after commission is deducted
  const applyCommission = (amount: number): number => {
    if (!amount || isNaN(amount) || amount <= 0) return 0;
    if (commission <= 0) return amount;
    // If commission is 20%, we show 80% of the original (100% - 20%)
    const commissionMultiplier = (100 - commission) / 100;
    const result = amount * commissionMultiplier;
    return isNaN(result) ? 0 : result;
  };

  // Helper function to calculate total monthly spend across all Media Plan Builder channels for a given month
  const calculateTotalMonthlySpendForMonth = (month: Date): number => {
    if (!mediaPlanBuilderChannels || mediaPlanBuilderChannels.length === 0) {
      return 0;
    }

    const year = month.getFullYear();
    const monthNum = month.getMonth() + 1;
    const getMonthKeyFormat = `${year}-${monthNum}`; // e.g., "2024-12" or "2024-1"
    const paddedMonthKey = `${year}-${String(monthNum).padStart(2, '0')}`; // e.g., "2024-12" or "2024-01"

    let totalSpend = 0;

    mediaPlanBuilderChannels.forEach((channel) => {
      if (channel.flights) {
        channel.flights.forEach((flight) => {
          if (flight.monthlySpend) {
            // Try all possible month key formats
            let spend = 0;
            if (flight.monthlySpend[getMonthKeyFormat] !== undefined) {
              spend = flight.monthlySpend[getMonthKeyFormat];
            } else if (flight.monthlySpend[paddedMonthKey] !== undefined) {
              spend = flight.monthlySpend[paddedMonthKey];
            } else {
              // Check all keys and try to match by normalizing
              Object.entries(flight.monthlySpend).forEach(([key, value]) => {
                const normalizedKey = key.includes('-') 
                  ? key.split('-').map((part, idx) => idx === 1 ? part.padStart(2, '0') : part).join('-')
                  : key;
                const unpaddedKey = normalizedKey.replace(/-0+(\d)$/, '-$1');
                
                if (normalizedKey === paddedMonthKey || 
                    normalizedKey === getMonthKeyFormat ||
                    unpaddedKey === getMonthKeyFormat ||
                    key === getMonthKeyFormat ||
                    key === paddedMonthKey) {
                  spend = value as number;
                }
              });
            }
            
            if (spend && !isNaN(spend)) {
              totalSpend += spend;
            }
          }
        });
      }
    });

    // Apply commission to match what's shown in the media plan builder
    return applyCommission(totalSpend);
  };

  // Map channel names to icons
  const getChannelIcon = (channelName: string) => {
    return getChannelLogo(channelName, "w-6 h-6");
  };

  // Get display name for channel
  const getChannelDisplayName = (channelName: string, detail: string) => {
    const lowerName = channelName.toLowerCase();
    if (lowerName.includes('facebook') && lowerName.includes('instagram')) {
      return 'Meta Ads';
    }
    if (lowerName.includes('facebook') || lowerName.includes('meta')) {
      return 'Meta Ads';
    }
    if (lowerName.includes('google')) {
      return 'Google Ads';
    }
    if (lowerName.includes('linkedin')) {
      return 'LinkedIn Ads';
    }
    if (lowerName.includes('tiktok')) {
      return 'TikTok Ads';
    }
    return channelName;
  };

  // Check if channel is Meta Ads
  const isMetaAdsChannel = (channelName: string) => {
    const lowerName = channelName.toLowerCase();
    return lowerName.includes('facebook') || lowerName.includes('meta');
  };

  // Check if channel is Google Ads
  const isGoogleAdsChannel = (channelName: string) => {
    const lowerName = channelName.toLowerCase();
    return lowerName.includes('google');
  };

  // Fetch live spend data for Meta Ads or Google Ads
  const fetchLiveSpendData = async (channelId: string, channelName: string, month?: Date) => {
    console.log(`[MediaChannels] fetchLiveSpendData called:`, { channelId, channelName, month });
    
    const isMeta = isMetaAdsChannel(channelName);
    const isGoogle = isGoogleAdsChannel(channelName);
    
    console.log(`[MediaChannels] Channel detection:`, { isMeta, isGoogle, channelName });
    
    if (!isMeta && !isGoogle) {
      console.log(`[MediaChannels] Channel is neither Meta nor Google, skipping fetch`);
      return;
    }

    console.log(`[MediaChannels] Starting fetch for ${isGoogle ? 'Google' : 'Meta'} Ads...`);
    setFetchingSpend(prev => ({ ...prev, [channelId]: true }));
    setSpendErrors(prev => ({ ...prev, [channelId]: '' }));

    try {
      const targetMonth = month || new Date();
      const monthStart = startOfMonth(targetMonth);
      const monthEnd = endOfMonth(targetMonth);

      const startDate = format(monthStart, 'yyyy-MM-dd');
      const endDate = format(monthEnd, 'yyyy-MM-dd');
      
      console.log(`[MediaChannels] Date range calculation:`, {
        targetMonth,
        monthStart,
        monthEnd,
        startDate,
        endDate,
        channelName
      });

      let response;
      if (isMeta) {
        response = await fetch('/api/ads/meta/fetch-spend', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            platform: 'meta-ads',
            startDate,
            endDate,
            clientId: clientId || undefined,
          }),
        });
      } else if (isGoogle) {
        response = await fetch('/api/ads/fetch-spend', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            platform: 'google-ads',
            startDate,
            endDate,
            clientId: clientId || undefined,
          }),
        });
      } else {
        return;
      }

      console.log(`[MediaChannels] API response status:`, response.status, response.statusText);
      
      if (!response.ok) {
        let errorData: any = {};
        try {
          const responseText = await response.text();
          if (responseText) {
            try {
              errorData = JSON.parse(responseText);
            } catch {
              // Not JSON, use text as error message
              errorData = { error: responseText.substring(0, 500) };
            }
          }
        } catch (e) {
          errorData = { error: 'Failed to read error response' };
        }
        
        // Extract error message from various possible fields
        const errorMessage = errorData.error || 
                            errorData.details || 
                            errorData.message || 
                            (Array.isArray(errorData.errors) && errorData.errors.length > 0 
                              ? errorData.errors.map((e: any) => e.message || e).join(', ')
                              : null) ||
                            `HTTP ${response.status}: Failed to fetch spend data`;
        
        console.error(`[MediaChannels] API error:`, { 
          status: response.status, 
          statusText: response.statusText,
          errorData 
        });
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log(`[MediaChannels] Raw API response:`, data);
      
      console.log(`[MediaChannels] Fetch spend response for ${channelName}:`, {
        success: data.success,
        dataLength: data.data?.length || 0,
        data: data.data?.slice(0, 3), // Log first 3 items for debugging
        error: data.error,
        platform: data.platform
      });
      
      if (data.success) {
        // Set data even if empty (empty array means no spend, not an error)
        setLiveSpendData(prev => ({ ...prev, [channelId]: data.data || [] }));
        
        if (data.data && data.data.length === 0) {
          console.log(`[MediaChannels] No spend data found for ${channelName} in the requested date range`);
          
          // Check if there are errors that explain why data is empty
          if (data.errors && data.errors.length > 0) {
            const errorMessages = data.errors.map((e: any) => e.error || e.message).join('; ');
            console.warn(`[MediaChannels] Errors while fetching spend data:`, errorMessages);
            // Set error message so user knows why data is missing
            setSpendErrors(prev => ({ ...prev, [channelId]: errorMessages }));
          }
        }
      } else {
        // API returned an error response
        const errorMsg = data.error || data.errors?.[0]?.error || 'Failed to fetch spend data';
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error(`Error fetching spend data for ${channelName}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setSpendErrors(prev => ({ ...prev, [channelId]: errorMessage }));
    } finally {
      setFetchingSpend(prev => ({ ...prev, [channelId]: false }));
    }
  };

  // Fetch action points for a channel type
  const fetchActionPoints = async (channelType: string) => {
    try {
      const params = new URLSearchParams({ channel_type: channelType });
      if (clientId) params.set('client_id', clientId);
      const response = await fetch(`/api/action-points?${params.toString()}`);
      if (!response.ok) {
        console.error(`Failed to fetch action points for channel type ${channelType}`);
        return;
      }
      const { data } = await response.json();
      setActionPoints(prev => ({ ...prev, [channelType]: data || [] }));
    } catch (error) {
      console.error(`Error fetching action points for channel type ${channelType}:`, error);
    }
  };

  // Fetch connected account for a channel
  const fetchConnectedAccount = async (channelType: string) => {
    if (!clientId) {
      console.log('fetchConnectedAccount: No clientId provided for channelType:', channelType);
      return;
    }
    
    try {
      console.log('fetchConnectedAccount: Fetching for channelType:', channelType, 'clientId:', clientId);
      const response = await fetch(
        `/api/connections/channel-account?clientId=${encodeURIComponent(clientId)}&channelType=${encodeURIComponent(channelType)}`
      );
      if (!response.ok) {
        console.error(`Failed to fetch connected account for channel type ${channelType}:`, response.status, response.statusText);
        return;
      }
      const { accountName, accountId, hasConnection } = await response.json();
      console.log('fetchConnectedAccount: Response for', channelType, ':', { accountName, accountId, hasConnection });
      setConnectedAccounts(prev => ({ ...prev, [channelType]: hasConnection ? (accountName || null) : null }));
      setConnectedAccountIds(prev => ({ ...prev, [channelType]: hasConnection ? (accountId || null) : null }));
    } catch (error) {
      console.error(`Error fetching connected account for channel type ${channelType}:`, error);
    }
  };

  // Auto-fetch spend data and action points for channels on mount
  useEffect(() => {
    console.log('MediaChannels useEffect: Running with', {
      hasMediaPlanBuilderChannels: !!mediaPlanBuilderChannels && mediaPlanBuilderChannels.length > 0,
      mediaPlanBuilderChannelsLength: mediaPlanBuilderChannels?.length || 0,
      hasActivePlan: !!activePlan && !!activePlan.channels,
      activePlanChannelsLength: activePlan?.channels?.length || 0,
      clientId
    });
    
    // Prioritize mediaPlanBuilderChannels over activePlan.channels
    if (mediaPlanBuilderChannels && mediaPlanBuilderChannels.length > 0) {
      console.log('MediaChannels: Processing mediaPlanBuilderChannels');
      mediaPlanBuilderChannels.forEach((channel) => {
        console.log('MediaChannels: Processing channel:', channel.channelName, channel.id);
        if (isMetaAdsChannel(channel.channelName) || isGoogleAdsChannel(channel.channelName)) {
          fetchLiveSpendData(channel.id, channel.channelName);
        }
        const channelType = getChannelDisplayName(channel.channelName, channel.format || '');
        console.log('MediaChannels: Calculated channelType:', channelType, 'from channelName:', channel.channelName, 'format:', channel.format);
        fetchActionPoints(channelType);
        if (clientId) {
          fetchConnectedAccount(channelType);
        } else {
          console.log('MediaChannels: Skipping fetchConnectedAccount - no clientId');
        }
      });
    } else if (activePlan && activePlan.channels) {
      console.log('MediaChannels: Processing activePlan.channels');
      activePlan.channels.forEach((channel) => {
        if (isMetaAdsChannel(channel.channel) || isGoogleAdsChannel(channel.channel)) {
          fetchLiveSpendData(channel.id, channel.channel);
        }
        const channelType = getChannelDisplayName(channel.channel, channel.detail);
        fetchActionPoints(channelType);
        if (clientId) {
          fetchConnectedAccount(channelType);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlan?.id, clientId, mediaPlanBuilderChannels ? mediaPlanBuilderChannels.map(c => c.id).join(',') : '']); // Refetch when plan, client, or mediaPlanBuilderChannels changes

  // Refetch action points when actionPointsRefetchTrigger changes (triggered by other components)
  useEffect(() => {
    if (actionPointsRefetchTrigger === 0) return; // Skip initial render
    
    console.log('MediaChannels: Refetching action points due to trigger change');
    
    // Refetch action points for all channels
    if (mediaPlanBuilderChannels && mediaPlanBuilderChannels.length > 0) {
      mediaPlanBuilderChannels.forEach((channel) => {
        const channelType = getChannelDisplayName(channel.channelName, channel.format || '');
        fetchActionPoints(channelType);
      });
    } else if (activePlan && activePlan.channels) {
      activePlan.channels.forEach((channel) => {
        const channelType = getChannelDisplayName(channel.channel, channel.detail);
        fetchActionPoints(channelType);
      });
    }
  }, [actionPointsRefetchTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Generate month data from weekly plans and live spend data
  const generateMonthDataFromWeeklyPlans = (
    weeklyPlans: any[], 
    monthBudget: number, 
    channelId: string,
    liveData?: any[],
    accountId?: string | null,
    hasConnectedAccount?: boolean,
    selectedMonth?: Date,
    selectedCampaignId?: string, // 'all' or specific campaign ID
    channelName?: string // Channel name to determine if we should use linear planned spend
  ) => {
    const month = selectedMonth || new Date();
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day
    
    // Generate data for the month, but ensure we include at least 30 days from today
    // This ensures we have enough data for the chart which shows today + 30 days ahead
    const thirtyDaysAhead = new Date(today);
    thirtyDaysAhead.setDate(thirtyDaysAhead.getDate() + 30);
    const effectiveEndDate = thirtyDaysAhead > monthEnd ? thirtyDaysAhead : monthEnd;
    
    const allDays = eachDayOfInterval({ start: monthStart, end: effectiveEndDate });
    
    // Check if this is Google Ads or Meta Ads - use linear planned spend for these channels
    const isGoogleAds = channelName && isGoogleAdsChannel(channelName);
    const isMetaAds = channelName && isMetaAdsChannel(channelName);
    const useLinearPlannedSpend = isGoogleAds || isMetaAds;
    
    // Calculate daily target
    const dailyTarget = monthBudget / allDays.length;
    
    // Create a map of dates to spend from live data
    const liveSpendByDate = new Map<string, number>();
    
        // Process live spend data if available
    if (liveData && liveData.length > 0) {
      console.log(`[MediaChannels] Processing live spend data for channel ${channelId}:`, {
        liveDataLength: liveData.length,
        accountId,
        hasConnectedAccount,
        selectedCampaignId,
        sampleItem: liveData[0]
      });
      
      liveData.forEach((item) => {
        // Filter by account ID only if explicitly provided (to show only data for the connected account)
        // For Google Ads, use customerId; for Meta Ads, use accountId
        // If no accountId is set, show all data (aggregated across all accounts)
        if (accountId && hasConnectedAccount) {
          let shouldInclude = false;
          
          if (item.accountId) {
            // Meta Ads format
            const itemAccountId = String(item.accountId);
            const connectedId = String(accountId);
            shouldInclude = itemAccountId === connectedId;
          } else if (item.customerId) {
            // Google Ads format - customerId is formatted like "123-456-7890"
            const itemCustomerId = String(item.customerId);
            const connectedId = String(accountId);
            // Compare both with and without dashes
            const itemClean = itemCustomerId.replace(/-/g, '');
            const connectedClean = connectedId.replace(/-/g, '');
            shouldInclude = itemClean === connectedClean || itemCustomerId === connectedId;
          }
          
          if (!shouldInclude) {
            return; // Skip this item if it doesn't match the connected account
          }
        }
        
        // Filter by campaign if a specific campaign is selected
        if (selectedCampaignId && selectedCampaignId !== 'all') {
          const itemCampaignId = item.campaignId || '';
          if (itemCampaignId !== selectedCampaignId) {
            return; // Skip this item if it doesn't match the selected campaign
          }
        }
        
        // Handle both Meta Ads (dateStart) and Google Ads (date) formats
        let dateKey: string | null = null;
        if (item.dateStart) {
          // Meta API returns date ranges, use dateStart for daily aggregation
          dateKey = item.dateStart; // API returns YYYY-MM-DD format
        } else if (item.date) {
          // Google Ads API returns single date field
          dateKey = item.date; // API returns YYYY-MM-DD format
        }
        
        if (dateKey && item.spend !== undefined) {
          // Sum spend for the same date (in case of multiple accounts or campaigns)
          liveSpendByDate.set(dateKey, (liveSpendByDate.get(dateKey) || 0) + (item.spend || 0));
        }
      });
    }
    
    // Create a map of dates to spend from weekly plans or linear calculation
    const plannedSpendByDate = new Map<string, number>();
    
    if (useLinearPlannedSpend) {
      // For Google Ads and Meta Ads: Calculate linear planned spend based on monthly budget
      // Linear progression from $0 at start of month to monthBudget at end of month
      const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd }).length;
      const monthBudgetInDollars = monthBudget / 100; // Convert from cents to dollars
      
      allDays.forEach((date) => {
        const dateKey = format(date, 'yyyy-MM-dd');
        
        // Only calculate for days within the selected month
        if (date >= monthStart && date <= monthEnd) {
          // Calculate day number (1-based) within the month
          const dayNumber = Math.floor((date.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          
          // Linear calculation: (dayNumber / daysInMonth) * monthBudget
          const linearPlannedSpend = (dayNumber / daysInMonth) * monthBudgetInDollars;
          plannedSpendByDate.set(dateKey, linearPlannedSpend);
        } else {
          // For days outside the month, continue the linear trend
          if (date > monthEnd) {
            const daysPastMonthEnd = Math.floor((date.getTime() - monthEnd.getTime()) / (1000 * 60 * 60 * 24));
            const dailyRate = monthBudgetInDollars / daysInMonth;
            const linearPlannedSpend = monthBudgetInDollars + (dailyRate * daysPastMonthEnd);
            plannedSpendByDate.set(dateKey, linearPlannedSpend);
          }
        }
      });
    } else {
      // For other channels: Process weekly plans to distribute spend across days
      // For the planned line, always use budget_planned from the media plan
      weeklyPlans.forEach((wp) => {
        const weekStart = parseISO(wp.week_commencing);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        // Always use planned budget from the media plan for the planned line
        // Commission is already applied in transformMediaPlanBuilderChannels or transformActivePlanChannels
        const weekPlannedSpend = wp.budget_planned || 0;
        const dailyPlannedSpend = weekPlannedSpend / 7;
        
        // Distribute across days in the week
        for (let i = 0; i < 7; i++) {
          const day = new Date(weekStart);
          day.setDate(day.getDate() + i);
          
          if (isWithinInterval(day, { start: monthStart, end: effectiveEndDate })) {
            const dateKey = format(day, 'yyyy-MM-dd');
            plannedSpendByDate.set(dateKey, (plannedSpendByDate.get(dateKey) || 0) + dailyPlannedSpend);
          }
        }
      });
    }
    
    // Keep planned and actual spend separate
    // Actual spend comes from live API data only
    // Planned spend comes from weekly plans only
    
    // Check if we have any live spend data
    // Show data if we have it, even without a connected account (user might want to see all their accounts)
    const hasLiveSpendData = liveData && liveData.length > 0;
    
    // Build cumulative data
    // Meta API returns daily spend (not cumulative), so we accumulate day by day
    let cumulativeActual = 0;
    let cumulativePlanned = 0;
    
    return allDays.map((date, index) => {
      const dateKey = format(date, 'yyyy-MM-dd');
      
      // Get planned spend for this day (from linear calculation or weekly plans)
      const plannedDaySpend = plannedSpendByDate.get(dateKey) || 0;
      
      // For linear planned spend, the value is already cumulative, so use it directly
      // For weekly plans, accumulate day by day
      if (useLinearPlannedSpend) {
        cumulativePlanned = plannedDaySpend; // Linear calculation is already cumulative
      } else {
        cumulativePlanned += plannedDaySpend / 100; // Accumulate from weekly plans (convert from cents)
      }
      
      // Get actual spend for this day (from live API data only)
      // Live data is in dollars, convert to cents for consistency
      const actualDaySpend = liveSpendByDate.get(dateKey) || 0;
      const actualDaySpendInCents = actualDaySpend * 100; // Convert dollars to cents
      cumulativeActual += actualDaySpendInCents;
      
      // Convert from cents to dollars for display
      // Show actual spend only if we have live data from connected account
      const shouldShowActual = hasLiveSpendData;
      
      return {
        date: dateKey,
        actualSpend: shouldShowActual ? cumulativeActual / 100 : null, // Convert from cents to dollars
        plannedSpend: cumulativePlanned, // Already in dollars for both linear and weekly (weekly converted during accumulation)
        projectedSpend: null, // Will be calculated in MediaChannelCard
        projected: false
      };
    });
  };

  // Transform MediaPlanBuilder channels to ActivePlan channels format
  const transformMediaPlanBuilderChannels = (channels: MediaPlanChannel[]): ActivePlan['channels'] => {
    return channels
      .filter(ch => ch.channelName && ch.channelName.trim() !== '')
      .map((channel) => {
        // Generate weekly plans from flights
        const weeklyPlans: ActivePlan['channels'][0]['weekly_plans'] = [];
        // Track monthly spend totals from flights (before commission)
        const monthlySpendTotals: { [monthKey: string]: number } = {};
        
        channel.flights.forEach((flight) => {
          // Accumulate monthly spend totals from all flights
          // Note: flight.monthlySpend uses getMonthKey format (e.g., "2024-12" or "2024-1")
          // We need to normalize to "yyyy-MM" format for consistency
          Object.entries(flight.monthlySpend).forEach(([monthKey, amount]) => {
            // Normalize month key to "yyyy-MM" format (pad month if needed)
            const normalizedMonthKey = monthKey.includes('-') 
              ? monthKey.split('-').map((part, idx) => idx === 1 ? part.padStart(2, '0') : part).join('-')
              : monthKey;
            monthlySpendTotals[normalizedMonthKey] = (monthlySpendTotals[normalizedMonthKey] || 0) + amount;
          });
          const startDate = new Date(flight.startWeek);
          const endDate = new Date(flight.endWeek);
          
          // Get Monday of the start week
          const startMonday = startOfWeek(startDate, { weekStartsOn: 1 });
          const endMonday = startOfWeek(endDate, { weekStartsOn: 1 });
          
          // Calculate number of weeks
          const numWeeks = differenceInWeeks(endMonday, startMonday) + 1;
          
          // Group weeks by month to properly distribute monthly spend
          const weeksByMonth: { [monthKey: string]: Date[] } = {};
          
          for (let i = 0; i < numWeeks; i++) {
            const weekStart = addWeeks(startMonday, i);
            const monthKey = format(weekStart, 'yyyy-MM');
            
            if (!weeksByMonth[monthKey]) {
              weeksByMonth[monthKey] = [];
            }
            weeksByMonth[monthKey].push(weekStart);
          }
          
          // Generate weekly plans with proper monthly distribution
          let weekNumber = 1;
          for (let i = 0; i < numWeeks; i++) {
            const weekStart = addWeeks(startMonday, i);
            const weekKey = format(weekStart, 'yyyy-MM-dd');
            const monthKey = format(weekStart, 'yyyy-MM');
            
            // Get monthly spend for this month
            // flight.monthlySpend uses getMonthKey format (e.g., "2024-12" or "2024-1")
            // monthKey is in "yyyy-MM" format, so we need to try both formats
            const unpaddedMonthKey = monthKey.replace(/-0+(\d)$/, '-$1'); // Convert "2024-01" to "2024-1"
            const monthlySpend = flight.monthlySpend[monthKey] || flight.monthlySpend[unpaddedMonthKey] || 0;
            // Count weeks in this month
            const weeksInMonth = weeksByMonth[monthKey]?.length || 1;
            // Distribute monthly spend across weeks in this month
            const weeklyBudgetBeforeCommission = weeksInMonth > 0 ? monthlySpend / weeksInMonth : 0;
            // Apply commission to reduce the budget
            const weeklyBudget = applyCommission(weeklyBudgetBeforeCommission);
            
            weeklyPlans.push({
              id: `week-${channel.id}-${flight.id}-${i}`,
              week_commencing: weekKey,
              week_number: weekNumber++,
              budget_planned: Math.round(weeklyBudget * 100), // Convert to cents
              budget_actual: 0,
              posts_planned: 0,
              posts_actual: 0,
            });
          }
        });
        
        return {
          id: channel.id,
          channel: channel.channelName,
          detail: channel.format || '',
          type: channel.channelName.toLowerCase(),
          weekly_plans: weeklyPlans,
          // Store monthly spend totals for accurate monthly budget calculation
          _monthlySpendTotals: monthlySpendTotals,
        };
      });
  };

  // Transform active plan channels to MediaChannelCard format
  const transformChannels = () => {
    // Prioritize mediaPlanBuilderChannels over activePlan.channels
    if (mediaPlanBuilderChannels && mediaPlanBuilderChannels.length > 0) {
      const transformedChannels = transformMediaPlanBuilderChannels(mediaPlanBuilderChannels);
      // Pass the original MediaPlanBuilder channels so we can recalculate monthly spend if needed
      return transformActivePlanChannels(transformedChannels, mediaPlanBuilderChannels);
    }
    
    if (!activePlan || !activePlan.channels || activePlan.channels.length === 0) {
      return [];
    }
    
    return transformActivePlanChannels(activePlan.channels);
  };

  // Transform ActivePlan channels to MediaChannelCard format
  const transformActivePlanChannels = (channels: ActivePlan['channels'], originalMediaPlanChannels?: MediaPlanChannel[]) => {
    if (!channels || channels.length === 0) {
      return [];
    }

    return channels.map((channel) => {
      const channelType = getChannelDisplayName(channel.channel, channel.detail);
      console.log('transformActivePlanChannels: channelType:', channelType, 'from channel:', channel.channel, 'detail:', channel.detail);
      console.log('transformActivePlanChannels: connectedAccounts:', connectedAccounts);
      console.log('transformActivePlanChannels: connectedAccountIds:', connectedAccountIds);
      const accountId = connectedAccountIds[channelType] ?? null;
      const hasConnectedAccount = !!accountId && !!connectedAccounts[channelType];
      console.log('transformActivePlanChannels: accountId:', accountId, 'hasConnectedAccount:', hasConnectedAccount, 'for channelType:', channelType);
      
      // Get selected month for this channel (default to current month)
      const selectedMonth = selectedMonths[channel.id] || startOfMonth(new Date());
      const selectedMonthKey = format(selectedMonth, 'yyyy-MM');
      
      // Get selected campaign for this channel (default to 'all')
      const selectedCampaignId = selectedCampaigns[channel.id] || 'all';
      
      // Extract unique campaigns from live spend data for this channel
      const channelLiveSpendData = liveSpendData[channel.id] || [];
      const campaignsMap = new Map<string, { id: string; name: string }>();
      channelLiveSpendData.forEach((item) => {
        const campaignId = item.campaignId || '';
        const campaignName = item.campaignName || '';
        if (campaignId && campaignName && !campaignsMap.has(campaignId)) {
          campaignsMap.set(campaignId, { id: campaignId, name: campaignName });
        }
      });
      const campaigns = Array.from(campaignsMap.values());
      
      // Check if this is a MediaPlanBuilder channel (has _monthlySpendTotals or we have original channels)
      const isMediaPlanBuilderChannel = !!(channel as any)._monthlySpendTotals || (originalMediaPlanChannels && originalMediaPlanChannels.some(c => c.id === channel.id));
      
      // For MediaPlanBuilder channels, weekly plans already have commission applied
      // For plan-entry channels, apply commission to weekly plans
      const weeklyPlans = isMediaPlanBuilderChannel
        ? (channel.weekly_plans || []) // MediaPlanBuilder: commission already applied
        : (channel.weekly_plans || []).map((wp) => ({
            ...wp,
            budget_planned: Math.round(applyCommission(wp.budget_planned || 0)),
          })); // Plan-entry: apply commission
      
      // For MediaPlanBuilder channels, use monthlySpend directly from flights (more accurate)
      // For plan-entry channels, calculate from weekly plans
      let finalSelectedMonthBudget: number;
      
      if (isMediaPlanBuilderChannel) {
        // MediaPlanBuilder channel - calculate monthly spend directly from original channels
        let monthlySpendTotal: number | undefined = undefined;
        let foundInOriginalChannels = false;
        
        // First, try to get directly from original MediaPlanBuilder channels (most reliable)
        // Sum monthly spend across ALL channels with the same channel name (channel type)
        // This ensures that if there are multiple rows (channels) for the same media channel type,
        // their spend is summed together for the planned monthly spend
        if (originalMediaPlanChannels && originalMediaPlanChannels.length > 0) {
          // Get month key in getMonthKey format (unpadded) for lookup
          const year = selectedMonth.getFullYear();
          const month = selectedMonth.getMonth() + 1;
          const getMonthKeyFormat = `${year}-${month}`; // e.g., "2024-12" or "2024-1"
          
          // Also try padded format
          const paddedMonthKey = `${year}-${String(month).padStart(2, '0')}`; // e.g., "2024-12" or "2024-01"
          
          // Find all channels with the same channel name (same media channel type)
          const channelsWithSameName = originalMediaPlanChannels.filter(c => 
            getChannelDisplayName(c.channelName, c.format || '') === channelType
          );
          
          // Debug logging
          console.log('Looking up monthly spend for:', {
            channelId: channel.id,
            channelName: channel.channel,
            channelType,
            selectedMonth: selectedMonthKey,
            getMonthKeyFormat,
            paddedMonthKey,
            channelsWithSameNameCount: channelsWithSameName.length,
            allChannelNames: originalMediaPlanChannels.map(c => ({
              id: c.id,
              name: c.channelName,
              displayName: getChannelDisplayName(c.channelName, c.format || '')
            }))
          });
          
          // Sum monthly spend from all flights across all channels with the same name
          monthlySpendTotal = 0;
          channelsWithSameName.forEach((originalChannel) => {
            if (originalChannel.flights) {
              originalChannel.flights.forEach((flight) => {
                if (flight.monthlySpend) {
                  // Try all possible formats - check each one explicitly
                  let spend = 0;
                  if (flight.monthlySpend[getMonthKeyFormat] !== undefined) {
                    spend = flight.monthlySpend[getMonthKeyFormat];
                    foundInOriginalChannels = true;
                  } else if (flight.monthlySpend[paddedMonthKey] !== undefined) {
                    spend = flight.monthlySpend[paddedMonthKey];
                    foundInOriginalChannels = true;
                  } else if (flight.monthlySpend[selectedMonthKey] !== undefined) {
                    spend = flight.monthlySpend[selectedMonthKey];
                    foundInOriginalChannels = true;
                  } else {
                    // Last resort: check all keys and try to match by normalizing
                    Object.entries(flight.monthlySpend).forEach(([key, value]) => {
                      // Normalize the key from flight to compare with our formats
                      const normalizedKey = key.includes('-') 
                        ? key.split('-').map((part, idx) => idx === 1 ? part.padStart(2, '0') : part).join('-')
                        : key;
                      const unpaddedKey = normalizedKey.replace(/-0+(\d)$/, '-$1');
                      
                      // Check if this key matches our selected month
                      if (normalizedKey === selectedMonthKey || 
                          normalizedKey === paddedMonthKey ||
                          unpaddedKey === getMonthKeyFormat ||
                          key === getMonthKeyFormat ||
                          key === paddedMonthKey ||
                          key === selectedMonthKey) {
                        spend = value as number;
                        foundInOriginalChannels = true;
                      }
                    });
                  }
                  
                  if (spend && !isNaN(spend)) {
                    monthlySpendTotal! += spend;
                  }
                }
              });
            }
          });
        }
        
        // If not found from original channels, try stored totals
        // Sum across all channels with the same channel type
        if (!foundInOriginalChannels && (monthlySpendTotal === undefined || monthlySpendTotal === 0)) {
          // Find all channels with the same channel name and sum their stored totals
          const channelsWithSameName = channels.filter(c => 
            getChannelDisplayName(c.channel, c.detail) === channelType
          );
          
          monthlySpendTotal = 0;
          channelsWithSameName.forEach((ch) => {
            const monthlySpendTotals = (ch as any)._monthlySpendTotals || {};
            let channelSpend = monthlySpendTotals[selectedMonthKey];
            
            // If not found, try unpadded format
            if (channelSpend === undefined || isNaN(channelSpend)) {
              const unpaddedKey = selectedMonthKey.replace(/-0+(\d)$/, '-$1');
              channelSpend = monthlySpendTotals[unpaddedKey];
            }
            
            if (channelSpend !== undefined && !isNaN(channelSpend)) {
              monthlySpendTotal! += channelSpend;
              foundInOriginalChannels = true;
            }
          });
        }
        
        // If still not found, fall back to calculating from weekly plans
        // Sum weekly plans across all channels with the same channel type
        if (!foundInOriginalChannels && (monthlySpendTotal === undefined || isNaN(monthlySpendTotal) || monthlySpendTotal === 0)) {
          const selectedMonthStart = startOfMonth(selectedMonth);
          const selectedMonthEnd = endOfMonth(selectedMonth);
          
          // Find all channels with the same channel name and sum their weekly plans
          const channelsWithSameName = channels.filter(c => 
            getChannelDisplayName(c.channel, c.detail) === channelType
          );
          
          // Collect weekly plans from all channels with the same name
          const allWeeklyPlans: ActivePlan['channels'][0]['weekly_plans'] = [];
          channelsWithSameName.forEach((ch) => {
            if (ch.weekly_plans) {
              allWeeklyPlans.push(...ch.weekly_plans);
            }
          });
          
          const selectedMonthWeeklyPlans = allWeeklyPlans.filter((wp) => {
            if (!wp.week_commencing) return false;
            const weekStart = parseISO(wp.week_commencing);
            return isWithinInterval(weekStart, { start: selectedMonthStart, end: selectedMonthEnd });
          });
          
          // Sum weekly plans and convert back to dollars (they're in cents)
          // Note: weekly plans already have commission applied, so we need to reverse it to get the original total
          const weeklyPlansTotal = selectedMonthWeeklyPlans.reduce((sum, wp) => {
            const budget = wp.budget_planned || 0;
            return sum + (isNaN(budget) ? 0 : budget);
          }, 0);
          const monthlySpendWithCommission = weeklyPlansTotal / 100; // Convert from cents to dollars
          
          // Reverse commission to get the original amount before commission
          // If commission is 20%, and we have $800 (after commission), original is $800 / 0.8 = $1000
          if (commission > 0 && commission < 100) {
            const commissionMultiplier = (100 - commission) / 100;
            monthlySpendTotal = monthlySpendWithCommission / commissionMultiplier;
          } else {
            monthlySpendTotal = monthlySpendWithCommission;
          }
        }
        
        // Ensure we have a valid number
        if (isNaN(monthlySpendTotal) || monthlySpendTotal === undefined) {
          monthlySpendTotal = 0;
        }
        
        // Planned Monthly Spend = total month spend from media plan builder (with commission applied)
        // Apply commission to match what's shown in the media plan builder for that month
        // Weekly plans already have commission applied, so monthly budget should too
        const monthlySpendAfterCommission = applyCommission(monthlySpendTotal);
        finalSelectedMonthBudget = Math.round(monthlySpendAfterCommission * 100); // Convert to cents
        
        // Debug logging
        console.log('Final monthly spend calculation:', {
          channelId: channel.id,
          channelName: channel.channel,
          selectedMonth: selectedMonthKey,
          monthlySpendTotal,
          finalSelectedMonthBudget,
          foundInOriginalChannels
        });
        
        // Final safety check
        if (isNaN(finalSelectedMonthBudget)) {
          finalSelectedMonthBudget = 0;
        }
      } else {
        // Plan-entry channel - calculate from weekly plans
        const selectedMonthStart = startOfMonth(selectedMonth);
        const selectedMonthEnd = endOfMonth(selectedMonth);
        const selectedMonthWeeklyPlans = weeklyPlans.filter((wp) => {
          if (!wp.week_commencing) return false;
          const weekStart = parseISO(wp.week_commencing);
          return isWithinInterval(weekStart, { start: selectedMonthStart, end: selectedMonthEnd });
        });
        const selectedMonthBudget = selectedMonthWeeklyPlans.reduce((sum, wp) => sum + (wp.budget_planned || 0), 0);
        const avgWeeklyBudget = weeklyPlans.length > 0
          ? weeklyPlans.reduce((sum, wp) => sum + (wp.budget_planned || 0), 0) / weeklyPlans.length
          : 0;
        const estimatedSelectedMonthBudget = avgWeeklyBudget * 4.33;
        finalSelectedMonthBudget = selectedMonthBudget > 0 ? selectedMonthBudget : estimatedSelectedMonthBudget;
      }
      
      // Calculate total monthly spend across all channels for the selected month
      const totalMonthlySpend = calculateTotalMonthlySpendForMonth(selectedMonth);

      return {
        id: channel.id,
        name: channelType,
        icon: getChannelIcon(channel.channel),
        status: 'Active' as const,
        actionPoints: actionPoints[channelType] || [],
        monthBudget: finalSelectedMonthBudget / 100, // Convert from cents
        totalMonthlySpend: totalMonthlySpend, // Total across all channels for Y-axis
        spendData: generateMonthDataFromWeeklyPlans(
          weeklyPlans, 
          finalSelectedMonthBudget, 
          channel.id,
          liveSpendData[channel.id],
          accountId,
          hasConnectedAccount,
          selectedMonth,
          selectedCampaignId,
          channel.channel // Pass channel name to determine if linear planned spend should be used
        ),
        isMetaAds: isMetaAdsChannel(channel.channel),
        onRefreshSpend: (month?: Date) => {
          console.log(`[MediaChannels] onRefreshSpend called:`, {
            channelId: channel.id,
            channelName: channel.channel,
            providedMonth: month,
            selectedMonthForChannel: selectedMonths[channel.id],
            defaultSelectedMonth: selectedMonth
          });
          // Use the provided month, or fall back to the current selected month for this channel
          const currentMonth = month || selectedMonths[channel.id] || selectedMonth;
          console.log(`[MediaChannels] Calling fetchLiveSpendData with month:`, currentMonth);
          fetchLiveSpendData(channel.id, channel.channel, currentMonth);
        },
        onMonthChange: ((month: Date) => {
          // Update selected month and fetch data for the new month
          setSelectedMonths(prev => ({ ...prev, [channel.id]: month }));
          if (isMetaAdsChannel(channel.channel) || isGoogleAdsChannel(channel.channel)) {
            fetchLiveSpendData(channel.id, channel.channel, month);
          }
        }) as any,
        onCampaignChange: (campaignId: string) => {
          // Update selected campaign for this channel
          setSelectedCampaigns(prev => ({ ...prev, [channel.id]: campaignId }));
        },
        isFetchingSpend: fetchingSpend[channel.id] || false,
        spendError: spendErrors[channel.id],
        onActionPointsChange: () => { fetchActionPoints(channelType); onActionPointsChange?.(); },
        clientId: clientId,
        channelType: channelType,
        connectedAccount: connectedAccounts[channelType] ?? undefined,
        liveSpendData: liveSpendData[channel.id] || [],
        connectedAccountId: accountId,
        selectedMonth: selectedMonth,
        campaigns: campaigns,
        selectedCampaignId: selectedCampaignId
      };
    });
  };

  const channels = transformChannels();

  // Group channels by name (channel type) to show only one card per channel
  const groupChannelsByName = (channels: ReturnType<typeof transformChannels>) => {
    const grouped = new Map<string, ReturnType<typeof transformChannels>>();
    
    channels.forEach((channel) => {
      const channelName = channel.name;
      if (!grouped.has(channelName)) {
        grouped.set(channelName, []);
      }
      grouped.get(channelName)!.push(channel);
    });
    
    // Aggregate data for each group
    const aggregatedChannels = Array.from(grouped.entries()).map(([channelName, channelGroup]) => {
      if (channelGroup.length === 1) {
        // Only one channel, return as-is
        return channelGroup[0];
      }
      
      // Multiple channels with same name - aggregate them
      const firstChannel = channelGroup[0];
      
      // Sum month budgets
      const totalMonthBudget = channelGroup.reduce((sum, ch) => sum + (ch.monthBudget || 0), 0);
      
      // Merge and aggregate spend data
      // Create a map of dates to aggregate spend data
      const spendDataMap = new Map<string, { actualSpend: number | null; plannedSpend: number; projectedSpend: number | null; projected: boolean }>();
      
      channelGroup.forEach((ch) => {
        if (ch.spendData) {
          ch.spendData.forEach((dataPoint) => {
            const existing = spendDataMap.get(dataPoint.date);
            if (existing) {
              // Aggregate: sum actual and planned (treat null as 0 for actualSpend)
              const existingActual = existing.actualSpend ?? 0;
              const newActual = dataPoint.actualSpend ?? 0;
              const aggregatedActual = existingActual + newActual;
              
              spendDataMap.set(dataPoint.date, {
                actualSpend: aggregatedActual > 0 ? aggregatedActual : null,
                plannedSpend: existing.plannedSpend + dataPoint.plannedSpend,
                projectedSpend: existing.projectedSpend ?? dataPoint.projectedSpend,
                projected: existing.projected || dataPoint.projected
              });
            } else {
              spendDataMap.set(dataPoint.date, {
                actualSpend: dataPoint.actualSpend,
                plannedSpend: dataPoint.plannedSpend,
                projectedSpend: dataPoint.projectedSpend,
                projected: dataPoint.projected
              });
            }
          });
        }
      });
      
      // Convert map back to array and sort by date
      const aggregatedSpendData = Array.from(spendDataMap.entries())
        .map(([date, data]) => ({
          date,
          ...data
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
      
      // Merge live spend data from all channels
      const allLiveSpendData = channelGroup
        .flatMap(ch => ch.liveSpendData || [])
        .filter(Boolean);
      
      // Merge campaigns from all channels (deduplicate by ID)
      const campaignsMap = new Map<string, { id: string; name: string }>();
      channelGroup.forEach((ch) => {
        if (ch.campaigns) {
          ch.campaigns.forEach((campaign) => {
            if (!campaignsMap.has(campaign.id)) {
              campaignsMap.set(campaign.id, campaign);
            }
          });
        }
      });
      const mergedCampaigns = Array.from(campaignsMap.values());
      
      // Combine action points (deduplicate by ID if they have one, otherwise by text)
      const allActionPoints = channelGroup.flatMap(ch => ch.actionPoints || []);
      const uniqueActionPoints = Array.from(
        new Map(allActionPoints.map(ap => [ap.id || JSON.stringify(ap), ap])).values()
      );
      
      // Use the first channel's selected month, or find earliest month with budget
      const selectedMonth = firstChannel.selectedMonth || startOfMonth(new Date());
      
      // Use the first channel's selected campaign, or default to 'all'
      const selectedCampaignId = firstChannel.selectedCampaignId || 'all';
      
      // Merge refresh handlers - use the first one that has it
      const refreshHandler = channelGroup.find(ch => ch.onRefreshSpend)?.onRefreshSpend || firstChannel.onRefreshSpend;
      
      // Merge month change handlers - use the first one that has it
      const monthChangeHandler = channelGroup.find(ch => ch.onMonthChange)?.onMonthChange || firstChannel.onMonthChange;
      
      // Merge campaign change handlers - update all channels in the group
      const campaignChangeHandler = (campaignId: string) => {
        channelGroup.forEach((ch) => {
          ch.onCampaignChange?.(campaignId);
        });
      };
      
      // Determine if any channel is fetching
      const isFetchingSpend = channelGroup.some(ch => ch.isFetchingSpend);
      
      // Combine spend errors
      const spendError = channelGroup
        .map(ch => ch.spendError)
        .filter(Boolean)
        .join('; ') || undefined;
      
      // Use the first channel's connected account info (they should all be the same for the same channel type)
      const connectedAccount = firstChannel.connectedAccount;
      const connectedAccountId = firstChannel.connectedAccountId;
      
      // Calculate total monthly spend for the selected month (should be same for all channels in group)
      const totalMonthlySpend = firstChannel.totalMonthlySpend !== undefined 
        ? firstChannel.totalMonthlySpend 
        : totalMonthBudget;

      return {
        ...firstChannel,
        id: `grouped-${channelName}`, // Use a grouped ID
        monthBudget: totalMonthBudget,
        totalMonthlySpend: totalMonthlySpend, // Preserve total monthly spend
        spendData: aggregatedSpendData,
        liveSpendData: allLiveSpendData,
        actionPoints: uniqueActionPoints,
        selectedMonth,
        campaigns: mergedCampaigns,
        selectedCampaignId,
        onRefreshSpend: refreshHandler,
        onMonthChange: monthChangeHandler,
        onCampaignChange: campaignChangeHandler,
        isFetchingSpend,
        spendError,
        connectedAccount,
        connectedAccountId
      };
    });
    
    return aggregatedChannels;
  };

  const groupedChannels = groupChannelsByName(channels);

  // If no channels from either source, show empty state
  const hasChannels = (mediaPlanBuilderChannels && mediaPlanBuilderChannels.length > 0) || 
                      (activePlan && activePlan.channels && activePlan.channels.length > 0);
  
  if (!hasChannels) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-[#0f172a]">Media Channels</h2>
          <p className="text-sm text-[#64748b]">No active media plan</p>
        </div>
        <div className="text-center py-12 bg-white rounded-lg border border-[#e2e8f0]">
          <p className="text-[#64748b] mb-4">No active media plan found for this client.</p>
          <p className="text-sm text-[#94a3b8]">Create and activate a media plan to see channel data here.</p>
        </div>
      </div>
    );
  }

  // If channels exist but transformation resulted in empty array, show different message
  if (groupedChannels.length === 0 && hasChannels) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-[#0f172a]">Media Channels</h2>
          <p className="text-sm text-[#64748b]">No valid channels found</p>
        </div>
        <div className="text-center py-12 bg-white rounded-lg border border-[#e2e8f0]">
          <p className="text-[#64748b] mb-4">
            {mediaPlanBuilderChannels && mediaPlanBuilderChannels.length > 0
              ? "Media plan builder has channels but they need channel names."
              : activePlan 
                ? `The active media plan "${activePlan.name}" has no channels.`
                : "No channels found."}
          </p>
          <p className="text-sm text-[#94a3b8]">Add channels to see pacing data here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-[#0f172a]">Media Channels</h2>
        <p className="text-sm text-[#64748b]">{groupedChannels.length} channel{groupedChannels.length !== 1 ? 's' : ''} active</p>
      </div>
      
      {groupedChannels.map((channel) => (
        <MediaChannelCard
          key={channel.id}
          channel={channel}
          onActualSpendChange={handleActualSpendChange}
        />
      ))}
    </div>
  );
}

