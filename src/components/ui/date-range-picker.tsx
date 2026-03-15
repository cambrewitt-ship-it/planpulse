'use client';

import { useState, useRef, useEffect } from 'react';
import { format, subDays, subMonths, startOfMonth, endOfMonth, startOfYear, isValid } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar, ChevronDown } from 'lucide-react';

interface DateRange {
  startDate: string;
  endDate: string;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  disabled?: boolean;
}

interface PresetOption {
  label: string;
  getValue: () => DateRange;
}

const PRESETS: PresetOption[] = [
  {
    label: 'Last 7 days',
    getValue: () => ({
      startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
    }),
  },
  {
    label: 'Last 14 days',
    getValue: () => ({
      startDate: format(subDays(new Date(), 14), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
    }),
  },
  {
    label: 'Last 30 days',
    getValue: () => ({
      startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
    }),
  },
  {
    label: 'Last 60 days',
    getValue: () => ({
      startDate: format(subDays(new Date(), 60), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
    }),
  },
  {
    label: 'Last 90 days',
    getValue: () => ({
      startDate: format(subDays(new Date(), 90), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
    }),
  },
  {
    label: 'This month',
    getValue: () => ({
      startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
    }),
  },
  {
    label: 'Last month',
    getValue: () => {
      const lastMonth = subMonths(new Date(), 1);
      return {
        startDate: format(startOfMonth(lastMonth), 'yyyy-MM-dd'),
        endDate: format(endOfMonth(lastMonth), 'yyyy-MM-dd'),
      };
    },
  },
  {
    label: 'YTD',
    getValue: () => ({
      startDate: format(startOfYear(new Date()), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
    }),
  },
];

export function DateRangePicker({ value, onChange, disabled = false }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState(value.startDate);
  const [customEnd, setCustomEnd] = useState(value.endDate);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowCustom(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update custom inputs when value changes
  useEffect(() => {
    setCustomStart(value.startDate);
    setCustomEnd(value.endDate);
  }, [value.startDate, value.endDate]);

  const formatDisplayDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (!isValid(date)) return dateStr;
    return format(date, 'MMM d, yyyy');
  };

  const handlePresetSelect = (preset: PresetOption) => {
    const newRange = preset.getValue();
    onChange(newRange);
    setIsOpen(false);
    setShowCustom(false);
  };

  const handleCustomApply = () => {
    // Validate dates
    const start = new Date(customStart);
    const end = new Date(customEnd);
    
    if (!isValid(start) || !isValid(end)) {
      return;
    }
    
    if (start > end) {
      // Swap if start is after end
      onChange({ startDate: customEnd, endDate: customStart });
    } else {
      onChange({ startDate: customStart, endDate: customEnd });
    }
    
    setIsOpen(false);
    setShowCustom(false);
  };

  // Find matching preset or show "Custom"
  const getSelectedLabel = () => {
    for (const preset of PRESETS) {
      const presetValue = preset.getValue();
      if (presetValue.startDate === value.startDate && presetValue.endDate === value.endDate) {
        return preset.label;
      }
    }
    return 'Custom';
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="outline"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="min-w-[280px] justify-between text-left font-normal"
      >
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-500" />
          <span className="text-sm">
            {formatDisplayDate(value.startDate)} – {formatDisplayDate(value.endDate)}
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 min-w-[280px]">
          {!showCustom ? (
            <>
              {/* Presets */}
              <div className="p-2">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 px-2 py-1 mb-1">
                  Quick Select
                </div>
                {PRESETS.map((preset) => {
                  const isSelected = getSelectedLabel() === preset.label;
                  return (
                    <button
                      key={preset.label}
                      onClick={() => handlePresetSelect(preset)}
                      className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200 dark:border-gray-700" />

              {/* Custom option */}
              <div className="p-2">
                <button
                  onClick={() => setShowCustom(true)}
                  className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                    getSelectedLabel() === 'Custom'
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  Custom range...
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Custom date inputs */}
              <div className="p-4 space-y-4">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Custom Date Range
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                      Start Date
                    </label>
                    <Input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="w-full text-sm"
                    />
                  </div>
                  
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                      End Date
                    </label>
                    <Input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="w-full text-sm"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCustom(false)}
                    className="flex-1"
                  >
                    Back
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCustomApply}
                    className="flex-1"
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

