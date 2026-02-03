'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getPlanById } from '@/lib/db/plans';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PlanEditForm from '@/components/plan-entry/PlanEditForm';
import Link from 'next/link';
import { ArrowLeft, Calendar, DollarSign, TrendingUp, AlertCircle, CheckCircle2, Clock, Target, Edit, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { format, differenceInDays, isAfter, isBefore, parseISO, startOfWeek, addWeeks, addDays, isToday, isSameDay } from 'date-fns';
import { CHANNEL_OPTIONS } from '@/types/media-plan';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { MediaPlanSummaryCards } from '@/components/ui/media-plan-summary-cards';
import { MediaChannelRow } from '@/components/ui/media-channel-row';
import { MediaChannelSpendChart } from '@/components/ui/media-channel-spend-chart';
import { MediaChannelHealthChecklist } from '@/components/ui/media-channel-health-checklist';
import { ActionCalendar } from '@/components/ui/action-calendar';
import { MediaPlanTimeSeriesChart } from '@/components/ui/media-plan-time-series-chart';
import { MediaChannel, TimeFrame, ViewMode, ChecklistItem as HealthChecklistItem } from '@/lib/types/media-plan';
import { fetchChannelSpendData, formatDateForApi } from '@/lib/api/spend-data-integration';
import { calculatePacingScore, getPacingStatus, calculateSpendRate } from '@/lib/utils/pacing-calculations';

export interface PlanDashboardData {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  total_budget: number;
  status: string;
  clients: {
    id: string;
    name: string;
  };
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

interface ActionPoint {
  id: string;
  channel: string;
  channelDetail: string;
  type: 'upcoming' | 'current' | 'overdue';
  priority: 'high' | 'medium' | 'low';
  message: string;
  week: string;
  weekNumber: number;
}

export default function PlanDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const planId = params.id as string;
  
  const [plan, setPlan] = useState<PlanDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionPoints, setActionPoints] = useState<ActionPoint[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [mediaChannels, setMediaChannels] = useState<MediaChannel[]>([]);
  const [loadingSpendData, setLoadingSpendData] = useState(false);
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (planId) {
      loadPlanData();
    }
  }, [planId]);

  const loadPlanData = async () => {
    try {
      const planData = await getPlanById(planId);
      setPlan(planData as PlanDashboardData);
      generateActionPoints(planData as PlanDashboardData);
      
      // Transform plan data to MediaChannel format
      const channels = transformToMediaChannels(planData as PlanDashboardData);
      setMediaChannels(channels);
      
      // Fetch real spend data from ad platforms
      await syncSpendData(channels, planData as PlanDashboardData);
    } catch (error) {
      console.error('Error loading plan:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = () => {
    setIsEditMode(true);
  };

  const handleEditClose = () => {
    setIsEditMode(false);
  };

  const handleEditSave = async () => {
    await loadPlanData(); // Reload plan data
    setIsEditMode(false);
  };

  const transformToMediaChannels = (planData: PlanDashboardData): MediaChannel[] => {
    const channelColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    
    return planData.channels.map((channel, index) => {
      const channelOption = CHANNEL_OPTIONS.find(c => c.value === channel.channel);
      const channelLabel = channelOption?.label || channel.channel;
      
      // Group weekly plans into monthly timeframes
      const timeFrames: TimeFrame[] = [];
      const monthlyData = new Map<string, { planned: number; actual: number; weeks: any[] }>();
      
      channel.weekly_plans.forEach((wp) => {
        const weekStart = parseISO(wp.week_commencing);
        const monthKey = format(weekStart, 'MMM yyyy');
        
        if (!monthlyData.has(monthKey)) {
          monthlyData.set(monthKey, {
            planned: 0,
            actual: 0,
            weeks: []
          });
        }
        
        const monthData = monthlyData.get(monthKey)!;
        monthData.planned += wp.budget_planned || 0;
        monthData.actual += wp.budget_actual || 0;
        monthData.weeks.push(wp);
      });
      
      // Convert monthly data to TimeFrame array
      monthlyData.forEach((data, monthKey) => {
        const weeks = data.weeks.sort((a, b) => 
          parseISO(a.week_commencing).getTime() - parseISO(b.week_commencing).getTime()
        );
        const startDate = weeks[0].week_commencing;
        const lastWeek = weeks[weeks.length - 1];
        const endDate = format(addWeeks(parseISO(lastWeek.week_commencing), 1), 'yyyy-MM-dd');
        
        timeFrames.push({
          period: monthKey,
          planned: data.planned / 100, // Convert cents to dollars
          actual: data.actual / 100,
          startDate,
          endDate
        });
      });
      
      // Determine platform type
      let platformType: MediaChannel['platformType'] = 'other';
      if (channel.type === 'paid' || channel.type === 'both') {
        // Check channel name for platform hints
        if (channelLabel.toLowerCase().includes('facebook') || channelLabel.toLowerCase().includes('instagram') || channelLabel.toLowerCase().includes('meta')) {
          platformType = 'meta-ads';
        } else if (channelLabel.toLowerCase().includes('google')) {
          platformType = 'google-ads';
        }
      } else {
        platformType = 'organic';
      }
      
      // Create sample checklist items
      const checklist: HealthChecklistItem[] = [
        { id: `${channel.id}-1`, text: 'Campaign objectives defined', completed: true },
        { id: `${channel.id}-2`, text: 'Target audience configured', completed: true },
        { id: `${channel.id}-3`, text: 'Ad creatives approved', completed: false, priority: 'critical' },
        { id: `${channel.id}-4`, text: 'Tracking pixels installed', completed: channel.type === 'paid', priority: 'critical' },
        { id: `${channel.id}-5`, text: 'Budget alerts configured', completed: false },
      ];
      
      return {
        id: channel.id,
        name: channelLabel,
        detail: channel.detail,
        schedule: channel.weekly_plans.length > 0 
          ? `${format(parseISO(channel.weekly_plans[0].week_commencing), 'MMM d')} - ${format(addWeeks(parseISO(channel.weekly_plans[channel.weekly_plans.length - 1].week_commencing), 1), 'MMM d')}`
          : 'No schedule',
        costPerMonth: timeFrames.reduce((sum, tf) => sum + tf.planned, 0) / (timeFrames.length || 1),
        color: channelColors[index % channelColors.length],
        status: getChannelStatus(channel).status === 'live' ? 'active' : 
                getChannelStatus(channel).status === 'upcoming' ? 'draft' : 'paused',
        timeFrames,
        checklist,
        platformType,
        adAccountId: undefined, // Would be set from user configuration
      };
    });
  };

  const syncSpendData = async (channels: MediaChannel[], planData: PlanDashboardData) => {
    setLoadingSpendData(true);
    
    try {
      const updatedChannels = await Promise.all(
        channels.map(async (channel) => {
          // Only fetch for channels with ad platform integration
          if (channel.platformType === 'organic' || channel.platformType === 'other' || !channel.adAccountId) {
            return channel;
          }
          
          const result = await fetchChannelSpendData(
            channel,
            planData.start_date,
            planData.end_date
          );
          
          if (result.success && result.updatedTimeFrames) {
            return {
              ...channel,
              timeFrames: result.updatedTimeFrames
            };
          }
          
          return channel;
        })
      );
      
      setMediaChannels(updatedChannels);
    } catch (error) {
      console.error('Error syncing spend data:', error);
    } finally {
      setLoadingSpendData(false);
    }
  };

  const toggleChannelExpanded = (channelId: string) => {
    setExpandedChannels((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(channelId)) {
        newSet.delete(channelId);
      } else {
        newSet.add(channelId);
      }
      return newSet;
    });
  };

  const generateActionPoints = (planData: PlanDashboardData) => {
    const today = new Date();
    const actions: ActionPoint[] = [];
    
    planData.channels.forEach((channel) => {
      const channelOption = CHANNEL_OPTIONS.find(c => c.value === channel.channel);
      const channelLabel = channelOption?.label || channel.channel;
      
      channel.weekly_plans.forEach((weeklyPlan) => {
        const weekStart = parseISO(weeklyPlan.week_commencing);
        const weekEnd = addWeeks(weekStart, 1);
        const daysUntilStart = differenceInDays(weekStart, today);
        const daysUntilEnd = differenceInDays(weekEnd, today);
        
        // Determine if this week is upcoming, current, or overdue
        let type: 'upcoming' | 'current' | 'overdue' = 'upcoming';
        let priority: 'high' | 'medium' | 'low' = 'low';
        let message = '';
        
        if (isBefore(weekEnd, today)) {
          // Week has passed
          type = 'overdue';
          if (weeklyPlan.budget_actual === 0 || weeklyPlan.budget_actual === null) {
            priority = 'high';
            message = `Budget not recorded for week ${weeklyPlan.week_number}`;
          } else if (weeklyPlan.posts_planned > 0 && (weeklyPlan.posts_actual === 0 || weeklyPlan.posts_actual === null)) {
            priority = 'high';
            message = `Posts not recorded for week ${weeklyPlan.week_number}`;
          }
        } else if (isBefore(weekStart, today) && isAfter(weekEnd, today)) {
          // Current week
          type = 'current';
          priority = 'high';
          if (channel.type === 'paid' || channel.type === 'both') {
            message = `Monitor budget spend for week ${weeklyPlan.week_number}`;
          }
          if (channel.type === 'organic' || channel.type === 'both') {
            if (weeklyPlan.posts_planned > 0) {
              message += weeklyPlan.posts_actual < weeklyPlan.posts_planned 
                ? ` Schedule ${weeklyPlan.posts_planned - (weeklyPlan.posts_actual || 0)} more posts`
                : ' All posts scheduled';
            }
          }
        } else if (daysUntilStart <= 7 && daysUntilStart > 0) {
          // Upcoming within a week
          type = 'upcoming';
          priority = 'medium';
          message = `Week ${weeklyPlan.week_number} starts in ${daysUntilStart} days`;
          if (channel.type === 'organic' || channel.type === 'both') {
            if (weeklyPlan.posts_planned > 0) {
              message += ` - Plan ${weeklyPlan.posts_planned} posts`;
            }
          }
        }
        
        if (message) {
          actions.push({
            id: `${channel.id}-${weeklyPlan.id}`,
            channel: channelLabel,
            channelDetail: channel.detail,
            type,
            priority,
            message,
            week: format(weekStart, 'MMM d'),
            weekNumber: weeklyPlan.week_number
          });
        }
      });
    });
    
    // Sort by priority and type
    actions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const typeOrder = { overdue: 0, current: 1, upcoming: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return typeOrder[a.type] - typeOrder[b.type];
    });
    
    setActionPoints(actions);
  };

  const calculateProgress = () => {
    if (!plan) return { time: 0, budget: 0 };
    
    const today = new Date();
    const start = parseISO(plan.start_date);
    const end = parseISO(plan.end_date);
    const totalDays = differenceInDays(end, start);
    const daysPassed = differenceInDays(today, start);
    const timeProgress = Math.min(100, Math.max(0, (daysPassed / totalDays) * 100));
    
    const totalBudgetPlanned = plan.channels.reduce((sum, ch) => {
      return sum + ch.weekly_plans.reduce((s, wp) => s + (wp.budget_planned || 0), 0);
    }, 0);
    
    const totalBudgetActual = plan.channels.reduce((sum, ch) => {
      return sum + ch.weekly_plans.reduce((s, wp) => s + (wp.budget_actual || 0), 0);
    }, 0);
    
    const budgetProgress = totalBudgetPlanned > 0 
      ? (totalBudgetActual / totalBudgetPlanned) * 100 
      : 0;
    
    return { time: timeProgress, budget: budgetProgress };
  };

  const getChannelChartData = () => {
    if (!plan) return { data: [], todayIndex: -1 };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const planStart = parseISO(plan.start_date);
    const planEnd = parseISO(plan.end_date);
    
    // Generate all days from plan start to today only (not beyond today)
    const endDate = isBefore(today, planEnd) ? today : planEnd;
    const days: Date[] = [];
    let currentDate = new Date(planStart);
    let todayIndex = -1;
    
    while (currentDate <= endDate) {
      const dateKey = new Date(currentDate);
      dateKey.setHours(0, 0, 0, 0);
      days.push(dateKey);
      
      // Track today's index
      if (isSameDay(dateKey, today)) {
        todayIndex = days.length - 1;
      }
      
      currentDate = addDays(currentDate, 1);
    }
    
    // Create data points for each day (only up to today)
    const chartData = days.map((day, dayIndex) => {
      const dayKey = format(day, 'MMM d');
      const isTodayDay = dayIndex === todayIndex;
      const dayData: any = { day: dayKey, date: day, isToday: isTodayDay };
      
      plan.channels.forEach((channel) => {
        const channelLabel = CHANNEL_OPTIONS.find(c => c.value === channel.channel)?.label || channel.channel;
        
        // Only calculate values for days up to and including today
        if (isBefore(day, today) || isSameDay(day, today)) {
          if (channel.weekly_plans.length > 0) {
            const firstWeek = channel.weekly_plans[0];
            const lastWeek = channel.weekly_plans[channel.weekly_plans.length - 1];
            const channelStart = parseISO(firstWeek.week_commencing);
            const lastWeekStart = parseISO(lastWeek.week_commencing);
            const channelEnd = addWeeks(lastWeekStart, 1);
            const totalPlanned = channel.weekly_plans.reduce((sum, wp) => sum + (wp.budget_planned || 0), 0);
            
            // Calculate expected spend for this day
            let expectedSpend = 0;
            if (isBefore(day, channelStart)) {
              expectedSpend = 0;
            } else if (isAfter(day, channelEnd) || isSameDay(day, channelEnd)) {
              expectedSpend = totalPlanned;
            } else {
              const totalDays = differenceInDays(channelEnd, channelStart);
              const daysElapsed = differenceInDays(day, channelStart);
              const timeProgress = totalDays > 0 ? Math.min(1, Math.max(0, daysElapsed / totalDays)) : 0;
              expectedSpend = totalPlanned * timeProgress;
            }
            
            // Calculate actual and planned spend up to this day (cumulative)
            let actualSpend = 0;
            let plannedSpend = 0;
            
            channel.weekly_plans.forEach((wp) => {
              const weekStart = parseISO(wp.week_commencing);
              const weekEnd = addWeeks(weekStart, 1);
              
              // If this week has already ended, include full amounts
              if (isBefore(weekEnd, day)) {
                actualSpend += wp.budget_actual || 0;
                plannedSpend += wp.budget_planned || 0;
              } 
              // If this day is within the week or on the week end, calculate proportional spend
              else if (isSameDay(day, weekStart) || (isAfter(day, weekStart) && isBefore(day, weekEnd)) || isSameDay(day, weekEnd)) {
                // Calculate daily spend for this week based on time progress
                const daysInWeek = differenceInDays(weekEnd, weekStart);
                const daysIntoWeek = differenceInDays(day, weekStart) + 1; // +1 to include the start day
                const weekProgress = daysInWeek > 0 ? Math.min(1, Math.max(0, daysIntoWeek / daysInWeek)) : 0;
                
                // For planned, use the weekly planned budget proportionally
                plannedSpend += (wp.budget_planned || 0) * weekProgress;
                
                // For actual, use the actual budget if available, otherwise 0
                actualSpend += (wp.budget_actual || 0) * weekProgress;
              }
              // If day is before week starts, no spend yet
            });
            
            dayData[`${channelLabel} (Expected)`] = expectedSpend / 100;
            dayData[`${channelLabel} (Actual)`] = actualSpend / 100;
            dayData[`${channelLabel} (Planned)`] = plannedSpend / 100;
          } else {
            dayData[`${channelLabel} (Expected)`] = 0;
            dayData[`${channelLabel} (Actual)`] = 0;
            dayData[`${channelLabel} (Planned)`] = 0;
          }
        } else {
          // For future dates, set to null so lines don't continue
          dayData[`${channelLabel} (Expected)`] = null;
          dayData[`${channelLabel} (Actual)`] = null;
          dayData[`${channelLabel} (Planned)`] = null;
        }
      });
      
      return dayData;
    });
    
    return { data: chartData, todayIndex };
  };

  const getDateData = (date: Date) => {
    if (!plan) return { isStart: false, isEnd: false, channels: [] };
    
    const dateString = format(date, 'yyyy-MM-dd');
    const channels: Array<{
      channel: string;
      channelDetail: string;
      type: string;
    }> = [];
    let isStart = false;
    let isEnd = false;
    
    plan.channels.forEach((channel) => {
      if (channel.weekly_plans.length > 0) {
        // Get the first week (start date)
        const firstWeek = channel.weekly_plans[0];
        const startDate = parseISO(firstWeek.week_commencing);
        const startDateString = format(startDate, 'yyyy-MM-dd');
        
        // Get the last week (end date)
        const lastWeek = channel.weekly_plans[channel.weekly_plans.length - 1];
        const lastWeekStart = parseISO(lastWeek.week_commencing);
        const endDate = addWeeks(lastWeekStart, 1);
        const endDateString = format(endDate, 'yyyy-MM-dd');
        
        // Check if this date is the start or end date
        if (dateString === startDateString) {
          isStart = true;
          const channelOption = CHANNEL_OPTIONS.find(c => c.value === channel.channel);
          const channelLabel = channelOption?.label || channel.channel;
          channels.push({
            channel: channelLabel,
            channelDetail: channel.detail,
            type: channel.type
          });
        } else if (dateString === endDateString) {
          isEnd = true;
          const channelOption = CHANNEL_OPTIONS.find(c => c.value === channel.channel);
          const channelLabel = channelOption?.label || channel.channel;
          channels.push({
            channel: channelLabel,
            channelDetail: channel.detail,
            type: channel.type
          });
        }
      }
    });
    
    return { isStart, isEnd, channels };
  };

  const getChannelStatus = (channel: PlanDashboardData['channels'][0]) => {
    if (channel.weekly_plans.length === 0) return { status: 'ended', label: 'ENDED', days: 0 };
    
    const today = new Date();
    const firstWeek = channel.weekly_plans[0];
    const lastWeek = channel.weekly_plans[channel.weekly_plans.length - 1];
    const startDate = parseISO(firstWeek.week_commencing);
    const lastWeekStart = parseISO(lastWeek.week_commencing);
    const endDate = addWeeks(lastWeekStart, 1);
    
    if (isBefore(today, startDate)) {
      const days = differenceInDays(startDate, today);
      return { status: 'upcoming', label: `STARTS IN ${days} DAY${days !== 1 ? 'S' : ''}`, days };
    } else if (isAfter(today, endDate) || isSameDay(today, endDate)) {
      return { status: 'ended', label: 'ENDED', days: 0 };
    } else {
      return { status: 'live', label: 'LIVE', days: 0 };
    }
  };

  const getChannelProgress = (channel: PlanDashboardData['channels'][0]) => {
    const totalPlanned = channel.weekly_plans.reduce((sum, wp) => sum + (wp.budget_planned || 0), 0);
    const totalActual = channel.weekly_plans.reduce((sum, wp) => sum + (wp.budget_actual || 0), 0);
    
    // Calculate expected spend based on today's date
    const today = new Date();
    let expectedSpend = 0;
    
    if (channel.weekly_plans.length > 0) {
      const firstWeek = channel.weekly_plans[0];
      const lastWeek = channel.weekly_plans[channel.weekly_plans.length - 1];
      const startDate = parseISO(firstWeek.week_commencing);
      const lastWeekStart = parseISO(lastWeek.week_commencing);
      const endDate = addWeeks(lastWeekStart, 1);
      
      // Calculate expected spend based on elapsed time
      if (isBefore(today, startDate)) {
        expectedSpend = 0;
      } else if (isAfter(today, endDate) || isSameDay(today, endDate)) {
        expectedSpend = totalPlanned;
      } else {
        // Calculate percentage of time elapsed
        const totalDays = differenceInDays(endDate, startDate);
        const daysElapsed = differenceInDays(today, startDate);
        const timeProgress = totalDays > 0 ? Math.min(1, Math.max(0, daysElapsed / totalDays)) : 0;
        expectedSpend = totalPlanned * timeProgress;
      }
    }
    
    const actualProgress = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;
    const expectedProgress = totalPlanned > 0 ? (expectedSpend / totalPlanned) * 100 : 0;
    
    return {
      planned: totalPlanned,
      actual: totalActual,
      expected: expectedSpend,
      actualProgress: Math.min(100, Math.max(0, actualProgress)),
      expectedProgress: Math.min(100, Math.max(0, expectedProgress))
    };
  };

  if (loading) {
    return (
      <div className="container mx-auto p-8">
        <div className="flex justify-center">Loading...</div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="container mx-auto p-8">
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-gray-500 mb-4">Plan not found</p>
            <Link href="/plans">
              <Button>Back to Plans</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isEditMode) {
    return (
      <PlanEditForm
        plan={plan}
        onClose={handleEditClose}
        onSave={handleEditSave}
      />
    );
  }

  const progress = calculateProgress();
  const chartDataResult = getChannelChartData();
  const chartData = chartDataResult.data;
  const todayIndex = chartDataResult.todayIndex;

  return (
    <div className="container mx-auto p-8">
      <div className="mb-6">
        <Link href="/plans">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Plans
          </Button>
        </Link>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">{plan.name}</h1>
            <p className="text-gray-600">{plan.clients.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={plan.status === 'active' ? 'default' : 'secondary'}>
              {plan.status}
            </Badge>
            <Button onClick={handleEditClick} variant="outline" size="sm">
              <Edit className="h-4 w-4 mr-2" />
              Edit Plan
            </Button>
          </div>
        </div>
      </div>

      {/* Time Series Chart - Overview of all channels */}
      <div className="mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Spend Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-96">
              <MediaPlanTimeSeriesChart
                channels={mediaChannels}
                startDate={plan.start_date}
                endDate={plan.end_date}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Calendar - Timeline view of tasks */}
      <div className="mb-8">
        <ActionCalendar
          channels={mediaChannels}
          onChannelClick={(channelId) => {
            // Expand the channel when action is clicked
            setExpandedChannels((prev) => {
              const newSet = new Set(prev);
              newSet.add(channelId);
              return newSet;
            });
            // Scroll to the channel
            const element = document.getElementById(`channel-${channelId}`);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }}
        />
      </div>

      {/* Media Plan Summary Cards */}
      <div className="mb-8">
        {loadingSpendData && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
            <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
            <span className="text-sm text-blue-800">Syncing spend data from ad platforms...</span>
          </div>
        )}
        
        <MediaPlanSummaryCards
          totalBudget={mediaChannels.reduce((sum, ch) => sum + ch.timeFrames.reduce((s, tf) => s + tf.planned, 0), 0)}
          actualSpend={mediaChannels.reduce((sum, ch) => sum + ch.timeFrames.reduce((s, tf) => s + tf.actual, 0), 0)}
          spendRate={calculateSpendRate(
            mediaChannels.reduce((sum, ch) => sum + ch.timeFrames.reduce((s, tf) => s + tf.actual, 0), 0),
            mediaChannels.reduce((sum, ch) => sum + ch.timeFrames.reduce((s, tf) => s + tf.planned, 0), 0)
          )}
          onTrackCount={mediaChannels.filter(ch => getPacingStatus(calculatePacingScore(ch, new Date())) === 'on-track').length}
          totalChannels={mediaChannels.length}
        />
      </div>

      {/* View Mode Toggle */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Media Channels</h2>
        <div className="flex items-center gap-3">
          <div className="flex border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('month')}
              className={`px-4 py-2 text-sm font-medium ${
                viewMode === 'month'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-4 py-2 text-sm font-medium border-l ${
                viewMode === 'week'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Week
            </button>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Channel
          </Button>
        </div>
      </div>

      {/* Media Channels Section */}
      <Card className="mb-8">
        <CardContent className="p-0">
          <div className="divide-y">
            {mediaChannels.map((channel) => {
              const pacingScore = calculatePacingScore(channel, new Date());
              const pacingStatus = getPacingStatus(pacingScore);
              const isExpanded = expandedChannels.has(channel.id);
              
              // Prepare monthly data for the channel row
              const monthlyData = channel.timeFrames.map(tf => ({
                month: tf.period,
                planned: tf.planned,
                actual: tf.actual
              }));
              
              // Prepare chart data - ensure we only show data for this specific channel
              // Sort timeFrames by start date to handle multiple months correctly
              const sortedTimeFrames = [...channel.timeFrames].sort((a, b) => 
                parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime()
              );
              
              const chartData = sortedTimeFrames.flatMap(tf => {
                const startDate = parseISO(tf.startDate);
                const endDate = parseISO(tf.endDate);
                const daysInPeriod = differenceInDays(endDate, startDate) + 1; // +1 to include both start and end days
                
                // Calculate daily rates for THIS channel's timeframe only
                const dailyPlanned = tf.planned / Math.max(daysInPeriod, 1);
                const dailyActual = tf.actual / Math.max(daysInPeriod, 1);
                
                // Generate data points for each day in this timeframe
                return Array.from({ length: daysInPeriod }, (_, i) => {
                  const date = format(addDays(startDate, i), 'yyyy-MM-dd');
                  return {
                    date,
                    // Cumulative planned spend up to this day for THIS channel only
                    planned: dailyPlanned * (i + 1),
                    // Cumulative actual spend up to this day for THIS channel only
                    actual: dailyActual * (i + 1),
                    // Projected spend for THIS channel only
                    projected: dailyActual * daysInPeriod
                  };
                });
              });
              
              return (
                <div key={channel.id} id={`channel-${channel.id}`}>
                  <MediaChannelRow
                    channelName={channel.name}
                    channelDetails={channel.detail}
                    scheduleDescription={channel.schedule}
                    colorDot={channel.color}
                    monthlyData={monthlyData}
                    pacingScore={pacingStatus}
                    onViewDetails={() => toggleChannelExpanded(channel.id)}
                  />
                  
                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="bg-gray-50 p-6 space-y-6">
                      {/* Summary Stats */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Net Planned Spend */}
                        <Card>
                          <CardContent className="p-4">
                            <p className="text-sm font-medium text-muted-foreground mb-1">
                              Net Planned Spend
                            </p>
                            <p className="text-2xl font-bold">
                              {(() => {
                                // Calculate monthly planned spend FOR THIS SPECIFIC CHANNEL ONLY
                                const today = new Date();
                                const currentMonth = format(today, 'MMM yyyy');
                                
                                // Find the timeframe for the current month for THIS channel only
                                const currentMonthTimeFrame = channel.timeFrames.find(tf => tf.period === currentMonth);
                                
                                // If found, use that month's planned spend for THIS channel
                                if (currentMonthTimeFrame) {
                                  return `$${currentMonthTimeFrame.planned.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                                }
                                
                                // Otherwise, use the most recent timeframe's planned spend for THIS channel
                                const mostRecentTimeFrame = [...channel.timeFrames].sort((a, b) => 
                                  parseISO(b.startDate).getTime() - parseISO(a.startDate).getTime()
                                )[0];
                                
                                if (mostRecentTimeFrame) {
                                  return `$${mostRecentTimeFrame.planned.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                                }
                                
                                return '$0.00';
                              })()}
                            </p>
                          </CardContent>
                        </Card>
                      </div>
                      
                      {/* Spend Chart */}
                      <div>
                        <h3 className="font-semibold mb-4 flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" />
                          Spend Trend
                        </h3>
                        <div className="h-64 bg-white rounded-lg p-4 border">
                          <MediaChannelSpendChart
                            data={chartData}
                            channelColor={channel.color}
                            channelName={channel.name}
                          />
                        </div>
                      </div>
                      
                      {/* Health Checklist */}
                      <MediaChannelHealthChecklist
                        title="Campaign Health Checklist"
                        items={channel.checklist.map(item => ({
                          id: item.id,
                          label: item.text,
                          checked: item.completed,
                          isCritical: item.priority === 'critical'
                        }))}
                        onItemToggle={(itemId) => {
                          // Toggle checklist item
                          setMediaChannels(prev => prev.map(ch => {
                            if (ch.id === channel.id) {
                              return {
                                ...ch,
                                checklist: ch.checklist.map(item => 
                                  item.id === itemId 
                                    ? { ...item, completed: !item.completed }
                                    : item
                                )
                              };
                            }
                            return ch;
                          }));
                        }}
                        defaultExpanded={true}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Progress Overview */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Time Progress</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(progress.time)}%</div>
            <Progress value={progress.time} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {format(parseISO(plan.start_date), 'MMM d')} - {format(parseISO(plan.end_date), 'MMM d, yyyy')}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Budget Progress</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(progress.budget)}%</div>
            <Progress value={progress.budget} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              ${((plan.total_budget || 0) / 100).toLocaleString()} total budget
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Channels</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{plan.channels.length}</div>
            <p className="text-xs text-muted-foreground mt-2">
              {plan.channels.filter(c => c.type === 'organic' || c.type === 'both').length} organic
            </p>
          </CardContent>
        </Card>
      </div>


      {/* Tabs for Channel Details */}
      <Tabs defaultValue="overview" className="mb-8">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Budget Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="day" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    label={{ value: 'Spend ($)', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip 
                    formatter={(value: number) => `$${value.toLocaleString()}`}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Legend />
                  {plan.channels.map((channel, index) => {
                    const channelLabel = CHANNEL_OPTIONS.find(c => c.value === channel.channel)?.label || channel.channel;
                    const baseColors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00', '#ff00ff', '#00ffff'];
                    const baseColor = baseColors[index % baseColors.length];
                    
                    return (
                      <React.Fragment key={channel.id}>
                        {/* Expected Spend Line */}
                        <Line 
                          type="monotone" 
                          dataKey={`${channelLabel} (Expected)`} 
                          stroke={baseColor}
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={false}
                          name={`${channelLabel} (Expected)`}
                        />
                        {/* Planned Spend Line */}
                        <Line 
                          type="monotone" 
                          dataKey={`${channelLabel} (Planned)`} 
                          stroke={baseColor}
                          strokeWidth={2}
                          strokeOpacity={0.6}
                          dot={(props: any) => {
                            if (props.payload && props.payload.isToday && todayIndex === props.index) {
                              return (
                                <circle 
                                  cx={props.cx} 
                                  cy={props.cy} 
                                  r={5} 
                                  fill={baseColor} 
                                  stroke="white" 
                                  strokeWidth={2}
                                />
                              );
                            }
                            return null;
                          }}
                          activeDot={false}
                          name={`${channelLabel} (Planned)`}
                        />
                        {/* Actual Spend Line */}
                        <Line 
                          type="monotone" 
                          dataKey={`${channelLabel} (Actual)`} 
                          stroke={baseColor}
                          strokeWidth={2}
                          dot={(props: any) => {
                            if (props.payload && props.payload.isToday && todayIndex === props.index) {
                              return (
                                <circle 
                                  cx={props.cx} 
                                  cy={props.cy} 
                                  r={5} 
                                  fill={baseColor} 
                                  stroke="white" 
                                  strokeWidth={2}
                                />
                              );
                            }
                            return null;
                          }}
                          activeDot={false}
                          name={`${channelLabel} (Actual)`}
                        />
                      </React.Fragment>
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="channels" className="space-y-4">
          {plan.channels.map((channel) => {
            const channelOption = CHANNEL_OPTIONS.find(c => c.value === channel.channel);
            const channelLabel = channelOption?.label || channel.channel;
            const totalPlanned = channel.weekly_plans.reduce((sum, wp) => sum + (wp.budget_planned || 0), 0);
            const totalActual = channel.weekly_plans.reduce((sum, wp) => sum + (wp.budget_actual || 0), 0);
            const channelProgress = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;
            
            return (
              <Card key={channel.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{channelLabel} - {channel.detail}</CardTitle>
                    <Badge variant={channel.type === 'organic' ? 'secondary' : 'default'}>
                      {channel.type}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Budget Progress</span>
                        <span>
                          ${(totalActual / 100).toLocaleString()} / ${(totalPlanned / 100).toLocaleString()}
                        </span>
                      </div>
                      <Progress value={channelProgress} />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Total Posts Planned</p>
                        <p className="text-lg font-semibold">
                          {channel.weekly_plans.reduce((sum, wp) => sum + (wp.posts_planned || 0), 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Total Posts Actual</p>
                        <p className="text-lg font-semibold">
                          {channel.weekly_plans.reduce((sum, wp) => sum + (wp.posts_actual || 0), 0)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-2 text-sm">Weekly Breakdown</h4>
                      <div className="space-y-2">
                        {channel.weekly_plans.map((wp) => {
                          const weekStart = parseISO(wp.week_commencing);
                          const isCurrentWeek = isBefore(weekStart, new Date()) && 
                            isAfter(addWeeks(weekStart, 1), new Date());
                          
                          return (
                            <div 
                              key={wp.id} 
                              className={`flex items-center justify-between p-2 rounded ${
                                isCurrentWeek ? 'bg-blue-50 border border-blue-200' : ''
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium">
                                  W{wp.week_number}: {format(weekStart, 'MMM d')}
                                </span>
                                {isCurrentWeek && (
                                  <Badge variant="outline" className="text-xs">Current</Badge>
                                )}
                              </div>
                              <div className="flex gap-4 text-xs">
                                <span>
                                  ${((wp.budget_planned || 0) / 100).toLocaleString()} planned
                                </span>
                                <span className={wp.budget_actual ? 'text-green-600' : 'text-gray-400'}>
                                  ${((wp.budget_actual || 0) / 100).toLocaleString()} actual
                                </span>
                                {wp.posts_planned > 0 && (
                                  <span>
                                    {wp.posts_actual || 0}/{wp.posts_planned} posts
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
        
        <TabsContent value="analytics">
          <Card>
            <CardHeader>
              <CardTitle>Channel Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                  <Legend />
                  {plan.channels.map((channel) => {
                    const channelLabel = CHANNEL_OPTIONS.find(c => c.value === channel.channel)?.label || channel.channel;
                    return (
                      <Bar 
                        key={`${channel.id}-planned`}
                        dataKey={`${channelLabel} (Planned)`} 
                        fill="#8884d8" 
                        opacity={0.6}
                      />
                    );
                  })}
                  {plan.channels.map((channel) => {
                    const channelLabel = CHANNEL_OPTIONS.find(c => c.value === channel.channel)?.label || channel.channel;
                    return (
                      <Bar 
                        key={`${channel.id}-actual`}
                        dataKey={`${channelLabel} (Actual)`} 
                        fill="#82ca9d" 
                      />
                    );
                  })}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

