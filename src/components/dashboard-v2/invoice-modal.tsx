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
import type { MediaPlanChannel } from '@/components/legacy-plan-builder/media-plan-grid';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  onGenerated?: (invoice: { dateRange: { startDate: string; endDate: string }; generatedAt: string }) => void;
}

interface InvoiceChannel {
  channelName: string;
  platform: string;
  accountName?: string;
  spend: number;
  detail: string;
  channelId?: string;
}

export function InvoiceModal({ isOpen, onClose, clientId, clientName, onGenerated }: InvoiceModalProps) {
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
  const [channelQtys, setChannelQtys] = useState<Record<string, number>>({});
  const [commission, setCommission] = useState<number>(0);
  const [spendType, setSpendType] = useState<'actual' | 'planned'>('actual');
  const [agencySettings, setAgencySettings] = useState<Record<string, any>>({});

  // Per-invoice fields
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [issueDate, setIssueDate] = useState(todayStr);
  const [dueDate, setDueDate] = useState(todayStr);
  const [poNumber, setPoNumber] = useState('');
  const [clientBillingAddress, setClientBillingAddress] = useState('');

  // Fetch agency settings once on open; initialise invoice fields from them
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/settings/agency')
      .then(r => r.ok ? r.json() : {})
      .then((d: Record<string, any>) => {
        setAgencySettings(d ?? {});
        const dueDays = d?.invoice_due_days ?? 14;
        const due = new Date();
        due.setDate(due.getDate() + dueDays);
        setDueDate(format(due, 'yyyy-MM-dd'));
      })
      .catch(() => {});
  }, [isOpen]);

  // Auto-generate invoice number when end date changes (user can override)
  useEffect(() => {
    setInvoiceNumber(`INV-${dateRange.endDate.replace(/-/g, '').slice(0, 8)}`);
  }, [dateRange.endDate]);

  // Fetch client billing address on open
  useEffect(() => {
    if (!isOpen || !clientId) return;
    fetch(`/api/clients/${clientId}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => { if (d?.billing_address) setClientBillingAddress(d.billing_address); })
      .catch(() => {});
  }, [isOpen, clientId]);

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
      const { default: jsPDF } = await import('jspdf');

      // ── Design tokens (matching spec) ─────────────────────────────────────
      const NAVY  = '#16305A';
      const GOLD  = '#D4AF37';
      const BODY  = '#182236';
      const SEC   = '#33394a';
      const MUTED = '#5b6472';
      const LABEL = '#9aa2b0';
      const HAIR  = '#e4e7ed';
      const px = (p: number) => p / 1.333;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
      const W  = doc.internal.pageSize.getWidth();
      const H  = doc.internal.pageSize.getHeight();
      const ML = 16.51;
      const MT = 15.24;
      const CW = W - ML * 2;

      const set = (size: number, weight: 'bold' | 'normal', color: string) => {
        doc.setFontSize(px(size));
        doc.setFont('helvetica', weight);
        doc.setTextColor(color);
      };

      let y = MT;

      // ── Logo (load via canvas to get base64) ───────────────────────────────
      let logoB64: string | null = null;
      let logoFmt: 'PNG' | 'JPEG' = 'PNG';
      if (agencySettings.logo_url) {
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject();
            img.src = agencySettings.logo_url;
          });
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
          canvas.getContext('2d')!.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          logoB64 = dataUrl.split(',')[1];
          logoFmt = 'PNG';
        } catch { /* skip logo */ }
      }

      // ── Header ─────────────────────────────────────────────────────────────
      const LOGO_SIZE = 14;
      if (logoB64) doc.addImage(logoB64, logoFmt, ML, y, LOGO_SIZE, LOGO_SIZE);
      const atx = logoB64 ? ML + LOGO_SIZE + 3.7 : ML;

      set(17, 'bold', NAVY);
      doc.text(agencySettings.agency_name || '', atx, y + 6);

      const contactStr = [
        agencySettings.agency_address,
        [agencySettings.agency_email, agencySettings.agency_phone].filter(Boolean).join('  ·  '),
      ].filter(Boolean).join('\n');
      if (contactStr) {
        set(10.5, 'normal', MUTED);
        contactStr.split('\n').forEach((line: string, i: number) => doc.text(line, atx, y + 11 + i * 4));
      }

      // Invoice label — right
      const invNum = invoiceNumber || `INV-${dateRange.endDate.replace(/-/g, '').slice(0, 8)}`;
      set(26, 'bold', NAVY);
      doc.text('INVOICE', W - ML, y + 9, { align: 'right' });
      set(11, 'normal', MUTED);
      doc.text(invNum, W - ML, y + 15, { align: 'right' });

      y += Math.max(LOGO_SIZE, 18) + 2;

      // ── Gold divider ───────────────────────────────────────────────────────
      y += 5.8;
      doc.setFillColor(GOLD);
      doc.rect(ML, y, CW, 0.8, 'F');
      y += 0.8 + 5.3;

      // ── Three-column meta ──────────────────────────────────────────────────
      const COL  = (CW - 12) / 3;
      const col2 = ML + COL + 6;
      const col3 = ML + (COL + 6) * 2;

      const drawLabel = (text: string, lx: number, ly: number) => {
        set(9.5, 'bold', LABEL);
        doc.setCharSpace(0.4);
        doc.text(text.toUpperCase(), lx, ly);
        doc.setCharSpace(0);
      };

      drawLabel('Bill To', ML, y);
      y += 4;
      set(13, 'bold', NAVY);
      doc.text(clientName, ML, y);
      if (clientBillingAddress) {
        set(11, 'normal', MUTED);
        doc.text(clientBillingAddress, ML, y + 4.5);
      }

      const metaY = y - 4;
      drawLabel('Invoice Details', col2, metaY);
      const fmtD = (s: string) => {
        const [yr, mo, dy] = s.split('-').map(Number);
        return new Date(yr, mo - 1, dy).toLocaleDateString('en-NZ', { month: 'short', day: 'numeric', year: 'numeric' });
      };
      const metaRows: [string, string][] = [
        ['Issue date', fmtD(issueDate)],
        ['Due date',   fmtD(dueDate)],
        ['PO number',  poNumber || '—'],
      ];
      metaRows.forEach(([lbl, val], i) => {
        const ry = metaY + 4 + i * 5.5;
        set(11, 'normal', MUTED);
        doc.text(lbl, col2, ry);
        set(11, 'bold', SEC);
        doc.text(val, col2 + COL * 0.55, ry);
      });

      drawLabel('Campaign Period', col3, metaY);
      set(11, 'normal', SEC);
      [
        formatDateRange(dateRange.startDate, dateRange.endDate),
        `Spend type: ${spendType === 'actual' ? 'Actual' : 'Planned'}`,
        `Commission: ${commission}%`,
      ].forEach((line, i) => doc.text(line, col3, metaY + 4 + i * 5.5));

      y += 22;

      // ── Line items table ───────────────────────────────────────────────────
      y += 7;

      const fr    = CW / 7.6;
      const tCols = [fr * 2, fr * 2, fr * 0.6, fr, fr, fr];
      const tHdrs = ['Media Channel', 'Details', 'Qty', 'Rate (Net)', 'Commission', 'Gross'];

      set(9.5, 'bold', NAVY);
      doc.setCharSpace(0.3);
      let tx = ML;
      tHdrs.forEach((h, i) => {
        const isRight = i >= 2;
        doc.text(h.toUpperCase(), isRight ? tx + tCols[i] : tx, y, { align: isRight ? 'right' : 'left' });
        tx += tCols[i];
      });
      doc.setCharSpace(0);
      y += 3;

      doc.setDrawColor(NAVY);
      doc.setLineWidth(0.53);
      doc.line(ML, y, ML + CW, y);
      y += 3;

      for (const ch of invoiceChannels) {
        if (y > H - MT - 30) { doc.addPage(); y = MT; }

        const key = spendType === 'planned'
          ? (ch.channelId || ch.channelName || 'unknown')
          : `${ch.platform}_${ch.accountName || 'default'}`;
        const qty = channelQtys[key] ?? 1;
        const net = ch.spend * qty;
        const gross = calculateGross(net, commission);
        const commAmt = gross - net;
        const detail = channelDetails[key] || '';
        const nameText = ch.channelName + (ch.accountName ? ` (${ch.accountName})` : '');

        const rowY = y + 9 * 0.3528;
        tx = ML;

        set(11, 'bold', BODY);
        const nameLines = doc.splitTextToSize(nameText, tCols[0] - 2);
        doc.text(nameLines, tx, rowY);
        tx += tCols[0];

        if (detail) {
          set(11, 'normal', MUTED);
          doc.text(doc.splitTextToSize(detail, tCols[1] - 2), tx, rowY);
        }
        tx += tCols[1];

        set(11, 'normal', SEC);
        doc.text(String(qty), tx + tCols[2], rowY, { align: 'right' });
        tx += tCols[2];
        doc.text(formatCurrency(ch.spend), tx + tCols[3], rowY, { align: 'right' });
        tx += tCols[3];
        doc.text(formatCurrency(commAmt), tx + tCols[4], rowY, { align: 'right' });
        tx += tCols[4];

        set(11, 'bold', NAVY);
        doc.text(formatCurrency(gross), tx + tCols[5], rowY, { align: 'right' });

        y += Math.max(9 * 0.3528 * 2, nameLines.length * 4.5) + 3.18;

        doc.setDrawColor(HAIR);
        doc.setLineWidth(0.35);
        doc.line(ML, y, ML + CW, y);
      }

      // ── Totals ─────────────────────────────────────────────────────────────
      y += 6.35;
      const totW = 69;
      const totX = ML + CW - totW;
      // Recalculate totals with qty applied
      const qtyAdjustedNet   = invoiceChannels.reduce((s, ch) => {
        const k = spendType === 'planned' ? (ch.channelId || ch.channelName || 'unknown') : `${ch.platform}_${ch.accountName || 'default'}`;
        return s + ch.spend * (channelQtys[k] ?? 1);
      }, 0);
      const qtyAdjustedGross = invoiceChannels.reduce((s, ch) => {
        const k = spendType === 'planned' ? (ch.channelId || ch.channelName || 'unknown') : `${ch.platform}_${ch.accountName || 'default'}`;
        return s + calculateGross(ch.spend * (channelQtys[k] ?? 1), commission);
      }, 0);
      const totalCommission = qtyAdjustedGross - qtyAdjustedNet;

      const totRows: [string, string][] = [
        ['Net Spend',              formatCurrency(qtyAdjustedNet)],
        [`Commission (${commission}%)`, formatCurrency(totalCommission)],
      ];
      totRows.forEach(([lbl, val]) => {
        set(11.5, 'normal', MUTED);
        doc.text(lbl, totX, y);
        set(11.5, 'normal', SEC);
        doc.text(val, totX + totW, y, { align: 'right' });
        y += 5.5;
      });

      y += 3;
      doc.setDrawColor(NAVY);
      doc.setLineWidth(0.53);
      doc.line(totX, y, totX + totW, y);
      y += 4.5;

      set(14, 'bold', NAVY);
      doc.text('Total Due', totX, y);
      set(16, 'bold', NAVY);
      doc.text(formatCurrency(qtyAdjustedGross), totX + totW, y, { align: 'right' });

      // ── Footer ─────────────────────────────────────────────────────────────
      const footerY = H - MT - 20;
      doc.setDrawColor(HAIR);
      doc.setLineWidth(0.35);
      doc.line(ML, footerY - 4, ML + CW, footerY - 4);

      const halfW = (CW - 10.6) / 2;

      drawLabel('Payment Details', ML, footerY);
      set(10.5, 'normal', MUTED);
      [
        agencySettings.bank_name,
        agencySettings.bank_account_name ? `Account name: ${agencySettings.bank_account_name}` : '',
        agencySettings.bank_account_number ? `Account number: ${agencySettings.bank_account_number}` : '',
        `Reference: ${invNum}`,
      ].filter(Boolean).forEach((line, i) => doc.text(line, ML, footerY + 4 + i * 4.2));

      const notesX = ML + halfW + 10.6;
      drawLabel('Notes', notesX, footerY);
      if (agencySettings.invoice_notes) {
        set(10.5, 'normal', MUTED);
        doc.text(doc.splitTextToSize(agencySettings.invoice_notes, halfW), notesX, footerY + 4);
      }

      const fileName = `Invoice_${clientName.replace(/\s+/g, '_')}_${dateRange.startDate}_${dateRange.endDate}.pdf`;
      doc.save(fileName);
      onGenerated?.({ dateRange, generatedAt: new Date().toISOString() });
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF.');
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
          {/* Campaign settings row */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Time Period:</label>
              <DateRangePicker value={dateRange} onChange={setDateRange} />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Spend Type:</label>
              <div className="flex items-center gap-1 border border-gray-300 rounded-md overflow-hidden">
                <Button type="button" variant={spendType === 'actual' ? 'default' : 'outline'} size="sm" onClick={() => setSpendType('actual')} className="rounded-none border-0 h-8 px-3">Actual</Button>
                <Button type="button" variant={spendType === 'planned' ? 'default' : 'outline'} size="sm" onClick={() => setSpendType('planned')} className="rounded-none border-0 h-8 px-3">Planned</Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Commission:</label>
              <div className="flex items-center gap-2">
                <Input type="number" min="0" max="99" step="0.1" value={commission} onChange={(e) => setCommission(Math.max(0, Math.min(99, parseFloat(e.target.value) || 0)))} className="w-20" placeholder="0" />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </div>
          </div>

          {/* Invoice detail fields */}
          <div className="grid grid-cols-2 gap-3 border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Invoice #</label>
              <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="INV-20260731" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">PO Number</label>
              <Input value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder="Optional" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Issue Date</label>
              <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Due Date</label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Client Billing Address</label>
              <Input value={clientBillingAddress} onChange={e => setClientBillingAddress(e.target.value)} placeholder="e.g. Level 3, 123 Main St, Wellington" className="h-8 text-sm" />
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
                <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 grid grid-cols-[2fr_3rem_1fr_1fr_2fr] gap-3">
                  <div className="font-semibold text-sm text-gray-700">Media Channel</div>
                  <div className="font-semibold text-sm text-gray-700 text-right">Qty</div>
                  <div className="font-semibold text-sm text-gray-700 text-right">Net Amount</div>
                  <div className="font-semibold text-sm text-gray-700 text-right">Gross Amount</div>
                  <div className="font-semibold text-sm text-gray-700">Details</div>
                </div>
                <div className="divide-y divide-gray-200">
                  {invoiceChannels.map((channel) => {
                    const key = spendType === 'planned'
                      ? (channel.channelId || channel.channelName || 'unknown')
                      : `${channel.platform}_${channel.accountName || 'default'}`;
                    const qty = channelQtys[key] ?? 1;
                    const net = channel.spend * qty;
                    const grossAmount = calculateGross(net, commission);
                    return (
                      <div key={key} className="px-4 py-3 grid grid-cols-[2fr_3rem_1fr_1fr_2fr] gap-3 items-center hover:bg-gray-50 transition-colors">
                        <div className="font-medium text-gray-900">
                          {channel.channelName}
                          {channel.accountName && <span className="text-xs text-gray-500 ml-2">({channel.accountName})</span>}
                        </div>
                        <div>
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={qty}
                            onChange={e => setChannelQtys(prev => ({ ...prev, [key]: Math.max(1, parseInt(e.target.value) || 1) }))}
                            className="w-full text-right px-2 h-8 text-sm"
                          />
                        </div>
                        <div className="text-right font-semibold text-gray-900">{formatCurrency(net)}</div>
                        <div className="text-right font-semibold text-gray-900">{formatCurrency(grossAmount)}</div>
                        <div>
                          <Input
                            type="text"
                            placeholder="Add details..."
                            value={channelDetails[key] || ''}
                            onChange={(e) => handleDetailChange(key, e.target.value)}
                            className="w-full h-8 text-sm"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Total Row */}
                {(() => {
                  const adjNet   = invoiceChannels.reduce((s, ch) => { const k = spendType === 'planned' ? (ch.channelId || ch.channelName || 'unknown') : `${ch.platform}_${ch.accountName || 'default'}`; return s + ch.spend * (channelQtys[k] ?? 1); }, 0);
                  const adjGross = invoiceChannels.reduce((s, ch) => { const k = spendType === 'planned' ? (ch.channelId || ch.channelName || 'unknown') : `${ch.platform}_${ch.accountName || 'default'}`; return s + calculateGross(ch.spend * (channelQtys[k] ?? 1), commission); }, 0);
                  return (
                    <div className="bg-gray-50 border-t-2 border-gray-300 px-4 py-3 grid grid-cols-[2fr_3rem_1fr_1fr_2fr] gap-3">
                      <div className="font-bold text-gray-900">Total</div>
                      <div />
                      <div className="text-right font-bold text-gray-900">{formatCurrency(adjNet)}</div>
                      <div className="text-right font-bold text-gray-900">{formatCurrency(adjGross)}</div>
                      <div />
                    </div>
                  );
                })()}
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
