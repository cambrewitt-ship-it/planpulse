'use client';

import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from './dropdown-menu';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { TimeFrame } from '@/lib/types/media-plan';
import {
  exportToCSV,
  exportToExcel,
  exportSummaryReport,
  ExportOptions,
} from '@/lib/utils/export-metrics';

interface MediaChannelExportButtonProps {
  timeFrames: TimeFrame[];
  channelName: string;
  platformType?: 'meta-ads' | 'google-ads' | 'organic' | 'other';
}

export function MediaChannelExportButton({
  timeFrames,
  channelName,
  platformType = 'other',
}: MediaChannelExportButtonProps) {
  const options: ExportOptions = {
    channelName,
    platformType,
    includeMetrics: true,
  };

  const handleExportCSV = () => {
    exportToCSV(timeFrames, options);
  };

  const handleExportExcel = () => {
    exportToExcel(timeFrames, options);
  };

  const handleExportSummary = () => {
    exportSummaryReport(timeFrames, options);
  };

  // Check if we have data to export
  const hasData = timeFrames.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2"
          disabled={!hasData}
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleExportCSV}>
          <FileText className="h-4 w-4 mr-2" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportExcel}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export for Excel
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleExportSummary}>
          <FileText className="h-4 w-4 mr-2" />
          Export Summary Report
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
