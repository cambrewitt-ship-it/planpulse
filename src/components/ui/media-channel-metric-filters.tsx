'use client';

import { useState } from 'react';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './popover';
import { Filter, X } from 'lucide-react';
import { Badge } from './badge';

export interface MetricFilters {
  minCTR?: number; // Percentage (e.g., 5 for 5%)
  maxCTR?: number;
  minCPC?: number; // Dollars
  maxCPC?: number;
  minImpressions?: number;
  maxImpressions?: number;
  minClicks?: number;
  maxClicks?: number;
  minConversions?: number; // Google Ads only
  maxConversions?: number;
}

interface MediaChannelMetricFiltersProps {
  filters: MetricFilters;
  onFiltersChange: (filters: MetricFilters) => void;
  platformType?: 'meta-ads' | 'google-ads' | 'organic' | 'other';
}

export function MediaChannelMetricFilters({
  filters,
  onFiltersChange,
  platformType = 'other',
}: MediaChannelMetricFiltersProps) {
  const [localFilters, setLocalFilters] = useState<MetricFilters>(filters);
  const [isOpen, setIsOpen] = useState(false);

  const handleApply = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleReset = () => {
    const emptyFilters: MetricFilters = {};
    setLocalFilters(emptyFilters);
    onFiltersChange(emptyFilters);
  };

  const updateFilter = (key: keyof MetricFilters, value: string) => {
    const numValue = value === '' ? undefined : parseFloat(value);
    setLocalFilters((prev) => ({
      ...prev,
      [key]: numValue,
    }));
  };

  // Count active filters
  const activeFilterCount = Object.keys(filters).filter(
    (key) => filters[key as keyof MetricFilters] !== undefined
  ).length;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2"
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Filter Metrics</h4>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="h-7 text-xs"
              >
                <X className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            )}
          </div>

          {/* CTR Filters */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">
              CTR (Click-Through Rate %)
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Input
                  type="number"
                  placeholder="Min"
                  value={localFilters.minCTR ?? ''}
                  onChange={(e) => updateFilter('minCTR', e.target.value)}
                  className="h-8 text-xs"
                  step="0.1"
                />
              </div>
              <div>
                <Input
                  type="number"
                  placeholder="Max"
                  value={localFilters.maxCTR ?? ''}
                  onChange={(e) => updateFilter('maxCTR', e.target.value)}
                  className="h-8 text-xs"
                  step="0.1"
                />
              </div>
            </div>
          </div>

          {/* CPC Filters */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">CPC (Cost Per Click $)</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Input
                  type="number"
                  placeholder="Min"
                  value={localFilters.minCPC ?? ''}
                  onChange={(e) => updateFilter('minCPC', e.target.value)}
                  className="h-8 text-xs"
                  step="0.01"
                />
              </div>
              <div>
                <Input
                  type="number"
                  placeholder="Max"
                  value={localFilters.maxCPC ?? ''}
                  onChange={(e) => updateFilter('maxCPC', e.target.value)}
                  className="h-8 text-xs"
                  step="0.01"
                />
              </div>
            </div>
          </div>

          {/* Impressions Filters */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Impressions</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Input
                  type="number"
                  placeholder="Min"
                  value={localFilters.minImpressions ?? ''}
                  onChange={(e) => updateFilter('minImpressions', e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Input
                  type="number"
                  placeholder="Max"
                  value={localFilters.maxImpressions ?? ''}
                  onChange={(e) => updateFilter('maxImpressions', e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Clicks Filters */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Clicks</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Input
                  type="number"
                  placeholder="Min"
                  value={localFilters.minClicks ?? ''}
                  onChange={(e) => updateFilter('minClicks', e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Input
                  type="number"
                  placeholder="Max"
                  value={localFilters.maxClicks ?? ''}
                  onChange={(e) => updateFilter('maxClicks', e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Conversions Filters (Google Ads only) */}
          {platformType === 'google-ads' && (
            <div className="space-y-2">
              <Label className="text-xs font-medium">Conversions</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Input
                    type="number"
                    placeholder="Min"
                    value={localFilters.minConversions ?? ''}
                    onChange={(e) =>
                      updateFilter('minConversions', e.target.value)
                    }
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Input
                    type="number"
                    placeholder="Max"
                    value={localFilters.maxConversions ?? ''}
                    onChange={(e) =>
                      updateFilter('maxConversions', e.target.value)
                    }
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Apply Button */}
          <Button onClick={handleApply} className="w-full h-8 text-xs">
            Apply Filters
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Helper function to apply filters to timeframes
export function applyMetricFilters(
  timeFrames: any[],
  filters: MetricFilters
): any[] {
  return timeFrames.filter((tf) => {
    const ctrPercent = (tf.ctr || 0) * 100;

    // CTR filters
    if (filters.minCTR !== undefined && ctrPercent < filters.minCTR) {
      return false;
    }
    if (filters.maxCTR !== undefined && ctrPercent > filters.maxCTR) {
      return false;
    }

    // CPC filters
    if (filters.minCPC !== undefined && (tf.cpc || 0) < filters.minCPC) {
      return false;
    }
    if (filters.maxCPC !== undefined && (tf.cpc || 0) > filters.maxCPC) {
      return false;
    }

    // Impressions filters
    if (
      filters.minImpressions !== undefined &&
      (tf.impressions || 0) < filters.minImpressions
    ) {
      return false;
    }
    if (
      filters.maxImpressions !== undefined &&
      (tf.impressions || 0) > filters.maxImpressions
    ) {
      return false;
    }

    // Clicks filters
    if (filters.minClicks !== undefined && (tf.clicks || 0) < filters.minClicks) {
      return false;
    }
    if (filters.maxClicks !== undefined && (tf.clicks || 0) > filters.maxClicks) {
      return false;
    }

    // Conversions filters
    if (
      filters.minConversions !== undefined &&
      (tf.conversions || 0) < filters.minConversions
    ) {
      return false;
    }
    if (
      filters.maxConversions !== undefined &&
      (tf.conversions || 0) > filters.maxConversions
    ) {
      return false;
    }

    return true;
  });
}
