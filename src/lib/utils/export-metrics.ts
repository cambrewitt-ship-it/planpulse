/**
 * Utility functions for exporting performance metrics to CSV and Excel formats
 */

import { TimeFrame } from '@/lib/types/media-plan';
import { format, parseISO } from 'date-fns';

export interface ExportOptions {
  channelName: string;
  platformType?: 'meta-ads' | 'google-ads' | 'organic' | 'other';
  includeMetrics?: boolean;
  dateRange?: { start: string; end: string };
}

/**
 * Convert timeframes to CSV format
 */
export function exportToCSV(
  timeFrames: TimeFrame[],
  options: ExportOptions
): void {
  const { channelName, platformType = 'other', includeMetrics = true } = options;

  // Prepare CSV headers
  const headers = [
    'Period',
    'Start Date',
    'End Date',
    'Planned Budget',
    'Actual Spend',
    'Variance',
    'Variance %',
  ];

  if (includeMetrics) {
    headers.push(
      'Impressions',
      'Clicks',
      'CTR (%)',
      'CPC ($)',
    );

    if (platformType === 'google-ads') {
      headers.push('Conversions', 'Conversion Rate (%)');
    } else if (platformType === 'meta-ads') {
      headers.push('Reach', 'CPM ($)', 'Frequency');
    }
  }

  // Prepare CSV rows
  const rows = timeFrames.map((tf) => {
    const variance = tf.actual - tf.planned;
    const variancePercent = tf.planned > 0 ? (variance / tf.planned) * 100 : 0;

    const baseRow = [
      tf.period,
      tf.startDate,
      tf.endDate,
      tf.planned.toFixed(2),
      tf.actual.toFixed(2),
      variance.toFixed(2),
      variancePercent.toFixed(2),
    ];

    if (includeMetrics) {
      const metricsRow = [
        (tf.impressions || 0).toString(),
        (tf.clicks || 0).toString(),
        ((tf.ctr || 0) * 100).toFixed(2),
        (tf.cpc || 0).toFixed(2),
      ];

      if (platformType === 'google-ads') {
        const conversionRate =
          tf.conversions && tf.clicks
            ? (tf.conversions / tf.clicks) * 100
            : 0;
        metricsRow.push(
          (tf.conversions || 0).toString(),
          conversionRate.toFixed(2)
        );
      } else if (platformType === 'meta-ads') {
        metricsRow.push(
          (tf.reach || 0).toString(),
          (tf.cpm || 0).toFixed(2),
          (tf.frequency || 0).toFixed(2)
        );
      }

      baseRow.push(...metricsRow);
    }

    return baseRow;
  });

  // Combine headers and rows
  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(','))
    .join('\n');

  // Create and trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  const filename = `${channelName.replace(/\s+/g, '_')}_metrics_${format(
    new Date(),
    'yyyy-MM-dd'
  )}.csv`;

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Convert timeframes to Excel-compatible format
 * Uses CSV with better Excel compatibility
 */
export function exportToExcel(
  timeFrames: TimeFrame[],
  options: ExportOptions
): void {
  const { channelName, platformType = 'other', includeMetrics = true } = options;

  // Add UTF-8 BOM for Excel compatibility
  const BOM = '\uFEFF';

  // Prepare headers
  const headers = [
    'Period',
    'Start Date',
    'End Date',
    'Planned Budget',
    'Actual Spend',
    'Variance',
    'Variance %',
  ];

  if (includeMetrics) {
    headers.push(
      'Impressions',
      'Clicks',
      'CTR (%)',
      'CPC ($)',
    );

    if (platformType === 'google-ads') {
      headers.push('Conversions', 'Conversion Rate (%)');
    } else if (platformType === 'meta-ads') {
      headers.push('Reach', 'CPM ($)', 'Frequency');
    }
  }

  // Prepare rows
  const rows = timeFrames.map((tf) => {
    const variance = tf.actual - tf.planned;
    const variancePercent = tf.planned > 0 ? (variance / tf.planned) * 100 : 0;

    const baseRow = [
      tf.period,
      tf.startDate,
      tf.endDate,
      tf.planned.toFixed(2),
      tf.actual.toFixed(2),
      variance.toFixed(2),
      variancePercent.toFixed(2),
    ];

    if (includeMetrics) {
      const metricsRow = [
        (tf.impressions || 0).toString(),
        (tf.clicks || 0).toString(),
        ((tf.ctr || 0) * 100).toFixed(2),
        (tf.cpc || 0).toFixed(2),
      ];

      if (platformType === 'google-ads') {
        const conversionRate =
          tf.conversions && tf.clicks
            ? (tf.conversions / tf.clicks) * 100
            : 0;
        metricsRow.push(
          (tf.conversions || 0).toString(),
          conversionRate.toFixed(2)
        );
      } else if (platformType === 'meta-ads') {
        metricsRow.push(
          (tf.reach || 0).toString(),
          (tf.cpm || 0).toFixed(2),
          (tf.frequency || 0).toFixed(2)
        );
      }

      baseRow.push(...metricsRow);
    }

    return baseRow;
  });

  // Create CSV content with BOM
  const csvContent =
    BOM +
    [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

  // Create and trigger download
  const blob = new Blob([csvContent], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  const filename = `${channelName.replace(/\s+/g, '_')}_metrics_${format(
    new Date(),
    'yyyy-MM-dd'
  )}.csv`;

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Generate summary statistics for export
 */
export function generateSummaryStats(timeFrames: TimeFrame[]) {
  const totalPlanned = timeFrames.reduce((sum, tf) => sum + tf.planned, 0);
  const totalActual = timeFrames.reduce((sum, tf) => sum + tf.actual, 0);
  const totalImpressions = timeFrames.reduce(
    (sum, tf) => sum + (tf.impressions || 0),
    0
  );
  const totalClicks = timeFrames.reduce((sum, tf) => sum + (tf.clicks || 0), 0);
  const totalConversions = timeFrames.reduce(
    (sum, tf) => sum + (tf.conversions || 0),
    0
  );

  const avgCTR = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const avgCPC = totalClicks > 0 ? totalActual / totalClicks : 0;

  return {
    totalPlanned,
    totalActual,
    variance: totalActual - totalPlanned,
    variancePercent:
      totalPlanned > 0 ? ((totalActual - totalPlanned) / totalPlanned) * 100 : 0,
    totalImpressions,
    totalClicks,
    totalConversions,
    avgCTR,
    avgCPC,
  };
}

/**
 * Export summary report with aggregated statistics
 */
export function exportSummaryReport(
  timeFrames: TimeFrame[],
  options: ExportOptions
): void {
  const { channelName, platformType = 'other' } = options;
  const stats = generateSummaryStats(timeFrames);

  const summaryContent = [
    `Performance Summary Report`,
    `Channel: ${channelName}`,
    `Platform: ${platformType}`,
    `Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`,
    ``,
    `Budget Summary`,
    `Total Planned Budget: $${stats.totalPlanned.toFixed(2)}`,
    `Total Actual Spend: $${stats.totalActual.toFixed(2)}`,
    `Variance: $${stats.variance.toFixed(2)} (${stats.variancePercent.toFixed(2)}%)`,
    ``,
    `Performance Summary`,
    `Total Impressions: ${stats.totalImpressions.toLocaleString()}`,
    `Total Clicks: ${stats.totalClicks.toLocaleString()}`,
    `Average CTR: ${(stats.avgCTR * 100).toFixed(2)}%`,
    `Average CPC: $${stats.avgCPC.toFixed(2)}`,
  ];

  if (platformType === 'google-ads') {
    summaryContent.push(
      `Total Conversions: ${stats.totalConversions.toLocaleString()}`
    );
  }

  // Add detailed data
  summaryContent.push(``, `Detailed Data`, ``);

  // Export combined summary + detailed data
  const headers = [
    'Period',
    'Start Date',
    'Planned',
    'Actual',
    'Impressions',
    'Clicks',
    'CTR %',
    'CPC $',
  ];

  if (platformType === 'google-ads') {
    headers.push('Conversions');
  }

  const rows = timeFrames.map((tf) => [
    tf.period,
    tf.startDate,
    tf.planned.toFixed(2),
    tf.actual.toFixed(2),
    (tf.impressions || 0).toString(),
    (tf.clicks || 0).toString(),
    ((tf.ctr || 0) * 100).toFixed(2),
    (tf.cpc || 0).toFixed(2),
    ...(platformType === 'google-ads' ? [(tf.conversions || 0).toString()] : []),
  ]);

  const detailedData = [headers, ...rows]
    .map((row) => row.join(','))
    .join('\n');

  const fullContent = [...summaryContent, detailedData].join('\n');

  // Create and trigger download
  const blob = new Blob([fullContent], { type: 'text/plain;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  const filename = `${channelName.replace(/\s+/g, '_')}_summary_${format(
    new Date(),
    'yyyy-MM-dd'
  )}.txt`;

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
