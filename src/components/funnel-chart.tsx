'use client';

import React from 'react';
import { FunnelStage } from '@/lib/types/funnel';
import { 
  formatConversionRate, 
  formatCostPerAction, 
  formatLargeNumber 
} from '@/lib/utils/funnel-calculations';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface FunnelChartProps {
  funnelStages: FunnelStage[];
  totalCost: number;
  dateRange: { startDate: string; endDate: string };
  isLoading?: boolean;
}

export function FunnelChart({
  funnelStages,
  totalCost,
  dateRange,
  isLoading = false,
}: FunnelChartProps) {
  const formatDateRange = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const formatter = new Intl.DateTimeFormat('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
    return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
  };

  const calculateCPM = (spend: number, impressions: number): string => {
    if (impressions === 0) return '-';
    const cpm = (spend / impressions) * 1000;
    return `$${cpm.toFixed(2)}`;
  };

  if (isLoading) {
    return (
      <Card className="p-6 w-full">
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-6 w-36" />
          </div>
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-2">
        <div className="text-sm text-slate-600">
          <span className="font-medium">Period:</span>{' '}
          {formatDateRange(dateRange.startDate, dateRange.endDate)}
        </div>
        <div className="text-sm font-semibold text-slate-900">
          Media Spend:{' '}
          <span className="text-lg">${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>

      {/* Funnel Stages */}
      <div className="space-y-0">
        <TooltipProvider>
          {funnelStages.map((stage, index) => {
            const isFirstStage = index === 0;
            const isImpressions = stage.metricKey === 'impressions';
            
            // Calculate trapezoid width percentages based on position
            const topLeftPercent = 5 + (index * 3);
            const topRightPercent = 95 - (index * 3);
            const bottomLeftPercent = 5 + ((index + 1) * 3);
            const bottomRightPercent = 95 - ((index + 1) * 3);

            return (
              <Tooltip key={stage.id}>
                <TooltipTrigger asChild>
                  <div
                    className="funnel-stage-container relative group cursor-pointer transition-transform duration-200 hover:scale-[1.02] hover:z-10"
                    style={{
                      clipPath: `polygon(
                        ${topLeftPercent}% 0%,
                        ${topRightPercent}% 0%,
                        ${bottomRightPercent}% 100%,
                        ${bottomLeftPercent}% 100%
                      )`,
                      border: '2px solid #1e293b',
                      padding: '1.5rem',
                      background: 'white',
                      marginBottom: '-2px',
                      minHeight: '120px',
                    }}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center h-full">
                      {/* LEFT: Conversion Rate */}
                      <div className="text-left">
                        {!isFirstStage && stage.conversionRate !== undefined ? (
                          <div>
                            <div className="text-2xl font-bold text-slate-900">
                              {stage.conversionRate.toFixed(2)}%
                            </div>
                            <div className="text-sm text-slate-500 mt-1">
                              Conversion
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-slate-400">-</div>
                        )}
                      </div>

                      {/* CENTER: Stage Name and Value */}
                      <div className="text-center">
                        <div className="text-lg font-semibold text-slate-900 mb-1">
                          {stage.displayName}
                        </div>
                        <div className="text-xs text-slate-500 mb-2">
                          ({stage.eventName || stage.metricKey})
                        </div>
                        <div className="text-3xl font-bold text-slate-900">
                          {formatLargeNumber(stage.value)}
                        </div>
                      </div>

                      {/* RIGHT: Cost Per Action */}
                      <div className="text-right">
                        {stage.costPerAction !== undefined ? (
                          <div>
                            <div className="text-sm text-slate-600 mb-1">
                              {isImpressions ? 'Cost per 1,000 Imps' : `Cost per ${stage.displayName}`}
                            </div>
                            <div className="text-xl font-bold text-slate-900">
                              {isImpressions 
                                ? calculateCPM(totalCost, stage.value)
                                : formatCostPerAction(stage.costPerAction)
                              }
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-slate-400">-</div>
                        )}
                      </div>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="space-y-1">
                    <p className="font-semibold">{stage.displayName}</p>
                    <p className="text-xs">
                      <span className="text-slate-400">Source:</span> {stage.source.toUpperCase()}
                    </p>
                    <p className="text-xs">
                      <span className="text-slate-400">Metric:</span> {stage.eventName || stage.metricKey}
                    </p>
                    <p className="text-xs">
                      <span className="text-slate-400">Exact Value:</span> {stage.value.toLocaleString()}
                    </p>
                    {stage.conversionRate !== undefined && (
                      <p className="text-xs">
                        <span className="text-slate-400">Conversion:</span> {formatConversionRate(stage.conversionRate)}
                      </p>
                    )}
                    {stage.costPerAction !== undefined && (
                      <p className="text-xs">
                        <span className="text-slate-400">Cost:</span>{' '}
                        {isImpressions 
                          ? `${calculateCPM(totalCost, stage.value)} CPM`
                          : formatCostPerAction(stage.costPerAction)
                        }
                      </p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </div>

      {/* Legend */}
      <div className="mt-8 pt-4 border-t border-slate-200">
        <div className="flex flex-wrap gap-4 text-xs text-slate-500 justify-center">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span>Meta</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>Google Ads</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-500"></div>
            <span>GA4</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
