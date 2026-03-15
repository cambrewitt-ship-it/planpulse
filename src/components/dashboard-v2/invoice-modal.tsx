'use client';

import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { FileDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fetchSpendData, type SpendDataPoint } from '@/lib/api/analytics-data-integration';
import { getChannelDisplayNameFromPlatform } from '@/lib/utils/channel-pacing';
import type { MediaPlanChannel } from '@/components/media-plan-builder/media-plan-grid';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
}

interface InvoiceChannel {
  channelName: string;
  platform: string;
  accountName?: string;
  spend: number;
  detail: string;
  channelId?: string;
}

export function InvoiceModal({ isOpen, onClose, clientId, clientName }: InvoiceModalProps) {
  const [dateRange, setDateRange] = useState(() => {
    const today = new Date();
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    return {
      startDate: format(lastMonth, 'yyyy-MM-dd'),
      endDate: format(lastMonthEnd, 'yyyy-MM-dd'),
    };
  });

  const [spendData, setSpendData] = useState<SpendDataPoint[]>([]);
  const [mediaPlanChannels, setMediaPlanChannels] = useState<MediaPlanChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [channelDetails, setChannelDetails] = useState<Record<string, string>>({});
  const [commission, setCommission] = useState<number>(0);
  const [spendType, setSpendType] = useState<'actual' | 'planned'>('actual');

  // Fetch spend data and media plan builder data when date range changes
  useEffect(() => {
    if (!isOpen || !clientId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch actual spend data
        const spendResult = await fetchSpendData(
          dateRange.startDate,
          dateRange.endDate,
          clientId
        );
        setSpendData(spendResult.data || []);

        // Fetch media plan builder data for planned spend
        const mediaPlanResponse = await fetch(`/api/clients/${clientId}/media-plan-builder`);
        if (mediaPlanResponse.ok) {
          const mediaPlanResult = await mediaPlanResponse.json();
          if (mediaPlanResult.data) {
            const processedChannels = (mediaPlanResult.data.channels || []).map((channel: any) => ({
              ...channel,
              flights: (channel.flights || []).map((flight: any) => ({
                ...flight,
                startWeek: flight.startWeek ? new Date(flight.startWeek) : new Date(),
                endWeek: flight.endWeek ? new Date(flight.endWeek) : new Date(),
              })),
            }));
            setMediaPlanChannels(processedChannels);
            setCommission(mediaPlanResult.data.commission || 0);
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        setSpendData([]);
        setMediaPlanChannels([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, clientId, dateRange.startDate, dateRange.endDate]);

  // Calculate planned spend for a date range
  const calculatePlannedSpend = useMemo(() => {
    if (!mediaPlanChannels || mediaPlanChannels.length === 0) return new Map<string, number>();
    if (!dateRange?.startDate || !dateRange?.endDate) return new Map<string, number>();

    const plannedByChannel = new Map<string, number>();

    // Parse date parts to avoid UTC timezone offset issues
    const [startY, startM, startD] = dateRange.startDate.split('-').map(Number);
    const [endY, endM, endD] = dateRange.endDate.split('-').map(Number);

    let year = startY;
    let month = startM; // 1-based

    while (year < endY || (year === endY && month <= endM)) {
      const daysInMonth = new Date(year, month, 0).getDate();
      const monthStart = (year === startY && month === startM) ? startD : 1;
      const monthEnd = (year === endY && month === endM) ? endD : daysInMonth;
      const fraction = (monthEnd - monthStart + 1) / daysInMonth;

      const paddedKey = `${year}-${String(month).padStart(2, '0')}`;
      const unpaddedKey = `${year}-${month}`;

      mediaPlanChannels.forEach((channel) => {
        const channelKey = channel.id || channel.channelName || 'unknown';
        channel.flights?.forEach((flight) => {
          if (flight.monthlySpend) {
            const spend = flight.monthlySpend[paddedKey] ?? flight.monthlySpend[unpaddedKey] ?? 0;
            const currentTotal = plannedByChannel.get(channelKey) || 0;
            plannedByChannel.set(channelKey, currentTotal + Number(spend) * fraction);
          }
        });
      });

      month++;
      if (month > 12) { month = 1; year++; }
    }

    return plannedByChannel;
  }, [mediaPlanChannels, dateRange.startDate, dateRange.endDate]);

  // Group spend data by channel and calculate totals
  const invoiceChannels = useMemo(() => {
    if (spendType === 'planned') {
      // Use planned spend from media plan builder
      const channels: InvoiceChannel[] = [];
      mediaPlanChannels.forEach((channel) => {
        const channelKey = channel.id || channel.channelName || 'unknown';
        const plannedSpend = calculatePlannedSpend.get(channelKey) || 0;
        if (plannedSpend > 0) {
          channels.push({
            channelName: channel.channelName || 'Unknown Channel',
            platform: channel.channelName || 'unknown',
            accountName: undefined,
            spend: plannedSpend,
            detail: channelDetails[channelKey] || '',
            channelId: channelKey,
          });
        }
      });
      return channels;
    } else {
      // Use actual spend data
      const channelMap = new Map<string, InvoiceChannel>();

      spendData.forEach((point) => {
        const channelName = getChannelDisplayNameFromPlatform(point.platform);
        const key = `${point.platform}_${point.accountName || 'default'}`;

        if (!channelMap.has(key)) {
          channelMap.set(key, {
            channelName,
            platform: point.platform || 'unknown',
            accountName: point.accountName,
            spend: 0,
            detail: channelDetails[key] || '',
          });
        }

        const channel = channelMap.get(key)!;
        channel.spend += point.spend || 0;
      });

      // Filter out channels with no spend
      return Array.from(channelMap.values()).filter((ch) => ch.spend > 0);
    }
  }, [spendData, mediaPlanChannels, calculatePlannedSpend, spendType, channelDetails]);

  const handleDetailChange = (key: string, value: string) => {
    setChannelDetails((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatDateRange = (start: string, end: string): string => {
    try {
      const startDate = new Date(start);
      const endDate = new Date(end);
      return `${format(startDate, 'MMM d, yyyy')} - ${format(endDate, 'MMM d, yyyy')}`;
    } catch {
      return `${start} - ${end}`;
    }
  };

  const totalSpend = invoiceChannels.reduce((sum, ch) => sum + ch.spend, 0);

  // Calculate gross amount: gross = net / (1 - commission/100)
  const calculateGross = (net: number, commissionPercent: number): number => {
    if (commissionPercent <= 0 || commissionPercent >= 100) return net;
    return net / (1 - commissionPercent / 100);
  };

  const totalGross = invoiceChannels.reduce((sum, ch) => sum + calculateGross(ch.spend, commission), 0);

  const generatePDF = async () => {
    try {
      // Dynamic import to avoid SSR issues
      const { jsPDF } = await import('jspdf');
      
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      let yPos = margin;

      // Client Name
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text(clientName, margin, yPos);
      yPos += 15;

      // Invoice - Time Frame
      doc.setFontSize(16);
      doc.setFont('helvetica', 'normal');
      doc.text(`Invoice - ${formatDateRange(dateRange.startDate, dateRange.endDate)}`, margin, yPos);
      yPos += 20;

      // Spend Type and Commission info
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Spend Type: ${spendType === 'actual' ? 'Actual' : 'Planned'}`, margin, yPos);
      yPos += 7;
      if (commission > 0) {
        doc.text(`Commission: ${commission}%`, margin, yPos);
        yPos += 7;
      }
      yPos += 5;

      // Table headers
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      const colWidths = [80, 30, 30, 50];
      const headers = ['Media Channel', 'Net', 'Gross', 'Details'];
      let xPos = margin;
      
      headers.forEach((header, i) => {
        doc.text(header, xPos, yPos);
        xPos += colWidths[i];
      });
      yPos += 8;

      // Draw line under headers
      doc.setLineWidth(0.5);
      doc.line(margin, yPos - 2, pageWidth - margin, yPos - 2);
      yPos += 3;

      // Table rows
      doc.setFont('helvetica', 'normal');
      invoiceChannels.forEach((channel) => {
        // Check if we need a new page
        if (yPos > doc.internal.pageSize.getHeight() - 30) {
          doc.addPage();
          yPos = margin;
        }

        const grossAmount = calculateGross(channel.spend, commission);
        const key = spendType === 'planned' 
          ? (channel.channelId || channel.channelName || 'unknown')
          : `${channel.platform}_${channel.accountName || 'default'}`;
        const detail = channelDetails[key] || '';

        xPos = margin;
        const channelNameText = channel.channelName + (channel.accountName ? ` (${channel.accountName})` : '');
        
        // Split long channel names if needed
        const lines = doc.splitTextToSize(channelNameText, colWidths[0] - 2);
        doc.text(lines, xPos, yPos);
        xPos += colWidths[0];

        doc.text(formatCurrency(channel.spend), xPos, yPos);
        xPos += colWidths[1];

        doc.text(formatCurrency(grossAmount), xPos, yPos);
        xPos += colWidths[2];

        if (detail) {
          const detailLines = doc.splitTextToSize(detail, colWidths[3] - 2);
          doc.text(detailLines, xPos, yPos);
        }

        yPos += Math.max(7, lines.length * 7, detail ? (doc.splitTextToSize(detail, colWidths[3] - 2).length * 7) : 7);
      });

      // Total row
      yPos += 5;
      if (yPos > doc.internal.pageSize.getHeight() - 30) {
        doc.addPage();
        yPos = margin;
      }

      doc.setLineWidth(0.5);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 8;

      doc.setFont('helvetica', 'bold');
      doc.text('Total', margin, yPos);
      doc.text(formatCurrency(totalSpend), margin + colWidths[0], yPos);
      doc.text(formatCurrency(totalGross), margin + colWidths[0] + colWidths[1], yPos);

      // Save PDF
      const fileName = `Invoice_${clientName.replace(/\s+/g, '_')}_${formatDateRange(dateRange.startDate, dateRange.endDate).replace(/\s+/g, '_')}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please make sure jsPDF is installed: npm install jspdf');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invoice for {formatDateRange(dateRange.startDate, dateRange.endDate)}</DialogTitle>
          <DialogDescription>
            Review media channel spend for {clientName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date Range Picker, Spend Type, and Commission */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                Time Period:
              </label>
              <DateRangePicker value={dateRange} onChange={setDateRange} />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                Spend Type:
              </label>
              <div className="flex items-center gap-1 border border-gray-300 rounded-md overflow-hidden">
                <Button
                  type="button"
                  variant={spendType === 'actual' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSpendType('actual')}
                  className="rounded-none border-0 h-8 px-3"
                >
                  Actual
                </Button>
                <Button
                  type="button"
                  variant={spendType === 'planned' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSpendType('planned')}
                  className="rounded-none border-0 h-8 px-3"
                >
                  Planned
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                Commission:
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="99"
                  step="0.1"
                  value={commission}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value) || 0;
                    setCommission(Math.max(0, Math.min(99, value)));
                  }}
                  className="w-20"
                  placeholder="0"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="text-center py-8 text-gray-500">
              Loading spend data...
            </div>
          )}

          {/* Channel Rows */}
          {!loading && invoiceChannels.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No {spendType} spend found for the selected time period.
            </div>
          )}

          {!loading && invoiceChannels.length > 0 && (
            <>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 grid grid-cols-[2fr_1fr_1fr_2fr] gap-4">
                  <div className="font-semibold text-sm text-gray-700">Media Channel</div>
                  <div className="font-semibold text-sm text-gray-700 text-right">Net Amount</div>
                  <div className="font-semibold text-sm text-gray-700 text-right">Gross Amount</div>
                  <div className="font-semibold text-sm text-gray-700">Details</div>
                </div>
                <div className="divide-y divide-gray-200">
                  {invoiceChannels.map((channel, index) => {
                    const key = spendType === 'planned' 
                      ? (channel.channelId || channel.channelName || 'unknown')
                      : `${channel.platform}_${channel.accountName || 'default'}`;
                    const grossAmount = calculateGross(channel.spend, commission);
                    return (
                      <div
                        key={key}
                        className="px-4 py-3 grid grid-cols-[2fr_1fr_1fr_2fr] gap-4 items-center hover:bg-gray-50 transition-colors"
                      >
                        <div className="font-medium text-gray-900">
                          {channel.channelName}
                          {channel.accountName && (
                            <span className="text-xs text-gray-500 ml-2">
                              ({channel.accountName})
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-gray-900">
                            {formatCurrency(channel.spend)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-gray-900">
                            {formatCurrency(grossAmount)}
                          </div>
                        </div>
                        <div>
                          <Input
                            type="text"
                            placeholder="Add details..."
                            value={channelDetails[key] || ''}
                            onChange={(e) => handleDetailChange(key, e.target.value)}
                            className="w-full"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Total Row */}
                <div className="bg-gray-50 border-t-2 border-gray-300 px-4 py-3 grid grid-cols-[2fr_1fr_1fr_2fr] gap-4">
                  <div className="font-bold text-gray-900">Total</div>
                  <div className="text-right">
                    <div className="font-bold text-gray-900">
                      {formatCurrency(totalSpend)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-gray-900">
                      {formatCurrency(totalGross)}
                    </div>
                  </div>
                  <div></div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* PDF Button */}
        {!loading && invoiceChannels.length > 0 && (
          <DialogFooter className="flex justify-end">
            <Button
              onClick={generatePDF}
              variant="default"
              className="flex items-center gap-2"
            >
              <FileDown className="w-4 h-4" />
              Generate PDF
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
