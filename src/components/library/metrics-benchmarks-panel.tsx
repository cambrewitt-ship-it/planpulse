'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Edit2, RotateCcw, X } from 'lucide-react';
import type { ChannelBenchmark } from '@/types/database';

const pageFont: React.CSSProperties = { fontFamily: "'DM Sans', system-ui, sans-serif" };

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 2500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        background: '#1C1917',
        color: '#FDFCF8',
        borderRadius: 6,
        padding: '10px 16px',
        fontSize: 13,
        zIndex: 9999,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        ...pageFont,
      }}
    >
      {message}
    </div>
  );
}

function EditableRow({
  benchmark,
  onSaved,
}: {
  benchmark: ChannelBenchmark;
  onSaved: (updated: ChannelBenchmark) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(benchmark.benchmark_value));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(String(benchmark.benchmark_value));
  }, [benchmark.benchmark_value]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const handleSave = async () => {
    const num = parseFloat(value);
    if (isNaN(num)) {
      handleCancel();
      return;
    }
    if (num === benchmark.benchmark_value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/benchmarks/${benchmark.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ benchmark_value: num }),
      });
      if (!res.ok) throw new Error('Failed');
      const { data } = await res.json();
      onSaved(data);
      setEditing(false);
    } catch {
      setValue(String(benchmark.benchmark_value));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setValue(String(benchmark.benchmark_value));
    setEditing(false);
  };

  return (
    <tr className="group border-b last:border-0" style={{ borderColor: '#E8E4DC' }}>
      <td className="py-2.5 pr-4 text-sm" style={{ color: '#1C1917' }}>
        {benchmark.metric_label}
      </td>
      <td className="py-2.5 pr-4 text-sm w-28">
        {editing ? (
          <Input
            ref={inputRef}
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') handleCancel();
            }}
            className="h-7 w-24 text-sm"
            disabled={saving}
          />
        ) : (
          <span style={{ color: '#1C1917' }}>{benchmark.benchmark_value}</span>
        )}
      </td>
      <td className="py-2.5 pr-4 text-sm w-16" style={{ color: '#8A8578' }}>
        {benchmark.unit || '—'}
      </td>
      <td className="py-2.5 pr-4 text-sm w-28">
        {benchmark.direction === 'higher_is_better' ? (
          <span className="inline-flex items-center gap-1" style={{ color: '#16a34a' }}>
            <ArrowUp className="w-3 h-3" /> Higher
          </span>
        ) : (
          <span className="inline-flex items-center gap-1" style={{ color: '#dc2626' }}>
            <ArrowDown className="w-3 h-3" /> Lower
          </span>
        )}
      </td>
      <td className="py-2.5 w-16 text-right">
        {editing ? (
          <div className="flex items-center justify-end gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-emerald-600 hover:text-emerald-700"
              onClick={handleSave}
              disabled={saving}
            >
              <Check className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={handleCancel}
              disabled={saving}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => setEditing(true)}
          >
            <Edit2 className="h-3 w-3" />
          </Button>
        )}
      </td>
    </tr>
  );
}

function ChannelBenchmarkCard({
  channelName,
  rows,
  onRowSaved,
}: {
  channelName: string;
  rows: ChannelBenchmark[];
  onRowSaved: (updated: ChannelBenchmark) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card style={{ background: '#FDFCF8', border: '0.5px solid #E8E4DC', borderRadius: 6 }}>
      <CardHeader className="pb-2">
        <button
          className="flex items-center gap-2 w-full text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: '#8A8578' }} />
          ) : (
            <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: '#8A8578' }} />
          )}
          <CardTitle className="text-base" style={{ color: '#1C1917' }}>
            {channelName}
          </CardTitle>
          <span className="text-xs ml-1" style={{ color: '#8A8578' }}>
            {rows.length} metrics
          </span>
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <table className="w-full" style={pageFont}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid #E8E4DC' }}>
                <th className="text-left pb-2 pr-4 text-xs font-semibold" style={{ color: '#8A8578' }}>
                  Metric
                </th>
                <th className="text-left pb-2 pr-4 text-xs font-semibold w-28" style={{ color: '#8A8578' }}>
                  Benchmark
                </th>
                <th className="text-left pb-2 pr-4 text-xs font-semibold w-16" style={{ color: '#8A8578' }}>
                  Unit
                </th>
                <th className="text-left pb-2 pr-4 text-xs font-semibold w-28" style={{ color: '#8A8578' }}>
                  Direction
                </th>
                <th className="pb-2 w-16" />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <EditableRow key={b.id} benchmark={b} onSaved={onRowSaved} />
              ))}
            </tbody>
          </table>
        </CardContent>
      )}
    </Card>
  );
}

export function MetricsBenchmarksPanel() {
  const [benchmarks, setBenchmarks] = useState<ChannelBenchmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    loadBenchmarks();
  }, []);

  const loadBenchmarks = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/benchmarks');
      if (res.ok) {
        const { data } = await res.json();
        setBenchmarks(data || []);
      }
    } catch (error) {
      console.error('Error loading benchmarks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRowSaved = (updated: ChannelBenchmark) => {
    setBenchmarks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    setToast('Benchmark saved');
  };

  const handleReset = async () => {
    if (!confirm('Reset all benchmarks to defaults? Any custom values will be overwritten.')) return;
    try {
      setResetting(true);
      const res = await fetch('/api/benchmarks/reset', { method: 'POST' });
      if (!res.ok) throw new Error('Reset failed');
      await loadBenchmarks();
      setToast('Benchmarks reset to defaults');
    } catch {
      alert('Failed to reset benchmarks. Please try again.');
    } finally {
      setResetting(false);
    }
  };

  const grouped = benchmarks.reduce<Record<string, ChannelBenchmark[]>>((acc, b) => {
    if (!acc[b.channel_name]) acc[b.channel_name] = [];
    acc[b.channel_name].push(b);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-md animate-pulse" style={{ background: '#E8E4DC' }} />
        ))}
      </div>
    );
  }

  return (
    <div style={pageFont}>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      <div className="flex items-center justify-between mb-6">
        <p className="text-sm" style={{ color: '#8A8578' }}>
          Industry benchmark values used to evaluate channel performance. Hover a row and click the edit icon to update a value.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          disabled={resetting}
          className="flex-shrink-0 ml-4"
          style={{ border: '0.5px solid #E8E4DC', color: '#8A8578' }}
        >
          <RotateCcw className="w-3 h-3 mr-1.5" />
          {resetting ? 'Resetting...' : 'Reset to Defaults'}
        </Button>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <Card style={{ background: '#FDFCF8', border: '0.5px solid #E8E4DC', borderRadius: 6 }}>
          <CardContent className="text-center py-12">
            <p style={{ color: '#8A8578' }}>
              No benchmarks found. Run <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">npm run seed:benchmarks</code> to populate defaults.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([channelName, rows]) => (
            <ChannelBenchmarkCard
              key={channelName}
              channelName={channelName}
              rows={rows}
              onRowSaved={handleRowSaved}
            />
          ))}
        </div>
      )}
    </div>
  );
}
