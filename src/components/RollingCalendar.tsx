'use client';

import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, addDays, subDays, isSameDay, startOfDay } from 'date-fns';
import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ActionPoint {
  id: string;
  text: string;
  completed: boolean;
  category: 'SET UP' | 'ONGOING';
  channel_type: string;
  reset_frequency?: 'weekly' | 'fortnightly' | 'monthly' | null;
}

interface Task {
  id: string;
  text: string;
  priority: 'high' | 'medium' | 'low';
  channel: string;
  completed: boolean;
  actionPointId: string;
  scheduledDate: Date;
}

interface DayData {
  date: Date;
  tasks: Task[];
}

interface RollingCalendarProps {
  channelTypes?: string[];
  activePlan?: {
    channels?: Array<{
      channel: string;
      detail: string;
    }>;
  } | null;
}

export default function RollingCalendar({ channelTypes, activePlan }: RollingCalendarProps = {}) {
  const today = startOfDay(new Date());
  const [startDayOffset, setStartDayOffset] = useState(-1); // Start from yesterday
  const [direction, setDirection] = useState<'left' | 'right' | null>(null);
  const [actionPoints, setActionPoints] = useState<ActionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  
  // Get channel types from active plan if not provided
  const getChannelTypes = (): string[] => {
    if (channelTypes && channelTypes.length > 0) {
      return channelTypes;
    }
    
    if (activePlan?.channels) {
      return activePlan.channels.map(ch => {
        const lowerName = ch.channel.toLowerCase();
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
        return ch.channel;
      });
    }
    
    return [];
  };

  // Fetch action points for all channel types
  useEffect(() => {
    const fetchAllActionPoints = async () => {
      setLoading(true);
      const types = getChannelTypes();
      
      if (types.length === 0) {
        setActionPoints([]);
        setLoading(false);
        return;
      }

      try {
        const allActionPoints: ActionPoint[] = [];
        
        // Fetch action points for each channel type
        await Promise.all(
          types.map(async (channelType) => {
            try {
              const response = await fetch(`/api/action-points?channel_type=${encodeURIComponent(channelType)}`);
              if (response.ok) {
                const { data } = await response.json();
                if (data && Array.isArray(data)) {
                  allActionPoints.push(...data);
                }
              }
            } catch (error) {
              console.error(`Error fetching action points for ${channelType}:`, error);
            }
          })
        );
        
        setActionPoints(allActionPoints);
        
        // Initialize completed tasks from action points
        const completed = new Set(
          allActionPoints.filter(ap => ap.completed).map(ap => ap.id)
        );
        setCompletedTasks(completed);
      } catch (error) {
        console.error('Error fetching action points:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAllActionPoints();
  }, [channelTypes, activePlan?.channels]);

  // Generate day data from action points
  const generateAllDays = (): DayData[] => {
    const allDays: DayData[] = [];
    const taskMap = new Map<string, Task[]>();
    
    // Initialize days from -7 to 7
    for (let i = -7; i <= 7; i++) {
      const date = addDays(today, i);
      const dateKey = format(date, 'yyyy-MM-dd');
      taskMap.set(dateKey, []);
    }
    
    // Process only incomplete action points
    const incompleteActionPoints = actionPoints.filter(ap => !ap.completed);
    
    // Track which action points have been scheduled to avoid duplicates
    const scheduledActionPointIds = new Set<string>();
    
    incompleteActionPoints.forEach((actionPoint) => {
      // Skip if already scheduled
      if (scheduledActionPointIds.has(actionPoint.id)) {
        return;
      }
      
      const priority: 'high' | 'medium' | 'low' = actionPoint.category === 'SET UP' ? 'high' : 'medium';
      const todayKey = format(today, 'yyyy-MM-dd');
      const tasks = taskMap.get(todayKey) || [];
      
      // Check if task already exists (avoid duplicates)
      if (!tasks.find(t => t.actionPointId === actionPoint.id)) {
        tasks.push({
          id: `${actionPoint.id}-${todayKey}`, // Make key unique by combining actionPointId with date
          text: actionPoint.text,
          priority,
          channel: actionPoint.channel_type,
          completed: false,
          actionPointId: actionPoint.id,
          scheduledDate: today,
        });
        taskMap.set(todayKey, tasks);
        scheduledActionPointIds.add(actionPoint.id);
      }
    });
    
    // Convert map to DayData array
    for (let i = -7; i <= 7; i++) {
      const date = addDays(today, i);
      const dateKey = format(date, 'yyyy-MM-dd');
      allDays.push({
        date,
        tasks: taskMap.get(dateKey) || [],
      });
    }
    
    return allDays;
  };
  
  const allDays = generateAllDays();

  // Get visible days based on current offset
  const getVisibleDays = () => {
    const startIndex = allDays.findIndex(d => isSameDay(d.date, addDays(today, startDayOffset)));
    return allDays.slice(startIndex, startIndex + 4);
  };
  
  const visibleDays = getVisibleDays();

  const toggleTask = async (taskId: string) => {
    const task = allDays.flatMap(d => d.tasks).find(t => t.id === taskId);
    if (!task) return;
    
    // Track completion by actionPointId, not taskId
    const actionPointId = task.actionPointId;
    const newCompleted = !completedTasks.has(actionPointId);
    
    // Optimistically update UI
    setCompletedTasks(prev => {
      const newSet = new Set(prev);
      if (newCompleted) {
        newSet.add(actionPointId);
      } else {
        newSet.delete(actionPointId);
      }
      return newSet;
    });
    
    // Update in database
    try {
      const response = await fetch('/api/action-points', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: actionPointId,
          completed: newCompleted
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update action point');
      }
      
      // Refresh action points to get latest state
      const types = getChannelTypes();
      const allActionPoints: ActionPoint[] = [];
      
      await Promise.all(
        types.map(async (channelType) => {
          try {
            const resp = await fetch(`/api/action-points?channel_type=${encodeURIComponent(channelType)}`);
            if (resp.ok) {
              const { data } = await resp.json();
              if (data && Array.isArray(data)) {
                allActionPoints.push(...data);
              }
            }
          } catch (error) {
            console.error(`Error refreshing action points for ${channelType}:`, error);
          }
        })
      );
      
      setActionPoints(allActionPoints);
      
      // Update completed tasks set from refreshed action points
      const completed = new Set(
        allActionPoints.filter(ap => ap.completed).map(ap => ap.id)
      );
      setCompletedTasks(completed);
    } catch (error) {
      console.error('Error updating action point:', error);
      // Revert on error
      setCompletedTasks(prev => {
        const newSet = new Set(prev);
        if (newCompleted) {
          newSet.delete(actionPointId);
        } else {
          newSet.add(actionPointId);
        }
        return newSet;
      });
    }
  };
  
  const handlePrevious = () => {
    if (startDayOffset > -7) {
      setDirection('left'); // Cards shift left when going back
      setTimeout(() => {
        setStartDayOffset(prev => prev - 1);
        setDirection(null);
      }, 100);
    }
  };
  
  const handleNext = () => {
    if (startDayOffset < 4) {
      setDirection('right'); // Cards shift right when going forward
      setTimeout(() => {
        setStartDayOffset(prev => prev + 1);
        setDirection(null);
      }, 100);
    }
  };

  const getPriorityColor = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high': return 'bg-[#ef4444]';
      case 'medium': return 'bg-[#f59e0b]';
      case 'low': return 'bg-[#22c55e]';
    }
  };

  const getChannelColor = (channel: string) => {
    const lowerChannel = channel.toLowerCase();
    if (lowerChannel.includes('meta') || lowerChannel.includes('facebook')) {
      return 'bg-blue-600';
    }
    if (lowerChannel.includes('google')) {
      return 'bg-red-600';
    }
    if (lowerChannel.includes('linkedin')) {
      return 'bg-blue-700';
    }
    if (lowerChannel.includes('tiktok')) {
      return 'bg-black';
    }
    return 'bg-gray-600';
  };

  return (
    <div className="w-full">
      <style jsx>{`
        .cards-container {
          transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .shift-left {
          transform: translateX(-100%);
          opacity: 0;
        }
        
        .shift-right {
          transform: translateX(100%);
          opacity: 0;
        }
        
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        .slide-in {
          animation: slideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
      `}</style>
      
      <Card className="bg-white shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 ease-in-out p-6">
        <div className="relative">
          {/* Navigation Buttons */}
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrevious}
              disabled={startDayOffset <= -7}
              className="h-10 w-10 transition-all duration-200"
              aria-label="Previous days"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            
            <h3 className="text-lg font-semibold text-[#0f172a]">Daily Task Calendar</h3>
            
            <Button
              variant="outline"
              size="icon"
              onClick={handleNext}
              disabled={startDayOffset >= 4}
              className="h-10 w-10 transition-all duration-200"
              aria-label="Next days"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* Day Cards */}
          <div className="overflow-hidden">
            <div 
              className={`cards-container grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ${
                direction === 'left' ? 'shift-left' : direction === 'right' ? 'shift-right' : ''
              }`}
            >
              {visibleDays.map((day, index) => {
                const isToday = isSameDay(day.date, today);
                const dayName = format(day.date, 'EEE').toUpperCase();
                const dayNumber = format(day.date, 'd');
                const fullDate = format(day.date, 'MMM d, yyyy');
                
                return (
                  <div
                    key={format(day.date, 'yyyy-MM-dd')}
                    className={`rounded-lg p-4 transition-all duration-300 ease-in-out ${
                      !direction ? 'slide-in' : ''
                    } ${
                      isToday 
                        ? 'bg-white border-2 border-[#2563eb] shadow-lg' 
                        : 'bg-[#f8fafc] border border-[#e2e8f0]'
                    }`}
                    style={{ animationDelay: `${index * 0.05}s` }}
                    role="article"
                    aria-label={`Day card for ${fullDate}`}
                  >
                  {/* Day Header */}
                  <div className="text-center mb-4">
                    <div className={`text-sm font-semibold mb-1 ${isToday ? 'text-[#2563eb]' : 'text-[#64748b]'}`}>
                      {dayName}
                    </div>
                    <div className={`text-4xl font-bold mb-1 ${isToday ? 'text-[#2563eb]' : 'text-[#0f172a]'}`}>
                      {dayNumber}
                    </div>
                    <div className={`text-xs ${isToday ? 'text-[#64748b]' : 'text-[#64748b]'}`}>
                      {fullDate}
                    </div>
                  </div>

                  {/* Tasks List */}
                  <div className="space-y-3">
                    {day.tasks.map((task) => {
                      const isCompleted = completedTasks.has(task.actionPointId);
                      return (
                        <div
                          key={task.id}
                          className={`flex items-start gap-2 p-2 rounded ${
                            isToday ? 'bg-[#f8fafc]' : 'bg-white'
                          }`}
                          role="group"
                          aria-label={`Task: ${task.text}`}
                        >
                          {/* Priority Dot */}
                          <div
                            className={`flex-shrink-0 w-2 h-2 rounded-full mt-1.5 ${getPriorityColor(task.priority)}`}
                            role="status"
                            aria-label={`${task.priority} priority`}
                          />
                          
                          <div className="flex-1 min-w-0">
                            {/* Channel Badge */}
                            <div className="mb-1">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-xs font-medium text-white ${getChannelColor(task.channel)}`}
                              >
                                {task.channel}
                              </span>
                            </div>
                            
                            {/* Task Text */}
                            <p
                              className={`text-sm ${
                                isCompleted
                                  ? 'line-through text-[#94a3b8]'
                                  : 'text-[#0f172a]'
                              }`}
                            >
                              {task.text}
                            </p>
                          </div>
                          
                          {/* Checkbox */}
                          <Checkbox
                            checked={isCompleted}
                            onCheckedChange={() => toggleTask(task.id)}
                            aria-label={`Mark task ${isCompleted ? 'incomplete' : 'complete'}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

