'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart, Dot } from 'recharts';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from 'date-fns';
import { useState } from 'react';
import { RefreshCw, Plus, X, Edit2, Check, Trash2 } from 'lucide-react';

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
    isMetaAds?: boolean;
    onRefreshSpend?: () => void;
    isFetchingSpend?: boolean;
    spendError?: string;
    onActionPointsChange?: () => void;
    channelType: string;
  };
  onToggleAction?: (channelId: string, actionId: string) => void;
}

export default function MediaChannelCard({ channel, onToggleAction }: MediaChannelCardProps) {
  const [completedActions, setCompletedActions] = useState<Set<string>>(
    new Set(channel.actionPoints.filter(a => a.completed).map(a => a.id))
  );
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
              <h4 className="text-sm font-semibold text-[#0f172a]">Budget Pacing</h4>
              {channel.isMetaAds && channel.onRefreshSpend && (
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

