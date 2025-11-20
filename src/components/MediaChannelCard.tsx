'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, Dot } from 'recharts';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from 'date-fns';
import { useState } from 'react';

interface ActionPoint {
  id: string;
  text: string;
  completed: boolean;
}

interface SpendData {
  date: string;
  actualSpend: number | null;
  targetSpend: number;
  projected?: boolean;
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
  };
  onToggleAction?: (channelId: string, actionId: string) => void;
}

export default function MediaChannelCard({ channel, onToggleAction }: MediaChannelCardProps) {
  const [completedActions, setCompletedActions] = useState<Set<string>>(
    new Set(channel.actionPoints.filter(a => a.completed).map(a => a.id))
  );

  const toggleAction = (actionId: string) => {
    setCompletedActions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(actionId)) {
        newSet.delete(actionId);
      } else {
        newSet.add(actionId);
      }
      return newSet;
    });
    onToggleAction?.(channel.id, actionId);
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
    const actualData = data.filter(d => d.actualSpend !== null && !d.projected);
    if (actualData.length < 2) return data;

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
    const intercept = (sumY - slope * sumX) / n;
    
    // Project from last actual data point
    const lastActualIndex = data.findIndex(d => d.date === actualData[actualData.length - 1].date);
    const lastActualSpend = actualData[actualData.length - 1].actualSpend || 0;
    
    return data.map((d, i) => {
      if (i <= lastActualIndex) return d;
      
      const daysFromLast = i - lastActualIndex;
      const projectedSpend = lastActualSpend + (slope * daysFromLast);
      
      return {
        ...d,
        actualSpend: projectedSpend,
        projected: true
      };
    });
  };

  const chartData = calculateProjection(channel.spendData);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border border-[#e2e8f0] rounded-lg shadow-lg p-3">
          <p className="text-sm font-semibold text-[#0f172a] mb-2">
            {format(parseISO(label), 'MMM d, yyyy')}
          </p>
          {data.actualSpend !== null && (
            <p className="text-sm text-[#2563eb] font-medium">
              Actual: ${data.actualSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {data.projected && ' (projected)'}
            </p>
          )}
          <p className="text-sm text-[#64748b]">
            Target: ${data.targetSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      );
    }
    return null;
  };

  const formatCurrency = (value: number) => {
    return `$${(value / 1000).toFixed(0)}k`;
  };

  const formatDate = (dateStr: string) => {
    return format(parseISO(dateStr), 'MMM d');
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
                <Badge className={`${getStatusColor(channel.status)} text-white font-medium`}>
                  {channel.status}
                </Badge>
              </div>
            </div>

            {/* Action Points */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-[#0f172a] mb-3">Action Items</h4>
              {channel.actionPoints.map((action) => {
                const isCompleted = completedActions.has(action.id);
                return (
                  <div
                    key={action.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-[#f8fafc] hover:bg-[#e2e8f0] transition-colors duration-200 ease-in-out cursor-pointer border border-transparent hover:border-[#cbd5e1]"
                    onClick={() => toggleAction(action.id)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Action item: ${action.text}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleAction(action.id);
                      }
                    }}
                  >
                    <Checkbox
                      checked={isCompleted}
                      onCheckedChange={() => toggleAction(action.id)}
                      aria-label={`Mark action ${isCompleted ? 'incomplete' : 'complete'}`}
                    />
                    <p
                      className={`text-sm flex-1 ${
                        isCompleted
                          ? 'line-through text-[#94a3b8]'
                          : 'text-[#0f172a]'
                      }`}
                    >
                      {action.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Section - Chart (60%) */}
          <div className="lg:col-span-3">
            <h4 className="text-sm font-semibold text-[#0f172a] mb-3">Budget Pacing</h4>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id={`colorTarget-${channel.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id={`colorActual-${channel.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    stroke="#64748b"
                    style={{ fontSize: '12px' }}
                    interval="preserveStartEnd"
                  />
                  
                  <YAxis
                    tickFormatter={formatCurrency}
                    stroke="#64748b"
                    style={{ fontSize: '12px' }}
                  />
                  
                  <Tooltip content={<CustomTooltip />} />
                  
                  {/* Target Budget Area */}
                  <Area
                    type="linear"
                    dataKey="targetSpend"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    fill={`url(#colorTarget-${channel.id})`}
                    animationDuration={1500}
                    animationEasing="ease-in-out"
                  />
                  
                  {/* Actual Spend Area */}
                  <Area
                    type="monotone"
                    dataKey="actualSpend"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    fill={`url(#colorActual-${channel.id})`}
                    animationDuration={1500}
                    animationEasing="ease-in-out"
                    dot={(props: any) => {
                      if (props.payload.projected) {
                        return (
                          <Dot
                            {...props}
                            r={3}
                            fill="#93c5fd"
                            stroke="#2563eb"
                            strokeWidth={1}
                            opacity={0.6}
                          />
                        );
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
                    strokeDasharray={(props: any) => {
                      // Use dashed line for projected data
                      return props?.payload?.projected ? "5 5" : "0";
                    }}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

