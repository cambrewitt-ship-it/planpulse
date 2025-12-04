'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, Dot, LineChart } from 'recharts';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO, addMonths, subMonths, addDays } from 'date-fns';
import { useState } from 'react';
import { RefreshCw, Plus, X, Edit2, Check, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

interface ActionPoint {
  id: string;
  text: string;
  completed: boolean;
  category: 'SET UP' | 'ONGOING';
  reset_frequency?: 'weekly' | 'fortnightly' | 'monthly' | null;
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
  dateStart?: string; // Meta Ads format
  dateStop?: string; // Meta Ads format
  date?: string; // Google Ads format
  spend?: number;
  currency?: string;
}

interface MediaChannelCardProps {
  channel: {
    id: string;
    name: string;
    icon: React.ReactNode;
    status: 'Active' | 'Review' | 'Paused';
    actionPoints: ActionPoint[];
    monthBudget: number;
    spendData: SpendData[];
    isMetaAds?: boolean;
    onRefreshSpend?: () => void;
    isFetchingSpend?: boolean;
    spendError?: string;
    onActionPointsChange?: () => void;
    channelType: string;
    connectedAccount?: string | null;
    liveSpendData?: LiveSpendItem[];
    connectedAccountId?: string | null;
  };
  onToggleAction?: (channelId: string, actionId: string) => void;
}

export default function MediaChannelCard({ channel, onToggleAction }: MediaChannelCardProps) {
  const [completedActions, setCompletedActions] = useState<Set<string>>(
    new Set(channel.actionPoints.filter(a => a.completed).map(a => a.id))
  );
  // Initialize selectedMonth from channel data (which comes from parent state)
  // The parent manages the selected month per channel
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    // Try to infer from spendData - get the first date's month
    if (channel.spendData && channel.spendData.length > 0) {
      return startOfMonth(parseISO(channel.spendData[0].date));
    }
    return new Date();
  });
  const [newActionText, setNewActionText] = useState('');
  const [newActionCategory, setNewActionCategory] = useState<'SET UP' | 'ONGOING'>('SET UP');
  const [newActionResetFrequency, setNewActionResetFrequency] = useState<'weekly' | 'fortnightly' | 'monthly'>('weekly');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingCategory, setEditingCategory] = useState<'SET UP' | 'ONGOING'>('SET UP');
  const [editingResetFrequency, setEditingResetFrequency] = useState<'weekly' | 'fortnightly' | 'monthly'>('weekly');
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
      const response = await fetch('/api/action-points', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: actionId,
          completed: newCompleted
        })
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
    if (newActionCategory === 'ONGOING' && !newActionResetFrequency) {
      alert('Please select a reset frequency for ONGOING action points');
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetch('/api/action-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_type: channel.channelType,
          text: newActionText.trim(),
          category: newActionCategory,
          reset_frequency: newActionCategory === 'ONGOING' ? newActionResetFrequency : null
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create action point');
      }

      setNewActionText('');
      setNewActionCategory('SET UP');
      setNewActionResetFrequency('weekly');
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
    setEditingCategory(action.category);
    setEditingResetFrequency(action.reset_frequency || 'weekly');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editingText.trim()) return;
    if (editingCategory === 'ONGOING' && !editingResetFrequency) {
      alert('Please select a reset frequency for ONGOING action points');
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetch('/api/action-points', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          text: editingText.trim(),
          category: editingCategory,
          reset_frequency: editingCategory === 'ONGOING' ? editingResetFrequency : null
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update action point');
      }

      setEditingId(null);
      setEditingText('');
      setEditingCategory('SET UP');
      setEditingResetFrequency('weekly');
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
    setEditingCategory('SET UP');
    setEditingResetFrequency('weekly');
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

  // Filter data to show only the current month
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = format(today, 'yyyy-MM-dd');
  const currentMonthStart = startOfMonth(today);
  const currentMonthEnd = endOfMonth(today);
  const currentMonthStartKey = format(currentMonthStart, 'yyyy-MM-dd');
  const currentMonthEndKey = format(currentMonthEnd, 'yyyy-MM-dd');
  
  // Filter to show only dates within the current month
  const filteredData = channel.spendData.filter(d => d.date >= currentMonthStartKey && d.date <= currentMonthEndKey);
  
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
  
  // Calculate Y-axis scale based on planned monthly spend
  // Scale to the closest 50 above the planned monthly spend
  const plannedMonthlySpend = channel.monthBudget;
  const yAxisMax = Math.ceil(plannedMonthlySpend / 50) * 50;
  
  // Set tick count based on the scale (1 tick per unit)
  const tickCount = yAxisMax;
  
  // Notify parent when month changes to fetch new data
  const handleMonthChange = (newMonth: Date) => {
    setSelectedMonth(newMonth);
    channel.onMonthChange?.(newMonth);
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
          {data.projectedSpend !== null && (
            <p className="text-sm text-[#93c5fd] font-medium">
              Projected: ${data.projectedSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

  return (
    <Card className="bg-white shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 ease-in-out">
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
                <h3 className="text-lg font-semibold text-[#0f172a] mb-1">
                  {channel.name}
                </h3>
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
              <h4 className="text-sm font-semibold text-[#0f172a] mb-3">Action Items</h4>
              
              {/* Add new action point */}
              <div className="space-y-2 mb-3">
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
                  className="h-8 text-sm"
                />
                <div className="flex gap-2">
                  <Select
                    value={newActionCategory}
                    onValueChange={(value: 'SET UP' | 'ONGOING') => setNewActionCategory(value)}
                    disabled={isSaving}
                  >
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SET UP">SET UP</SelectItem>
                      <SelectItem value="ONGOING">ONGOING</SelectItem>
                    </SelectContent>
                  </Select>
                  {newActionCategory === 'ONGOING' && (
                    <Select
                      value={newActionResetFrequency}
                      onValueChange={(value: 'weekly' | 'fortnightly' | 'monthly') => setNewActionResetFrequency(value)}
                      disabled={isSaving}
                    >
                      <SelectTrigger className="h-8 text-xs flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="fortnightly">Fortnightly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    size="sm"
                    onClick={handleAddAction}
                    disabled={!newActionText.trim() || isSaving}
                    className="h-8 px-3"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Action points list */}
              {channel.actionPoints.length === 0 ? (
                <p className="text-xs text-[#94a3b8] text-center py-4">
                  No action items yet. Add one above.
                </p>
              ) : (
                channel.actionPoints.map((action) => {
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
                            className="h-7 text-sm"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <Select
                              value={editingCategory}
                              onValueChange={(value: 'SET UP' | 'ONGOING') => setEditingCategory(value)}
                              disabled={isSaving}
                            >
                              <SelectTrigger className="h-7 text-xs flex-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="SET UP">SET UP</SelectItem>
                                <SelectItem value="ONGOING">ONGOING</SelectItem>
                              </SelectContent>
                            </Select>
                            {editingCategory === 'ONGOING' && (
                              <Select
                                value={editingResetFrequency}
                                onValueChange={(value: 'weekly' | 'fortnightly' | 'monthly') => setEditingResetFrequency(value)}
                                disabled={isSaving}
                              >
                                <SelectTrigger className="h-7 text-xs flex-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="weekly">Weekly</SelectItem>
                                  <SelectItem value="fortnightly">Fortnightly</SelectItem>
                                  <SelectItem value="monthly">Monthly</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
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
                        </div>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-sm flex-1 min-w-0 ${
                                isCompleted
                                  ? 'line-through text-[#94a3b8]'
                                  : 'text-[#0f172a]'
                              }`}
                              onClick={() => !isSaving && handleStartEdit(action)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if ((e.key === 'Enter' || e.key === ' ') && !isSaving) {
                                  e.preventDefault();
                                  handleStartEdit(action);
                                }
                              }}
                            >
                              {action.text}
                            </span>
                            <Badge
                              variant={action.category === 'SET UP' ? 'secondary' : 'default'}
                              className="text-xs shrink-0"
                            >
                              {action.category}
                            </Badge>
                            {action.category === 'ONGOING' && action.reset_frequency && (
                              <span className="text-xs text-[#64748b] shrink-0">
                                {action.reset_frequency}
                              </span>
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
                })
              )}
            </div>
          </div>

          {/* Right Section - Chart (60%) */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <h4 className="text-sm font-semibold text-[#0f172a]">Budget Pacing</h4>
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
                    disabled={format(addMonths(selectedMonth, 1), 'yyyy-MM') > format(new Date(), 'yyyy-MM')}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {channel.onRefreshSpend && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={channel.onRefreshSpend}
                  disabled={channel.isFetchingSpend}
                  className="h-7 text-xs"
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${channel.isFetchingSpend ? 'animate-spin' : ''}`} />
                  {channel.isFetchingSpend ? 'Refreshing...' : 'Refresh Spend'}
                </Button>
              )}
            </div>
            {channel.spendError && (
              <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {channel.spendError}
              </div>
            )}
            
            {/* Stats Section */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-[#f8fafc] rounded-lg p-3 border border-[#e2e8f0]">
                <p className="text-xs text-[#64748b] mb-1">Current Daily Spend</p>
                <p className="text-lg font-semibold text-[#0f172a]">
                  {hasConnectedAccount && currentDailySpend !== null
                    ? `$${currentDailySpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '—'}
                </p>
              </div>
              <div className="bg-[#f8fafc] rounded-lg p-3 border border-[#e2e8f0]">
                <p className="text-xs text-[#64748b] mb-1">Planned Monthly Spend</p>
                <p className="text-lg font-semibold text-[#0f172a]">
                  ${plannedMonthlySpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="bg-[#f8fafc] rounded-lg p-3 border border-[#e2e8f0]">
                <p className="text-xs text-[#64748b] mb-1">Projected Monthly Spend</p>
                <p className="text-lg font-semibold text-[#0f172a]">
                  {hasConnectedAccount && projectedMonthlySpend !== null
                    ? `$${projectedMonthlySpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '—'}
                </p>
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
                      <linearGradient id={`colorPlanned-${channel.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.5} />
                      </linearGradient>
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
                  
                  {/* Planned Spend Area (underneath) */}
                  <Area
                    type="monotone"
                    dataKey="plannedSpend"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    fill={`url(#colorPlanned-${channel.id})`}
                    connectNulls={false}
                    animationDuration={1500}
                    animationEasing="ease-in-out"
                  />
                  
                  {/* Projected Spend Line (extends from actual) */}
                  <Line
                    type="linear"
                    dataKey="projectedSpend"
                    stroke="#93c5fd"
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    dot={false}
                    connectNulls={false}
                    animationDuration={1500}
                    animationEasing="ease-in-out"
                  />
                  
                  {/* Actual Spend Area - only up to today (no stroke, line drawn separately) */}
                  <Area
                    type="monotone"
                    dataKey="actualSpendForArea"
                    stroke="none"
                    fill={`url(#colorActual-${channel.id})`}
                    animationDuration={1500}
                    animationEasing="ease-in-out"
                    connectNulls={false}
                  />
                  
                  {/* Actual Spend Line - solid up to today */}
                  <Line
                    type="monotone"
                    dataKey="actualSpendLineUpToToday"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    dot={(props: any) => {
                      if (props.payload.projectedSpend !== null || props.payload.date > todayKey) {
                        return null; // Don't show dots on projected section or after today
                      }
                      return (
                        <Dot
                          {...props}
                          r={4}
                          fill="#2563eb"
                          stroke="#fff"
                          strokeWidth={2}
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
                  />
                </ComposedChart>
              </ResponsiveContainer>
              </div>
              <div className="absolute left-0 right-[10px] bottom-[-20px] text-center">
                <p className="text-base font-semibold text-[#64748b] tracking-wide">
                  {format(today, 'MMMM').toUpperCase()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

