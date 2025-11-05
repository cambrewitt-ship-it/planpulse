'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getPlanById } from '@/lib/db/plans';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';
import { ArrowLeft, Calendar, DollarSign, TrendingUp, AlertCircle, CheckCircle2, Clock, Target } from 'lucide-react';
import { format, differenceInDays, isAfter, isBefore, parseISO, startOfWeek, addWeeks, addDays, isToday, isSameDay } from 'date-fns';
import { CHANNEL_OPTIONS } from '@/types/media-plan';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface PlanDashboardData {
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
    } catch (error) {
      console.error('Error loading plan:', error);
    } finally {
      setLoading(false);
    }
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
    if (!plan) return [];
    
    const weekMap = new Map<string, { week: string; weekDate: Date; [key: string]: any }>();
    
    plan.channels.forEach((channel) => {
      const channelLabel = CHANNEL_OPTIONS.find(c => c.value === channel.channel)?.label || channel.channel;
      
      channel.weekly_plans.forEach((wp) => {
        const weekDate = parseISO(wp.week_commencing);
        const weekKey = format(weekDate, 'MMM d');
        
        if (!weekMap.has(weekKey)) {
          weekMap.set(weekKey, { week: weekKey, weekDate });
        }
        
        const weekData = weekMap.get(weekKey)!;
        weekData[`${channelLabel} (Planned)`] = (wp.budget_planned || 0) / 100;
        weekData[`${channelLabel} (Actual)`] = (wp.budget_actual || 0) / 100;
      });
    });
    
    return Array.from(weekMap.values()).sort((a, b) => 
      a.weekDate.getTime() - b.weekDate.getTime()
    );
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

  const progress = calculateProgress();
  const chartData = getChannelChartData();

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
          <Badge variant={plan.status === 'active' ? 'default' : 'secondary'}>
            {plan.status}
          </Badge>
        </div>
      </div>

      {/* Date Row - Today + Next 9 Days */}
      <Card className="mb-8">
        <CardContent className="p-0">
          <div className="grid grid-cols-10">
            {Array.from({ length: 10 }, (_, i) => {
              const date = addDays(new Date(), i);
              const isCurrentDay = isToday(date);
              const dayName = format(date, 'EEE');
              const dayNumber = format(date, 'd');
              const dateData = getDateData(date);
              
              return (
                <div
                  key={i}
                  className={`flex flex-col border-r last:border-r-0 border-gray-200 ${
                    isCurrentDay ? 'shadow-lg' : ''
                  }`}
                >
                  <div className="flex items-center justify-center p-3 bg-gray-600">
                    <span className="text-base font-bold text-white">
                      {dayName} {dayNumber}
                    </span>
                  </div>
                  <div className={`border-t border-gray-200 border-l border-r border-b border-black aspect-square p-2 overflow-y-auto flex flex-col items-center justify-center ${
                    dateData.isStart || dateData.isEnd ? 'bg-blue-50' : 'bg-white'
                  }`}>
                    {dateData.isStart && (
                      <div className="flex flex-col items-center">
                        <div className="text-xs font-bold text-blue-700">START</div>
                        {dateData.channels.map((ch, idx) => (
                          <div key={idx} className="text-xs text-blue-600 mt-1">
                            {ch.channel}
                          </div>
                        ))}
                      </div>
                    )}
                    {dateData.isEnd && (
                      <div className="flex flex-col items-center">
                        <div className="text-xs font-bold text-red-700">END</div>
                        {dateData.channels.map((ch, idx) => (
                          <div key={idx} className="text-xs text-red-600 mt-1">
                            {ch.channel}
                          </div>
                        ))}
                      </div>
                    )}
                    {!dateData.isStart && !dateData.isEnd && (
                      <div className="text-xs text-gray-400 text-center">No activity</div>
                    )}
                  </div>
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

      {/* Action Points */}
      {actionPoints.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Action Points
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {actionPoints.slice(0, 10).map((action) => (
                <div
                  key={action.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    action.type === 'overdue' 
                      ? 'border-red-200 bg-red-50' 
                      : action.type === 'current'
                      ? 'border-yellow-200 bg-yellow-50'
                      : 'border-blue-200 bg-blue-50'
                  }`}
                >
                  <div className="mt-1">
                    {action.type === 'overdue' && <AlertCircle className="h-4 w-4 text-red-600" />}
                    {action.type === 'current' && <Clock className="h-4 w-4 text-yellow-600" />}
                    {action.type === 'upcoming' && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={action.priority === 'high' ? 'destructive' : 'secondary'}>
                        {action.priority}
                      </Badge>
                      <span className="font-semibold text-sm">{action.channel} - {action.channelDetail}</span>
                      <span className="text-xs text-gray-500">Week {action.weekNumber} ({action.week})</span>
                    </div>
                    <p className="text-sm text-gray-700">{action.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
                  <XAxis dataKey="week" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                  <Legend />
                  {plan.channels.map((channel) => {
                    const channelLabel = CHANNEL_OPTIONS.find(c => c.value === channel.channel)?.label || channel.channel;
                    return (
                      <Line 
                        key={`${channel.id}-planned`}
                        type="monotone" 
                        dataKey={`${channelLabel} (Planned)`} 
                        stroke="#8884d8" 
                        strokeDasharray="5 5"
                      />
                    );
                  })}
                  {plan.channels.map((channel) => {
                    const channelLabel = CHANNEL_OPTIONS.find(c => c.value === channel.channel)?.label || channel.channel;
                    return (
                      <Line 
                        key={`${channel.id}-actual`}
                        type="monotone" 
                        dataKey={`${channelLabel} (Actual)`} 
                        stroke="#82ca9d" 
                      />
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

