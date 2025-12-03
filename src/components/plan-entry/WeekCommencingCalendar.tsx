'use client';

import React, { useState, useRef, useEffect } from 'react';
import { format, addWeeks, startOfMonth } from 'date-fns';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getWeekCommencing, MediaChannel, CHANNEL_OPTIONS } from '@/types/media-plan';

interface WeekCommencingCalendarProps {
  channels: MediaChannel[];
  selectedChannelIndex: number | null;
  onDateRangeChange: (channelIndex: number, startWeek: string, endWeek: string) => void;
}

export default function WeekCommencingCalendar({
  channels,
  selectedChannelIndex,
  onDateRangeChange
}: WeekCommencingCalendarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<string | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<string | null>(null);
  const [activeChannelIndex, setActiveChannelIndex] = useState<number | null>(selectedChannelIndex);
  // Track selected weeks for each channel (set of week strings)
  const [selectedWeeksByChannel, setSelectedWeeksByChannel] = useState<Map<number, Set<string>>>(new Map());
  // Ref to store pending date range changes to avoid calling callback during render
  const pendingDateRangeChangeRef = useRef<{ channelIndex: number; startWeek: string; endWeek: string } | null>(null);
  
  // Update active channel when selectedChannelIndex changes
  useEffect(() => {
    setActiveChannelIndex(selectedChannelIndex);
  }, [selectedChannelIndex]);

  // Call onDateRangeChange when pending date range change is set (outside of render phase)
  useEffect(() => {
    if (pendingDateRangeChangeRef.current) {
      const { channelIndex, startWeek, endWeek } = pendingDateRangeChangeRef.current;
      pendingDateRangeChangeRef.current = null; // Clear the ref
      onDateRangeChange(channelIndex, startWeek, endWeek);
    }
  }, [selectedWeeksByChannel, onDateRangeChange]);

  // Initialize selected weeks from channel data on mount and when new channels are added
  useEffect(() => {
    setSelectedWeeksByChannel(prev => {
      const newMap = new Map(prev);
      let hasChanges = false;
      
      channels.forEach((channel, index) => {
        // Only initialize if this channel doesn't already have selected weeks
        if (!newMap.has(index)) {
          if (channel.startWeek && channel.endWeek) {
            const weekSet = new Set<string>();
            const start = getWeekCommencing(new Date(channel.startWeek));
            const end = getWeekCommencing(new Date(channel.endWeek));
            const startStr = format(start, 'yyyy-MM-dd');
            const endStr = format(end, 'yyyy-MM-dd');
            
            // Always add start and end
            weekSet.add(startStr);
            if (startStr !== endStr) {
              weekSet.add(endStr);
            }
            
            // Check if adjacent - if so, add weeks in between
            const oneWeekLater = addWeeks(start, 1);
            const isAdjacent = format(getWeekCommencing(oneWeekLater), 'yyyy-MM-dd') === endStr;
            if (isAdjacent) {
              let current = addWeeks(start, 1);
              while (current < end) {
                weekSet.add(format(getWeekCommencing(current), 'yyyy-MM-dd'));
                current = addWeeks(current, 1);
              }
            }
            
            newMap.set(index, weekSet);
            hasChanges = true;
          } else {
            // Initialize empty set for channels without dates
            newMap.set(index, new Set<string>());
            hasChanges = true;
          }
        }
      });
      
      // Remove channels that no longer exist
      const existingIndices = new Set(channels.map((_, i) => i));
      for (const [index] of newMap) {
        if (!existingIndices.has(index)) {
          newMap.delete(index);
          hasChanges = true;
        }
      }
      
      return hasChanges ? newMap : prev;
    });
  }, [channels.map(c => c.id).join(',')]); // Only re-run when channel IDs change (new channels added/removed)
  
  // Calculate the date range needed to show all channels
  const getDateRange = () => {
    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    
    channels.forEach(channel => {
      if (channel.startWeek && channel.endWeek) {
        const start = new Date(channel.startWeek);
        const end = new Date(channel.endWeek);
        
        if (!minDate || start < minDate) minDate = start;
        if (!maxDate || end > maxDate) maxDate = end;
      }
    });
    
    // Default to 6 months back and 12 months forward if no channels
    const today = new Date();
    if (!minDate) minDate = addWeeks(today, -26);
    if (!maxDate) maxDate = addWeeks(today, 52);
    
    // Add some buffer
    const bufferWeeks = 4;
    minDate = addWeeks(minDate, -bufferWeeks);
    maxDate = addWeeks(maxDate, bufferWeeks);
    
    return { minDate, maxDate };
  };

  const { minDate, maxDate } = getDateRange();
  
  // Generate weeks based on date range
  const generateWeeks = () => {
    const weeks: Date[] = [];
    let currentWeek = getWeekCommencing(minDate);
    
    while (currentWeek <= maxDate) {
      weeks.push(new Date(currentWeek));
      currentWeek = addWeeks(currentWeek, 1);
    }
    
    return weeks;
  };

  const weeks = generateWeeks();
  
  // Group weeks by month
  const getMonthGroups = () => {
    const groups: { month: string; monthStart: Date; weeks: Date[] }[] = [];
    let currentMonth: string | null = null;
    let currentGroup: Date[] = [];
    let currentMonthStart: Date | null = null;

    weeks.forEach((week) => {
      const monthKey = format(week, 'yyyy-MM');
      
      if (monthKey !== currentMonth) {
        if (currentGroup.length > 0 && currentMonthStart) {
          groups.push({
            month: format(currentMonthStart, 'MMM yyyy'),
            monthStart: currentMonthStart,
            weeks: [...currentGroup]
          });
        }
        currentMonth = monthKey;
        currentGroup = [week];
        currentMonthStart = startOfMonth(week);
      } else {
        currentGroup.push(week);
      }
    });
    
    if (currentGroup.length > 0 && currentMonthStart) {
      groups.push({
        month: format(currentMonthStart, 'MMM yyyy'),
        monthStart: currentMonthStart,
        weeks: [...currentGroup]
      });
    }
    
    return groups;
  };

  const monthGroups = getMonthGroups();

  const isWeekInChannelRange = (weekDate: Date, channelIndex: number) => {
    const weekStart = getWeekCommencing(weekDate);
    const weekString = format(weekStart, 'yyyy-MM-dd');
    const selectedWeeks = selectedWeeksByChannel.get(channelIndex);
    return selectedWeeks ? selectedWeeks.has(weekString) : false;
  };

  const isWeekInSelectionRange = (weekDate: Date) => {
    // No longer needed with toggle-based selection
    return false;
  };

  const handleWeekClick = (weekDate: Date, channelIndex: number) => {
    // Set active channel if clicking on a different channel
    if (activeChannelIndex !== channelIndex) {
      setActiveChannelIndex(channelIndex);
    }

    const weekStart = getWeekCommencing(weekDate);
    const weekString = format(weekStart, 'yyyy-MM-dd');
    
    // Calculate the new selected weeks and date range
    setSelectedWeeksByChannel(prev => {
      // Get current selected weeks for this channel (ensure it exists)
      const currentSelected = prev.get(channelIndex) || new Set<string>();
      const newSelected = new Set(currentSelected);
      
      // Toggle the clicked week
      if (newSelected.has(weekString)) {
        // Remove if already selected
        newSelected.delete(weekString);
      } else {
        // Add if not selected
        newSelected.add(weekString);
      }
      
      // Calculate min and max weeks for startWeek and endWeek
      let calculatedStartWeek = '';
      let calculatedEndWeek = '';
      
      if (newSelected.size > 0) {
        const weekDates = Array.from(newSelected)
          .map(w => new Date(w))
          .sort((a, b) => a.getTime() - b.getTime());
        const minWeek = weekDates[0];
        const maxWeek = weekDates[weekDates.length - 1];
        
        calculatedStartWeek = format(getWeekCommencing(minWeek), 'yyyy-MM-dd');
        calculatedEndWeek = format(getWeekCommencing(maxWeek), 'yyyy-MM-dd');
      }
      
      // Store the callback parameters in a ref (will be called in useEffect)
      pendingDateRangeChangeRef.current = {
        channelIndex,
        startWeek: calculatedStartWeek,
        endWeek: calculatedEndWeek
      };
      
      // Update the map
      const updated = new Map(prev);
      updated.set(channelIndex, newSelected);
      
      return updated;
    });
  };

  const handleWeekMouseEnter = (weekDate: Date, channelIndex: number) => {
    // Hover preview removed - using toggle-based selection instead
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 300;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  // Get channel label
  const getChannelLabel = (channel: MediaChannel, index: number) => {
    if (channel.channel && channel.detail) {
      const channelOption = CHANNEL_OPTIONS.find(opt => opt.value === channel.channel);
      const channelName = channelOption ? channelOption.label : channel.channel;
      return `${channelName} - ${channel.detail}`;
    }
    return `Channel ${index + 1}`;
  };

  return (
    <Card className="p-4 sticky top-4 self-start max-h-[calc(100vh-2rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h3 className="text-sm font-semibold">Date Range Calendar</h3>
          <p className="text-xs text-gray-500 mt-1">
            {activeChannelIndex !== null && channels[activeChannelIndex]
              ? `Click W/C boxes to set dates for: ${getChannelLabel(channels[activeChannelIndex], activeChannelIndex)}`
              : 'Select a channel row to set dates'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => scroll('left')}
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => scroll('right')}
            className="h-8 w-8"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <div 
        ref={scrollContainerRef}
        className="overflow-x-auto overflow-y-auto flex-1 pb-2"
        style={{ scrollbarWidth: 'thin' }}
      >
        <div className="inline-flex flex-col min-w-full">
          {/* Month Header Row */}
          <div className="flex border-b sticky top-0 bg-white z-20">
            <div className="px-3 py-1 text-xs font-semibold text-gray-700 border-r bg-white min-w-[150px] max-w-[150px] sticky left-0 z-20">
              Month
            </div>
            {monthGroups.map((group) => (
              <div
                key={group.month}
                className="border-r px-2 py-1 text-xs font-semibold text-gray-700 min-w-[120px]"
                style={{ width: `${group.weeks.length * 40}px` }}
              >
                {group.month}
              </div>
            ))}
          </div>
          
          {/* W/C Header Row */}
          <div className="flex border-b bg-gray-50 sticky top-[29px] z-10">
            <div className="px-3 py-1 text-xs font-medium border-r bg-gray-50 min-w-[150px] max-w-[150px] sticky left-0 z-10">
              W/C
            </div>
            {weeks.map((week, index) => {
              const weekStart = getWeekCommencing(week);
              const weekString = format(weekStart, 'yyyy-MM-dd');
              
              return (
                <div
                  key={weekString}
                  data-week-index={index}
                  className="border-r px-1 py-1 text-xs text-center min-w-[40px] font-medium"
                  title={format(weekStart, "'W/C' dd MMM yyyy")}
                >
                  {format(weekStart, 'dd/MM')}
                </div>
              );
            })}
          </div>
          
          {/* Channel Rows */}
          {channels.map((channel, channelIndex) => {
            const isActive = activeChannelIndex === channelIndex;
            const channelLabel = getChannelLabel(channel, channelIndex);
            
            return (
              <div key={channel.id} className="flex border-b">
                <div className="px-3 py-2 text-xs font-medium border-r bg-gray-50 min-w-[150px] max-w-[150px] sticky left-0 z-10">
                  <div className={`truncate ${isActive ? 'text-blue-600 font-semibold' : 'text-gray-700'}`}>
                    {channelLabel}
                  </div>
                </div>
                {weeks.map((week, weekIndex) => {
                  const weekStart = getWeekCommencing(week);
                  const weekString = format(weekStart, 'yyyy-MM-dd');
                  const isInRange = isWeekInChannelRange(week, channelIndex);
                  
                  return (
                    <div
                      key={`${channel.id}-${weekString}`}
                      className={`border-r px-1 py-2 text-xs text-center min-w-[40px] cursor-pointer transition-colors ${
                        isActive ? 'hover:bg-blue-50' : ''
                      }`}
                      onClick={() => handleWeekClick(week, channelIndex)}
                      style={{
                        backgroundColor: isInRange 
                          ? (isActive ? '#3b82f6' : '#93c5fd')
                          : undefined,
                        color: isInRange && isActive ? 'white' : undefined,
                        fontWeight: isInRange && isActive ? 'bold' : undefined
                      }}
                      title={format(weekStart, "'W/C' dd MMM yyyy")}
                    >
                      {isInRange ? '●' : ''}
                    </div>
                  );
                })}
              </div>
            );
          })}
          
          {/* Empty state if no channels */}
          {channels.length === 0 && (
            <div className="flex items-center justify-center py-8 text-sm text-gray-500">
              Add a channel to see date ranges
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
