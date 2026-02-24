'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, Dot, LineChart } from 'recharts';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO, addMonths, subMonths, addDays } from 'date-fns';
import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Plus, X, Edit2, Check, Trash2, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { MediaChannelEnhancedView } from '@/components/ui/media-channel-enhanced-view';
import { TimeFrame } from '@/lib/types/media-plan';
import { DateRangePicker } from '@/components/ui/date-range-picker';

interface ActionPoint {
  id: string;
  text: string;
  completed: boolean;
  category: 'SET UP' | 'HEALTH CHECK';
  frequency?: 'daily' | 'weekly' | 'fortnightly' | 'monthly' | null;
  due_date?: string | null;
}

interface SpendData {
  date: string;
  actualSpend: number | null;
  plannedSpend: number | null;
  projectedSpend: number | null;
  projected?: boolean;
}

interface LiveSpendItem {
  accountId?: string;
  accountName?: string;
  customerId?: string; // Google Ads format
  campaignId?: string; // Campaign ID
  campaignName?: string; // Campaign name
  dateStart?: string; // Meta Ads format
  dateStop?: string; // Meta Ads format
  date?: string; // Google Ads format
  spend?: number;
  currency?: string;
}

interface Campaign {
  id: string;
  name: string;
}

interface MediaChannelCardProps {
  channel: {
    id: string;
    name: string;
    icon: React.ReactNode;
    status: 'Active' | 'Review' | 'Paused';
    actionPoints: ActionPoint[];
    monthBudget: number;
    totalMonthlySpend?: number; // Total across all channels for Y-axis
    spendData: SpendData[];
    isMetaAds?: boolean;
    onRefreshSpend?: (month?: Date) => void;
    isFetchingSpend?: boolean;
    spendError?: string;
    onActionPointsChange?: () => void;
    clientId?: string;
    channelType: string;
    connectedAccount?: string | null;
    liveSpendData?: LiveSpendItem[];
    connectedAccountId?: string | null;
    selectedMonth?: Date;
    campaigns?: Campaign[];
    selectedCampaignId?: string;
    onCampaignChange?: (campaignId: string) => void;
  };
  onToggleAction?: (channelId: string, actionId: string) => void;
  onActualSpendChange?: (channelId: string, actualSpend: number) => void;
}

