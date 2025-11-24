"use client";

import React, { useState, useRef, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WeekRange {
  weekStart: Date;
  weekEnd: Date;
  month: string;
}

export interface MediaFlight {
  id: string;
  startWeek: Date;  // The week this flight starts
  endWeek: Date;    // The week this flight ends
  monthlySpend: { [monthKey: string]: number };  // Spend per month
  color: string;    // Hex color for the block
  weeklyBudget?: number;
}

export interface MediaPlanChannel {
  id: string;
  channelName: string;
  format: string;
  percentOfInvestment: number;
  totalBudget: number;
  flights: MediaFlight[];
}

const generateChannelId = (): string => {
  return `channel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const createEmptyChannel = (): MediaPlanChannel => ({
  id: generateChannelId(),
  channelName: "",
  format: "",
  percentOfInvestment: 0,
  totalBudget: 0,
  flights: [],
});

// Media channel definitions with colors
const MEDIA_CHANNELS = [
  { name: "Meta Ads", color: "bg-blue-50", textColor: "text-blue-900" },
  { name: "Google Ads", color: "bg-red-50", textColor: "text-red-900" },
  { name: "LinkedIn Ads", color: "bg-blue-100", textColor: "text-blue-950" },
  { name: "TikTok Ads", color: "bg-gray-100", textColor: "text-gray-900" },
  { name: "Instagram Ads", color: "bg-pink-50", textColor: "text-pink-900" },
  { name: "Twitter Ads", color: "bg-sky-50", textColor: "text-sky-900" },
  { name: "YouTube Ads", color: "bg-red-100", textColor: "text-red-950" },
  { name: "Snapchat Ads", color: "bg-yellow-50", textColor: "text-yellow-900" },
];

// Get channel color classes
const getChannelColorClasses = (channelName: string): { bg: string; text: string } => {
  if (!channelName) {
    return { bg: "bg-white", text: "text-gray-900" };
  }
  const channel = MEDIA_CHANNELS.find(
    (c) => c.name.toLowerCase() === channelName.toLowerCase()
  );
  return channel
    ? { bg: channel.color, text: channel.textColor }
    : { bg: "bg-white", text: "text-gray-900" };
};

/**
 * Generates weekly date ranges between start and end dates.
 * Each week runs Monday-Sunday.
 * 
 * @param startDate - Start date (inclusive)
 * @param endDate - End date (inclusive)
 * @returns Array of week objects with weekStart, weekEnd, and month
 */
function generateWeeklyDateRanges(startDate: Date, endDate: Date): WeekRange[] {
  const weeks: WeekRange[] = [];
  
  // Find the Monday of the week containing the start date
  const currentWeekStart = new Date(startDate);
  const dayOfWeek = currentWeekStart.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  currentWeekStart.setDate(currentWeekStart.getDate() + daysToMonday);
  
  // Generate weeks until we pass the end date
  while (currentWeekStart <= endDate) {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6); // Sunday (6 days after Monday)
    
    // Get month name for the week (use the month of the week start)
    const monthName = currentWeekStart.toLocaleDateString("en-US", { 
      month: "long", 
      year: "numeric" 
    });
    
    weeks.push({
      weekStart: new Date(currentWeekStart),
      weekEnd: new Date(weekEnd),
      month: monthName,
    });
    
    // Move to next Monday
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  }
  
  return weeks;
}

interface MediaPlanGridProps {
  channels?: MediaPlanChannel[];
  onChannelsChange?: (channels: MediaPlanChannel[]) => void;
}

export function MediaPlanGrid({ channels: externalChannels, onChannelsChange }: MediaPlanGridProps) {
  // Use internal state if not controlled
  const [internalChannels, setInternalChannels] = useState<MediaPlanChannel[]>(() => [
    createEmptyChannel(),
  ]);
  const channels = externalChannels ?? internalChannels;
  const setChannels = onChannelsChange ?? setInternalChannels;
  
  // Drag state
  const [dragState, setDragState] = useState<{
    channelId: string | null;
    startWeekIdx: number | null;
    currentWeekIdx: number | null;
    isDragging: boolean;
  }>({
    channelId: null,
    startWeekIdx: null,
    currentWeekIdx: null,
    isDragging: false,
  });
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ rowIndex: number; weekIndex: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ rowIndex: number; weekIndex: number } | null>(null);

  // Flight editing modal state
  const [editingFlight, setEditingFlight] = useState<{
    channelId: string;
    flight: MediaFlight | null;
    startWeekIdx: number;
    endWeekIdx: number;
  } | null>(null);
  
  const [flightFormData, setFlightFormData] = useState<{
    monthlySpend: { [monthKey: string]: number };
    color: string;
  }>({ monthlySpend: {}, color: "#3b82f6" });
  
  const isDraggingRef = useRef(false);
  // Hardcoded date range: Dec 1 2024 - Feb 28 2025
  const startDate = new Date(2024, 11, 1); // December 1, 2024 (month is 0-indexed)
  const endDate = new Date(2025, 1, 28); // February 28, 2025
  
  const weeks = generateWeeklyDateRanges(startDate, endDate);
  
  // Group weeks by month
  const monthGroups: Array<{ month: string; weeks: WeekRange[] }> = [];
  let currentMonth = "";
  let currentGroup: WeekRange[] = [];
  
  weeks.forEach((week) => {
    if (week.month !== currentMonth) {
      if (currentGroup.length > 0) {
        monthGroups.push({ month: currentMonth, weeks: currentGroup });
      }
      currentMonth = week.month;
      currentGroup = [week];
    } else {
      currentGroup.push(week);
    }
  });
  if (currentGroup.length > 0) {
    monthGroups.push({ month: currentMonth, weeks: currentGroup });
  }

  const formatWeekDate = (date: Date) => {
    const day = date.getDate();
    const month = date.toLocaleDateString("en-US", { month: "short" });
    return `${day}/${month}`;
  };

  const getSelectedCells = () => {
    if (!dragStart || !dragEnd) return [];
    const minWeek = Math.min(dragStart.weekIndex, dragEnd.weekIndex);
    const maxWeek = Math.max(dragStart.weekIndex, dragEnd.weekIndex);
    return Array.from({ length: maxWeek - minWeek + 1 }, (_, i) => minWeek + i);
  };

const calculateMonthlyTotal = (monthKey: string) => {
  let total = 0;
  channels.forEach((channel) => {
    channel.flights?.forEach((flight) => {
      const weeklyBudget = flight.weeklyBudget || 0;
      if (weeklyBudget === 0) {
        return;
      }
      const weeksInMonthAndFlight = weeks.filter((week) => {
        const weekMonthKey = `${week.weekStart.getFullYear()}-${week.weekStart.getMonth() + 1}`;
        const isInMonth = weekMonthKey === monthKey;
        const weekStartDate = week.weekStart;
        const flightStart = new Date(flight.startWeek);
        const flightEnd = new Date(flight.endWeek);
        const isInFlight = weekStartDate >= flightStart && weekStartDate <= flightEnd;
        return isInMonth && isInFlight;
      });
      total += weeklyBudget * weeksInMonthAndFlight.length;
    });
  });
  return total;
};

const handleCreateFlight = (channelIndex: number) => {
  if (!dragStart || !dragEnd) return;

  const channel = channels[channelIndex];
  if (!channel || !channel.totalBudget || channel.totalBudget === 0) {
    alert("Please enter a total budget first");
    return;
  }

  const selectedWeeks = getSelectedCells();
  if (selectedWeeks.length === 0) return;

  const weeklyBudget = channel.totalBudget / selectedWeeks.length;

  const newFlight: MediaFlight = {
    id: Date.now().toString(),
    startWeek: weeks[selectedWeeks[0]].weekStart,
    endWeek: weeks[selectedWeeks[selectedWeeks.length - 1]].weekEnd,
    monthlySpend: {},
    color: "#60A5FA",
    weeklyBudget,
  };

  const updatedChannels = [...channels];
  const channelFlights = updatedChannels[channelIndex].flights || [];
  updatedChannels[channelIndex] = {
    ...updatedChannels[channelIndex],
    flights: [...channelFlights, newFlight],
  };
  setChannels(updatedChannels);
};

  // Helper to get month key for a date (format: "YYYY-MM")
const getMonthKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return `${year}-${month}`;
};

  // Check if a week overlaps with a flight
  const weekOverlapsFlight = (week: WeekRange, flight: MediaFlight): boolean => {
    // Week overlaps if it starts before flight ends and ends after flight starts
    return week.weekStart <= flight.endWeek && week.weekEnd >= flight.startWeek;
  };

  // Get the flight that covers a week (returns first matching flight)
  const getFlightForWeek = (week: WeekRange, flights: MediaFlight[]): MediaFlight | null => {
    return flights.find(flight => weekOverlapsFlight(week, flight)) || null;
  };


  // Format currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Format percentage
  const formatPercentage = (value: number): string => {
    return `${value.toFixed(1)}%`;
  };

  // Add a new channel
  const handleAddChannel = () => {
    const newChannel = createEmptyChannel();
    setChannels([...channels, newChannel]);
  };

  // Update a channel
  const handleUpdateChannel = (channelId: string, updates: Partial<MediaPlanChannel>) => {
    setChannels(
      channels.map((channel) =>
        channel.id === channelId ? { ...channel, ...updates } : channel
      )
    );
  };

const handleBudgetChange = (channelIndex: number, value: number) => {
  const updatedChannels = channels.map((channel, idx) =>
    idx === channelIndex ? { ...channel, totalBudget: value } : channel
  );
  setChannels(updatedChannels);
};

  // Delete a channel
  const handleDeleteChannel = (channelId: string) => {
    const updatedChannels = channels.filter((channel) => channel.id !== channelId);
    setChannels(updatedChannels.length > 0 ? updatedChannels : [createEmptyChannel()]);
  };

  // Generate a unique ID for new flights
  const generateFlightId = (): string => {
    return `flight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  // Handle mouse down on week cell
  const handleWeekCellMouseDown = (channelId: string, weekIdx: number, e: React.MouseEvent) => {
    // Don't start drag if clicking on a flight block or its children
    const target = e.target as HTMLElement;
    if (target.closest('[data-flight-block]')) {
      return;
    }
    
    // Don't start drag if clicking on resize handles
    if (target.classList.contains('cursor-ew-resize')) {
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    setDragState({
      channelId,
      startWeekIdx: weekIdx,
      currentWeekIdx: weekIdx,
      isDragging: true,
    });
  };

  // Handle mouse move
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || dragState.startWeekIdx === null) return;
      
      // Find which week cell we're over
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const weekCell = target?.closest('[data-week-cell]');
      if (weekCell) {
        const weekIdx = parseInt(weekCell.getAttribute('data-week-index') || '-1');
        const channelId = weekCell.getAttribute('data-channel-id');
        
        if (weekIdx >= 0 && channelId === dragState.channelId) {
          setDragState((prev) => ({
            ...prev,
            currentWeekIdx: weekIdx,
          }));
        }
      }
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current && dragState.startWeekIdx !== null && dragState.currentWeekIdx !== null) {
        const startIdx = Math.min(dragState.startWeekIdx, dragState.currentWeekIdx);
        const endIdx = Math.max(dragState.startWeekIdx, dragState.currentWeekIdx);
        
        // Get all months in the flight range
        const monthsInRange = new Set<string>();
        for (let i = startIdx; i <= endIdx; i++) {
          monthsInRange.add(getMonthKey(weeks[i].weekStart));
        }
        const monthKeys = Array.from(monthsInRange).sort();
        
        // Initialize monthly spend
        const initialSpend: { [monthKey: string]: number } = {};
        monthKeys.forEach((key) => {
          initialSpend[key] = 0;
        });
        
        setFlightFormData({
          monthlySpend: initialSpend,
          color: "#3b82f6",
        });
        
        // Open modal to create flight
        setEditingFlight({
          channelId: dragState.channelId!,
          flight: null,
          startWeekIdx: startIdx,
          endWeekIdx: endIdx,
        });
      }
      
      isDraggingRef.current = false;
      setDragState({
        channelId: null,
        startWeekIdx: null,
        currentWeekIdx: null,
        isDragging: false,
      });
    };

    if (dragState.isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState]);

  // Handle flight block click (edit)
  const handleFlightBlockClick = (channelId: string, flight: MediaFlight, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Find flight range
    let startIdx = -1;
    let endIdx = -1;
    
    weeks.forEach((week, idx) => {
      if (weekOverlapsFlight(week, flight)) {
        if (startIdx === -1) startIdx = idx;
        endIdx = idx;
      }
    });
    
    if (startIdx !== -1) {
      // Get all months in the flight range
      const monthsInRange = new Set<string>();
      for (let i = startIdx; i <= endIdx; i++) {
        monthsInRange.add(getMonthKey(weeks[i].weekStart));
      }
      const monthKeys = Array.from(monthsInRange).sort();
      
      // Initialize monthly spend
      const initialSpend: { [monthKey: string]: number } = {};
      monthKeys.forEach((key) => {
        initialSpend[key] = flight.monthlySpend[key] || 0;
      });
      
      setFlightFormData({
        monthlySpend: initialSpend,
        color: flight.color,
      });
      
      setEditingFlight({
        channelId,
        flight,
        startWeekIdx: startIdx,
        endWeekIdx: endIdx,
      });
    }
  };

  // Save flight (create or update)
  const handleSaveFlight = (flightData: {
    monthlySpend: { [monthKey: string]: number };
    color: string;
    startWeekIdx?: number;
    endWeekIdx?: number;
  }) => {
    if (!editingFlight) return;
    
    const channel = channels.find((c) => c.id === editingFlight.channelId);
    if (!channel) return;
    
    const startWeek = weeks[flightData.startWeekIdx ?? editingFlight.startWeekIdx];
    const endWeek = weeks[flightData.endWeekIdx ?? editingFlight.endWeekIdx];
    
    if (editingFlight.flight) {
      // Update existing flight
      const updatedFlights = channel.flights.map((f) =>
        f.id === editingFlight.flight!.id
          ? {
              ...f,
              startWeek: startWeek.weekStart,
              endWeek: endWeek.weekEnd,
              monthlySpend: flightData.monthlySpend,
              color: flightData.color,
            }
          : f
      );
      handleUpdateChannel(editingFlight.channelId, { flights: updatedFlights });
    } else {
      // Create new flight
      const newFlight: MediaFlight = {
        id: generateFlightId(),
        startWeek: startWeek.weekStart,
        endWeek: endWeek.weekEnd,
        monthlySpend: flightData.monthlySpend,
        color: flightData.color,
      };
      handleUpdateChannel(editingFlight.channelId, {
        flights: [...channel.flights, newFlight],
      });
    }
    
    setEditingFlight(null);
  };

  // Delete flight
  const handleDeleteFlight = (channelId: string, flightId: string) => {
    const channel = channels.find((c) => c.id === channelId);
    if (!channel) return;
    
    handleUpdateChannel(channelId, {
      flights: channel.flights.filter((f) => f.id !== flightId),
    });
    setEditingFlight(null);
  };

  return (
    <div className="w-full overflow-hidden border border-gray-300 rounded-lg">
      <div
        className="overflow-x-auto w-full"
        onMouseUp={() => {
          if (isDragging && dragStart) {
            handleCreateFlight(dragStart.rowIndex);
          }
          setIsDragging(false);
          setDragStart(null);
          setDragEnd(null);
        }}
        onMouseLeave={() => {
          setIsDragging(false);
          setDragStart(null);
          setDragEnd(null);
        }}
      >
        <table className="border-collapse w-full">
          <thead className="bg-gray-100 sticky top-0 z-10">
            {/* Month header row */}
            <tr>
              <th className="border border-gray-300 bg-gray-50 bg-opacity-100 text-left px-3 py-2 font-semibold sticky left-0 mr-[-1px] z-20 w-[200px] min-w-[200px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]"></th>
              <th className="border border-gray-300 bg-gray-50 bg-opacity-100 text-left px-3 py-2 font-semibold sticky left-[200px] mr-[-1px] z-20 w-[150px] min-w-[150px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]"></th>
              <th className="border-l-2 border-l-gray-400 border border-gray-300 bg-gray-50 bg-opacity-100 text-left px-3 py-2 font-semibold sticky left-[350px] mr-[-1px] z-20 w-[120px] min-w-[120px] border-r-2 border-gray-400 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.15)]"></th>
              <th className="border border-gray-300 bg-gray-100 text-center px-3 py-2 font-semibold" style={{ width: '64px' }}></th>
              
              {monthGroups.map((group, groupIdx) => (
                <th
                  key={groupIdx}
                  colSpan={group.weeks.length}
                  className="text-center font-bold border border-gray-300 px-4 py-2 bg-gray-100 relative z-[1]"
                >
                  {group.month}
                </th>
              ))}
            </tr>
            
            {/* Week date header row */}
            <tr>
              {/* Fixed left column headers */}
              <th className="border border-gray-300 bg-gray-50 bg-opacity-100 text-left px-3 py-2 font-semibold sticky left-0 mr-[-1px] z-20 w-[200px] min-w-[200px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                Channel Name
              </th>
              <th className="border border-gray-300 bg-gray-50 bg-opacity-100 text-left px-3 py-2 font-semibold sticky left-[200px] mr-[-1px] z-20 w-[150px] min-w-[150px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                Detail
              </th>
              <th className="border-l-2 border-l-gray-400 border border-gray-300 bg-gray-50 bg-opacity-100 text-left px-3 py-2 font-semibold sticky left-[350px] mr-[-1px] z-30 w-[120px] min-w-[120px] border-r-2 border-gray-400 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.15)]">
                Total Budget
              </th>
              <th className="border border-gray-300 bg-gray-100 text-center px-3 py-2 font-semibold" style={{ width: '64px' }}>
                {/* Delete column header */}
              </th>
              
              {/* Week date columns - scrollable section */}
              {weeks.map((week, weekIdx) => (
                <th
                  key={weekIdx}
                  className={`border border-gray-300 bg-gray-100 text-center px-2 py-2 font-semibold relative z-0 w-[100px] min-w-[100px] max-w-[100px] text-sm ${
                    weekIdx === 0 ? 'border-l-2 border-l-gray-400' : ''
                  }`}
                >
                  {formatWeekDate(week.weekStart)}
                </th>
              ))}
            </tr>
          </thead>
          
          <tbody>
            {channels.length === 0 ? (
              // Empty state
              <tr>
                <td
                  colSpan={4 + weeks.length}
                  className="border border-gray-300 bg-white px-3 py-8 text-center text-gray-500"
                >
                  No channels added yet
                </td>
              </tr>
            ) : (
              // Channel rows
              channels.map((channel, channelIndex) => {
                const channelColors = getChannelColorClasses(channel.channelName);
                
                return (
                  <tr
                    key={channel.id}
                    className={`relative ${channelColors.bg}`}
                  >
                    {/* Left columns - Channel data with inputs */}
                    <td className="border border-gray-300 px-3 py-2 sticky left-0 mr-[-1px] z-20 bg-gray-50 bg-opacity-100 w-[200px] min-w-[200px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                      <Select
                        value={channel.channelName || ""}
                        onValueChange={(value) =>
                          handleUpdateChannel(channel.id, { channelName: value.toUpperCase() })
                        }
                      >
                        <SelectTrigger className={`w-full border-none outline-none bg-transparent h-auto p-0 shadow-none focus:ring-0 ${channelColors.text}`}>
                          <SelectValue placeholder="Select Channel" className="uppercase font-semibold">
                            {channel.channelName ? channel.channelName.toUpperCase() : "Select Channel"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {MEDIA_CHANNELS.map((ch) => (
                            <SelectItem key={ch.name} value={ch.name}>
                              <span className="uppercase font-semibold">{ch.name}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  <td className="border border-gray-300 px-3 py-2 sticky left-[200px] mr-[-1px] z-20 bg-gray-50 bg-opacity-100 w-[150px] min-w-[150px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                    <input
                      type="text"
                      value={channel.format}
                      onChange={(e) =>
                        handleUpdateChannel(channel.id, { format: e.target.value })
                      }
                      placeholder="Detail"
                      className={`w-full border-none outline-none bg-transparent text-sm ${channelColors.text}`}
                    />
                  </td>
                  <td className="border-l-2 border-l-gray-400 border border-gray-300 px-3 py-2 text-center font-mono sticky left-[350px] mr-[-1px] z-30 bg-gray-50 bg-opacity-100 w-[120px] min-w-[120px] border-r-2 border-gray-400 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.15)]">
                    <input
                      type="number"
                      value={channel.totalBudget ?? 0}
                      onChange={(e) =>
                        handleBudgetChange(
                          channelIndex,
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-full px-2 py-1 border-0 bg-transparent text-center focus:bg-white focus:border focus:border-blue-500 rounded"
                      placeholder="0"
                    />
                  </td>
                  <td className="border border-gray-300 px-2 py-2 text-center" style={{ width: '64px' }}>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteChannel(channel.id)}
                      className="h-8 w-8 text-gray-500 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                  
                  {/* Week data cells with flight blocks */}
                  {(() => {
                    // Calculate flight ranges
                    const flightRanges = channel.flights.map((flight) => {
                      let startIdx = -1;
                      let endIdx = -1;
                      
                      weeks.forEach((week, idx) => {
                        if (weekOverlapsFlight(week, flight)) {
                          if (startIdx === -1) startIdx = idx;
                          endIdx = idx;
                        }
                      });
                      
                      return { flight, startIdx, endIdx };
                    }).filter((f) => f.startIdx !== -1);
                    
                    // Convert hex color to rgba with 80% opacity
                    const hexToRgba = (hex: string, opacity: number): string => {
                      const r = parseInt(hex.slice(1, 3), 16);
                      const g = parseInt(hex.slice(3, 5), 16);
                      const b = parseInt(hex.slice(5, 7), 16);
                      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
                    };
                    
                    const cellWidth = 100;
                    
                    // Track which weeks are covered by colspan
                    const coveredByColspan = new Set<number>();
                    const weekToStartFlights = new Map<number, typeof flightRanges>();
                    
                    // Group flights by their start week
                    flightRanges.forEach((range) => {
                      if (!weekToStartFlights.has(range.startIdx)) {
                        weekToStartFlights.set(range.startIdx, []);
                      }
                      weekToStartFlights.get(range.startIdx)!.push(range);
                      
                      // Mark weeks covered by colspan
                      for (let i = range.startIdx + 1; i <= range.endIdx; i++) {
                        coveredByColspan.add(i);
                      }
                    });
                    
                    const cells: React.ReactNode[] = [];
                    
                    weeks.forEach((week, weekIdx) => {
                      const isCellSelected =
                        isDragging &&
                        dragStart?.rowIndex === channelIndex &&
                        getSelectedCells().includes(weekIdx);
                      
                      if (weekToStartFlights.has(weekIdx)) {
                        // This week starts one or more flights - use colspan for the longest
                        const flightsStartingHere = weekToStartFlights.get(weekIdx)!;
                        const maxSpan = Math.max(
                          ...flightsStartingHere.map((f) => f.endIdx - f.startIdx + 1)
                        );
                        
                        cells.push(
                          <td
                            key={`week-${weekIdx}`}
                            data-week-cell
                            data-week-index={weekIdx}
                            data-channel-id={channel.id}
                            colSpan={maxSpan}
                            className={`border-l-2 border-l-gray-400 border border-gray-300 px-2 py-2 relative h-12 cursor-crosshair z-0 w-[100px] min-w-[100px] max-w-[100px] ${
                              isCellSelected ? 'bg-blue-200 border-2 border-blue-500' : channelColors.bg
                            }`}
                            onMouseDown={(e) => {
                              handleWeekCellMouseDown(channel.id, weekIdx, e);
                              setIsDragging(true);
                              setDragStart({ rowIndex: channelIndex, weekIndex: weekIdx });
                              setDragEnd({ rowIndex: channelIndex, weekIndex: weekIdx });
                            }}
                            onMouseEnter={() => {
                              if (isDragging && dragStart?.rowIndex === channelIndex) {
                                setDragEnd({ rowIndex: channelIndex, weekIndex: weekIdx });
                              }
                            }}
                          >
                            {channel.flights?.map((flight) => {
                              const flightStartIndex = weeks.findIndex(
                                (w) => w.weekStart.getTime() === new Date(flight.startWeek).getTime()
                              );
                              const flightEndIndex = weeks.findIndex(
                                (w) => w.weekEnd.getTime() === new Date(flight.endWeek).getTime()
                              );

                              if (weekIdx === flightStartIndex) {
                                const spanWeeks = flightEndIndex - flightStartIndex + 1;
                                return (
                                  <div
                                    key={flight.id}
                                    className="absolute inset-1 flex items-center justify-center rounded text-white font-semibold text-sm"
                                    style={{
                                      backgroundColor: flight.color,
                                      width: `calc(${spanWeeks * 100}% + ${(spanWeeks - 1) * 100}px)`,
                                    }}
                                  >
                                    ${Math.round((flight.weeklyBudget || 0) * spanWeeks).toLocaleString()}
                                  </div>
                                );
                              }
                              return null;
                            })}
                            {/* Render all flights that overlap this week, stacked */}
                            {flightRanges
                              .filter(({ startIdx, endIdx }) => weekIdx >= startIdx && weekIdx <= endIdx)
                              .map(({ flight, startIdx, endIdx }, flightLayerIdx) => {
                                const isFirstWeek = weekIdx === startIdx;
                                
                                // Aggregate monthly spend
                                const monthsInFlight = new Set<string>();
                                for (let i = startIdx; i <= endIdx; i++) {
                                  monthsInFlight.add(getMonthKey(weeks[i].weekStart));
                                }
                                const totalSpend = Array.from(monthsInFlight).reduce((sum, monthKey) => {
                                  return sum + (flight.monthlySpend[monthKey] || 0);
                                }, 0);
                                
                                // Calculate block position and width
                                const flightSpan = endIdx - startIdx + 1;
                                const blockWidth = flightSpan * cellWidth;
                                const leftOffset = (weekIdx - startIdx) * cellWidth;
                                
                                // Stack overlapping flights
                                const stackOffset = flightLayerIdx * 2;
                                
                                return (
                                  <div
                                    key={`flight-${flight.id}-${weekIdx}`}
                                    data-flight-block
                                    className="absolute flex items-center justify-center text-white text-xs font-semibold px-1 rounded cursor-pointer hover:opacity-90 transition-opacity group"
                                    style={{
                                      top: `${stackOffset + 2}px`,
                                      bottom: `${stackOffset + 2}px`,
                                      left: `${leftOffset + 2}px`,
                                      width: `${blockWidth - 4}px`,
                                      backgroundColor: hexToRgba(flight.color, 0.8),
                                      zIndex: 10 + flightLayerIdx,
                                    }}
                                    onClick={(e) => handleFlightBlockClick(channel.id, flight, e)}
                                  >
                                    {isFirstWeek && totalSpend > 0 && formatCurrency(totalSpend)}
                                    {/* Resize handles */}
                                    {isFirstWeek && (
                                      <>
                                        <div
                                          className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-white/30 hover:bg-white/50"
                                          onMouseDown={(e) => {
                                            e.stopPropagation();
                                            // TODO: Implement resize
                                          }}
                                        />
                                        <div
                                          className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-white/30 hover:bg-white/50"
                                          onMouseDown={(e) => {
                                            e.stopPropagation();
                                            // TODO: Implement resize
                                          }}
                                        />
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                          </td>
                        );
                      } else if (!coveredByColspan.has(weekIdx)) {
                        // Empty cell or cell with overlapping flights that don't start here
                        const overlappingFlights = flightRanges.filter(
                          ({ startIdx, endIdx }) => weekIdx >= startIdx && weekIdx <= endIdx && startIdx !== weekIdx
                        );
                        
                        cells.push(
                          <td
                            key={`week-${weekIdx}`}
                            data-week-cell
                            data-week-index={weekIdx}
                            data-channel-id={channel.id}
                            className={`border-l-2 border-l-gray-400 border border-gray-300 px-2 py-2 relative h-12 cursor-crosshair z-0 w-[100px] min-w-[100px] max-w-[100px] ${
                              isCellSelected ? 'bg-blue-200 border-2 border-blue-500' : channelColors.bg
                            }`}
                            onMouseDown={(e) => {
                              handleWeekCellMouseDown(channel.id, weekIdx, e);
                              setIsDragging(true);
                              setDragStart({ rowIndex: channelIndex, weekIndex: weekIdx });
                              setDragEnd({ rowIndex: channelIndex, weekIndex: weekIdx });
                            }}
                            onMouseEnter={() => {
                              if (isDragging && dragStart?.rowIndex === channelIndex) {
                                setDragEnd({ rowIndex: channelIndex, weekIndex: weekIdx });
                              }
                            }}
                          >
                            {/* Render overlapping flights */}
                            {overlappingFlights.map(({ flight, startIdx, endIdx }, flightLayerIdx) => {
                              const flightSpan = endIdx - startIdx + 1;
                              const blockWidth = flightSpan * cellWidth;
                              const leftOffset = (weekIdx - startIdx) * cellWidth;
                              const stackOffset = flightLayerIdx * 2;
                              
                              return (
                                <div
                                  key={`flight-overlap-${flight.id}-${weekIdx}`}
                                  className="absolute flex items-center justify-center text-white text-xs font-semibold px-1 rounded"
                                  style={{
                                    top: `${stackOffset + 2}px`,
                                    bottom: `${stackOffset + 2}px`,
                                    left: `${leftOffset + 2}px`,
                                    width: `${blockWidth - 4}px`,
                                    backgroundColor: hexToRgba(flight.color, 0.8),
                                    zIndex: 10 + flightLayerIdx,
                                  }}
                                />
                              );
                            })}
                          </td>
                        );
                      }
                      // Week covered by colspan - skip
                    });
                    
                    return cells;
                  })()}
                </tr>
                );
              })
            )}
            
            {/* Totals Row */}
            {channels.length > 0 && (() => {
              // Calculate total budget across all channels
              const totalBudget = channels.reduce((sum, channel) => sum + (channel.totalBudget || 0), 0);

              return (
                <tr className="bg-gray-50 font-semibold">
                  {/* Left columns - Totals labels */}
                  <td className="border border-gray-300 px-3 py-2 sticky left-0 mr-[-1px] z-20 bg-gray-50 bg-opacity-100 w-[200px] min-w-[200px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                    TOTALS
                  </td>
                  <td className="border border-gray-300 px-3 py-2 sticky left-[200px] mr-[-1px] z-20 bg-gray-50 bg-opacity-100 w-[150px] min-w-[150px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                    {/* Empty */}
                  </td>
                  <td className="border-l-2 border-l-gray-400 border border-gray-300 px-3 py-2 text-right font-mono sticky left-[350px] mr-[-1px] z-30 bg-gray-50 bg-opacity-100 w-[120px] min-w-[120px] border-r-2 border-gray-400 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.15)]">
                    {formatCurrency(totalBudget)}
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-center" style={{ width: '64px' }}>
                    {/* Empty */}
                  </td>
                  
                  {/* Monthly totals in date columns */}
                  {monthGroups.map((group, groupIdx) => {
                    const monthKey = getMonthKey(group.weeks[0].weekStart);
                    const monthTotal = calculateMonthlyTotal(monthKey);
                    
                    return (
                      <td
                        key={`total-${groupIdx}`}
                        colSpan={group.weeks.length}
                        className={`border-l-2 border-l-gray-400 border border-gray-300 px-2 py-2 text-center font-mono bg-gray-50 relative z-[1] font-bold text-lg ${
                          groupIdx === 0 ? "border-l-2 border-l-gray-400" : ""
                        }`}
                      >
                        {monthTotal > 0 && `$${Math.round(monthTotal).toLocaleString()}`}
                      </td>
                    );
                  })}
                </tr>
              );
            })()}
            
            {/* Grand Total Row */}
            {channels.length > 0 && (() => {
              // Calculate grand total
              const monthlyTotals: { [monthKey: string]: number } = {};
              
              channels.forEach((channel) => {
                channel.flights.forEach((flight) => {
                  Object.entries(flight.monthlySpend).forEach(([monthKey, amount]) => {
                    monthlyTotals[monthKey] = (monthlyTotals[monthKey] || 0) + amount;
                  });
                });
              });
              
              const grandTotal = Object.values(monthlyTotals).reduce((sum, amount) => sum + amount, 0);
              const totalBudget = channels.reduce((sum, channel) => sum + (channel.totalBudget || 0), 0);
              
              return (
                <tr className="bg-gray-100 font-bold">
                  <td
                    colSpan={4 + weeks.length}
                    className="border border-gray-300 px-3 py-2 text-right font-mono bg-gray-100"
                  >
                    <div className="flex justify-end items-center gap-6">
                      <span>Total Budget: {formatCurrency(totalBudget)}</span>
                      <span>Grand Total (All Monthly Spend): {formatCurrency(grandTotal)}</span>
                    </div>
                  </td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>
      {/* Add Channel Button */}
      <div className="p-4 border-t border-gray-300">
        <Button
          onClick={handleAddChannel}
          variant="outline"
          className="w-full sm:w-auto"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Channel
        </Button>
      </div>
      
    </div>
  );
}

