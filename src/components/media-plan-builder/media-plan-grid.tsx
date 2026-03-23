"use client";

import React, { useState, useRef, useEffect } from "react";
import { Plus, Trash2, ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  channelCategory?: 'paid_digital' | 'organic_social' | 'edm' | 'ooh';
  channelSubType?: string; // e.g. "Instagram", "Facebook", "LinkedIn"
  postsPerWeek?: number;
  sendFrequency?: string; // e.g. "weekly", "fortnightly", "monthly"
  oohConfirmed?: boolean;
  totalUpfrontSpend?: number;
  isAlwaysOn?: boolean;
  status?: 'in_progress' | 'booked';
}

const generateChannelId = (): string => {
  return `channel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const createEmptyChannel = (): MediaPlanChannel => ({
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
  { name: "Instagram (Organic)", color: "bg-pink-50", textColor: "text-pink-900" },
  { name: "Facebook (Organic)", color: "bg-blue-50", textColor: "text-blue-900" },
  { name: "LinkedIn (Organic)", color: "bg-cyan-50", textColor: "text-cyan-900" },
  { name: "EDM / Email", color: "bg-purple-50", textColor: "text-purple-900" },
  { name: "OOH", color: "bg-orange-50", textColor: "text-orange-900" },
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

// Get channel solid color for budget boxes (Excel-style filled cells)
const getChannelBudgetColor = (channelName: string): string => {
  if (!channelName) {
    return "bg-gray-500";
  }
  const channelMap: { [key: string]: string } = {
    "meta ads": "bg-blue-500",
    "google ads": "bg-red-500",
    "linkedin ads": "bg-indigo-500",
    "tiktok ads": "bg-gray-500",
    "instagram ads": "bg-pink-500",
    "twitter ads": "bg-sky-500",
    "youtube ads": "bg-red-600",
    "snapchat ads": "bg-yellow-500",
  };
  return channelMap[channelName.toLowerCase()] || "bg-gray-500";
};

// Get diagonal stripe style for organic social cells
const getOrganicStripeStyle = (channelName: string): React.CSSProperties => {
  const lower = channelName.toLowerCase();
  let c = '#10b981'; // default green
  if (lower.includes('instagram')) c = '#ec4899';
  else if (lower.includes('facebook')) c = '#3b82f6';
  else if (lower.includes('linkedin')) c = '#06b6d4';
  return {
    backgroundImage: `repeating-linear-gradient(-45deg, ${c}35 0px, ${c}35 3px, transparent 3px, transparent 9px)`,
    backgroundColor: `${c}10`,
  };
};

// Determine channel category from channelName
const getChannelCategory = (channelName: string): 'paid_digital' | 'organic_social' | 'edm' | 'ooh' => {
  if (!channelName) return 'paid_digital';
  const lower = channelName.toLowerCase();
  if (lower.includes('(organic)')) return 'organic_social';
  if (lower.includes('edm') || lower.includes('email')) return 'edm';
  if (lower.includes('ooh')) return 'ooh';
  return 'paid_digital';
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
  commission?: number;
  onCommissionChange?: (commission: number) => void;
}

export function MediaPlanGrid({ channels: externalChannels, onChannelsChange, commission: externalCommission, onCommissionChange }: MediaPlanGridProps) {
  // Use internal state if not controlled
  const [internalChannels, setInternalChannels] = useState<MediaPlanChannel[]>(() => [
    createEmptyChannel(),
  ]);
  const channels = externalChannels ?? internalChannels;
  const setChannels = onChannelsChange ?? setInternalChannels;
  
  // Commission state
  const [internalCommission, setInternalCommission] = useState<number>(0);
  const commission = externalCommission ?? internalCommission;
  const setCommission = onCommissionChange ?? setInternalCommission;
  
  // Year navigation state (default to current year)
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  
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
  
  // Inline budget input state
  const [activeSelection, setActiveSelection] = useState<{
    channelId: string;
    startWeekIdx: number;
    endWeekIdx: number;
    budget: string;
  } | null>(null);
  
  // Keep editingFlight for editing existing flights (clicking on flight blocks)
  const [editingFlight, setEditingFlight] = useState<{
    channelId: string;
    flight: MediaFlight | null;
    startWeekIdx: number;
    endWeekIdx: number;
  } | null>(null);
  
  const isDraggingRef = useRef(false);
  const budgetInputRef = useRef<HTMLInputElement>(null);
  const hasFocusedInputRef = useRef(false);
  
  // Focus budget input when activeSelection changes (only once per selection)
  useEffect(() => {
    if (activeSelection && budgetInputRef.current && !hasFocusedInputRef.current) {
      budgetInputRef.current.focus();
      hasFocusedInputRef.current = true;
    } else if (!activeSelection) {
      hasFocusedInputRef.current = false;
    }
  }, [activeSelection]);
  
  // Generate date range based on selected year (full calendar year)
  const startDate = new Date(selectedYear, 0, 1); // January 1 of selected year
  const endDate = new Date(selectedYear, 11, 31); // December 31 of selected year
  
  // Generate weeks and filter to only include weeks that start in the selected year
  const allWeeks = generateWeeklyDateRanges(startDate, endDate);
  const weeks = allWeeks.filter(week => week.weekStart.getFullYear() === selectedYear);
  
  // Calculate current week commencing (Monday of current week)
  const getCurrentWeekCommencing = (): Date => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() + daysToMonday);
    currentWeekStart.setHours(0, 0, 0, 0);
    return currentWeekStart;
  };
  
  // Find the index of the current week commencing
  const currentWeekCommencing = getCurrentWeekCommencing();
  const normalizeDate = (date: Date) => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized.getTime();
  };
  const currentWeekIndex = weeks.findIndex(week => 
    normalizeDate(week.weekStart) === normalizeDate(currentWeekCommencing)
  );
  
  // Calculate current day of week position (0 = Sunday, 1 = Monday, etc.)
  // Monday should be at left (0px), Sunday at right (~34px)
  const getCurrentDayPosition = (): number => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const cellWidth = 40;
    // Map: Monday (1) = 0, Tuesday (2) = 1, ..., Sunday (0) = 6
    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    // Position within the 40px column (distribute across 7 days)
    return (dayIndex * cellWidth) / 7;
  };
  const currentDayPosition = getCurrentDayPosition();
  
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

  // Helper to check if a week is in the current drag selection
  const isWeekInDragSelection = (weekIdx: number, channelId: string): boolean => {
    if (!dragState.isDragging || dragState.channelId !== channelId) return false;
    if (dragState.startWeekIdx === null || dragState.currentWeekIdx === null) return false;
    const minWeek = Math.min(dragState.startWeekIdx, dragState.currentWeekIdx);
    const maxWeek = Math.max(dragState.startWeekIdx, dragState.currentWeekIdx);
    return weekIdx >= minWeek && weekIdx <= maxWeek;
  };

const calculateMonthlyTotal = (monthKey: string) => {
  let total = 0;
  channels.forEach((channel) => {
    channel.flights?.forEach((flight) => {
      // Sum monthly spend for the specific month
      total += flight.monthlySpend[monthKey] || 0;
    });
  });
  return total;
};

// Calculate total budget from all flights in a channel
const calculateTotalBudgetFromFlights = (flights: MediaFlight[]): number => {
  return flights.reduce((total, flight) => {
    // Sum all monthly spend values
    const flightTotal = Object.values(flight.monthlySpend).reduce((sum, amount) => sum + amount, 0);
    return total + flightTotal;
  }, 0);
};

  // Helper to get month key for a date (format: "YYYY-MM")
const getMonthKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return `${year}-${month}`;
};

  // Check if a week overlaps with a flight
  const weekOverlapsFlight = (week: WeekRange, flight: MediaFlight): boolean => {
    // Convert dates to Date objects if they're strings
    const flightStart = flight.startWeek instanceof Date 
      ? flight.startWeek 
      : new Date(flight.startWeek);
    const flightEnd = flight.endWeek instanceof Date 
      ? flight.endWeek 
      : new Date(flight.endWeek);
    
    // Week overlaps if it starts before flight ends and ends after flight starts
    // Compare dates by setting time to start of day to avoid time component issues
    const normalizeDate = (date: Date) => {
      const normalized = new Date(date);
      normalized.setHours(0, 0, 0, 0);
      return normalized;
    };
    
    return normalizeDate(week.weekStart) <= normalizeDate(flightEnd) && 
           normalizeDate(week.weekEnd) >= normalizeDate(flightStart);
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
    setChannels((prev) =>
      prev.map((channel) =>
        channel.id === channelId ? { ...channel, ...updates } : channel
      )
    );
  };

// Total budget is now auto-calculated, so we don't need handleBudgetChange
// But we'll keep it for backward compatibility if needed elsewhere
const handleBudgetChange = (channelIndex: number, value: number) => {
  // Total budget is now auto-calculated from flights
  // This function is kept for compatibility but won't be used
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
    
    // Prevent interaction for organic_social channels
    const channel = channels.find(c => c.id === channelId);
    if (channel) {
      const category = channel.channelCategory || getChannelCategory(channel.channelName);
      if (category === 'organic_social') {
        return;
      }
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
        
        const channel = channels.find(c => c.id === dragState.channelId);
        if (channel) {
          // Check if selected range overlaps with any existing flights
          const selectedWeeks = weeks.slice(startIdx, endIdx + 1);
          const overlappingFlights = channel.flights.filter(flight => {
            // Check if flight overlaps with selected range
            const flightStart = flight.startWeek instanceof Date 
              ? flight.startWeek 
              : new Date(flight.startWeek);
            const flightEnd = flight.endWeek instanceof Date 
              ? flight.endWeek 
              : new Date(flight.endWeek);
            const selectionStart = selectedWeeks[0].weekStart;
            const selectionEnd = selectedWeeks[selectedWeeks.length - 1].weekEnd;
            
            // Normalize dates for comparison
            const normalizeDate = (date: Date) => {
              const normalized = new Date(date);
              normalized.setHours(0, 0, 0, 0);
              return normalized;
            };
            
            // Flight overlaps if it starts before selection ends and ends after selection starts
            return normalizeDate(flightStart) <= normalizeDate(selectionEnd) && 
                   normalizeDate(flightEnd) >= normalizeDate(selectionStart);
          });
          
          if (overlappingFlights.length > 0) {
            // Delete overlapping flights
            const flightIdsToDelete = overlappingFlights.map(f => f.id);
            const updatedFlights = channel.flights.filter(f => !flightIdsToDelete.includes(f.id));
            const newTotalBudget = calculateTotalBudgetFromFlights(updatedFlights);
            
            handleUpdateChannel(dragState.channelId!, {
              flights: updatedFlights,
              totalBudget: newTotalBudget,
            });
          } else {
            // No existing flights, show budget input
            setActiveSelection({
              channelId: dragState.channelId!,
              startWeekIdx: startIdx,
              endWeekIdx: endIdx,
              budget: "",
            });
          }
        }
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
  }, [dragState, channels, weeks]);

  // Handle flight block click (delete)
  const handleFlightBlockClick = (channelId: string, flight: MediaFlight, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Delete the flight when clicked
    handleDeleteFlight(channelId, flight.id);
  };

  // Save flight from inline input
  const handleSaveBudgetFromInput = (budget: number) => {
    if (!activeSelection) return;
    
    const channel = channels.find((c) => c.id === activeSelection.channelId);
    if (!channel) return;
    
    const startWeek = weeks[activeSelection.startWeekIdx];
    const endWeek = weeks[activeSelection.endWeekIdx];
    
    // Calculate which months are in the flight range
    const selectedWeeks = weeks.slice(
      activeSelection.startWeekIdx,
      activeSelection.endWeekIdx + 1
    );
    
    // Get months in the selection
    const selectionMonths = new Set<string>();
    selectedWeeks.forEach(week => {
      selectionMonths.add(getMonthKey(week.weekStart));
    });
    
    // Find existing flights in the same month(s) that can be combined
    // Flights can be combined if they're in the same month(s) and overlap or are adjacent
    const combinableFlights: MediaFlight[] = [];
    const otherFlights: MediaFlight[] = [];
    
    channel.flights.forEach(flight => {
      // Get months in this flight
      const flightMonths = new Set<string>();
      Object.keys(flight.monthlySpend).forEach(monthKey => {
        if (flight.monthlySpend[monthKey] > 0) {
          flightMonths.add(monthKey);
        }
      });
      
      // Check if flight shares any months with selection
      const sharesMonths = Array.from(selectionMonths).some(month => flightMonths.has(month));
      
      // Check if flight overlaps or is adjacent to selection
      const flightStart = flight.startWeek instanceof Date 
        ? flight.startWeek 
        : new Date(flight.startWeek);
      const flightEnd = flight.endWeek instanceof Date 
        ? flight.endWeek 
        : new Date(flight.endWeek);
      const selectionStart = startWeek.weekStart;
      const selectionEnd = endWeek.weekEnd;
      
      // Normalize dates for comparison
      const normalizeDate = (date: Date) => {
        const normalized = new Date(date);
        normalized.setHours(0, 0, 0, 0);
        return normalized;
      };
      
      // Overlaps if flight starts before selection ends and ends after selection starts
      // Adjacent if they're next to each other (within 1 week)
      const overlaps = normalizeDate(flightStart) <= normalizeDate(selectionEnd) && 
                       normalizeDate(flightEnd) >= normalizeDate(selectionStart);
      const isAdjacent = Math.abs(normalizeDate(flightEnd).getTime() - normalizeDate(selectionStart).getTime()) <= 7 * 24 * 60 * 60 * 1000 ||
                         Math.abs(normalizeDate(flightStart).getTime() - normalizeDate(selectionEnd).getTime()) <= 7 * 24 * 60 * 60 * 1000;
      
      if (sharesMonths && (overlaps || isAdjacent)) {
        combinableFlights.push(flight);
      } else {
        otherFlights.push(flight);
      }
    });
    
    // Group weeks by month - weeks should be combined until a month break occurs
    const monthlySpend: { [monthKey: string]: number } = {};
    const weeksByMonth: { [monthKey: string]: WeekRange[] } = {};
    
    selectedWeeks.forEach(week => {
      const monthKey = getMonthKey(week.weekStart);
      if (!weeksByMonth[monthKey]) {
        weeksByMonth[monthKey] = [];
      }
      weeksByMonth[monthKey].push(week);
    });
    
    // Distribute new budget proportionally by number of weeks in each month
    const totalWeeks = selectedWeeks.length;
    Object.entries(weeksByMonth).forEach(([monthKey, monthWeeks]) => {
      monthlySpend[monthKey] = (budget * monthWeeks.length) / totalWeeks;
    });
    
    // Combine with existing flights if any
    if (combinableFlights.length > 0) {
      // Merge date ranges
      let combinedStart = startWeek.weekStart;
      let combinedEnd = endWeek.weekEnd;
      
      combinableFlights.forEach(flight => {
        const flightStart = flight.startWeek instanceof Date 
          ? flight.startWeek 
          : new Date(flight.startWeek);
        const flightEnd = flight.endWeek instanceof Date 
          ? flight.endWeek 
          : new Date(flight.endWeek);
        if (flightStart < combinedStart) combinedStart = flightStart;
        if (flightEnd > combinedEnd) combinedEnd = flightEnd;
      });
      
      // Add budgets together for each month
      combinableFlights.forEach(flight => {
        Object.entries(flight.monthlySpend).forEach(([monthKey, amount]) => {
          if (monthlySpend[monthKey] !== undefined) {
            monthlySpend[monthKey] += amount;
          } else {
            monthlySpend[monthKey] = amount;
          }
        });
      });
      
      // Create combined flight
      const combinedFlight: MediaFlight = {
        id: generateFlightId(),
        startWeek: combinedStart,
        endWeek: combinedEnd,
        monthlySpend: monthlySpend,
        color: "#3b82f6",
      };
      
      const updatedFlights = [...otherFlights, combinedFlight];
      
      // Auto-calculate total budget from all flights
      const newTotalBudget = calculateTotalBudgetFromFlights(updatedFlights);
      
      // Update channel with new flights and total budget
      handleUpdateChannel(activeSelection.channelId, {
        flights: updatedFlights,
        totalBudget: newTotalBudget,
      });
    } else {
      // No combinable flights, create new flight
      const newFlight: MediaFlight = {
        id: generateFlightId(),
        startWeek: startWeek.weekStart,
        endWeek: endWeek.weekEnd,
        monthlySpend: monthlySpend,
        color: "#3b82f6",
      };
      
      const updatedFlights = [...channel.flights, newFlight];
      
      // Auto-calculate total budget from all flights
      const newTotalBudget = calculateTotalBudgetFromFlights(updatedFlights);
      
      // Update channel with new flights and total budget
      handleUpdateChannel(activeSelection.channelId, {
        flights: updatedFlights,
        totalBudget: newTotalBudget,
      });
    }
    
    setActiveSelection(null);
  };

  // Save flight (create or update) - for editing existing flights
  const handleSaveFlight = (flightData: {
    budget: number;
    color: string;
    startWeekIdx?: number;
    endWeekIdx?: number;
  }) => {
    if (!editingFlight) return;
    
    const channel = channels.find((c) => c.id === editingFlight.channelId);
    if (!channel) return;
    
    const startWeek = weeks[flightData.startWeekIdx ?? editingFlight.startWeekIdx];
    const endWeek = weeks[flightData.endWeekIdx ?? editingFlight.endWeekIdx];
    
    // Calculate which months are in the flight range
    const selectedWeeks = weeks.slice(
      flightData.startWeekIdx ?? editingFlight.startWeekIdx,
      (flightData.endWeekIdx ?? editingFlight.endWeekIdx) + 1
    );
    
    // Group weeks by month and calculate monthly spend
    const monthlySpend: { [monthKey: string]: number } = {};
    const weeksByMonth: { [monthKey: string]: WeekRange[] } = {};
    
    selectedWeeks.forEach(week => {
      const monthKey = getMonthKey(week.weekStart);
      if (!weeksByMonth[monthKey]) {
        weeksByMonth[monthKey] = [];
      }
      weeksByMonth[monthKey].push(week);
    });
    
    // Distribute budget proportionally by number of weeks in each month
    const totalWeeks = selectedWeeks.length;
    Object.entries(weeksByMonth).forEach(([monthKey, monthWeeks]) => {
      monthlySpend[monthKey] = (flightData.budget * monthWeeks.length) / totalWeeks;
    });
    
    let updatedFlights: MediaFlight[];
    
    if (editingFlight.flight) {
      // Update existing flight
      updatedFlights = channel.flights.map((f) =>
        f.id === editingFlight.flight!.id
          ? {
              ...f,
              startWeek: startWeek.weekStart,
              endWeek: endWeek.weekEnd,
              monthlySpend: monthlySpend,
              color: flightData.color,
            }
          : f
      );
    } else {
      // Create new flight
      const newFlight: MediaFlight = {
        id: generateFlightId(),
        startWeek: startWeek.weekStart,
        endWeek: endWeek.weekEnd,
        monthlySpend: monthlySpend,
        color: flightData.color,
      };
      updatedFlights = [...channel.flights, newFlight];
    }
    
    // Auto-calculate total budget from all flights
    const newTotalBudget = calculateTotalBudgetFromFlights(updatedFlights);
    
    // Update channel with new flights and total budget
    handleUpdateChannel(editingFlight.channelId, {
      flights: updatedFlights,
      totalBudget: newTotalBudget,
    });
    
    setEditingFlight(null);
  };

  // Delete flight
  const handleDeleteFlight = (channelId: string, flightId: string) => {
    const channel = channels.find((c) => c.id === channelId);
    if (!channel) return;
    
    const updatedFlights = channel.flights.filter((f) => f.id !== flightId);
    const newTotalBudget = calculateTotalBudgetFromFlights(updatedFlights);
    
    handleUpdateChannel(channelId, {
      flights: updatedFlights,
      totalBudget: newTotalBudget,
    });
    setEditingFlight(null);
  };

  return (
    <div className="w-full overflow-hidden border border-gray-300 rounded-lg relative">
      {/* Year Navigation and Commission Header */}
      <div className="flex justify-between items-center gap-4 px-4 py-3 bg-gray-50 border-b border-gray-300">
        {/* Year Navigation */}
        <div className="flex items-center gap-3">
          <Label className="text-sm font-medium text-gray-700">
            Year:
          </Label>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSelectedYear(selectedYear - 1)}
              className="h-8 w-8"
              title="Previous year"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[80px] text-center">
              <span className="text-lg font-semibold text-gray-900">
                {selectedYear}
              </span>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSelectedYear(selectedYear + 1)}
              className="h-8 w-8"
              title="Next year"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Commission Input */}
        <div className="flex items-center gap-2">
          <Label htmlFor="commission" className="text-sm font-medium text-gray-700">
            Commission:
          </Label>
          <div className="flex items-center gap-1">
            <Input
              id="commission"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={commission || ''}
              onChange={(e) => {
                const value = parseFloat(e.target.value) || 0;
                setCommission(value);
              }}
              className="w-20 h-8 text-sm font-[family-name:var(--font-inter)]"
              placeholder="0"
            />
            <span className="text-sm text-gray-600">%</span>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto w-full">
        <table className="border-collapse w-full">
          <thead className="bg-gray-100 sticky top-0 z-10">
            {/* Month header row */}
            <tr>
              <th className="border border-gray-300 bg-gray-50 text-center px-2 py-2 font-semibold sticky left-0 mr-[-1px] z-30 w-[64px] min-w-[64px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]"></th>
              <th className="border border-gray-300 bg-gray-50 text-left px-3 py-2 font-semibold sticky left-[64px] mr-[-1px] z-20 w-[200px] min-w-[200px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]"></th>
              <th className="border border-gray-300 bg-gray-50 text-left px-3 py-2 font-semibold sticky left-[264px] mr-[-1px] z-20 w-[150px] min-w-[150px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]"></th>
              <th className="border-l-2 border-l-gray-400 border border-gray-300 bg-gray-50 text-left px-3 py-2 font-semibold sticky left-[414px] mr-[-1px] z-20 w-[120px] min-w-[120px] border-r-2 border-gray-400 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.15)]"></th>
              
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
              <th className="border border-gray-300 bg-gray-50 text-center px-2 py-2 font-semibold sticky left-0 mr-[-1px] z-30 w-[64px] min-w-[64px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                {/* Delete column header */}
              </th>
              <th className="border border-gray-300 bg-gray-50 text-left px-3 py-2 font-semibold sticky left-[64px] mr-[-1px] z-20 w-[200px] min-w-[200px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                Channel Name
              </th>
              <th className="border border-gray-300 bg-gray-50 text-left px-3 py-2 font-semibold sticky left-[264px] mr-[-1px] z-20 w-[150px] min-w-[150px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                Detail
              </th>
              <th className="border-l-2 border-l-gray-400 border border-gray-300 bg-gray-50 text-left px-3 py-2 font-semibold sticky left-[414px] mr-[-1px] z-30 w-[120px] min-w-[120px] border-r-2 border-gray-400 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.15)]">
                Total Budget
              </th>
              
              {/* Week date columns - scrollable section */}
              {weeks.map((week, weekIdx) => (
                <th
                  key={weekIdx}
                  className={`border border-gray-300 bg-gray-100 text-center px-2 py-2 font-semibold relative z-0 w-[40px] min-w-[40px] max-w-[40px] text-sm ${
                    weekIdx === 0 ? 'border-l-2 border-l-gray-400' : ''
                  }`}
                  style={{ height: '80px' }}
                >
                  {/* Vertical red line for current day of week */}
                  {currentWeekIndex >= 0 && weekIdx === currentWeekIndex && (
                    <div
                      className="absolute top-0 bottom-0 bg-red-500 pointer-events-none"
                      style={{
                        left: `${currentDayPosition}px`,
                        width: '2px',
                        zIndex: 9999,
                      }}
                    />
                  )}
                  <div className="transform -rotate-90 origin-center whitespace-nowrap">
                    {formatWeekDate(week.weekStart)}
                  </div>
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
                    {/* 3-dot menu - Far left */}
                    <td className="border border-gray-300 px-2 py-2 text-center sticky left-0 mr-[-1px] z-30 bg-gray-50 w-[64px] min-w-[64px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-gray-500 hover:text-gray-900"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem
                            onClick={() => {
                              // Find the first week cell for this channel and trigger selection
                              const firstFlightStart = channel.flights?.[0]?.startWeek;
                              const startIdx = firstFlightStart
                                ? weeks.findIndex(w => {
                                    const n = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x.getTime(); };
                                    return n(w.weekStart) === n(firstFlightStart instanceof Date ? firstFlightStart : new Date(firstFlightStart));
                                  })
                                : 0;
                              setActiveSelection({
                                channelId: channel.id,
                                startWeekIdx: Math.max(0, startIdx),
                                endWeekIdx: Math.max(0, startIdx),
                                budget: channel.totalBudget > 0 ? channel.totalBudget.toString() : '',
                              });
                            }}
                          >
                            Edit spend
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handleUpdateChannel(channel.id, {
                                status: channel.status === 'in_progress' ? undefined : 'in_progress',
                              })
                            }
                          >
                            {channel.status === 'in_progress' ? '✓ ' : ''}In Progress
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handleUpdateChannel(channel.id, {
                                status: channel.status === 'booked' ? undefined : 'booked',
                              })
                            }
                          >
                            {channel.status === 'booked' ? '✓ ' : ''}Booked
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={() => handleDeleteChannel(channel.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                    
                    {/* Channel Name */}
                    <td className="border border-gray-300 px-3 py-2 sticky left-[64px] mr-[-1px] z-20 bg-gray-50 w-[200px] min-w-[200px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                      <Select
                        value={channel.channelName || ""}
                        onValueChange={(value) => {
                          const category = getChannelCategory(value);
                          const updates: Partial<MediaPlanChannel> = {
                            channelName: value.toUpperCase(),
                            channelCategory: category,
                          };
                          
                          // For organic_social, auto-fill all weeks
                          if (category === 'organic_social') {
                            const firstWeek = weeks[0];
                            const lastWeek = weeks[weeks.length - 1];
                            if (firstWeek && lastWeek) {
                              // Create monthly spend entries for all months in the year
                              const monthlySpend: { [monthKey: string]: number } = {};
                              const monthGroups: { [monthKey: string]: WeekRange[] } = {};
                              
                              weeks.forEach(week => {
                                const monthKey = getMonthKey(week.weekStart);
                                if (!monthGroups[monthKey]) {
                                  monthGroups[monthKey] = [];
                                }
                                monthGroups[monthKey].push(week);
                                monthlySpend[monthKey] = 0; // No spend, just marking as active
                              });
                              
                              const newFlight: MediaFlight = {
                                id: generateFlightId(),
                                startWeek: firstWeek.weekStart,
                                endWeek: lastWeek.weekEnd,
                                monthlySpend: monthlySpend,
                                color: "#10b981", // Green for organic
                              };
                              updates.flights = [newFlight];
                              updates.isAlwaysOn = true;
                            }
                          } else {
                            // Clear flights for other types if switching from organic
                            if (channel.channelCategory === 'organic_social') {
                              updates.flights = [];
                              updates.isAlwaysOn = false;
                            }
                          }
                          
                          handleUpdateChannel(channel.id, updates);
                        }}
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
                      {channel.status && (
                        <span className={`mt-1 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          channel.status === 'booked'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {channel.status === 'booked' ? 'BOOKED' : 'IN PROGRESS'}
                        </span>
                      )}
                    </td>

                    {/* Format/Detail */}
                    <td className="border border-gray-300 px-3 py-2 sticky left-[264px] mr-[-1px] z-20 bg-gray-50 w-[150px] min-w-[150px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                      {(() => {
                        const category = channel.channelCategory || getChannelCategory(channel.channelName);
                        
                        // Organic Social: Show Posts per week
                        if (category === 'organic_social') {
                          return (
                            <div className="flex flex-col gap-1">
                              <Label className="text-xs text-gray-600">Posts per week</Label>
                              <Input
                                type="number"
                                min="0"
                                step="1"
                                value={channel.postsPerWeek || ''}
                                onChange={(e) => {
                                  const value = parseInt(e.target.value) || 0;
                                  handleUpdateChannel(channel.id, { postsPerWeek: value });
                                }}
                                placeholder="0"
                                className="h-7 text-sm"
                              />
                            </div>
                          );
                        }
                        
                        // EDM: Show frequency selector and date pickers
                        if (category === 'edm') {
                          const edmFlight = channel.flights.length > 0 ? channel.flights[0] : null;
                          const normalizeDate = (date: Date) => {
                            const normalized = new Date(date);
                            normalized.setHours(0, 0, 0, 0);
                            return normalized.getTime();
                          };
                          const startWeekIdx = edmFlight ? weeks.findIndex(w => {
                            const flightStart = edmFlight.startWeek instanceof Date ? edmFlight.startWeek : new Date(edmFlight.startWeek);
                            return normalizeDate(w.weekStart) === normalizeDate(flightStart);
                          }) : -1;
                          const endWeekIdx = edmFlight ? weeks.findIndex(w => {
                            const flightEnd = edmFlight.endWeek instanceof Date ? edmFlight.endWeek : new Date(edmFlight.endWeek);
                            return normalizeDate(w.weekEnd) === normalizeDate(flightEnd);
                          }) : -1;
                          
                          return (
                            <div className="flex flex-col gap-2">
                              <div>
                                <Label className="text-xs text-gray-600">Frequency</Label>
                                <Select
                                  value={channel.sendFrequency || 'weekly'}
                                  onValueChange={(value) =>
                                    handleUpdateChannel(channel.id, { sendFrequency: value })
                                  }
                                >
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="weekly">Weekly</SelectItem>
                                    <SelectItem value="fortnightly">Fortnightly</SelectItem>
                                    <SelectItem value="monthly">Monthly</SelectItem>
                                    <SelectItem value="custom">Custom</SelectItem>
                                  </SelectContent>
                                </Select>
                                {channel.sendFrequency === 'custom' && (
                                  <Input
                                    type="number"
                                    min="1"
                                    step="1"
                                    placeholder="Sends per month"
                                    className="h-7 text-xs mt-1"
                                    onChange={(e) => {
                                      const value = parseInt(e.target.value) || 0;
                                      handleUpdateChannel(channel.id, { sendFrequency: `custom:${value}` });
                                    }}
                                  />
                                )}
                              </div>
                              <div>
                                <Label className="text-xs text-gray-600">Start Week</Label>
                                <Select
                                  value={startWeekIdx >= 0 ? startWeekIdx.toString() : ''}
                                  onValueChange={(value) => {
                                    const idx = parseInt(value);
                                    if (idx >= 0 && idx < weeks.length) {
                                      const week = weeks[idx];
                                      const existingFlight = channel.flights[0];
                                      const endWeek = existingFlight?.endWeek || week.weekEnd;
                                      const monthKey = getMonthKey(week.weekStart);
                                      const newFlight: MediaFlight = {
                                        id: existingFlight?.id || generateFlightId(),
                                        startWeek: week.weekStart,
                                        endWeek: endWeek instanceof Date ? endWeek : new Date(endWeek),
                                        monthlySpend: existingFlight?.monthlySpend || { [monthKey]: 0 },
                                        color: existingFlight?.color || "#3b82f6",
                                      };
                                      handleUpdateChannel(channel.id, { flights: [newFlight] });
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue placeholder="Select start week" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {weeks.map((week, idx) => (
                                      <SelectItem key={idx} value={idx.toString()}>
                                        {formatWeekDate(week.weekStart)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-xs text-gray-600">End Week</Label>
                                <Select
                                  value={endWeekIdx >= 0 ? endWeekIdx.toString() : ''}
                                  onValueChange={(value) => {
                                    const idx = parseInt(value);
                                    if (idx >= 0 && idx < weeks.length) {
                                      const week = weeks[idx];
                                      const existingFlight = channel.flights[0];
                                      const startWeek = existingFlight?.startWeek || week.weekStart;
                                      const monthKey = getMonthKey(week.weekStart);
                                      const newFlight: MediaFlight = {
                                        id: existingFlight?.id || generateFlightId(),
                                        startWeek: startWeek instanceof Date ? startWeek : new Date(startWeek),
                                        endWeek: week.weekEnd,
                                        monthlySpend: existingFlight?.monthlySpend || { [monthKey]: 0 },
                                        color: existingFlight?.color || "#3b82f6",
                                      };
                                      handleUpdateChannel(channel.id, { flights: [newFlight] });
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue placeholder="Select end week" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {weeks.map((week, idx) => (
                                      <SelectItem key={idx} value={idx.toString()}>
                                        {formatWeekDate(week.weekEnd)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          );
                        }
                        
                        // OOH: Show Total Upfront Spend and checkbox
                        if (category === 'ooh') {
                          return (
                            <div className="flex flex-col gap-2">
                              <div>
                                <Label className="text-xs text-gray-600">Total Upfront Spend</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={channel.totalUpfrontSpend || ''}
                                  onChange={(e) => {
                                    const value = parseFloat(e.target.value) || 0;
                                    handleUpdateChannel(channel.id, { totalUpfrontSpend: value });
                                  }}
                                  placeholder="0.00"
                                  className="h-7 text-sm"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  id={`ooh-confirmed-${channel.id}`}
                                  checked={channel.oohConfirmed || false}
                                  onCheckedChange={(checked) =>
                                    handleUpdateChannel(channel.id, { oohConfirmed: checked === true })
                                  }
                                />
                                <Label htmlFor={`ooh-confirmed-${channel.id}`} className="text-xs cursor-pointer">
                                  Booking Confirmed
                                </Label>
                              </div>
                              <p className="text-xs text-gray-500 italic mt-1">
                                OOH spend is entered as a total and is not tracked live
                              </p>
                            </div>
                          );
                        }
                        
                        // Default: Show format input
                        return (
                          <input
                            type="text"
                            value={channel.format}
                            onChange={(e) =>
                              handleUpdateChannel(channel.id, { format: e.target.value })
                            }
                            placeholder="Detail"
                            className={`w-full border-none outline-none bg-transparent text-sm ${channelColors.text}`}
                          />
                        );
                      })()}
                    </td>
                    
                    {/* Total Budget */}
                    <td className="border-l-2 border-l-gray-400 border border-gray-300 px-3 py-2 text-center font-[family-name:var(--font-inter)] sticky left-[414px] mr-[-1px] z-30 bg-gray-50 w-[120px] min-w-[120px] border-r-2 border-gray-400 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.15)]">
                      <div className="w-full px-2 py-1 text-center">
                        {(() => {
                          const category = channel.channelCategory || getChannelCategory(channel.channelName);
                          if (category === 'ooh') {
                            return formatCurrency(channel.totalUpfrontSpend || 0);
                          }
                          if (category === 'organic_social') {
                            return `${channel.postsPerWeek || 0} posts/week`;
                          }
                          if (category === 'edm') {
                            return channel.sendFrequency || 'N/A';
                          }
                          return formatCurrency(calculateTotalBudgetFromFlights(channel.flights || []));
                        })()}
                      </div>
                    </td>
                  
                  {/* Week data cells with flight blocks */}
                  {(() => {
                    const category = channel.channelCategory || getChannelCategory(channel.channelName);
                    
                    // EDM: Hide week grid, show date pickers instead
                    if (category === 'edm') {
                      return weeks.map((week, weekIdx) => (
                        <td
                          key={`week-${weekIdx}`}
                          className="border-l-2 border-l-gray-400 border border-gray-300 px-2 py-2 text-center text-xs bg-gray-50 cursor-default"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        >
                          {/* EDM channels don't show week grid - dates selected via pickers in Detail column */}
                        </td>
                      ));
                    }
                    
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
                    
                    const cellWidth = 40;
                    
                    // Track which weeks are covered by colspan
                    const coveredByColspan = new Set<number>();
                    const weekToStartFlights = new Map<number, typeof flightRanges>();
                    
                    // Check if there's an active selection for this channel
                    const hasActiveSelection = activeSelection && activeSelection.channelId === channel.id;
                    if (hasActiveSelection) {
                      // Mark weeks covered by the active selection colspan
                      for (let i = activeSelection.startWeekIdx + 1; i <= activeSelection.endWeekIdx; i++) {
                        coveredByColspan.add(i);
                      }
                    }
                    
                    // Group flights by their start week
                    flightRanges.forEach((range) => {
                      if (!weekToStartFlights.has(range.startIdx)) {
                        weekToStartFlights.set(range.startIdx, []);
                      }
                      weekToStartFlights.get(range.startIdx)!.push(range);
                      
                      // Mark weeks covered by colspan (only if not already covered by active selection)
                      for (let i = range.startIdx + 1; i <= range.endIdx; i++) {
                        if (!hasActiveSelection || i < activeSelection.startWeekIdx || i > activeSelection.endWeekIdx) {
                          coveredByColspan.add(i);
                        }
                      }
                    });
                    
                    const cells: React.ReactNode[] = [];
                    
                    // For organic_social, check if week is in the always-on flight range
                    const isOrganicSocial = category === 'organic_social';
                    const organicFlight = isOrganicSocial && channel.flights.length > 0 ? channel.flights[0] : null;
                    const isWeekInOrganicRange = (weekIdx: number): boolean => {
                      if (!organicFlight) return false;
                      const week = weeks[weekIdx];
                      return weekOverlapsFlight(week, organicFlight);
                    };
                    
                    weeks.forEach((week, weekIdx) => {
                      const isCellSelected = isWeekInDragSelection(weekIdx, channel.id);
                      const isFirstSelectedCell = activeSelection && 
                        activeSelection.channelId === channel.id &&
                        activeSelection.startWeekIdx === weekIdx;
                      
                      // Check if this is part of an active selection that spans multiple cells
                      const isInActiveSelection = activeSelection && 
                        activeSelection.channelId === channel.id &&
                        weekIdx >= activeSelection.startWeekIdx &&
                        weekIdx <= activeSelection.endWeekIdx;
                      
                      // For organic_social, check if week is in range
                      const isOrganicWeek = isOrganicSocial && isWeekInOrganicRange(weekIdx);
                      
                      if (weekToStartFlights.has(weekIdx)) {
                        // This week starts one or more flights - use colspan for the longest
                        const flightsStartingHere = weekToStartFlights.get(weekIdx)!;
                        const maxSpan = Math.max(
                          ...flightsStartingHere.map((f) => f.endIdx - f.startIdx + 1)
                        );
                        
                        // If this is the first cell of an active selection, calculate the span
                        const selectionSpan = isInActiveSelection && isFirstSelectedCell
                          ? activeSelection.endWeekIdx - activeSelection.startWeekIdx + 1
                          : maxSpan;
                        
                        cells.push(
                          <td
                            key={`week-${weekIdx}`}
                            data-week-cell
                            data-week-index={weekIdx}
                            data-channel-id={channel.id}
                            colSpan={isInActiveSelection && isFirstSelectedCell ? selectionSpan : maxSpan}
                            className={`border-l-2 border-l-gray-400 border border-gray-300 px-0 py-0 relative h-12 z-0 w-[40px] min-w-[40px] max-w-[40px] overflow-hidden ${
                              isOrganicWeek
                                ? 'cursor-default'
                                : isCellSelected || isInActiveSelection
                                  ? 'bg-blue-200 border-2 border-blue-500 rounded-none cursor-crosshair'
                                  : `${channelColors.bg} cursor-crosshair`
                            }`}
                            style={isOrganicWeek ? getOrganicStripeStyle(channel.channelName) : undefined}
                            onMouseDown={(e) => {
                              // Prevent interaction for organic_social weeks
                              if (isOrganicWeek) {
                                e.preventDefault();
                                e.stopPropagation();
                                return;
                              }
                              handleWeekCellMouseDown(channel.id, weekIdx, e);
                            }}
                          >
                            {/* Vertical red line for current day of week */}
                            {currentWeekIndex >= 0 && weekIdx === currentWeekIndex && (
                              <div
                                className="absolute top-0 bottom-0 bg-red-500 pointer-events-none"
                                style={{
                                  left: `${currentDayPosition}px`,
                                  width: '2px',
                                  zIndex: 9999,
                                }}
                              />
                            )}
                            {/* Inline budget input spanning across selected cells */}
                            {isFirstSelectedCell && activeSelection && !isOrganicWeek && (() => {
                              const channelBudgetColor = getChannelBudgetColor(channel.channelName);
                              const isOoh = category === 'ooh';
                              return (
                                <div className={`absolute inset-0 z-50 flex items-center justify-center ${channelBudgetColor}`} style={{ overflow: 'hidden', fontFamily: 'var(--font-inter)' }}>
                                  <Input
                                    ref={budgetInputRef}
                                    type="number"
                                    value={activeSelection.budget}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setActiveSelection({
                                        ...activeSelection,
                                        budget: value,
                                      });
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        const budget = parseFloat(activeSelection.budget);
                                        if (budget > 0) {
                                          if (isOoh) {
                                            handleSaveBudgetFromInput(budget);
                                            handleUpdateChannel(channel.id, { totalUpfrontSpend: budget });
                                          } else {
                                            handleSaveBudgetFromInput(budget);
                                          }
                                        } else {
                                          setActiveSelection(null);
                                        }
                                      } else if (e.key === 'Escape') {
                                        setActiveSelection(null);
                                      }
                                    }}
                                    onBlur={() => {
                                      const budget = parseFloat(activeSelection.budget);
                                      if (budget > 0) {
                                        if (isOoh) {
                                          handleSaveBudgetFromInput(budget);
                                          handleUpdateChannel(channel.id, { totalUpfrontSpend: budget });
                                        } else {
                                          handleSaveBudgetFromInput(budget);
                                        }
                                      } else {
                                        setActiveSelection(null);
                                      }
                                    }}
                                    placeholder=""
                                    className="w-full h-full text-center text-xs font-semibold border-0 px-2 py-1 focus:ring-0 focus-visible:ring-0 shadow-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-white bg-transparent placeholder:text-white/70"
                                    style={{ 
                                      textShadow: 'none !important', 
                                      boxShadow: 'none !important',
                                      filter: 'none !important',
                                      WebkitTextStroke: '0',
                                      WebkitTextFillColor: 'white',
                                      boxSizing: 'border-box'
                                    }}
                                    autoFocus
                                  />
                                </div>
                              );
                            })()}
                            {channel.flights?.map((flight) => {
                              // Convert dates to Date objects if they're strings
                              const flightStart = flight.startWeek instanceof Date 
                                ? flight.startWeek 
                                : new Date(flight.startWeek);
                              const flightEnd = flight.endWeek instanceof Date 
                                ? flight.endWeek 
                                : new Date(flight.endWeek);
                              
                              // Normalize dates for comparison (ignore time component)
                              const normalizeDate = (date: Date) => {
                                const normalized = new Date(date);
                                normalized.setHours(0, 0, 0, 0);
                                return normalized.getTime();
                              };
                              
                              const flightStartIndex = weeks.findIndex(
                                (w) => normalizeDate(w.weekStart) === normalizeDate(flightStart)
                              );
                              const flightEndIndex = weeks.findIndex(
                                (w) => normalizeDate(w.weekEnd) === normalizeDate(flightEnd)
                              );

                              if (weekIdx === flightStartIndex && flightStartIndex !== -1) {
                                const channelBudgetColor = getChannelBudgetColor(channel.channelName);
                                return (
                                  <div
                                    key={flight.id}
                                    className={`absolute inset-0 z-50 flex items-center justify-center text-white font-semibold text-sm ${channelBudgetColor}`}
                                    style={{ fontFamily: 'var(--font-inter)' }}
                                  >
                                    {/* Vertical red line for current day of week */}
                                    {currentWeekIndex >= 0 && weekIdx === currentWeekIndex && (
                                      <div
                                        className="absolute top-0 bottom-0 bg-red-500 pointer-events-none"
                                        style={{
                                          left: `${currentDayPosition}px`,
                                          width: '2px',
                                          zIndex: 9999,
                                        }}
                                      />
                                    )}
                                    {(() => {
                                      const totalBudget = Object.values(flight.monthlySpend).reduce((sum, amount) => sum + amount, 0);
                                      return formatCurrency(totalBudget);
                                    })()}
                                  </div>
                                );
                              }
                              return null;
                            })}
                            {/* Render all flights that overlap this week, stacked */}
                            {!isOrganicSocial && flightRanges
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
                                
                                const channelBudgetColor = getChannelBudgetColor(channel.channelName);
                                
                                return (
                                  <div
                                    key={`flight-${flight.id}-${weekIdx}`}
                                    data-flight-block
                                    className={`absolute top-0 bottom-0 z-50 flex items-center justify-center text-white text-xs font-semibold cursor-pointer hover:opacity-90 transition-opacity group ${channelBudgetColor}`}
                                    style={{
                                      left: `${leftOffset}px`,
                                      width: `${blockWidth}px`,
                                      zIndex: 10 + flightLayerIdx,
                                      fontFamily: 'var(--font-inter)',
                                    }}
                                    onClick={(e) => handleFlightBlockClick(channel.id, flight, e)}
                                  >
                                    {/* Vertical red line for current day of week - show if current week is within this flight's range */}
                                    {currentWeekIndex >= 0 && 
                                     currentWeekIndex >= startIdx && 
                                     currentWeekIndex <= endIdx && (
                                      <div
                                        className="absolute top-0 bottom-0 bg-red-500 pointer-events-none"
                                        style={{
                                          left: `${(currentWeekIndex - startIdx) * cellWidth + currentDayPosition}px`,
                                          width: '2px',
                                          zIndex: 9999,
                                        }}
                                      />
                                    )}
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
                        
                        // Check if this is part of an active selection
                        const isInActiveSelection = activeSelection && 
                          activeSelection.channelId === channel.id &&
                          weekIdx >= activeSelection.startWeekIdx &&
                          weekIdx <= activeSelection.endWeekIdx;
                        
                        // For organic_social, check if week is in range
                        const isOrganicWeek = isOrganicSocial && isWeekInOrganicRange(weekIdx);
                        
                        // If this is the first cell of an active selection, calculate the span
                        const shouldShowInput = isFirstSelectedCell && activeSelection && !isOrganicSocial;
                        const selectionSpan = shouldShowInput
                          ? activeSelection.endWeekIdx - activeSelection.startWeekIdx + 1
                          : 1;
                        
                        cells.push(
                          <td
                            key={`week-${weekIdx}`}
                            data-week-cell
                            data-week-index={weekIdx}
                            data-channel-id={channel.id}
                            colSpan={shouldShowInput ? selectionSpan : 1}
                            className={`border-l-2 border-l-gray-400 border border-gray-300 px-0 py-0 relative h-12 z-0 w-[40px] min-w-[40px] max-w-[40px] overflow-hidden ${
                              isOrganicWeek
                                ? 'cursor-default'
                                : isCellSelected || isInActiveSelection
                                  ? 'bg-blue-200 border-2 border-blue-500 rounded-none cursor-crosshair'
                                  : `${channelColors.bg} cursor-crosshair`
                            }`}
                            style={isOrganicWeek ? getOrganicStripeStyle(channel.channelName) : undefined}
                            onMouseDown={(e) => {
                              // Prevent interaction for organic_social weeks
                              if (isOrganicWeek) {
                                e.preventDefault();
                                e.stopPropagation();
                                return;
                              }
                              handleWeekCellMouseDown(channel.id, weekIdx, e);
                            }}
                          >
                            {/* Vertical red line for current day of week */}
                            {currentWeekIndex >= 0 && weekIdx === currentWeekIndex && (
                              <div
                                className="absolute top-0 bottom-0 bg-red-500 pointer-events-none"
                                style={{
                                  left: `${currentDayPosition}px`,
                                  width: '2px',
                                  zIndex: 9999,
                                }}
                              />
                            )}
                            {/* Inline budget input spanning across selected cells */}
                            {shouldShowInput && !isOrganicWeek && (() => {
                              const channelBudgetColor = getChannelBudgetColor(channel.channelName);
                              const isOoh = category === 'ooh';
                              return (
                                <div className={`absolute inset-0 z-50 flex items-center justify-center ${channelBudgetColor}`} style={{ overflow: 'hidden', fontFamily: 'var(--font-inter)' }}>
                                  <Input
                                    ref={budgetInputRef}
                                    type="number"
                                    value={activeSelection.budget}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setActiveSelection({
                                        ...activeSelection,
                                        budget: value,
                                      });
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        const budget = parseFloat(activeSelection.budget);
                                        if (budget > 0) {
                                          if (isOoh) {
                                            handleSaveBudgetFromInput(budget);
                                            handleUpdateChannel(channel.id, { totalUpfrontSpend: budget });
                                          } else {
                                            handleSaveBudgetFromInput(budget);
                                          }
                                        } else {
                                          setActiveSelection(null);
                                        }
                                      } else if (e.key === 'Escape') {
                                        setActiveSelection(null);
                                      }
                                    }}
                                    onBlur={() => {
                                      const budget = parseFloat(activeSelection.budget);
                                      if (budget > 0) {
                                        if (isOoh) {
                                          handleSaveBudgetFromInput(budget);
                                          handleUpdateChannel(channel.id, { totalUpfrontSpend: budget });
                                        } else {
                                          handleSaveBudgetFromInput(budget);
                                        }
                                      } else {
                                        setActiveSelection(null);
                                      }
                                    }}
                                    placeholder=""
                                    className="w-full h-full text-center text-xs font-semibold border-0 px-2 py-1 focus:ring-0 focus-visible:ring-0 shadow-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-white bg-transparent placeholder:text-white/70"
                                    style={{ 
                                      textShadow: 'none !important', 
                                      boxShadow: 'none !important',
                                      filter: 'none !important',
                                      WebkitTextStroke: '0',
                                      WebkitTextFillColor: 'white',
                                      boxSizing: 'border-box'
                                    }}
                                    autoFocus
                                  />
                                </div>
                              );
                            })()}
                            {/* Render overlapping flights */}
                            {!isOrganicWeek && overlappingFlights.map(({ flight, startIdx, endIdx }, flightLayerIdx) => {
                              const flightSpan = endIdx - startIdx + 1;
                              const blockWidth = flightSpan * cellWidth;
                              const leftOffset = (weekIdx - startIdx) * cellWidth;
                              const channelBudgetColor = getChannelBudgetColor(channel.channelName);
                              
                              return (
                                <div
                                  key={`flight-overlap-${flight.id}-${weekIdx}`}
                                  className={`absolute top-0 bottom-0 z-50 flex items-center justify-center text-white text-xs font-semibold ${channelBudgetColor}`}
                                  style={{
                                    left: `${leftOffset}px`,
                                    width: `${blockWidth}px`,
                                    zIndex: 10 + flightLayerIdx,
                                  }}
                                >
                                  {/* Vertical red line for current day of week - show if current week is within this flight's range */}
                                  {currentWeekIndex >= 0 && 
                                   currentWeekIndex >= startIdx && 
                                   currentWeekIndex <= endIdx && (
                                    <div
                                      className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none"
                                      style={{
                                        left: `${(currentWeekIndex - startIdx) * cellWidth + currentDayPosition}px`,
                                        zIndex: 1000,
                                      }}
                                    />
                                  )}
                                </div>
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
              // Calculate total budget across all channels (auto-calculated from flights)
              const totalBudget = channels.reduce((sum, channel) => 
                sum + calculateTotalBudgetFromFlights(channel.flights || []), 0);

              return (
                <tr className="bg-gray-50 font-semibold">
                  {/* Delete column - empty for totals row */}
                  <td className="border border-gray-300 px-2 py-2 text-center sticky left-0 mr-[-1px] z-30 bg-gray-50 w-[64px] min-w-[64px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                    {/* Empty */}
                  </td>
                  {/* Channel Name column - TOTALS label */}
                  <td className="border border-gray-300 px-3 py-2 sticky left-[64px] mr-[-1px] z-20 bg-gray-50 w-[200px] min-w-[200px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                    TOTALS
                  </td>
                  {/* Detail column - empty */}
                  <td className="border border-gray-300 px-3 py-2 sticky left-[264px] mr-[-1px] z-20 bg-gray-50 w-[150px] min-w-[150px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                    {/* Empty */}
                  </td>
                  {/* Total Budget column */}
                  <td className="border-l-2 border-l-gray-400 border border-gray-300 px-3 py-2 text-right font-[family-name:var(--font-inter)] sticky left-[414px] mr-[-1px] z-30 bg-gray-50 w-[120px] min-w-[120px] border-r-2 border-gray-400 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.15)]">
                    {formatCurrency(totalBudget)}
                  </td>
                  
                  {/* Monthly totals in date columns */}
                  {monthGroups.map((group, groupIdx) => {
                    const monthKey = getMonthKey(group.weeks[0].weekStart);
                    const monthTotal = calculateMonthlyTotal(monthKey);
                    
                    return (
                      <td
                        key={`total-${groupIdx}`}
                        colSpan={group.weeks.length}
                        className={`border-l-2 border-l-gray-400 border border-gray-300 px-2 py-2 text-center font-[family-name:var(--font-inter)] bg-gray-50 relative z-[1] font-bold text-lg ${
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
                    className="border border-gray-300 px-3 py-2 text-right font-[family-name:var(--font-inter)] bg-gray-100"
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