export default function MediaChannelCard({ channel, onToggleAction, onActualSpendChange }: MediaChannelCardProps) {
  const [completedActions, setCompletedActions] = useState<Set<string>>(
    new Set(channel.actionPoints.filter(a => a.completed).map(a => a.id))
  );
  
  // Sync completedActions with channel.actionPoints when they change
  useEffect(() => {
    setCompletedActions(new Set(channel.actionPoints.filter(a => a.completed).map(a => a.id)));
  }, [channel.actionPoints]);
  
  // Initialize selectedMonth from channel prop (which comes from parent state)
  // The parent manages the selected month per channel
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    // Use selectedMonth from channel prop if available, otherwise infer from spendData
    if (channel.selectedMonth) {
      return channel.selectedMonth;
    }
    // Try to infer from spendData - get the first date's month
    if (channel.spendData && channel.spendData.length > 0) {
      return startOfMonth(parseISO(channel.spendData[0].date));
    }
    return new Date();
  });

  // Date range state for filtering
  const [dateRange, setDateRange] = useState<{ startDate: string; endDate: string }>(() => {
    const monthStart = startOfMonth(selectedMonth);
    const monthEnd = endOfMonth(selectedMonth);
    return {
      startDate: format(monthStart, 'yyyy-MM-dd'),
      endDate: format(monthEnd, 'yyyy-MM-dd'),
    };
  });
  
  // Sync local state with prop when it changes
  useEffect(() => {
    if (channel.selectedMonth) {
      setSelectedMonth(channel.selectedMonth);
    }
  }, [channel.selectedMonth]);
  
  // Campaign filter state - "all" means show all campaigns
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(channel.selectedCampaignId || 'all');
  
  // Sync campaign filter with prop
  useEffect(() => {
    if (channel.selectedCampaignId !== undefined) {
      setSelectedCampaignId(channel.selectedCampaignId);
    }
  }, [channel.selectedCampaignId]);

  // Handle campaign change
  const handleCampaignChange = (campaignId: string) => {
    setSelectedCampaignId(campaignId);
    channel.onCampaignChange?.(campaignId);
  };
  
  const [currentList, setCurrentList] = useState<'SET UP' | 'HEALTH CHECK'>('SET UP');
  const [newActionText, setNewActionText] = useState('');
  const [newActionFrequency, setNewActionFrequency] = useState<'daily' | 'weekly' | 'fortnightly' | 'monthly'>('weekly');
  const [newActionDueDate, setNewActionDueDate] = useState('');
  const [completedOpen, setCompletedOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingFrequency, setEditingFrequency] = useState<'daily' | 'weekly' | 'fortnightly' | 'monthly'>('weekly');
  const [editingDueDate, setEditingDueDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const toggleAction = async (actionId: string) => {
    const action = channel.actionPoints.find(a => a.id === actionId);
    if (!action) return;

    const newCompleted = !completedActions.has(actionId);
    setCompletedActions(prev => {
      const newSet = new Set(prev);
      if (newCompleted) {
        newSet.add(actionId);
      } else {
        newSet.delete(actionId);
      }
      return newSet;
    });

    // Save to database
    try {
      setIsSaving(true);
      const payload: any = { id: actionId, completed: newCompleted };
      if (channel.clientId) payload.client_id = channel.clientId;
      const response = await fetch('/api/action-points', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Failed to update action point');
      }

      onToggleAction?.(channel.id, actionId);
      channel.onActionPointsChange?.();
    } catch (error) {
      console.error('Error updating action point:', error);
      // Revert on error
      setCompletedActions(prev => {
        const newSet = new Set(prev);
        if (newCompleted) {
          newSet.delete(actionId);
        } else {
          newSet.add(actionId);
        }
        return newSet;
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddAction = async () => {
    if (!newActionText.trim()) return;

    try {
      setIsSaving(true);
      const requestBody: any = {
        channel_type: channel.channelType,
        text: newActionText.trim(),
        category: currentList
      };

      // Add frequency for HEALTH CHECK items
      if (currentList === 'HEALTH CHECK') {
        requestBody.frequency = newActionFrequency;
      }

      // Add due_date for SET UP items
      if (currentList === 'SET UP' && newActionDueDate) {
        requestBody.due_date = newActionDueDate;
      }

      const response = await fetch('/api/action-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error('Failed to create action point');
      }

      setNewActionText('');
      setNewActionDueDate('');
      setNewActionFrequency('weekly');
      channel.onActionPointsChange?.();
    } catch (error) {
      console.error('Error creating action point:', error);
      alert('Failed to create action point. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartEdit = (action: ActionPoint) => {
    setEditingId(action.id);
    setEditingText(action.text);
    setEditingFrequency(action.frequency || 'weekly');
    setEditingDueDate(action.due_date || '');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editingText.trim()) return;

    try {
      setIsSaving(true);
      const updateBody: any = {
        id: editingId,
        text: editingText.trim()
      };

      // Add frequency for HEALTH CHECK items
      if (currentList === 'HEALTH CHECK') {
        updateBody.frequency = editingFrequency;
      }

      // Add due_date for SET UP items
      if (currentList === 'SET UP') {
        updateBody.due_date = editingDueDate || null;
      }

      const response = await fetch('/api/action-points', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateBody)
      });

      if (!response.ok) {
        throw new Error('Failed to update action point');
      }

      setEditingId(null);
      setEditingText('');
      setEditingFrequency('weekly');
      setEditingDueDate('');
      channel.onActionPointsChange?.();
    } catch (error) {
      console.error('Error updating action point:', error);
      alert('Failed to update action point. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingText('');
    setEditingFrequency('weekly');
    setEditingDueDate('');
  };

  const handleDeleteAction = async (actionId: string) => {
    if (!confirm('Are you sure you want to delete this action point?')) return;

    try {
      setIsSaving(true);
      const response = await fetch(`/api/action-points?id=${actionId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete action point');
      }

      // Remove from completed set if it was there
      setCompletedActions(prev => {
        const newSet = new Set(prev);
        newSet.delete(actionId);
        return newSet;
      });

      channel.onActionPointsChange?.();
    } catch (error) {
      console.error('Error deleting action point:', error);
      alert('Failed to delete action point. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const ordinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-[#22c55e] hover:bg-[#16a34a]';
      case 'Review': return 'bg-[#f59e0b] hover:bg-[#d97706]';
      case 'Paused': return 'bg-[#94a3b8] hover:bg-[#64748b]';
      default: return 'bg-[#94a3b8]';
    }
  };

  // Calculate projection using linear regression on last N days
  const calculateProjection = (data: SpendData[]): SpendData[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = format(today, 'yyyy-MM-dd');
    
    const actualData = data.filter(d => d.actualSpend !== null && !d.projected && d.date <= todayKey);
    if (actualData.length < 2) {
      // If not enough data, return data with projectedSpend as null
      return data.map(d => ({ ...d, projectedSpend: null }));
    }

    // Use last 7 days for trend
    const recentData = actualData.slice(-7);
    const n = recentData.length;
    
    // Calculate slope using simple linear regression
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    recentData.forEach((d, i) => {
      sumX += i;
      sumY += d.actualSpend || 0;
      sumXY += i * (d.actualSpend || 0);
      sumX2 += i * i;
    });
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    // Find today's index in the data
    const todayIndex = data.findIndex(d => d.date === todayKey);
    const todayActualSpend = todayIndex >= 0 && data[todayIndex]?.actualSpend !== null 
      ? data[todayIndex].actualSpend || 0
      : actualData[actualData.length - 1].actualSpend || 0;
    
    return data.map((d, i) => {
      // For dates up to today, no projection (show actual or planned)
      if (d.date <= todayKey) {
        return { ...d, projectedSpend: null };
      }
      
      // For future dates, calculate projection from today
      const daysFromToday = i - todayIndex;
      const projectedSpend = todayActualSpend + (slope * daysFromToday);
      
      return {
        ...d,
        projectedSpend: projectedSpend >= 0 ? projectedSpend : null
      };
    });
  };

  // Filter data to show only the selected date range
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = format(today, 'yyyy-MM-dd');
  const selectedMonthStart = startOfMonth(selectedMonth);
  const selectedMonthEnd = endOfMonth(selectedMonth);
  const selectedMonthStartKey = dateRange.startDate;
  const selectedMonthEndKey = dateRange.endDate;

  // Filter to show only dates within the selected date range
  const filteredData = channel.spendData.filter(d => d.date >= selectedMonthStartKey && d.date <= selectedMonthEndKey);
  
  // Sort by date to ensure proper order
  const sortedData = [...filteredData].sort((a, b) => a.date.localeCompare(b.date));
  
  const chartData = calculateProjection(sortedData);
  
  // Prepare data for actual spend: area only up to today, line continues after today
  const chartDataWithActualSpendSplit = chartData.map((d) => {
    const isAfterToday = d.date > todayKey;
    const isToday = d.date === todayKey;
    return {
      ...d,
      // For area fill: only show actualSpend up to today
      actualSpendForArea: isAfterToday ? null : d.actualSpend,
      // For line up to today: show actualSpend up to and including today
      actualSpendLineUpToToday: isAfterToday ? null : d.actualSpend,
      // For line after today: show actualSpend from today onwards (to ensure connection)
      actualSpendLineAfterToday: isToday || isAfterToday ? d.actualSpend : null,
    };
  });
  
  // Calculate planned monthly spend FOR THIS CHANNEL ONLY from the spend data
  // Get the maximum planned spend value for the selected month (matches what the graph shows)
  const plannedMonthlySpendForChannel = sortedData.length > 0
    ? Math.max(...sortedData.map(d => d.plannedSpend || 0))
    : (channel.monthBudget || 0);
  
  // Calculate Y-axis scale based on THIS CHANNEL's planned monthly spend
  // Round planned monthly spend to the nearest $100
  const increment = 100;
  const yAxisMax = Math.ceil(plannedMonthlySpendForChannel / increment) * increment;
  
  // Keep plannedMonthlySpend for backward compatibility (if needed elsewhere)
  const plannedMonthlySpend = channel.totalMonthlySpend !== undefined ? channel.totalMonthlySpend : channel.monthBudget;
  
  // Set reasonable tick count (not 1 per unit, which would be too many)
  const tickCount = Math.min(10, Math.max(5, Math.ceil(yAxisMax / increment)));
  
  // Notify parent when month changes to fetch new data
  const handleMonthChange = (newMonth: Date) => {
    setSelectedMonth(newMonth);
    // Update date range to match the new month
    const monthStart = startOfMonth(newMonth);
    const monthEnd = endOfMonth(newMonth);
    setDateRange({
      startDate: format(monthStart, 'yyyy-MM-dd'),
      endDate: format(monthEnd, 'yyyy-MM-dd'),
    });
    (channel as any).onMonthChange?.(newMonth);
  };

  // Handle custom date range changes
  const handleDateRangeChange = (newRange: { startDate: string; endDate: string }) => {
    setDateRange(newRange);
    // Update selected month to the start date's month
    const startDate = parseISO(newRange.startDate);
    setSelectedMonth(startOfMonth(startDate));
    // Optionally fetch new data for this range
    (channel as any).onMonthChange?.(startDate);
  };

  // Calculate stats (reuse today and todayKey from above)
  
  // Check if account is connected
  const hasConnectedAccount = !!channel.connectedAccountId && !!channel.connectedAccount;
  
  // Calculate Current Daily Spend from live API data (connected account only)
  // Meta Ads API with time_increment=1 returns daily spend (not cumulative) for each day
  // Google Ads API also returns daily spend
  let currentDailySpend: number | null = null;
  
  if (hasConnectedAccount && channel.liveSpendData && channel.liveSpendData.length > 0) {
    // Filter by connected account ID (handle both Meta Ads accountId and Google Ads customerId)
    const filteredLiveData = channel.liveSpendData.filter(item => {
      if (!channel.connectedAccountId) return false;
      
      // Check Meta Ads format (accountId)
      if (item.accountId) {
        const itemAccountId = String(item.accountId);
        const connectedId = String(channel.connectedAccountId);
        return itemAccountId === connectedId;
      }
      
      // Check Google Ads format (customerId)
      if (item.customerId) {
        const itemCustomerId = String(item.customerId).replace(/-/g, '');
        const connectedId = String(channel.connectedAccountId).replace(/-/g, '');
        return itemCustomerId === connectedId;
      }
      
      return false;
    });
    
    if (filteredLiveData.length > 0) {
      // Sort by date (most recent first) - handle both Meta Ads (dateStart/dateStop) and Google Ads (date)
      const sortedData = [...filteredLiveData].sort((a, b) => {
        const dateA = a.date || a.dateStart || a.dateStop || '';
        const dateB = b.date || b.dateStart || b.dateStop || '';
        return dateB.localeCompare(dateA);
      });
      
      // Try to find today's spend first
      let todaySpendItem = sortedData.find(item => {
        const itemDate = item.date || item.dateStart || item.dateStop;
        if (!itemDate) return false;
        return itemDate === todayKey;
      });
      
      // If not found, try yesterday (since today's data might not be available yet)
      if (!todaySpendItem) {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = format(yesterday, 'yyyy-MM-dd');
        todaySpendItem = sortedData.find(item => {
          const itemDate = item.date || item.dateStart || item.dateStop;
          return itemDate === yesterdayKey;
        });
      }
      
      // Use today's or yesterday's spend, or fall back to most recent
      const spendItem = todaySpendItem || sortedData[0];
      if (spendItem && spendItem.spend !== undefined && spendItem.spend !== null) {
        currentDailySpend = spendItem.spend;
      } else {
        // No spend data found - set to 0 (not null, so we show $0.00)
        currentDailySpend = 0;
      }
    } else {
      // Account connected but no data for this account - show 0
      currentDailySpend = 0;
    }
  }
  
  // Planned Monthly Spend = monthBudget (already defined above for Y-axis scaling)
  // Reuse plannedMonthlySpend from line 326
  
  // Projected Monthly Spend = current daily rate * days in month
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd }).length;
  
  let projectedMonthlySpend: number | null = null;
  
  if (hasConnectedAccount && channel.liveSpendData && channel.liveSpendData.length > 0) {
    // Calculate average daily spend from live API data (connected account only)
    // Handle both Meta Ads (accountId) and Google Ads (customerId)
    const filteredLiveData = channel.liveSpendData.filter(item => {
      if (!channel.connectedAccountId) return false;
      
      // Check Meta Ads format (accountId)
      if (item.accountId) {
        const itemAccountId = String(item.accountId);
        const connectedId = String(channel.connectedAccountId);
        return itemAccountId === connectedId;
      }
      
      // Check Google Ads format (customerId)
      if (item.customerId) {
        const itemCustomerId = String(item.customerId).replace(/-/g, '');
        const connectedId = String(channel.connectedAccountId).replace(/-/g, '');
        return itemCustomerId === connectedId;
      }
      
      return false;
    });
    
    if (filteredLiveData.length > 0) {
      // Get actual daily spend values (not cumulative)
      const dailySpends = filteredLiveData
        .map(item => item.spend || 0)
        .filter(spend => spend > 0);
      
      if (dailySpends.length > 0) {
        const averageDailySpend = dailySpends.reduce((sum, spend) => sum + spend, 0) / dailySpends.length;
        projectedMonthlySpend = averageDailySpend * daysInMonth;
      } else {
        projectedMonthlySpend = 0;
      }
    } else {
      projectedMonthlySpend = 0;
    }
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-lg p-3">
          <p className="text-sm font-semibold text-[#0f172a] mb-2">
            {format(parseISO(label), 'MMM d, yyyy')}
          </p>
          {data.plannedSpend !== null && (
            <p className="text-sm text-[#94a3b8]">
              Planned: ${data.plannedSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          )}
          {data.actualSpend !== null && (
            <p className="text-sm text-[#2563eb] font-medium">
              Actual: ${data.actualSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  const formatCurrency = (value: number) => {
    if (value === 0) {
      return '$0';
    } else if (value < 1000) {
      return `$${Math.round(value)}`;
    } else if (value < 10000) {
      return `$${(value / 1000).toFixed(1)}k`;
    } else {
      return `$${Math.round(value / 1000)}k`;
    }
  };

  const formatDate = (dateStr: string) => {
    return format(parseISO(dateStr), 'd');
  };

  // Calculate pacing status
  const calculatePacingStatus = () => {
    if (!hasConnectedAccount || projectedMonthlySpend === null || plannedMonthlySpendForChannel === 0) {
      return null;
    }

    // Calculate percentage difference: (projected - planned) / planned * 100
    const percentageDiff = ((projectedMonthlySpend - plannedMonthlySpendForChannel) / plannedMonthlySpendForChannel) * 100;
    
    // Determine status based on percentage difference
    // Green: within ±10% (on track)
    // Orange: ±10% to ±20% (warning)
    // Red: beyond ±20% (off track)
    const isOver = percentageDiff > 0;
    const absPercentage = Math.abs(percentageDiff);
    const statusText = isOver ? 'OVER SPENDING' : 'UNDER SPENDING';
    
    if (absPercentage <= 10) {
      return { color: 'green', percentage: absPercentage, isOver, statusText: 'ON TRACK' };
    } else if (absPercentage <= 20) {
      return { color: 'orange', percentage: absPercentage, isOver, statusText };
    } else {
      return { color: 'red', percentage: absPercentage, isOver, statusText };
    }
  };

  const pacingStatus = calculatePacingStatus();

  // Convert spend data to TimeFrame format for MediaChannelEnhancedView
  // Group spend data by week/period to match TimeFrame structure
  const convertToTimeFrames = (): TimeFrame[] => {
    if (!channel.liveSpendData || channel.liveSpendData.length === 0) {
      return [];
    }

    // Group data by date and aggregate metrics
    const dataByDate = new Map<string, {
      date: string;
      spend: number;
      impressions: number;
      reach: number;
      clicks: number;
      conversions: number;
      frequency: number;
      impressionWeight: number; // For weighted average of frequency
    }>();

    channel.liveSpendData.forEach((item) => {
      // Filter by connected account if applicable
      if (channel.connectedAccountId) {
        let matches = false;
        if (item.accountId) {
          matches = String(item.accountId) === String(channel.connectedAccountId);
        } else if (item.customerId) {
          const itemId = String(item.customerId).replace(/-/g, '');
          const connectedId = String(channel.connectedAccountId).replace(/-/g, '');
          matches = itemId === connectedId;
        }
        if (!matches) return;
      }

      // Filter by selected campaign if applicable
      if (selectedCampaignId && selectedCampaignId !== 'all') {
        if (item.campaignId !== selectedCampaignId) return;
      }

      // Get date from item (handle both Meta and Google formats)
      const dateKey = item.date || item.dateStart || '';
      if (!dateKey) return;

      // Filter to selected month only
      if (dateKey < selectedMonthStartKey || dateKey > selectedMonthEndKey) return;

      const existing = dataByDate.get(dateKey);
      const spend = item.spend || 0;
      const impressions = (item as any).impressions || 0;
      const reach = (item as any).reach || 0;
      const clicks = (item as any).clicks || 0;
      const conversions = (item as any).conversions || 0;
      const frequency = (item as any).frequency || 0;

      if (existing) {
        existing.spend += spend;
        existing.impressions += impressions;
        existing.reach += reach;
        existing.clicks += clicks;
        existing.conversions += conversions;
        // Weighted average for frequency
        existing.impressionWeight += impressions;
        if (impressions > 0 && frequency > 0) {
          existing.frequency += frequency * impressions;
        }
      } else {
        dataByDate.set(dateKey, {
          date: dateKey,
          spend,
          impressions,
          reach,
          clicks,
          conversions,
          frequency: impressions > 0 && frequency > 0 ? frequency * impressions : 0,
          impressionWeight: impressions,
        });
      }
    });

    // Convert map to TimeFrame array
    // Group by week for better aggregation
    const timeFrames: TimeFrame[] = [];
    const sortedDates = Array.from(dataByDate.keys()).sort();

    if (sortedDates.length === 0) return [];

    // Group dates by week
    let weekStart = sortedDates[0];
    let weekData = {
      spend: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      conversions: 0,
      frequency: 0,
      impressionWeight: 0,
    };

    sortedDates.forEach((dateKey, index) => {
      const data = dataByDate.get(dateKey)!;
      weekData.spend += data.spend;
      weekData.impressions += data.impressions;
      weekData.reach += data.reach;
      weekData.clicks += data.clicks;
      weekData.conversions += data.conversions;
      weekData.frequency += data.frequency;
      weekData.impressionWeight += data.impressionWeight;

      // Check if we should close this week (every 7 days or last item)
      const currentDate = parseISO(dateKey);
      const startDate = parseISO(weekStart);
      const daysDiff = Math.floor((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysDiff >= 6 || index === sortedDates.length - 1) {
        // Calculate metrics
        const ctr = weekData.impressions > 0 ? weekData.clicks / weekData.impressions : 0;
        const cpc = weekData.clicks > 0 ? weekData.spend / weekData.clicks : 0;
        const cpm = weekData.impressions > 0 ? (weekData.spend / weekData.impressions) * 1000 : 0;
        const avgFrequency = weekData.impressionWeight > 0 ? weekData.frequency / weekData.impressionWeight : 0;

        timeFrames.push({
          period: `${format(startDate, 'MMM d')} - ${format(currentDate, 'MMM d')}`,
          planned: 0, // We don't have weekly planned from this view
          actual: weekData.spend,
          startDate: weekStart,
          endDate: dateKey,
          impressions: weekData.impressions,
          reach: weekData.reach,
          clicks: weekData.clicks,
          ctr,
          cpc,
          cpm,
          conversions: weekData.conversions,
          frequency: avgFrequency,
        });

        // Reset for next week
        if (index < sortedDates.length - 1) {
          weekStart = sortedDates[index + 1];
          weekData = {
            spend: 0,
            impressions: 0,
            reach: 0,
            clicks: 0,
            conversions: 0,
            frequency: 0,
            impressionWeight: 0,
          };
        }
      }
    });

    return timeFrames;
  };

  const timeFrames = convertToTimeFrames();

  // Determine platform type from channel name
  const getPlatformType = (): 'meta-ads' | 'google-ads' | 'organic' | 'other' => {
    const lowerName = channel.name.toLowerCase();
    if (lowerName.includes('meta') || lowerName.includes('facebook') || lowerName.includes('instagram')) {
      return 'meta-ads';
    }
    if (lowerName.includes('google')) {
      return 'google-ads';
    }
    if (lowerName.includes('organic') || lowerName.includes('seo')) {
      return 'organic';
    }
    return 'other';
  };

  const platformType = getPlatformType();

  // Calculate month progress (percentage through the selected month)
  const daysInSelectedMonth = eachDayOfInterval({ start: selectedMonthStart, end: selectedMonthEnd }).length;
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);
  
  let monthProgress = 0;
  if (selectedMonthStart <= currentDate && currentDate <= selectedMonthEnd) {
    // We're in the selected month
    const daysElapsed = Math.floor((currentDate.getTime() - selectedMonthStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    monthProgress = (daysElapsed / daysInSelectedMonth) * 100;
  } else if (currentDate > selectedMonthEnd) {
    // Selected month is in the past
    monthProgress = 100;
  } else {
    // Selected month is in the future
    monthProgress = 0;
  }
  
  // Calculate spend progress (actual spend / planned spend * 100)
  // Get the last actual spend value from chart data (matches what the graph shows)
  // This is the cumulative actual spend up to today, which is what the graph displays
  const lastActualSpendData = chartDataWithActualSpendSplit
    .filter(d => d.actualSpendLineUpToToday !== null && d.date <= todayKey)
    .slice(-1)[0];
  
  const totalActualSpend = lastActualSpendData?.actualSpendLineUpToToday ?? 0;

  const spendProgress = plannedMonthlySpendForChannel > 0
    ? (totalActualSpend / plannedMonthlySpendForChannel) * 100
    : 0;

  // Notify parent when actual spend changes (from live API data)
  // Use ref to track previous value and only notify on actual changes
  const prevTotalActualSpendRef = useRef<number>(totalActualSpend);

  useEffect(() => {
    if (prevTotalActualSpendRef.current !== totalActualSpend) {
      prevTotalActualSpendRef.current = totalActualSpend;
      onActualSpendChange?.(channel.id, totalActualSpend);
    }
  }, [totalActualSpend, channel.id, onActualSpendChange]);

  return (
    <Card className="bg-white shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 ease-in-out relative">
      {channel.onRefreshSpend && (
        <div className="absolute top-4 right-4 z-10">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              console.log(`[MediaChannelCard] Refresh button clicked for channel:`, {
                channelId: channel.id,
                channelName: channel.name,
                selectedMonth: selectedMonth,
                hasRefreshHandler: !!channel.onRefreshSpend
              });
              channel.onRefreshSpend?.(selectedMonth);
            }}
            disabled={channel.isFetchingSpend}
            className="h-7 text-xs"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${channel.isFetchingSpend ? 'animate-spin' : ''}`} />
            {channel.isFetchingSpend ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      )}
      <CardContent className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Section - Actions (40%) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Header */}
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-6 h-6" role="img" aria-label={`${channel.name} icon`}>
                {channel.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-semibold text-[#0f172a]">
                    {channel.name}
                  </h3>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={`${getStatusColor(channel.status)} text-white font-medium`}>
                    {channel.status}
                  </Badge>
                  <span className="text-xs text-[#64748b]">
                    {channel.connectedAccount || 'No Account Connected'}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Points */}
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-[#0f172a]">Action Items</h4>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentList(currentList === 'SET UP' ? 'HEALTH CHECK' : 'SET UP')}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <span className="text-xs font-semibold min-w-[100px] text-center">
                    {currentList === 'HEALTH CHECK' ? 'ONGOING' : currentList}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentList(currentList === 'SET UP' ? 'HEALTH CHECK' : 'SET UP')}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Action points list */}
              {(() => {
                const sortByDueDate = (a: ActionPoint, b: ActionPoint) => {
                  if (!a.due_date && !b.due_date) return 0;
                  if (!a.due_date) return 1;
                  if (!b.due_date) return -1;
                  return a.due_date.localeCompare(b.due_date);
                };

                const listItems = channel.actionPoints.filter(ap => ap.category === currentList);
                const incompleteItems = listItems.filter(a => !completedActions.has(a.id)).sort(sortByDueDate);
                const completedItems = listItems.filter(a => completedActions.has(a.id)).sort(sortByDueDate);

                if (listItems.length === 0) {
                  return (
                    <p className="text-xs text-[#94a3b8] text-center py-4">
                      No {currentList === 'HEALTH CHECK' ? 'ONGOING' : currentList.toLowerCase()} items yet.
                    </p>
                  );
                }

                const renderActionRow = (action: ActionPoint) => {
                  const isCompleted = completedActions.has(action.id);
                  const isEditing = editingId === action.id;
                  return (
                  <div
                    key={action.id}
                    className="group flex items-start gap-2 p-3 rounded-lg bg-[#f8fafc] hover:bg-[#e2e8f0] transition-colors duration-200 ease-in-out border border-transparent hover:border-[#cbd5e1]"
                  >
                      <Checkbox
                        checked={isCompleted}
                        onCheckedChange={() => toggleAction(action.id)}
                        disabled={isSaving}
                        aria-label={`Mark action ${isCompleted ? 'incomplete' : 'complete'}`}
                        className="mt-0.5"
                      />
                      
                      {isEditing ? (
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <Input
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !isSaving) {
                                  e.preventDefault();
                                  handleSaveEdit();
                                } else if (e.key === 'Escape') {
                                  handleCancelEdit();
                                }
                              }}
                              disabled={isSaving}
                              className="h-7 text-sm flex-1"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handleSaveEdit}
                              disabled={!editingText.trim() || isSaving}
                              className="h-7 w-7 p-0"
                            >
                              <Check className="h-3 w-3 text-green-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handleCancelEdit}
                              disabled={isSaving}
                              className="h-7 w-7 p-0"
                            >
                              <X className="h-3 w-3 text-gray-500" />
                            </Button>
                          </div>
                          {currentList === 'HEALTH CHECK' && (
                            <Select
                              value={editingFrequency}
                              onValueChange={(value: 'daily' | 'weekly' | 'fortnightly' | 'monthly') => setEditingFrequency(value)}
                              disabled={isSaving}
                            >
                              <SelectTrigger className="h-7 text-xs w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="daily">Daily</SelectItem>
                                <SelectItem value="weekly">Weekly</SelectItem>
                                <SelectItem value="fortnightly">Fortnightly</SelectItem>
                                <SelectItem value="monthly">Monthly</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                          {currentList === 'SET UP' && (
                            <Input
                              type="date"
                              value={editingDueDate}
                              onChange={(e) => setEditingDueDate(e.target.value)}
                              disabled={isSaving}
                              className="h-7 text-xs"
                              placeholder="Due date"
                            />
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-sm ${
                                isCompleted
                                  ? 'line-through text-[#94a3b8]'
                                  : 'text-[#0f172a]'
                              }`}
                            >
                              {action.text}
                            </span>
                            {currentList === 'HEALTH CHECK' && action.frequency && (
                              <Badge variant="outline" className="text-xs">
                                {action.frequency}
                              </Badge>
                            )}
                            {currentList === 'SET UP' && action.due_date && (
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  (() => {
                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0);
                                    const dueDate = new Date(action.due_date);
                                    dueDate.setHours(0, 0, 0, 0);
                                    const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                    return daysUntil < 0 ? 'text-red-600 border-red-600' :
                                           daysUntil === 0 ? 'text-orange-600 border-orange-600' :
                                           daysUntil <= 3 ? 'text-yellow-600 border-yellow-600' : '';
                                  })()
                                }`}
                              >
                                {(() => {
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);
                                  const dueDate = new Date(action.due_date);
                                  dueDate.setHours(0, 0, 0, 0);
                                  const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                  const parsed = parseISO(action.due_date);
                                  const dayNum = parseInt(format(parsed, 'd'), 10);
                                  const dateStr = `Due ${ordinal(dayNum)} ${format(parsed, 'MMM')}`;
                                  if (daysUntil < 0) return 'Overdue';
                                  if (daysUntil === 0) return 'Due today';
                                  if (daysUntil <= 3) return `${dateStr} | ${daysUntil} Day${daysUntil === 1 ? '' : 's'}`;
                                  return dateStr;
                                })()}
                              </Badge>
                            )}
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartEdit(action);
                              }}
                              disabled={isSaving}
                              className="h-6 w-6 p-0"
                            >
                              <Edit2 className="h-3 w-3 text-gray-500" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteAction(action.id);
                              }}
                              disabled={isSaving}
                              className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                };

                return (
                  <>
                    {incompleteItems.length === 0 && completedItems.length === 0 ? null : (
                      <>
                        {incompleteItems.map(renderActionRow)}

                        {completedItems.length > 0 && (
                          <div className="mt-2">
                            <button
                              onClick={() => setCompletedOpen(v => !v)}
                              className="flex items-center gap-1.5 text-xs text-[#94a3b8] hover:text-[#64748b] transition-colors py-1 w-full text-left"
                            >
                              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${completedOpen ? '' : '-rotate-90'}`} />
                              Completed Tasks ({completedItems.length})
                            </button>
                            {completedOpen && (
                              <div className="mt-1 space-y-0.5">
                                {completedItems.map(renderActionRow)}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </>
                );
              })()}
              
              {/* Add new action item - at bottom */}
              <div className="flex gap-2 mt-3 pt-3 border-t border-[#e2e8f0]">
                <Input
                  placeholder="Add new action item..."
                  value={newActionText}
                  onChange={(e) => setNewActionText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isSaving) {
                      e.preventDefault();
                      handleAddAction();
                    }
                  }}
                  disabled={isSaving}
                  className="h-8 text-sm flex-1"
                />
                {currentList === 'HEALTH CHECK' && (
                  <Select
                    value={newActionFrequency}
                    onValueChange={(value: 'daily' | 'weekly' | 'fortnightly' | 'monthly') => setNewActionFrequency(value)}
                    disabled={isSaving}
                  >
                    <SelectTrigger className="h-8 text-xs w-[120px]">
                      <SelectValue placeholder="Frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="fortnightly">Fortnightly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {currentList === 'SET UP' && (
                  <Input
                    type="date"
                    value={newActionDueDate}
                    onChange={(e) => setNewActionDueDate(e.target.value)}
                    disabled={isSaving}
                    className="h-8 text-xs w-[140px]"
                    placeholder="Due date"
                  />
                )}
                <Button
                  size="sm"
                  onClick={handleAddAction}
                  disabled={!newActionText.trim() || isSaving}
                  className="h-8 px-3"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
            </div>
          </div>

          {/* Right Section - Chart (60%) */}
          <div className="lg:col-span-3">
            <MediaChannelEnhancedView
              timeFrames={timeFrames}
              platformType={platformType}
              channelName={channel.name}
              selectedMonth={selectedMonth}
              budgetPacingHeader={
                <div className="flex items-center justify-between mb-3 gap-2">
                  <div className="flex items-center gap-3">
                    {/* Month Navigation */}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleMonthChange(subMonths(selectedMonth, 1))}
                        className="h-7 w-7 p-0"
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </Button>
                      <span className="text-xs font-medium text-[#0f172a] min-w-[80px] text-center">
                        {format(selectedMonth, 'MMM yyyy')}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleMonthChange(addMonths(selectedMonth, 1))}
                        className="h-7 w-7 p-0"
                      >
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                    {/* Date Range Picker */}
                    <DateRangePicker
                      value={dateRange}
                      onChange={handleDateRangeChange}
                      disabled={channel.isFetchingSpend}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Campaign Filter */}
                    {channel.campaigns && channel.campaigns.length > 0 && (
                      <Select value={selectedCampaignId} onValueChange={handleCampaignChange}>
                        <SelectTrigger className="h-7 text-xs w-[180px]">
                          <SelectValue placeholder="All Campaigns" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Campaigns</SelectItem>
                          {channel.campaigns.map((campaign) => (
                            <SelectItem key={campaign.id} value={campaign.id}>
                              {campaign.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              }
              budgetView={
                <>
                  {channel.spendError && (
                    <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                      {channel.spendError}
                    </div>
                  )}

                  {/* Stats Section */}
                  <div className="mb-4">
                    {/* Stats Columns */}
                    <div className="grid grid-cols-3 gap-3">
                    <div className="bg-[#f8fafc] rounded-lg p-3 border border-[#e2e8f0]">
                      <p className="text-xs text-[#64748b] mb-1">Current Daily Spend</p>
                      <p className="text-lg font-semibold text-[#0f172a]">
                        {hasConnectedAccount && currentDailySpend !== null
                          ? `$${currentDailySpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '—'}
                      </p>
                    </div>
                    <div className="bg-[#f8fafc] rounded-lg p-3 border border-[#e2e8f0]">
                      <p className="text-xs text-[#64748b] mb-1">Net Planned Spend</p>
                      <p className="text-lg font-semibold text-[#0f172a]">
                        ${plannedMonthlySpendForChannel.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="bg-[#f8fafc] rounded-lg p-3 border border-[#e2e8f0]">
                      <p className="text-xs text-[#64748b] mb-1">Actual Spend (Net)</p>
                      <p className="text-lg font-semibold text-[#0f172a]">
                        ${totalActualSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    </div>
                  </div>

                  {/* Progress Bars Section */}
                  <div className="space-y-3 mb-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[#64748b]">Month Progress</span>
                        <span className="text-xs font-semibold text-[#0f172a]">{monthProgress.toFixed(1)}%</span>
                      </div>
                      <Progress value={monthProgress} className="h-2" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[#64748b]">Spend Progress</span>
                        <span className="text-xs font-semibold text-[#0f172a]">
                          {hasConnectedAccount ? `${spendProgress.toFixed(1)}%` : '—'}
                        </span>
                      </div>
                      <Progress
                        value={spendProgress > 100 ? 100 : spendProgress}
                        className={`h-2 ${
                          spendProgress > 100
                            ? '[&>div]:bg-red-500'
                            : '[&>div]:bg-green-500'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="relative">
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={chartDataWithActualSpendSplit}
                          margin={{ top: 10, right: 10, left: 0, bottom: 25 }}
                        >
                          <defs>
                            {/* Meta graph style: Light grey planned spend gradient */}
                            <linearGradient id={`colorPlanned-${channel.id}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.5} />
                              <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.5} />
                            </linearGradient>
                            {/* Meta graph style: Blue actual spend gradient */}
                            <linearGradient id={`colorActual-${channel.id}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.9} />
                              <stop offset="95%" stopColor="#2563eb" stopOpacity={0.3} />
                            </linearGradient>
                            <linearGradient id={`colorProjected-${channel.id}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#93c5fd" stopOpacity={0.6} />
                              <stop offset="95%" stopColor="#93c5fd" stopOpacity={0.1} />
                            </linearGradient>
                          </defs>

                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />

                          <XAxis
                            dataKey="date"
                            tickFormatter={formatDate}
                            stroke="#64748b"
                            style={{ fontSize: '12px' }}
                            interval={0}
                            domain={['dataMin', 'dataMax']}
                          />

                        <YAxis
                          tickFormatter={formatCurrency}
                          stroke="#64748b"
                          style={{ fontSize: '12px' }}
                          domain={[0, yAxisMax]}
                          tickCount={tickCount}
                        />

                        <Tooltip content={<CustomTooltip />} />

                        {/* Meta graph style: Planned Spend - light grey dashed diagonal line with area fill */}
                        <Area
                          type="monotone"
                          dataKey="plannedSpend"
                          stroke="#94a3b8"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          fill={`url(#colorPlanned-${channel.id})`}
                          fillOpacity={0.5}
                          connectNulls={false}
                          animationDuration={1500}
                          animationEasing="ease-in-out"
                          style={{ stroke: '#94a3b8' }}
                        />

                        {/* Meta graph style: Actual Spend Area - blue area fill under the line */}
                        <Area
                          type="monotone"
                          dataKey="actualSpendForArea"
                          stroke="none"
                          fill="#2563eb"
                          fillOpacity={0.3}
                          connectNulls={false}
                          animationDuration={1500}
                          animationEasing="ease-in-out"
                        />

                        {/* Meta graph style: Actual Spend Line - solid blue line with circular markers */}
                        <Line
                          type="monotone"
                          dataKey="actualSpendLineUpToToday"
                          stroke="#2563eb"
                          strokeWidth={2.5}
                          style={{ stroke: '#2563eb' }}
                          dot={(props: any) => {
                            if (props.payload.date > todayKey) {
                              return null; // Don't show dots after today
                            }
                            return (
                              <Dot
                                {...props}
                                r={4}
                                fill="#2563eb"
                                stroke="#fff"
                                strokeWidth={2}
                                style={{ fill: '#2563eb', stroke: '#fff' }}
                              />
                            );
                          }}
                          connectNulls={false}
                          animationDuration={1500}
                          animationEasing="ease-in-out"
                        />

                        {/* Actual Spend Line - dotted after today */}
                        <Line
                          type="monotone"
                          dataKey="actualSpendLineAfterToday"
                          stroke="#2563eb"
                          strokeWidth={2.5}
                          strokeDasharray="5 5"
                          dot={false}
                          connectNulls={false}
                          animationDuration={1500}
                          animationEasing="ease-in-out"
                          style={{ stroke: '#2563eb' }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                    </div>
                    <div className="absolute left-0 right-[10px] bottom-[-20px] text-center">
                      <p className="text-base font-semibold text-[#64748b] tracking-wide">
                        {format(selectedMonth, 'MMMM').toUpperCase()}
                      </p>
                    </div>
                  </div>
                </>
              }
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

