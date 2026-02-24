'use client';

import React from 'react';
import { FunnelStage, CombinedMetric } from '@/lib/types/funnel';
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

  const SOURCE_METRICS = {
    meta: [
      { value: 'impressions', label: 'Impressions' },
      { value: 'clicks', label: 'Clicks' },
      { value: 'link_clicks', label: 'Link Clicks' },
      { value: 'conversions', label: 'Conversions' },
      { value: 'spend', label: 'Spend' },
    ],
    google: [
      { value: 'impressions', label: 'Impressions' },
      { value: 'clicks', label: 'Clicks' },
      { value: 'conversions', label: 'Conversions' },
      { value: 'spend', label: 'Spend' },
    ],
    ga4: [
      { value: 'activeUsers', label: 'Active Users' },
      { value: 'totalUsers', label: 'Total Users' },
      { value: 'sessions', label: 'Sessions' },
      { value: 'conversions', label: 'Conversions' },
      { value: 'screenPageViews', label: 'Page Views' },
      { value: 'eventCount', label: 'Custom Event' },
    ],
  };

  const formatCombinedMetricsDisplay = (combinedMetrics: CombinedMetric[]): string => {
    return combinedMetrics.map((cm, index) => {
      const metricLabel = SOURCE_METRICS[cm.source].find(m => m.value === cm.metricKey)?.label || cm.metricKey;
      const platformName = cm.platformName || (cm.source === 'meta' ? 'Meta' : cm.source === 'google' ? 'Google Search' : 'GA4');
      const display = `${platformName} | ${metricLabel}`;
      return index > 0 ? ` + ${display}` : display;
    }).join('');
  };

  const getClientInitials = (clientName: string): string => {
    const words = clientName.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    } else if (words.length === 1 && words[0].length >= 2) {
      return words[0].substring(0, 2).toUpperCase();
    } else if (words.length === 1 && words[0].length === 1) {
      return words[0].toUpperCase() + words[0].toUpperCase();
    }
    return '??';
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
      <div className="flex justify-between items-center mb-6">
        {/* Left: Period */}
        <div className="text-base text-slate-900 flex-1">
          <span className="font-normal">Period:</span>{' '}
          {formatDateRange(dateRange.startDate, dateRange.endDate)}
        </div>
        
        {/* Center: Media Spend */}
        <div className="text-base font-normal text-slate-900 flex-1 text-center">
          Media Spend:{' '}
          <span className="font-semibold text-lg">
            ${totalCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>
        
        {/* Right: Client Logo or Initials */}
        <div className="flex-1 flex justify-end items-center">
          {client ? (
            client.logo_url ? (
              <div className="flex items-center">
                <img
                  src={client.logo_url}
                  alt={`${client.name} logo`}
                  className="h-10 w-auto object-contain"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-10 w-10 rounded bg-slate-200">
                <span className="text-sm font-semibold text-slate-600">
                  {getClientInitials(client.name)}
                </span>
              </div>
            )
          ) : null}
        </div>
      </div>

      {/* Funnel Stages */}
      <div className="space-y-0 relative" style={{ display: 'grid', gridTemplateRows: `repeat(${funnelStages.length}, 1fr)` }}>
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
                {/* Top horizontal line - inside funnel (skip for first stage) */}
                {index > 0 && (
                  <>
                    <line
                      x1={topLeftPercent}
                      y1={y1}
                      x2={topRightPercent}
                      y2={y1}
                      stroke="#1e293b"
                      strokeWidth="0.6"
                    />

                    {/* Top horizontal line - left side (outside funnel) */}
                    <line
                      x1={0}
                      y1={y1}
                      x2={topLeftPercent}
                      y2={y1}
                      stroke="#cbd5e1"
                      strokeWidth="0.6"
                    />

                    {/* Top horizontal line - right side (outside funnel) */}
                    <line
                      x1={topRightPercent}
                      y1={y1}
                      x2={100}
                      y2={y1}
                      stroke="#cbd5e1"
                      strokeWidth="0.6"
                    />
                  </>
                )}

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

                {/* Bottom horizontal line - inside funnel (skip for last stage) */}
                {index < funnelStages.length - 1 && (
                  <>
                    <line
                      x1={bottomLeftPercent}
                      y1={y2}
                      x2={bottomRightPercent}
                      y2={y2}
                      stroke="#1e293b"
                      strokeWidth="0.6"
                    />

                    {/* Bottom horizontal line - left side (outside funnel) */}
                    <line
                      x1={0}
                      y1={y2}
                      x2={bottomLeftPercent}
                      y2={y2}
                      stroke="#cbd5e1"
                      strokeWidth="0.6"
                    />

                    {/* Bottom horizontal line - right side (outside funnel) */}
                    <line
                      x1={bottomRightPercent}
                      y1={y2}
                      x2={100}
                      y2={y2}
                      stroke="#cbd5e1"
                      strokeWidth="0.6"
                    />
                  </>
                )}
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
                    <div className="funnel-stage-container relative group cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1 hover:z-10 bg-white py-6 flex items-center h-full">
                      <div className="flex items-center w-full h-full">
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
                          {/* Show combined metrics if present */}
                          {stage.combinedMetrics && stage.combinedMetrics.length > 0 && (
                            <div className="text-xs text-slate-600 mb-2 font-medium">
                              {formatCombinedMetricsDisplay(stage.combinedMetrics)}
                            </div>
                          )}
                          {/* Show single metric event name if not combined */}
                          {!stage.combinedMetrics && stage.eventName && (
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
                              <div className="text-2xl font-bold text-slate-900 mb-1">
                                {isImpressions
                                  ? calculateCPM(totalCost, stage.value)
                                  : formatCostPerAction(stage.costPerAction)
                                }
                              </div>
                              <div className="text-sm text-slate-600">
                                {isImpressions
                                  ? 'Cost per 1,000 Imps:'
                                  : `Cost per ${stage.displayName.replace(/s$/, '')}:`
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
                    {stage.combinedMetrics && stage.combinedMetrics.length > 0 ? (
                      <>
                        <p className="text-xs font-medium text-slate-600 mb-1">Combined Metrics:</p>
                        {stage.combinedMetrics.map((cm, idx) => {
                          const metricLabel = SOURCE_METRICS[cm.source].find(m => m.value === cm.metricKey)?.label || cm.metricKey;
                          const platformName = cm.platformName || (cm.source === 'meta' ? 'Meta' : cm.source === 'google' ? 'Google Search' : 'GA4');
                          return (
                            <p key={idx} className="text-xs pl-2">
                              {platformName} | {metricLabel}
                              {cm.eventName && <span className="text-slate-500"> ({cm.eventName})</span>}
                            </p>
                          );
                        })}
                      </>
                    ) : (
                      <>
                        <p className="text-xs">
                          <span className="text-slate-400">Source:</span> {stage.source.toUpperCase()}
                        </p>
                        <p className="text-xs">
                          <span className="text-slate-400">Metric:</span> {stage.eventName || stage.metricKey}
                        </p>
                      </>
                    )}
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
