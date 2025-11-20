'use client';

import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, addDays, subDays, isSameDay } from 'date-fns';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Task {
  id: string;
  text: string;
  priority: 'high' | 'medium' | 'low';
  channel: 'Meta' | 'Google' | 'LinkedIn' | 'TikTok';
  completed: boolean;
}

interface DayData {
  date: Date;
  tasks: Task[];
}

export default function RollingCalendar() {
  const today = new Date();
  const [startDayOffset, setStartDayOffset] = useState(-1); // Start from yesterday
  const [direction, setDirection] = useState<'left' | 'right' | null>(null);
  
  // Generate day data for a wider range (7 days before to 7 days after today)
  const generateAllDays = (): DayData[] => {
    const allDays: DayData[] = [];
    
    // Sample tasks for different days
    const taskTemplates = [
      { text: 'Review ad performance', priority: 'high' as const, channel: 'Meta' as const },
      { text: 'Update campaign budgets', priority: 'medium' as const, channel: 'Google' as const },
      { text: 'Analyze audience insights', priority: 'low' as const, channel: 'LinkedIn' as const },
      { text: 'Launch new campaign', priority: 'high' as const, channel: 'Meta' as const },
      { text: 'Client status meeting', priority: 'high' as const, channel: 'Google' as const },
      { text: 'Review creative assets', priority: 'medium' as const, channel: 'TikTok' as const },
      { text: 'Optimize targeting', priority: 'medium' as const, channel: 'Google' as const },
      { text: 'A/B test results review', priority: 'high' as const, channel: 'Meta' as const },
      { text: 'Content calendar update', priority: 'low' as const, channel: 'LinkedIn' as const },
      { text: 'Monthly report prep', priority: 'medium' as const, channel: 'Google' as const },
      { text: 'Strategy adjustment', priority: 'high' as const, channel: 'Meta' as const },
      { text: 'Competitor analysis', priority: 'low' as const, channel: 'TikTok' as const },
      { text: 'Budget reallocation review', priority: 'medium' as const, channel: 'Meta' as const },
      { text: 'Performance dashboard check', priority: 'low' as const, channel: 'Google' as const },
      { text: 'Team sync meeting', priority: 'medium' as const, channel: 'LinkedIn' as const },
    ];
    
    for (let i = -7; i <= 7; i++) {
      const date = addDays(today, i);
      const dayTasks = taskTemplates
        .slice((i + 7) % taskTemplates.length, ((i + 7) % taskTemplates.length) + 3)
        .map((template, idx) => ({
          id: `task-${i}-${idx}`,
          ...template,
          completed: i < 0 && Math.random() > 0.5, // Past tasks may be completed
        }));
      
      allDays.push({
        date,
        tasks: dayTasks.length ? dayTasks : taskTemplates.slice(0, 3).map((template, idx) => ({
          id: `task-${i}-${idx}`,
          ...template,
          completed: false,
        })),
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
  
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(
    new Set(allDays.flatMap(d => d.tasks.filter(t => t.completed).map(t => t.id)))
  );

  const toggleTask = (taskId: string) => {
    setCompletedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
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
    switch (channel) {
      case 'Meta': return 'bg-blue-600';
      case 'Google': return 'bg-red-600';
      case 'LinkedIn': return 'bg-blue-700';
      case 'TikTok': return 'bg-black';
      default: return 'bg-gray-600';
    }
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
                        ? 'bg-gradient-to-br from-[#2563eb] to-[#1d4ed8] text-white shadow-lg' 
                        : 'bg-[#f8fafc] border border-[#e2e8f0]'
                    }`}
                    style={{ animationDelay: `${index * 0.05}s` }}
                    role="article"
                    aria-label={`Day card for ${fullDate}`}
                  >
                  {/* Day Header */}
                  <div className="text-center mb-4">
                    <div className={`text-sm font-semibold mb-1 ${isToday ? 'text-blue-100' : 'text-[#64748b]'}`}>
                      {dayName}
                    </div>
                    <div className={`text-4xl font-bold mb-1 ${isToday ? 'text-white' : 'text-[#0f172a]'}`}>
                      {dayNumber}
                    </div>
                    <div className={`text-xs ${isToday ? 'text-blue-100' : 'text-[#64748b]'}`}>
                      {fullDate}
                    </div>
                    {isToday && (
                      <Badge className="mt-2 bg-white text-[#2563eb] hover:bg-white font-semibold">
                        Today
                      </Badge>
                    )}
                  </div>

                  {/* Tasks List */}
                  <div className="space-y-3">
                    {day.tasks.map((task) => {
                      const isCompleted = completedTasks.has(task.id);
                      return (
                        <div
                          key={task.id}
                          className={`flex items-start gap-2 p-2 rounded ${
                            isToday ? 'bg-white/10' : 'bg-white'
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
                                  ? `line-through ${isToday ? 'text-white/50' : 'text-[#94a3b8]'}`
                                  : isToday
                                  ? 'text-white'
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
                            className={isToday ? 'border-white data-[state=checked]:bg-white data-[state=checked]:text-blue-600' : ''}
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

