'use client';

import MediaChannelCard from './MediaChannelCard';
import { Facebook, Search, Linkedin, Music, Instagram } from 'lucide-react';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
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
}

export default function MediaChannels({ activePlan }: MediaChannelsProps) {
  const [liveSpendData, setLiveSpendData] = useState<Record<string, any[]>>({});
  const [fetchingSpend, setFetchingSpend] = useState<Record<string, boolean>>({});
  const [spendErrors, setSpendErrors] = useState<Record<string, string>>({});
  const [actionPoints, setActionPoints] = useState<Record<string, any[]>>({});

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

  // Fetch live spend data for Meta Ads
  const fetchLiveSpendData = async (channelId: string, channelName: string) => {
    if (!isMetaAdsChannel(channelName)) {
      return;
    }

    setFetchingSpend(prev => ({ ...prev, [channelId]: true }));
    setSpendErrors(prev => ({ ...prev, [channelId]: '' }));

    try {
      const today = new Date();
      const monthStart = startOfMonth(today);
      const monthEnd = endOfMonth(today);

      const startDate = format(monthStart, 'yyyy-MM-dd');
      const endDate = format(monthEnd, 'yyyy-MM-dd');

      const response = await fetch('/api/ads/meta/fetch-spend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          platform: 'meta-ads',
          startDate,
          endDate,
        }),
      });

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

  // Auto-fetch spend data and action points for channels on mount
  useEffect(() => {
    if (!activePlan || !activePlan.channels) return;

    activePlan.channels.forEach((channel) => {
      if (isMetaAdsChannel(channel.channel)) {
        fetchLiveSpendData(channel.id, channel.channel);
      }
      const channelType = getChannelDisplayName(channel.channel, channel.detail);
      fetchActionPoints(channelType);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlan?.id]); // Only refetch when plan changes

  // Generate month data from weekly plans and live spend data
  const generateMonthDataFromWeeklyPlans = (
    weeklyPlans: any[], 
    monthBudget: number, 
    channelId: string,
    liveData?: any[]
  ) => {
    const today = new Date();
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    // Calculate daily target
    const dailyTarget = monthBudget / allDays.length;
    
    // Create a map of dates to spend from live data
    const liveSpendByDate = new Map<string, number>();
    
    // Process live spend data if available
    if (liveData && liveData.length > 0) {
      liveData.forEach((item) => {
        if (item.dateStart && item.spend !== undefined) {
          // Meta API returns date ranges, use dateStart for daily aggregation
          // If dateStart and dateStop are different, we'll use dateStart
          // (for daily data, they should be the same)
          const dateKey = item.dateStart; // API returns YYYY-MM-DD format
          // Sum spend for the same date (in case of multiple accounts or date ranges)
          liveSpendByDate.set(dateKey, (liveSpendByDate.get(dateKey) || 0) + (item.spend || 0));
        }
      });
    }
    
    // Create a map of dates to spend from weekly plans
    const plannedSpendByDate = new Map<string, number>();
    
    // Process weekly plans to distribute spend across days
    weeklyPlans.forEach((wp) => {
      const weekStart = parseISO(wp.week_commencing);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      // Use actual spend if available, otherwise use planned
      const weekSpend = wp.budget_actual || wp.budget_planned || 0;
      const dailySpend = weekSpend / 7;
      
      // Distribute across days in the week
      for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(day.getDate() + i);
        
        if (isWithinInterval(day, { start: monthStart, end: monthEnd })) {
          const dateKey = format(day, 'yyyy-MM-dd');
          plannedSpendByDate.set(dateKey, (plannedSpendByDate.get(dateKey) || 0) + dailySpend);
        }
      }
    });
    
    // Merge live data with planned data (live data takes precedence)
    const spendByDate = new Map<string, number>();
    
    // First, add planned spend
    plannedSpendByDate.forEach((spend, date) => {
      spendByDate.set(date, spend);
    });
    
    // Then, override with live data where available
    liveSpendByDate.forEach((spend, date) => {
      spendByDate.set(date, spend * 100); // Convert dollars to cents to match planned data format
    });
    
    // Check if we have any spend data at all
    const hasAnySpend = Array.from(spendByDate.values()).some(spend => spend > 0);
    
    // Build cumulative data
    let cumulativeActual = 0;
    let cumulativeTarget = 0;
    
    return allDays.map((date, index) => {
      const dateKey = format(date, 'yyyy-MM-dd');
      const daySpend = spendByDate.get(dateKey) || 0;
      cumulativeActual += daySpend;
      cumulativeTarget += dailyTarget;
      
      return {
        date: dateKey,
        actualSpend: hasAnySpend ? cumulativeActual / 100 : null, // Convert from cents, show cumulative if we have any spend
        targetSpend: cumulativeTarget / 100, // Convert from cents
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
      
      // Calculate month budget from weekly plans
      const currentMonth = new Date();
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      
      // Get weekly plans for current month
      const monthWeeklyPlans = weeklyPlans.filter((wp) => {
        if (!wp.week_commencing) return false;
        const weekStart = parseISO(wp.week_commencing);
        return isWithinInterval(weekStart, { start: monthStart, end: monthEnd });
      });
      
      // Calculate month budget (sum of planned budgets for weeks in this month)
      const monthBudget = monthWeeklyPlans.reduce((sum, wp) => sum + (wp.budget_planned || 0), 0);
      
      // If no weekly plans for this month, use average weekly budget
      const avgWeeklyBudget = weeklyPlans.length > 0
        ? weeklyPlans.reduce((sum, wp) => sum + (wp.budget_planned || 0), 0) / weeklyPlans.length
        : 0;
      const estimatedMonthBudget = avgWeeklyBudget * 4.33; // Average weeks per month
      
      const finalMonthBudget = monthBudget > 0 ? monthBudget : estimatedMonthBudget;
      
      const channelType = getChannelDisplayName(channel.channel, channel.detail);
      return {
        id: channel.id,
        name: channelType,
        icon: getChannelIcon(channel.channel),
        status: 'Active' as const,
        actionPoints: actionPoints[channelType] || [],
        monthBudget: finalMonthBudget / 100, // Convert from cents
        spendData: generateMonthDataFromWeeklyPlans(
          weeklyPlans, 
          finalMonthBudget, 
          channel.id,
          liveSpendData[channel.id]
        ),
        isMetaAds: isMetaAdsChannel(channel.channel),
        onRefreshSpend: () => fetchLiveSpendData(channel.id, channel.channel),
        isFetchingSpend: fetchingSpend[channel.id] || false,
        spendError: spendErrors[channel.id],
        onActionPointsChange: () => fetchActionPoints(channelType),
        channelType: channelType
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

