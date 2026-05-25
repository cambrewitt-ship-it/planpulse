'use client';

import { useState } from 'react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
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
import { Button } from '@/components/ui/button';

interface ReportBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
}

const SECTIONS = [
  { id: 'summary', label: 'Executive Summary', description: 'Health status, AI-written narrative' },
  { id: 'spend', label: 'Spend Overview', description: 'Planned vs actual by channel' },
  { id: 'channels', label: 'Channel Performance', description: 'Impressions, clicks, CTR, CPC' },
  { id: 'actions', label: 'Action Points', description: 'Completed, outstanding, overdue' },
] as const;

export function ReportBuilderModal({ isOpen, onClose, clientId, clientName }: ReportBuilderModalProps) {
  const [dateRange, setDateRange] = useState(() => {
    const lastMonth = subMonths(new Date(), 1);
    return {
      startDate: format(startOfMonth(lastMonth), 'yyyy-MM-dd'),
      endDate: format(endOfMonth(lastMonth), 'yyyy-MM-dd'),
    };
  });

  const [selectedSections, setSelectedSections] = useState<Set<string>>(
    new Set(SECTIONS.map(s => s.id))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSection(id: string) {
    setSelectedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  async function handleGenerate() {
    if (selectedSections.size === 0) {
      setError('Select at least one section.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/clients/${clientId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_date: dateRange.startDate,
          end_date: dateRange.endDate,
          sections: Array.from(selectedSections),
          format: 'pdf',
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Failed to generate report (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Report_${clientName.replace(/\s+/g, '_')}_${dateRange.startDate}_${dateRange.endDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate Report — {clientName}</DialogTitle>
          <DialogDescription>
            Choose a date range and the sections to include in the PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Time Period:</label>
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Sections</p>
            <div className="space-y-2">
              {SECTIONS.map(section => (
                <label
                  key={section.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedSections.has(section.id)}
                    onChange={() => toggleSection(section.id)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{section.label}</p>
                    <p className="text-xs text-gray-500">{section.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={loading || selectedSections.size === 0}>
            {loading ? (
              'Generating...'
            ) : (
              <>
                <FileDown className="w-4 h-4 mr-2" />
                Generate PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
