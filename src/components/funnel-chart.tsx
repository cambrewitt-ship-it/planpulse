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

interface Client {
  id: string;
  name: string;
  logo_url?: string | null;
}

interface FunnelChartProps {
  funnelStages: FunnelStage[];
  totalCost: number;
  dateRange: { startDate: string; endDate: string };
  isLoading?: boolean;
  client?: Client;
}

export function FunnelChart({
  funnelStages,
  totalCost,
  dateRange,
  isLoading = false,
  client,
}: FunnelChartProps) {
  const formatDateRange = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);

    const startDay = startDate.getDate();
    const endDay = endDate.getDate();

    const startMonthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' });
    const endMonthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' });

    const startMonth = startMonthFormatter.format(startDate);
    const endMonth = endMonthFormatter.format(endDate);

    // Add ordinal suffix
    const getOrdinalSuffix = (day: number) => {
      if (day > 3 && day < 21) return 'th';
      switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
      }
    };

    return `${startDay} ${startMonth} – ${endDay}${getOrdinalSuffix(endDay)} ${endMonth}`;
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
    <Card className="p-8 w-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div className="text-base text-slate-900">
          <span className="font-normal">Period:</span>{' '}
          {formatDateRange(dateRange.startDate, dateRange.endDate)}
        </div>
        <div className="flex items-center gap-8">
          <div className="text-base font-normal text-slate-900">
            Media Spend:{' '}
            <span className="font-semibold text-lg">
              ${totalCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
          {client?.logo_url && (
            <div className="flex items-center">
              <img
                src={client.logo_url}
                alt={`${client.name} logo`}
                className="h-10 w-auto object-contain"
              />
            </div>
          )}
        </div>
      </div>

      {/* Funnel Stages */}
      <div className="space-y-0 relative">
        {/* SVG Funnel Outline */}
        <svg
          className="absolute inset-0 pointer-events-none z-20"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%' }}
        >
          {funnelStages.map((_, index) => {
            const topLeftPercent = 20 + (index * 3.5);
            const topRightPercent = 80 - (index * 3.5);
            const bottomLeftPercent = 20 + ((index + 1) * 3.5);
            const bottomRightPercent = 80 - ((index + 1) * 3.5);

            const stageHeight = 100 / funnelStages.length;
            const y1 = index * stageHeight;
            const y2 = (index + 1) * stageHeight;

            return (
              <g key={`funnel-stage-${index}`}>
                {/* Top horizontal line */}
                <line
                  x1={topLeftPercent}
                  y1={y1}
                  x2={topRightPercent}
                  y2={y1}
                  stroke="#1e293b"
                  strokeWidth="0.6"
                />

                {/* Left side line */}
                <line
                  x1={topLeftPercent}
                  y1={y1}
                  x2={bottomLeftPercent}
                  y2={y2}
                  stroke="#1e293b"
                  strokeWidth="0.6"
                />

                {/* Right side line */}
                <line
                  x1={topRightPercent}
                  y1={y1}
                  x2={bottomRightPercent}
                  y2={y2}
                  stroke="#1e293b"
                  strokeWidth="0.6"
                />

                {/* Bottom horizontal line */}
                <line
                  x1={bottomLeftPercent}
                  y1={y2}
                  x2={bottomRightPercent}
                  y2={y2}
                  stroke="#1e293b"
                  strokeWidth="0.6"
                />
              </g>
            );
          })}
        </svg>
        
        <TooltipProvider>
          {funnelStages.map((stage, index) => {
            const isFirstStage = index === 0;
            const isImpressions = stage.metricKey === 'impressions';

            return (
              <Tooltip key={stage.id}>
                <TooltipTrigger asChild>
                  <div className="relative z-10">
                    {/* Horizontal dividing line (except after last stage) */}
                    {index < funnelStages.length - 1 && (
                      <div className="absolute left-0 right-0 bottom-0 h-px bg-slate-300 z-30" />
                    )}

                    <div className="funnel-stage-container relative group cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1 hover:z-10 bg-white py-6">
                      <div className="flex items-center h-full">
                        {/* LEFT: Conversion Rate - Outside funnel */}
                        <div className="flex-1 flex justify-center" style={{ maxWidth: '25%' }}>
                          {!isFirstStage && stage.conversionRate !== undefined ? (
                            <div className="text-center">
                              <div className="text-2xl font-bold text-slate-900">
                                {stage.conversionRate.toFixed(2)}%
                              </div>
                              <div className="text-sm text-slate-600 mt-1">
                                Conversion
                              </div>
                            </div>
                          ) : null}
                        </div>

                        {/* CENTER: Stage Name and Value - Inside funnel */}
                        <div className="flex-1 text-center">
                          <div className="text-lg font-semibold text-slate-900 mb-1">
                            {stage.displayName}
                          </div>
                          {stage.eventName && (
                            <div className="text-xs text-slate-500 mb-2">
                              ({stage.eventName})
                            </div>
                          )}
                          <div className="text-3xl font-bold text-slate-900">
                            {formatLargeNumber(stage.value)}
                          </div>
                        </div>

                        {/* RIGHT: Cost Per Action - Outside funnel */}
                        <div className="flex-1 flex justify-center" style={{ maxWidth: '25%' }}>
                          {stage.costPerAction !== undefined ? (
                            <div className="text-center">
                              <div className="text-sm text-slate-600 mb-1">
                                {isImpressions
                                  ? 'Cost per 1,000 Imps:'
                                  : `Cost per ${stage.displayName.replace(/s$/, '')}:`
                                }
                              </div>
                              <div className="text-xl font-bold text-slate-900">
                                {isImpressions
                                  ? calculateCPM(totalCost, stage.value)
                                  : formatCostPerAction(stage.costPerAction)
                                }
                              </div>
                            </div>
                          ) : null}
                        </div>
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
