'use client';

import MediaChannelCard from './MediaChannelCard';
import { Facebook, Search, Linkedin, Music, Instagram } from 'lucide-react';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, parseISO, isWithinInterval, addDays } from 'date-fns';
import { useState, useEffect } from 'react';

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
}

export default function MediaChannels({ activePlan, clientId }: MediaChannelsProps) {
  const [liveSpendData, setLiveSpendData] = useState<Record<string, any[]>>({});
  const [fetchingSpend, setFetchingSpend] = useState<Record<string, boolean>>({});
  const [spendErrors, setSpendErrors] = useState<Record<string, string>>({});
  const [actionPoints, setActionPoints] = useState<Record<string, any[]>>({});
  const [connectedAccounts, setConnectedAccounts] = useState<Record<string, string | null>>({});
  const [connectedAccountIds, setConnectedAccountIds] = useState<Record<string, string | null>>({});
  const [selectedMonths, setSelectedMonths] = useState<Record<string, Date>>({});

  // Map channel names to icons
  const getChannelIcon = (channelName: string) => {
    const lowerName = channelName.toLowerCase();
    if (lowerName.includes('facebook') || lowerName.includes('meta')) {
      return <Facebook className="w-6 h-6 text-blue-600" />;
    }
    if (lowerName.includes('instagram')) {
      return <Instagram className="w-6 h-6 text-pink-600" />;
    }
    if (lowerName.includes('google')) {
      return <Search className="w-6 h-6 text-red-600" />;
    }
    if (lowerName.includes('linkedin')) {
      return <Linkedin className="w-6 h-6 text-blue-700" />;
    }
    if (lowerName.includes('tiktok')) {
      return <Music className="w-6 h-6 text-black" />;
    }
    return <Facebook className="w-6 h-6 text-gray-600" />;
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
    const isMeta = isMetaAdsChannel(channelName);
    const isGoogle = isGoogleAdsChannel(channelName);
    
    if (!isMeta && !isGoogle) {
      return;
    }

    setFetchingSpend(prev => ({ ...prev, [channelId]: true }));
    setSpendErrors(prev => ({ ...prev, [channelId]: '' }));

    try {
      const targetMonth = month || new Date();
      const monthStart = startOfMonth(targetMonth);
      const monthEnd = endOfMonth(targetMonth);

      const startDate = format(monthStart, 'yyyy-MM-dd');
      const endDate = format(monthEnd, 'yyyy-MM-dd');

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
          }),
        });
      } else {
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch spend data`);
      }

      const data = await response.json();
      
      if (data.success && data.data) {
        setLiveSpendData(prev => ({ ...prev, [channelId]: data.data }));
      } else {
        throw new Error(data.error || 'Failed to fetch spend data');
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
      const response = await fetch(`/api/action-points?channel_type=${encodeURIComponent(channelType)}`);
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
    if (!clientId) return;
    
    try {
      const response = await fetch(
        `/api/connections/channel-account?clientId=${encodeURIComponent(clientId)}&channelType=${encodeURIComponent(channelType)}`
      );
      if (!response.ok) {
        console.error(`Failed to fetch connected account for channel type ${channelType}`);
        return;
      }
      const { accountName, accountId, hasConnection } = await response.json();
      setConnectedAccounts(prev => ({ ...prev, [channelType]: hasConnection ? (accountName || null) : null }));
      setConnectedAccountIds(prev => ({ ...prev, [channelType]: hasConnection ? (accountId || null) : null }));
    } catch (error) {
      console.error(`Error fetching connected account for channel type ${channelType}:`, error);
    }
  };

  // Auto-fetch spend data and action points for channels on mount
  useEffect(() => {
    if (!activePlan || !activePlan.channels) return;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlan?.id, clientId]); // Only refetch when plan or client changes

  // Generate month data from weekly plans and live spend data
  const generateMonthDataFromWeeklyPlans = (
    weeklyPlans: any[], 
    monthBudget: number, 
    channelId: string,
    liveData?: any[],
    accountId?: string | null,
    hasConnectedAccount?: boolean,
    selectedMonth?: Date
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
    
    // Calculate daily target
    const dailyTarget = monthBudget / allDays.length;
    
    // Create a map of dates to spend from live data
    const liveSpendByDate = new Map<string, number>();
    
    // Process live spend data if available
    if (liveData && liveData.length > 0) {
      liveData.forEach((item) => {
        // Filter by account ID if provided (to show only data for the connected account)
        // For Google Ads, use customerId; for Meta Ads, use accountId
        if (accountId) {
          if (item.accountId) {
            // Meta Ads format
            const itemAccountId = String(item.accountId);
            const connectedId = String(accountId);
            if (itemAccountId !== connectedId) {
              return;
            }
          } else if (item.customerId) {
            // Google Ads format - customerId is formatted like "123-456-7890"
            const itemCustomerId = String(item.customerId);
            const connectedId = String(accountId);
            // Compare both with and without dashes
            const itemClean = itemCustomerId.replace(/-/g, '');
            const connectedClean = connectedId.replace(/-/g, '');
            if (itemClean !== connectedClean && itemCustomerId !== connectedId) {
              return;
            }
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
    
    // Create a map of dates to spend from weekly plans
    const plannedSpendByDate = new Map<string, number>();
    
    // Process weekly plans to distribute spend across days
    // For the planned line, always use budget_planned from the media plan
    weeklyPlans.forEach((wp) => {
      const weekStart = parseISO(wp.week_commencing);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      // Always use planned budget from the media plan for the planned line
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
    
    // Keep planned and actual spend separate
    // Actual spend comes from live API data only
    // Planned spend comes from weekly plans only
    
    // Check if we have any live spend data
    const hasLiveSpendData = hasConnectedAccount && liveData && liveData.length > 0 && accountId;
    
    // Build cumulative data
    // Meta API returns daily spend (not cumulative), so we accumulate day by day
    let cumulativeActual = 0;
    let cumulativePlanned = 0;
    
    return allDays.map((date, index) => {
      const dateKey = format(date, 'yyyy-MM-dd');
      
      // Get planned spend for this day (from weekly plans only)
      const plannedDaySpend = plannedSpendByDate.get(dateKey) || 0;
      cumulativePlanned += plannedDaySpend;
      
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
        plannedSpend: cumulativePlanned / 100, // Convert from cents to dollars
        projectedSpend: null, // Will be calculated in MediaChannelCard
        projected: false
      };
    });
  };

  // Transform active plan channels to MediaChannelCard format
  const transformChannels = () => {
    if (!activePlan || !activePlan.channels || activePlan.channels.length === 0) {
      return [];
    }

    return activePlan.channels.map((channel) => {
      // Ensure weekly_plans exists
      const weeklyPlans = channel.weekly_plans || [];
      
      const channelType = getChannelDisplayName(channel.channel, channel.detail);
      const accountId = connectedAccountIds[channelType] ?? null;
      const hasConnectedAccount = !!accountId && !!connectedAccounts[channelType];
      
      // Get selected month for this channel (default to current month)
      const selectedMonth = selectedMonths[channel.id] || new Date();
      
      // Calculate month budget for selected month
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
      const finalSelectedMonthBudget = selectedMonthBudget > 0 ? selectedMonthBudget : estimatedSelectedMonthBudget;
      
      return {
        id: channel.id,
        name: channelType,
        icon: getChannelIcon(channel.channel),
        status: 'Active' as const,
        actionPoints: actionPoints[channelType] || [],
        monthBudget: finalSelectedMonthBudget / 100, // Convert from cents
        spendData: generateMonthDataFromWeeklyPlans(
          weeklyPlans, 
          finalSelectedMonthBudget, 
          channel.id,
          liveSpendData[channel.id],
          accountId,
          hasConnectedAccount,
          selectedMonth
        ),
        isMetaAds: isMetaAdsChannel(channel.channel),
        onRefreshSpend: () => fetchLiveSpendData(channel.id, channel.channel, selectedMonth),
        onMonthChange: (month: Date) => {
          // Update selected month and fetch data for the new month
          setSelectedMonths(prev => ({ ...prev, [channel.id]: month }));
          if (isMetaAdsChannel(channel.channel) || isGoogleAdsChannel(channel.channel)) {
            fetchLiveSpendData(channel.id, channel.channel, month);
          }
        },
        isFetchingSpend: fetchingSpend[channel.id] || false,
        spendError: spendErrors[channel.id],
        onActionPointsChange: () => fetchActionPoints(channelType),
        channelType: channelType,
        connectedAccount: connectedAccounts[channelType] ?? undefined,
        liveSpendData: liveSpendData[channel.id] || [],
        connectedAccountId: accountId
      };
    });
  };

  const channels = transformChannels();

  // If no active plan, show empty state
  if (!activePlan) {
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

  // If active plan exists but no channels, show different message
  if (channels.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-[#0f172a]">Media Channels</h2>
          <p className="text-sm text-[#64748b]">No channels in active plan</p>
        </div>
        <div className="text-center py-12 bg-white rounded-lg border border-[#e2e8f0]">
          <p className="text-[#64748b] mb-4">The active media plan "{activePlan.name}" has no channels.</p>
          <p className="text-sm text-[#94a3b8]">Add channels to the plan to see pacing data here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-[#0f172a]">Media Channels</h2>
        <p className="text-sm text-[#64748b]">{channels.length} channel{channels.length !== 1 ? 's' : ''} active</p>
      </div>
      
      {channels.map((channel) => (
        <MediaChannelCard key={channel.id} channel={channel} />
      ))}
    </div>
  );
}

