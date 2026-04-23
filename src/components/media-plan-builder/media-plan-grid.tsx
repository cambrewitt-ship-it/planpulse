"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
  channelCategory?: 'paid_digital' | 'organic_social' | 'edm' | 'ooh' | 'display_native' | 'radio' | 'other';
  channelSubType?: string; // e.g. "Instagram", "Facebook", "LinkedIn"
  postsPerWeek?: number;
  sendFrequency?: string; // e.g. "weekly", "fortnightly", "monthly"
  oohConfirmed?: boolean;
  totalUpfrontSpend?: number;
  isAlwaysOn?: boolean;
  status?: 'in_progress' | 'booked';
  customChannelName?: string; // display name for 'other' channels
  fees?: number; // production/agency fees
  otherFrequency?: string; // frequency for 'other' channel logging
  otherLogCount?: number; // count per period for 'other' channel
  // Interactive tracking fields (manual channels)
  checklistItems?: Record<string, boolean>;
  campaignNotes?: string;
  manualActualSpend?: number;
  campaignStatus?: 'planning' | 'live' | 'paused' | 'complete';
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
  { name: "Display Ads", color: "bg-cyan-50", textColor: "text-cyan-900" },
  { name: "Native Ads", color: "bg-teal-50", textColor: "text-teal-900" },
  { name: "LinkedIn Ads", color: "bg-blue-100", textColor: "text-blue-950" },
  { name: "TikTok Ads", color: "bg-gray-100", textColor: "text-gray-900" },
  { name: "Instagram Ads", color: "bg-pink-50", textColor: "text-pink-900" },
  { name: "Twitter Ads", color: "bg-sky-50", textColor: "text-sky-900" },
  { name: "YouTube Ads", color: "bg-red-100", textColor: "text-red-950" },
  { name: "Snapchat Ads", color: "bg-yellow-50", textColor: "text-yellow-900" },
  { name: "Reddit Ads", color: "bg-orange-100", textColor: "text-orange-950" },
  { name: "Instagram (Organic)", color: "bg-pink-50", textColor: "text-pink-900" },
  { name: "Facebook (Organic)", color: "bg-blue-50", textColor: "text-blue-900" },
  { name: "LinkedIn (Organic)", color: "bg-cyan-50", textColor: "text-cyan-900" },
  { name: "EDM / Email", color: "bg-purple-50", textColor: "text-purple-900" },
  { name: "OOH", color: "bg-orange-50", textColor: "text-orange-900" },
  { name: "Radio", color: "bg-amber-50", textColor: "text-amber-900" },
  { name: "Linear TV", color: "bg-violet-50", textColor: "text-violet-900" },
  { name: "SVOD", color: "bg-purple-50", textColor: "text-purple-900" },
  { name: "BVOD", color: "bg-fuchsia-50", textColor: "text-fuchsia-900" },
  { name: "Other", color: "bg-gray-50", textColor: "text-gray-700" },
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
    "display ads": "bg-cyan-500",
    "native ads": "bg-teal-500",
    "linkedin ads": "bg-indigo-500",
    "tiktok ads": "bg-gray-500",
    "instagram ads": "bg-pink-500",
    "twitter ads": "bg-sky-500",
    "youtube ads": "bg-red-600",
    "snapchat ads": "bg-yellow-500",
    "reddit ads": "bg-orange-600",
    "linear tv": "bg-violet-600",
    "svod": "bg-purple-600",
    "bvod": "bg-fuchsia-600",
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
const getChannelCategory = (channelName: string): 'paid_digital' | 'organic_social' | 'edm' | 'ooh' | 'radio' | 'other' => {
  if (!channelName) return 'paid_digital';
  const lower = channelName.toLowerCase();
  if (lower.includes('(organic)')) return 'organic_social';
  if (lower.includes('edm') || lower.includes('email')) return 'edm';
  if (lower.includes('ooh')) return 'ooh';
  if (lower === 'radio') return 'radio';
  if (lower === 'other') return 'other';
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
    
    // Get month name for the week — assign to majority month (4+ days)
    const dayCounts = new Map<string, number>();
    const tempDay = new Date(currentWeekStart);
    for (let d = 0; d < 7; d++) {
      const m = tempDay.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      dayCounts.set(m, (dayCounts.get(m) || 0) + 1);
      tempDay.setDate(tempDay.getDate() + 1);
    }
    let monthName = currentWeekStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    let maxDays = 0;
    dayCounts.forEach((count, m) => { if (count > maxDays) { maxDays = count; monthName = m; } });
    
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

  // Zoom: column width in px (default 40, range 20–60)
  const [cellWidth, setCellWidth] = useState<number>(40);

  // Other channel optional detail expansion
  const [expandedOtherDetails, setExpandedOtherDetails] = useState<Set<string>>(new Set());

  // Inline total budget editing
  const [editingTotalBudget, setEditingTotalBudget] = useState<{ channelId: string; value: string } | null>(null);

  // Pending budgets (entered in Total Budget before any flights exist)
  const [pendingBudgets, setPendingBudgets] = useState<Record<string, number>>({});

  // Custom columns
  const [customColumns, setCustomColumns] = useState<{ id: string; name: string }[]>([]);
  const [customColumnData, setCustomColumnData] = useState<Record<string, Record<string, string>>>({});
  const [editingCustomColHeader, setEditingCustomColHeader] = useState<string | null>(null);
  const [editingCustomCell, setEditingCustomCell] = useState<{ channelId: string; colId: string; value: string } | null>(null);

  const handleAddCustomColumn = () => {
    const id = `custom-${Date.now()}`;
    setCustomColumns(prev => [...prev, { id, name: 'New Column' }]);
    setEditingCustomColHeader(id);
  };

  // 3-dots flight menu state
  const [openFlightMenu, setOpenFlightMenu] = useState<string | null>(null);
  const [flightMenuPos, setFlightMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [flightStatusMap, setFlightStatusMap] = useState<Map<string, 'in_progress' | 'booked'>>(new Map());

  // Flight resize ("Change Dates") state
  const [resizingFlight, setResizingFlight] = useState<{ channelId: string; flightId: string } | null>(null);
  const [edgeDragState, setEdgeDragState] = useState<{
    channelId: string; flightId: string; edge: 'start' | 'end';
    currentIdx: number; origStartIdx: number; origEndIdx: number;
  } | null>(null);
  const isEdgeDraggingRef = useRef(false);

  // Inline spend editing
  const [editingSpendFlight, setEditingSpendFlight] = useState<{
    channelId: string; flightId: string; value: string;
  } | null>(null);
  
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
    // Map: Monday (1) = 0, Tuesday (2) = 1, ..., Sunday (0) = 6
    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    // Position within the column (distribute across 7 days)
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
    setChannels(
      channels.map((channel) =>
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
          
          if (overlappingFlights.length > 0 && startIdx !== endIdx) {
            // Delete overlapping flights only when the drag spans multiple cells
            const flightIdsToDelete = overlappingFlights.map(f => f.id);
            const updatedFlights = channel.flights.filter(f => !flightIdsToDelete.includes(f.id));
            const newTotalBudget = calculateTotalBudgetFromFlights(updatedFlights);

            handleUpdateChannel(dragState.channelId!, {
              flights: updatedFlights,
              totalBudget: newTotalBudget,
            });
          } else if (overlappingFlights.length === 0) {
            // No existing flights, show budget input (pre-fill from pending budget if set)
            const pending = pendingBudgets[dragState.channelId!];
            setActiveSelection({
              channelId: dragState.channelId!,
              startWeekIdx: startIdx,
              endWeekIdx: endIdx,
              budget: pending ? String(pending) : "",
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

  // Edge drag (resize flight) mouse events
  useEffect(() => {
    if (!edgeDragState) return;
    const handleMouseMove = (e: MouseEvent) => {
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const weekCell = target?.closest('[data-week-cell]');
      if (weekCell) {
        const weekIdx = parseInt(weekCell.getAttribute('data-week-index') || '-1');
        if (weekIdx >= 0) {
          setEdgeDragState(prev => prev ? { ...prev, currentIdx: weekIdx } : prev);
        }
      }
    };
    const handleMouseUp = () => {
      if (edgeDragState) {
        const { channelId, flightId, edge, currentIdx, origStartIdx, origEndIdx } = edgeDragState;
        const newStartIdx = edge === 'start' ? Math.min(currentIdx, origEndIdx) : origStartIdx;
        const newEndIdx = edge === 'end' ? Math.max(currentIdx, origStartIdx) : origEndIdx;
        handleResizeFlight(channelId, flightId, newStartIdx, newEndIdx);
      }
      setEdgeDragState(null);
      setResizingFlight(null);
      isEdgeDraggingRef.current = false;
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [edgeDragState]);

  // Handle flight block click — activate spend editing for that flight
  const handleFlightBlockClick = (channelId: string, flight: MediaFlight, e: React.MouseEvent) => {
    e.stopPropagation();
    const totalSpend = Object.values(flight.monthlySpend).reduce((s, v) => s + v, 0);
    // Only trigger if not already editing this flight's spend, not clicking the 3-dots, and has a value (empty blocks require double-click)
    if (editingSpendFlight?.flightId !== flight.id && totalSpend > 0) {
      setEditingSpendFlight({ channelId, flightId: flight.id, value: String(Math.round(totalSpend)) });
    }
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
    
    setPendingBudgets(prev => { const next = { ...prev }; delete next[activeSelection.channelId]; return next; });
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

  // Close flight menu on outside click
  useEffect(() => {
    if (!openFlightMenu) return;
    const close = () => { setOpenFlightMenu(null); setFlightMenuPos(null); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openFlightMenu]);

  // Dismiss resize mode on Escape
  useEffect(() => {
    if (!resizingFlight) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setResizingFlight(null); setEdgeDragState(null); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [resizingFlight]);

  // Save inline-edited spend value
  const handleSaveEditedSpend = () => {
    if (!editingSpendFlight) return;
    const raw = editingSpendFlight.value.replace(/[^0-9.]/g, '');
    const newTotal = parseFloat(raw);
    if (isNaN(newTotal)) { setEditingSpendFlight(null); return; }
    const channel = channels.find(c => c.id === editingSpendFlight.channelId);
    if (!channel) { setEditingSpendFlight(null); return; }
    const flight = channel.flights.find(f => f.id === editingSpendFlight.flightId);
    if (!flight) { setEditingSpendFlight(null); return; }
    const existingTotal = Object.values(flight.monthlySpend).reduce((s, v) => s + v, 0);
    let newMonthlySpend: { [key: string]: number };
    if (existingTotal === 0) {
      const firstMonth = Object.keys(flight.monthlySpend)[0];
      newMonthlySpend = { ...flight.monthlySpend };
      if (firstMonth) newMonthlySpend[firstMonth] = newTotal;
    } else {
      newMonthlySpend = {};
      for (const [month, amount] of Object.entries(flight.monthlySpend)) {
        newMonthlySpend[month] = Math.round((amount / existingTotal) * newTotal);
      }
    }
    const updatedFlights = channel.flights.map(f =>
      f.id === editingSpendFlight.flightId ? { ...f, monthlySpend: newMonthlySpend } : f
    );
    handleUpdateChannel(editingSpendFlight.channelId, {
      flights: updatedFlights,
      totalBudget: calculateTotalBudgetFromFlights(updatedFlights),
    });
    setEditingSpendFlight(null);
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

  // Resize flight to new week range (keeps total spend, redistributes by month)
  const handleResizeFlight = (channelId: string, flightId: string, newStartIdx: number, newEndIdx: number) => {
    const channel = channels.find(c => c.id === channelId);
    if (!channel) return;
    const flight = channel.flights.find(f => f.id === flightId);
    if (!flight) return;
    const totalBudget = Object.values(flight.monthlySpend).reduce((a, b) => a + b, 0);
    const selectedWeeks = weeks.slice(newStartIdx, newEndIdx + 1);
    const weeksByMonth: { [k: string]: WeekRange[] } = {};
    selectedWeeks.forEach(w => {
      const mk = getMonthKey(w.weekStart);
      if (!weeksByMonth[mk]) weeksByMonth[mk] = [];
      weeksByMonth[mk].push(w);
    });
    const monthlySpend: { [k: string]: number } = {};
    const totalWeeks = selectedWeeks.length;
    Object.entries(weeksByMonth).forEach(([mk, mw]) => {
      monthlySpend[mk] = (totalBudget * mw.length) / totalWeeks;
    });
    const updatedFlight: MediaFlight = {
      ...flight,
      startWeek: weeks[newStartIdx].weekStart,
      endWeek: weeks[newEndIdx].weekEnd,
      monthlySpend,
    };
    const updatedFlights = channel.flights.map(f => f.id === flightId ? updatedFlight : f);
    handleUpdateChannel(channelId, { flights: updatedFlights, totalBudget: calculateTotalBudgetFromFlights(updatedFlights) });
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
        
        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium text-gray-700">Zoom:</Label>
          <Button variant="outline" size="icon" className="h-7 w-7 text-base" onClick={() => setCellWidth(w => Math.max(20, w - 8))} title="Zoom out">−</Button>
          <span className="text-xs text-gray-500 w-8 text-center">{Math.round((cellWidth / 40) * 100)}%</span>
          <Button variant="outline" size="icon" className="h-7 w-7 text-base" onClick={() => setCellWidth(w => Math.min(60, w + 8))} title="Zoom in">+</Button>
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
              <th className="border border-gray-300 bg-gray-50 text-left px-3 py-2 font-semibold sticky left-0 mr-[-1px] z-20 w-[200px] min-w-[200px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]"></th>
              <th className="border border-gray-300 bg-gray-50 text-left px-3 py-2 font-semibold sticky left-[200px] mr-[-1px] z-20 w-[150px] min-w-[150px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]"></th>
              <th className="border-l-2 border-l-gray-400 border border-gray-300 bg-gray-50 text-left px-3 py-2 font-semibold sticky left-[350px] mr-[-1px] z-20 w-[120px] min-w-[120px] border-r-2 border-gray-400 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.15)]"></th>
              {customColumns.map((col) => (
                <th key={col.id} className="border border-gray-300 bg-gray-50 w-[120px] min-w-[120px]"></th>
              ))}
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
              <th className="border border-gray-300 bg-gray-50 text-left px-3 py-2 font-semibold sticky left-0 mr-[-1px] z-20 w-[200px] min-w-[200px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                Channel Name
              </th>
              <th className="border border-gray-300 bg-gray-50 text-left px-3 py-2 font-semibold sticky left-[200px] mr-[-1px] z-20 w-[150px] min-w-[150px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                <div className="flex items-center justify-between">
                  <span>Detail</span>
                  <button
                    onClick={handleAddCustomColumn}
                    className="ml-1 w-5 h-5 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 text-gray-600 hover:text-gray-900 transition-colors text-xs font-bold"
                    title="Add custom column"
                  >
                    +
                  </button>
                </div>
              </th>
              <th className="border-l-2 border-l-gray-400 border border-gray-300 bg-gray-50 text-left px-3 py-2 font-semibold sticky left-[350px] mr-[-1px] z-30 w-[120px] min-w-[120px] border-r-2 border-gray-400 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.15)]">
                Total Budget
              </th>

              {/* Custom columns */}
              {customColumns.map((col) => (
                <th key={col.id} className="border border-gray-300 bg-gray-50 px-2 py-2 font-semibold w-[120px] min-w-[120px] text-left">
                  {editingCustomColHeader === col.id ? (
                    <input
                      autoFocus
                      type="text"
                      defaultValue={col.name}
                      className="w-full text-sm border border-blue-400 rounded px-1 py-0.5 bg-white outline-none"
                      onBlur={(e) => {
                        setCustomColumns(prev => prev.map(c => c.id === col.id ? { ...c, name: e.target.value || col.name } : c));
                        setEditingCustomColHeader(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setEditingCustomColHeader(null);
                      }}
                    />
                  ) : (
                    <div className="flex items-center justify-between group cursor-pointer" onClick={() => setEditingCustomColHeader(col.id)}>
                      <span className="text-xs">{col.name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setCustomColumns(prev => prev.filter(c => c.id !== col.id)); }}
                        className="ml-1 text-gray-400 hover:text-red-500 text-xs leading-none"
                        title="Remove column"
                      >×</button>
                    </div>
                  )}
                </th>
              ))}

              {/* Week date columns - scrollable section */}
              {weeks.map((week, weekIdx) => (
                <th
                  key={weekIdx}
                  className={`border border-gray-300 bg-gray-100 text-center px-0 py-2 font-semibold relative z-0 text-sm ${
                    weekIdx === 0 ? 'border-l-2 border-l-gray-400' : ''
                  }`}
                  style={{ height: '80px', width: cellWidth, minWidth: cellWidth, maxWidth: cellWidth }}
                >
                  {/* Today line */}
                  {currentWeekIndex >= 0 && weekIdx === currentWeekIndex && (
                    <div
                      className="absolute top-0 bottom-0 pointer-events-none"
                      style={{ left: `${currentDayPosition}px`, width: '2px', background: '#8A8578', zIndex: 9999, overflow: 'visible' }}
                    >
                      <div style={{ position: 'absolute', top: 0, left: '-4px', width: '9px', height: '9px', borderRadius: '50%', background: '#8A8578' }} />
                    </div>
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
                  colSpan={3 + customColumns.length + weeks.length}
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
                    {/* Channel Name */}
                    <td className="border border-gray-300 px-3 py-2 sticky left-0 mr-[-1px] z-20 bg-gray-50 w-[200px] min-w-[200px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
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
                            {channel.channelName
                              ? ((channel.channelCategory === 'other' || channel.channelName.toLowerCase() === 'other') && channel.customChannelName
                                  ? channel.customChannelName.toUpperCase()
                                  : channel.channelName.toUpperCase())
                              : "Select Channel"}
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

                    {/* Format/Detail */}
                    <td className="border border-gray-300 px-3 py-2 sticky left-[200px] mr-[-1px] z-20 bg-gray-50 w-[150px] min-w-[150px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
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

                        // Radio: Similar to OOH — total upfront spend + booking confirmed
                        if (category === 'radio') {
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
                                  id={`radio-confirmed-${channel.id}`}
                                  checked={channel.oohConfirmed || false}
                                  onCheckedChange={(checked) =>
                                    handleUpdateChannel(channel.id, { oohConfirmed: checked === true })
                                  }
                                />
                                <Label htmlFor={`radio-confirmed-${channel.id}`} className="text-xs cursor-pointer">
                                  Booking Confirmed
                                </Label>
                              </div>
                              <p className="text-xs text-gray-500 italic mt-1">
                                Radio spend is entered as a total and is not tracked live
                              </p>
                            </div>
                          );
                        }

                        // Other: Custom name (required) + optional fees/frequency/count
                        if (category === 'other') {
                          const isExpanded = expandedOtherDetails.has(channel.id);
                          return (
                            <div className="flex flex-col gap-2">
                              <div>
                                <Label className="text-xs text-gray-600">Channel Name</Label>
                                <Input
                                  type="text"
                                  value={channel.customChannelName || ''}
                                  onChange={(e) => handleUpdateChannel(channel.id, { customChannelName: e.target.value })}
                                  placeholder="e.g. Podcast, Print…"
                                  className="h-7 text-sm"
                                />
                              </div>
                              <button
                                type="button"
                                className="text-xs text-blue-600 hover:text-blue-800 text-left underline underline-offset-2"
                                onClick={() => {
                                  setExpandedOtherDetails(prev => {
                                    const next = new Set(prev);
                                    if (next.has(channel.id)) next.delete(channel.id);
                                    else next.add(channel.id);
                                    return next;
                                  });
                                }}
                              >
                                {isExpanded ? '− Hide details' : '+ Add details (optional)'}
                              </button>
                              {isExpanded && (
                                <>
                                  <div>
                                    <Label className="text-xs text-gray-600">Fees</Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={channel.fees || ''}
                                      onChange={(e) => handleUpdateChannel(channel.id, { fees: parseFloat(e.target.value) || 0 })}
                                      placeholder="0.00"
                                      className="h-7 text-sm"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs text-gray-600">Frequency</Label>
                                    <Select
                                      value={channel.otherFrequency || ''}
                                      onValueChange={(value) => handleUpdateChannel(channel.id, { otherFrequency: value })}
                                    >
                                      <SelectTrigger className="h-7 text-xs">
                                        <SelectValue placeholder="Select…" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="daily">Daily</SelectItem>
                                        <SelectItem value="weekly">Weekly</SelectItem>
                                        <SelectItem value="fortnightly">Fortnightly</SelectItem>
                                        <SelectItem value="monthly">Monthly</SelectItem>
                                        <SelectItem value="one-off">One-off</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-gray-600">Count per period</Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={channel.otherLogCount || ''}
                                      onChange={(e) => handleUpdateChannel(channel.id, { otherLogCount: parseInt(e.target.value) || 0 })}
                                      placeholder="0"
                                      className="h-7 text-sm"
                                    />
                                  </div>
                                </>
                              )}
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
                    <td className="border-l-2 border-l-gray-400 border border-gray-300 px-3 py-2 text-center font-[family-name:var(--font-inter)] sticky left-[350px] mr-[-1px] z-30 bg-gray-50 w-[120px] min-w-[120px] border-r-2 border-gray-400 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.15)]">
                      {(() => {
                        const category = channel.channelCategory || getChannelCategory(channel.channelName);
                        if (category === 'ooh') {
                          return <div className="w-full px-2 py-1 text-center">{formatCurrency(channel.totalUpfrontSpend || 0)}</div>;
                        }
                        if (category === 'organic_social') {
                          return <div className="w-full px-2 py-1 text-center">{`${channel.postsPerWeek || 0} posts/week`}</div>;
                        }
                        if (category === 'edm') {
                          return <div className="w-full px-2 py-1 text-center">{channel.sendFrequency || 'N/A'}</div>;
                        }
                        // paid_digital / radio / other: editable total budget
                        const calcTotal = category === 'other'
                          ? calculateTotalBudgetFromFlights(channel.flights || []) + (channel.fees || 0)
                          : (channel.flights?.length > 0
                              ? calculateTotalBudgetFromFlights(channel.flights)
                              : (pendingBudgets[channel.id] ?? channel.totalBudget ?? 0));
                        const isEditing = editingTotalBudget?.channelId === channel.id;
                        if (isEditing) {
                          return (
                            <input
                              autoFocus
                              type="number"
                              value={editingTotalBudget!.value}
                              onChange={e => setEditingTotalBudget({ channelId: channel.id, value: e.target.value })}
                              onBlur={() => {
                                const newTotal = parseFloat(editingTotalBudget!.value);
                                if (!isNaN(newTotal) && newTotal >= 0) {
                                  // Distribute across flights proportionally, or set single-flight budget
                                  const flights = channel.flights || [];
                                  if (flights.length === 1) {
                                    const f = flights[0];
                                    const months = Object.keys(f.monthlySpend);
                                    const perMonth = months.length > 0 ? newTotal / months.length : newTotal;
                                    const newMonthlySpend = Object.fromEntries(months.map(m => [m, perMonth]));
                                    const updated = [{ ...f, monthlySpend: newMonthlySpend }];
                                    handleUpdateChannel(channel.id, { flights: updated, totalBudget: newTotal });
                                  } else if (flights.length > 1) {
                                    const oldTotal = calculateTotalBudgetFromFlights(flights);
                                    const ratio = oldTotal > 0 ? newTotal / oldTotal : 0;
                                    const updated = flights.map(f => ({
                                      ...f,
                                      monthlySpend: Object.fromEntries(
                                        Object.entries(f.monthlySpend).map(([m, v]) => [m, v * ratio])
                                      ),
                                    }));
                                    handleUpdateChannel(channel.id, { flights: updated, totalBudget: newTotal });
                                  } else {
                                    // No flights yet — store as pending budget and prompt user to highlight weeks
                                    handleUpdateChannel(channel.id, { totalBudget: newTotal });
                                    if (newTotal > 0) setPendingBudgets(prev => ({ ...prev, [channel.id]: newTotal }));
                                  }
                                }
                                setEditingTotalBudget(null);
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                if (e.key === 'Escape') setEditingTotalBudget(null);
                              }}
                              className="w-full text-center text-sm border border-blue-400 rounded px-1 py-0.5 bg-white outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          );
                        }
                        return (
                          <div
                            className="w-full px-2 py-1 text-center cursor-text hover:bg-blue-50 rounded transition-colors"
                            title="Click to edit total budget"
                            onClick={() => setEditingTotalBudget({ channelId: channel.id, value: String(calcTotal) })}
                          >
                            {formatCurrency(calcTotal)}
                          </div>
                        );
                      })()}
                    </td>

                  {/* Custom column cells */}
                  {customColumns.map((col) => {
                    const cellVal = customColumnData[channel.id]?.[col.id] ?? '';
                    const isEditing = editingCustomCell?.channelId === channel.id && editingCustomCell?.colId === col.id;
                    return (
                      <td key={col.id} className="border border-gray-300 px-2 py-2 w-[120px] min-w-[120px] text-sm">
                        {isEditing ? (
                          <input
                            autoFocus
                            type="text"
                            value={editingCustomCell!.value}
                            onChange={(e) => setEditingCustomCell({ channelId: channel.id, colId: col.id, value: e.target.value })}
                            onBlur={() => {
                              setCustomColumnData(prev => ({
                                ...prev,
                                [channel.id]: { ...(prev[channel.id] || {}), [col.id]: editingCustomCell!.value },
                              }));
                              setEditingCustomCell(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              if (e.key === 'Escape') setEditingCustomCell(null);
                            }}
                            className="w-full text-sm border border-blue-400 rounded px-1 py-0.5 bg-white outline-none"
                          />
                        ) : (
                          <div
                            className="w-full min-h-[24px] cursor-text hover:bg-blue-50 rounded px-1 py-0.5 transition-colors"
                            onClick={() => setEditingCustomCell({ channelId: channel.id, colId: col.id, value: cellVal })}
                          >
                            {cellVal || <span className="text-gray-300">—</span>}
                          </div>
                        )}
                      </td>
                    );
                  })}

                  {/* Week data cells with flight blocks */}
                  {(() => {
                    const category = channel.channelCategory || getChannelCategory(channel.channelName);
                    
                    // EDM only: Hide week grid, no drag
                    if (category === 'edm') {
                      return weeks.map((week, weekIdx) => (
                        <td
                          key={`week-${weekIdx}`}
                          className={`border-l-2 border-l-gray-400 border border-gray-300 px-2 py-2 text-center text-xs bg-gray-50 cursor-default relative${weekIdx === 0 ? ' border-l-2 border-l-gray-400' : ''}`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        >
                          {currentWeekIndex >= 0 && weekIdx === currentWeekIndex && (
                            <div
                              className="absolute top-0 bottom-0 pointer-events-none"
                              style={{ left: `${currentDayPosition}px`, width: '2px', background: '#8A8578', zIndex: 9999 }}
                            />
                          )}
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
                    }).filter((f) => f.startIdx !== -1).map(range => {
                      // Override indices live during edge drag
                      if (edgeDragState?.flightId === range.flight.id && edgeDragState?.channelId === channel.id) {
                        const { edge, currentIdx, origStartIdx, origEndIdx } = edgeDragState;
                        return edge === 'start'
                          ? { ...range, startIdx: Math.max(0, Math.min(currentIdx, origEndIdx)) }
                          : { ...range, endIdx: Math.min(weeks.length - 1, Math.max(currentIdx, origStartIdx)) };
                      }
                      return range;
                    });
                    
                    // Convert hex color to rgba with 80% opacity
                    const hexToRgba = (hex: string, opacity: number): string => {
                      const r = parseInt(hex.slice(1, 3), 16);
                      const g = parseInt(hex.slice(3, 5), 16);
                      const b = parseInt(hex.slice(5, 7), 16);
                      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
                    };
                    
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
                            className={`border-l-2 border-l-gray-400 border border-gray-300 px-0 py-0 relative h-12 z-0 overflow-hidden ${
                              isOrganicWeek
                                ? 'cursor-default'
                                : isCellSelected || isInActiveSelection
                                  ? 'bg-blue-200 border-2 border-blue-500 rounded-none cursor-crosshair'
                                  : `${channelColors.bg} cursor-crosshair`
                            }`}
                            style={{ width: cellWidth, minWidth: cellWidth, maxWidth: cellWidth, ...(isOrganicWeek ? getOrganicStripeStyle(channel.channelName) : {}) }}
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
                            {/* Today line */}
                            {currentWeekIndex >= 0 && weekIdx === currentWeekIndex && (
                              <div
                                className="absolute top-0 bottom-0 pointer-events-none"
                                style={{ left: `${currentDayPosition}px`, width: '2px', background: '#8A8578', zIndex: 9999 }}
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
                                        const finalBudget = isNaN(budget) ? 0 : budget;
                                        if (isOoh) {
                                          handleSaveBudgetFromInput(finalBudget);
                                          handleUpdateChannel(channel.id, { totalUpfrontSpend: finalBudget });
                                        } else {
                                          handleSaveBudgetFromInput(finalBudget);
                                        }
                                      } else if (e.key === 'Escape') {
                                        setActiveSelection(null);
                                      }
                                    }}
                                    onBlur={() => {
                                      const budget = parseFloat(activeSelection.budget);
                                      const finalBudget = isNaN(budget) ? 0 : budget;
                                      if (isOoh) {
                                        handleSaveBudgetFromInput(finalBudget);
                                        handleUpdateChannel(channel.id, { totalUpfrontSpend: finalBudget });
                                      } else {
                                        handleSaveBudgetFromInput(finalBudget);
                                      }
                                    }}
                                    placeholder="$"
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
                                
                                const flightStatus = flightStatusMap.get(flight.id);
                                const channelBudgetColor = getChannelBudgetColor(channel.channelName);
                                const blockBgColor = flightStatus === 'booked'
                                  ? '#111827'
                                  : flightStatus === 'in_progress'
                                    ? '#9CA3AF'
                                    : null;

                                return (
                                  <div
                                    key={`flight-${flight.id}-${weekIdx}`}
                                    data-flight-block
                                    className={`absolute top-0 bottom-0 z-50 flex items-center justify-center text-white text-xs font-semibold cursor-pointer hover:opacity-90 transition-opacity group ${blockBgColor ? '' : channelBudgetColor}`}
                                    style={{
                                      left: `${leftOffset}px`,
                                      width: `${blockWidth}px`,
                                      zIndex: 10 + flightLayerIdx,
                                      fontFamily: 'var(--font-inter)',
                                      ...(blockBgColor ? { backgroundColor: blockBgColor } : {}),
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => handleFlightBlockClick(channel.id, flight, e)}
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      if (totalSpend === 0) {
                                        setEditingSpendFlight({ channelId: channel.id, flightId: flight.id, value: '' });
                                      }
                                    }}
                                  >
                                    {/* Today line */}
                                    {currentWeekIndex >= 0 &&
                                     currentWeekIndex >= startIdx &&
                                     currentWeekIndex <= endIdx && (
                                      <div
                                        className="absolute top-0 bottom-0 pointer-events-none"
                                        style={{ left: `${(currentWeekIndex - startIdx) * cellWidth + currentDayPosition}px`, width: '2px', background: '#8A8578', zIndex: 9999 }}
                                      />
                                    )}

                                    {/* Spend number — click to edit */}
                                    {isFirstWeek && (totalSpend > 0 || (editingSpendFlight?.flightId === flight.id && editingSpendFlight?.channelId === channel.id)) && (
                                      editingSpendFlight?.flightId === flight.id && editingSpendFlight?.channelId === channel.id ? (
                                        <input
                                          autoFocus
                                          value={editingSpendFlight.value}
                                          onChange={e => setEditingSpendFlight(prev => prev ? { ...prev, value: e.target.value } : null)}
                                          onBlur={handleSaveEditedSpend}
                                          onKeyDown={e => { if (e.key === 'Enter') handleSaveEditedSpend(); if (e.key === 'Escape') setEditingSpendFlight(null); }}
                                          onClick={e => e.stopPropagation()}
                                          style={{ width: Math.max(blockWidth - 24, 44), fontSize: 10, fontWeight: 600, color: 'white', background: 'transparent', border: '1px solid rgba(255,255,255,0.6)', borderRadius: 2, padding: '1px 3px', textAlign: 'center', outline: 'none' }}
                                        />
                                      ) : (
                                        <span
                                          onClick={(e) => { e.stopPropagation(); setEditingSpendFlight({ channelId: channel.id, flightId: flight.id, value: String(totalSpend) }); }}
                                          style={{ cursor: 'text' }}
                                          title="Click to edit"
                                        >
                                          {formatCurrency(totalSpend)}
                                        </span>
                                      )
                                    )}

                                    {/* 3-dots menu (first week only) */}
                                    {isFirstWeek && (
                                      <div
                                        style={{ position: 'absolute', top: 1, right: 1, zIndex: 200 }}
                                        onClick={e => e.stopPropagation()}
                                      >
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (openFlightMenu === flight.id) {
                                              setOpenFlightMenu(null);
                                              setFlightMenuPos(null);
                                            } else {
                                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                              setFlightMenuPos({ top: rect.bottom + 2, right: window.innerWidth - rect.right });
                                              setOpenFlightMenu(flight.id);
                                            }
                                          }}
                                          style={{ background: 'rgba(255,255,255,0.22)', border: 'none', borderRadius: 2, padding: '0 4px', cursor: 'pointer', fontSize: 11, color: 'white', lineHeight: '14px', height: 14 }}
                                        >···</button>
                                      </div>
                                    )}

                                    {/* Status badge */}
                                    {isFirstWeek && flightStatusMap.has(flight.id) && (
                                      <div style={{ position: 'absolute', bottom: 1, left: 2, fontSize: 7, fontWeight: 700, color: 'white', background: 'rgba(0,0,0,0.28)', borderRadius: 2, padding: '1px 3px', letterSpacing: '0.05em', textTransform: 'uppercase', pointerEvents: 'none' }}>
                                        {flightStatusMap.get(flight.id) === 'in_progress' ? 'In Prog' : 'Booked'}
                                      </div>
                                    )}

                                    {/* Resize handles — shown when this flight is in "Change Dates" mode */}
                                    {resizingFlight?.flightId === flight.id && resizingFlight?.channelId === channel.id && (() => {
                                      const curRange = flightRanges.find(r => r.flight.id === flight.id);
                                      const origStartIdx = curRange?.startIdx ?? 0;
                                      const origEndIdx = curRange?.endIdx ?? 0;
                                      return (
                                        <>
                                          {/* Left (start) handle */}
                                          <div
                                            onMouseDown={e => {
                                              e.stopPropagation();
                                              isEdgeDraggingRef.current = true;
                                              setEdgeDragState({ channelId: channel.id, flightId: flight.id, edge: 'start', currentIdx: origStartIdx, origStartIdx, origEndIdx });
                                            }}
                                            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 10, cursor: 'ew-resize', background: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
                                          >
                                            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.9)', lineHeight: 1, userSelect: 'none' }}>⠿</span>
                                          </div>
                                          {/* Right (end) handle */}
                                          <div
                                            onMouseDown={e => {
                                              e.stopPropagation();
                                              isEdgeDraggingRef.current = true;
                                              setEdgeDragState({ channelId: channel.id, flightId: flight.id, edge: 'end', currentIdx: origEndIdx, origStartIdx, origEndIdx });
                                            }}
                                            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 10, cursor: 'ew-resize', background: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
                                          >
                                            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.9)', lineHeight: 1, userSelect: 'none' }}>⠿</span>
                                          </div>
                                        </>
                                      );
                                    })()}
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
                            className={`border-l-2 border-l-gray-400 border border-gray-300 px-0 py-0 relative h-12 z-0 overflow-hidden ${
                              isOrganicWeek
                                ? 'cursor-default'
                                : isCellSelected || isInActiveSelection
                                  ? 'bg-blue-200 border-2 border-blue-500 rounded-none cursor-crosshair'
                                  : `${channelColors.bg} cursor-crosshair`
                            }`}
                            style={{ width: cellWidth, minWidth: cellWidth, maxWidth: cellWidth, ...(isOrganicWeek ? getOrganicStripeStyle(channel.channelName) : {}) }}
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
                            {/* Today line */}
                            {currentWeekIndex >= 0 && weekIdx === currentWeekIndex && (
                              <div
                                className="absolute top-0 bottom-0 pointer-events-none"
                                style={{ left: `${currentDayPosition}px`, width: '2px', background: '#8A8578', zIndex: 9999 }}
                              />
                            )}
                            {/* Pending budget hint — drag to set flights */}
                            {weekIdx === 0 && !activeSelection && pendingBudgets[channel.id] && channel.flights.length === 0 && (
                              <div className="absolute inset-0 flex items-center pointer-events-none z-10" style={{ paddingLeft: 6 }}>
                                <span className="text-xs text-blue-500 whitespace-nowrap animate-pulse font-medium">← Drag to set flight dates</span>
                              </div>
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
                                        const finalBudget = isNaN(budget) ? 0 : budget;
                                        if (isOoh) {
                                          handleSaveBudgetFromInput(finalBudget);
                                          handleUpdateChannel(channel.id, { totalUpfrontSpend: finalBudget });
                                        } else {
                                          handleSaveBudgetFromInput(finalBudget);
                                        }
                                      } else if (e.key === 'Escape') {
                                        setActiveSelection(null);
                                      }
                                    }}
                                    onBlur={() => {
                                      const budget = parseFloat(activeSelection.budget);
                                      const finalBudget = isNaN(budget) ? 0 : budget;
                                      if (isOoh) {
                                        handleSaveBudgetFromInput(finalBudget);
                                        handleUpdateChannel(channel.id, { totalUpfrontSpend: finalBudget });
                                      } else {
                                        handleSaveBudgetFromInput(finalBudget);
                                      }
                                    }}
                                    placeholder="$"
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
                                  {/* Today line */}
                                  {currentWeekIndex >= 0 &&
                                   currentWeekIndex >= startIdx &&
                                   currentWeekIndex <= endIdx && (
                                    <div
                                      className="absolute top-0 bottom-0 pointer-events-none"
                                      style={{ left: `${(currentWeekIndex - startIdx) * cellWidth + currentDayPosition}px`, width: '2px', background: '#8A8578', zIndex: 1000 }}
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
                  {/* Channel Name column - TOTALS label + Add Channel button */}
                  <td className="border border-gray-300 px-3 py-2 sticky left-0 mr-[-1px] z-20 bg-gray-50 w-[200px] min-w-[200px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={handleAddChannel}
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Channel
                      </Button>
                      <span>TOTALS</span>
                    </div>
                  </td>
                  {/* Detail column - empty */}
                  <td className="border border-gray-300 px-3 py-2 sticky left-[200px] mr-[-1px] z-20 bg-gray-50 w-[150px] min-w-[150px] border-r-2 border-gray-400 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                    {/* Empty */}
                  </td>
                  {/* Total Budget column */}
                  <td className="border-l-2 border-l-gray-400 border border-gray-300 px-3 py-2 text-right font-[family-name:var(--font-inter)] sticky left-[350px] mr-[-1px] z-30 bg-gray-50 w-[120px] min-w-[120px] border-r-2 border-gray-400 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.15)]">
                    {formatCurrency(totalBudget)}
                  </td>

                  {/* Custom column cells - empty in totals row */}
                  {customColumns.map((col) => (
                    <td key={col.id} className="border border-gray-300 px-2 py-2 w-[120px] min-w-[120px]"></td>
                  ))}

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
                    colSpan={3 + customColumns.length + weeks.length}
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


      {/* Flight 3-dots portal dropdown — renders outside overflow:hidden containers */}
      {openFlightMenu && flightMenuPos && typeof window !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            top: flightMenuPos.top,
            right: flightMenuPos.right,
            background: '#FDFCF8',
            border: '0.5px solid #E8E4DC',
            borderRadius: 5,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            zIndex: 99999,
            minWidth: 110,
            overflow: 'hidden',
          }}
          onClick={e => e.stopPropagation()}
        >
          {(['in_progress', 'booked'] as const).map(status => (
            <button key={status}
              onClick={(e) => { e.stopPropagation(); setFlightStatusMap(prev => new Map(prev).set(openFlightMenu, status)); setOpenFlightMenu(null); setFlightMenuPos(null); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: 11, color: flightStatusMap.get(openFlightMenu) === status ? '#4A6580' : '#1C1917', fontWeight: flightStatusMap.get(openFlightMenu) === status ? 600 : 400, background: 'transparent', border: 'none', cursor: 'pointer', borderBottom: '0.5px solid #F0EDE8', fontFamily: "'DM Sans', system-ui, sans-serif" }}
            >
              {status === 'in_progress' ? '▶ In Progress' : '✓ Booked'}
            </button>
          ))}
          {(() => {
            // Find which channel+flight this menu belongs to
            const channelWithFlight = channels.find(c => c.flights.some(f => f.id === openFlightMenu));
            const flightId = openFlightMenu;
            return channelWithFlight ? (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setResizingFlight({ channelId: channelWithFlight.id, flightId });
                    setOpenFlightMenu(null);
                    setFlightMenuPos(null);
                  }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: 11, color: '#4A6580', background: 'transparent', border: 'none', borderTop: '0.5px solid #F0EDE8', cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif" }}
                >
                  ↔ Change Dates
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteFlight(channelWithFlight.id, flightId); setOpenFlightMenu(null); setFlightMenuPos(null); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: 11, color: '#A0442A', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', system-ui, sans-serif" }}
                >
                  🗑 Delete
                </button>
              </>
            ) : null;
          })()}
        </div>,
        document.body
      )}
    </div>
  );
}

