"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Plus, Trash2, Upload, Download, X, Check, Edit2, ChevronDown, Loader2, Calendar } from "lucide-react";
import type { SandboxPlan, PlanRow, Flight, Week, FeeRow, CustomColumn } from "./types";
import { FLIGHT_COLORS } from "./types";
import { getChannelLogo, PRESET_CHANNELS } from "@/lib/utils/channel-icons";
import { nzToday } from "@/lib/timezone";

// ── Constants ─────────────────────────────────────────────────────────────────

const COL_WIDTHS = { del: 32, channel: 230, total: 110 };
const CUSTOM_COL_W = 140;
const WEEK_W = 72;
const WEEK_W_MIN = 28;
const WEEK_W_MAX = 120;
const WEEK_W_STEP = 8;
const WEEK_W_DEFAULT = Math.round(WEEK_W * 0.78); // starting zoom = 78%
const ROW_H = 38;
const HEADER_H = 32;

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10); }

function totalForRow(row: PlanRow): number {
  return row.flights.reduce((s, f) => s + f.budget, 0);
}

function fmt(n: number): string {
  if (n === 0) return "";
  return "$" + n.toLocaleString();
}

function groupWeeksByMonth(weeks: Week[]): Array<{ month: string; year: number; count: number }> {
  const groups: Array<{ month: string; year: number; count: number }> = [];
  for (const w of weeks) {
    const last = groups[groups.length - 1];
    if (last && last.month === w.month && last.year === w.year) {
      last.count++;
    } else {
      groups.push({ month: w.month, year: w.year, count: 1 });
    }
  }
  return groups;
}

function generateWeeksForYear(year: number, count: number): Week[] {
  const short = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const full  = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const jan1 = new Date(year, 0, 1);
  const dow = jan1.getDay(); // 0=Sun
  const toMonday = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
  const firstMonday = new Date(year, 0, 1 + toMonday);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(firstMonday);
    d.setDate(firstMonday.getDate() + i * 7);
    const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    // Assign to the month that contains ≥4 of the 7 days (Mon–Sun)
    const lastOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const daysInStartMonth = Math.min(7, lastOfMonth - d.getDate() + 1);
    let wMonth: string, wYear: number;
    if (daysInStartMonth >= 4) {
      wMonth = full[d.getMonth()]; wYear = d.getFullYear();
    } else {
      const nextM = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      wMonth = full[nextM.getMonth()]; wYear = nextM.getFullYear();
    }
    return { weekStart: iso, label: `${d.getDate()}-${short[d.getMonth()]}`, month: wMonth, year: wYear };
  });
}

interface RowSpan {
  showChannel: boolean; channelSpan: number;
}

function computeRowSpans(rows: PlanRow[]): RowSpan[] {
  const result: RowSpan[] = rows.map(() => ({ showChannel: false, channelSpan: 1 }));
  let i = 0;
  while (i < rows.length) {
    const channel = rows[i].channel;
    let j = i;
    while (j < rows.length && rows[j].channel === channel && channel !== "") j++;
    if (j === i) j = i + 1; // empty channel: no span
    result[i].showChannel = true;
    result[i].channelSpan = j - i;
    i = j;
  }
  return result;
}

function flightAtWeek(row: PlanRow, weekStart: string): Flight | null {
  return row.flights.find(f => f.startWeek <= weekStart && weekStart <= f.endWeek) ?? null;
}

function weekSpanForFlight(flight: Flight, weeks: Week[]): number {
  return weeks.filter(w => w.weekStart >= flight.startWeek && w.weekStart <= flight.endWeek).length;
}

function weekTotals(rows: PlanRow[], weeks: Week[]): number[] {
  return weeks.map(w =>
    rows.reduce((sum, row) => {
      const f = flightAtWeek(row, w.weekStart);
      return sum + (f ? f.budget / Math.max(1, weekSpanForFlight(f, weeks)) : 0);
    }, 0)
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lighten(hex: string, amt = 30): string {
  const [r, g, b] = hexToRgb(hex);
  const clamp = (v: number) => Math.min(255, v + amt);
  return `#${[clamp(r), clamp(g), clamp(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

// ── Flight edit popover ───────────────────────────────────────────────────────

interface FlightPopoverProps {
  flight: Flight;
  onSave: (budget: number, color: string) => void;
  onDelete: () => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

function FlightPopover({ flight, onSave, onDelete, onClose, anchorRef }: FlightPopoverProps) {
  const [budget, setBudget] = useState(String(flight.budget));
  const [color, setColor] = useState(flight.color);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, anchorRef]);

  return (
    <div
      ref={popRef}
      className="absolute z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-56"
      style={{ top: "calc(100% + 4px)", left: 0 }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-700">Edit flight</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
      </div>
      <label className="text-xs text-gray-500 block mb-1">Budget</label>
      <input
        autoFocus
        type="text"
        inputMode="numeric"
        value={budget}
        onChange={e => setBudget(e.target.value.replace(/[^0-9.]/g, ""))}
        onKeyDown={e => {
          if (e.key === "Enter") onSave(Math.max(0, parseFloat(budget) || 0), color);
          if (e.key === "Escape") onClose();
        }}
        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
        placeholder="0"
      />
      <label className="text-xs text-gray-500 block mb-2">Colour</label>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {FLIGHT_COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)}
            className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
            style={{ background: c, borderColor: color === c ? "#1d4ed8" : "transparent" }}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSave(Math.max(0, parseFloat(budget) || 0), color)}
          className="flex-1 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 flex items-center justify-center gap-1"
        >
          <Check className="w-3 h-3" /> Save
        </button>
        <button onClick={onDelete} className="py-1.5 px-2.5 border border-red-200 text-red-500 rounded-lg text-xs hover:bg-red-50">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Budget prompt (after drag) ────────────────────────────────────────────────

interface BudgetPromptProps {
  defaultColor: string;
  onConfirm: (budget: number, color: string) => void;
  onCancel: () => void;
  pos: { x: number; y: number };
}

function BudgetPrompt({ defaultColor, onConfirm, onCancel, pos }: BudgetPromptProps) {
  const [budget, setBudget] = useState("");
  const [color, setColor] = useState(defaultColor);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onCancel]);

  const modalW = 256;
  const modalH = 290;
  const left = Math.min(Math.max(8, pos.x - modalW / 2), (typeof window !== 'undefined' ? window.innerWidth : 1200) - modalW - 8);
  const top = pos.y + modalH > (typeof window !== 'undefined' ? window.innerHeight : 800) - 16
    ? pos.y - modalH - 8
    : pos.y + 8;

  return (
    <div ref={ref} className="fixed z-50" style={{ left, top }}>
      <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl p-5" style={{ width: modalW }}>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">New flight</h3>
        <label className="text-xs text-gray-500 block mb-1">Budget</label>
        <input
          autoFocus type="number" value={budget}
          onChange={e => setBudget(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") onConfirm(Math.max(0, parseInt(budget) || 0), color);
            if (e.key === "Escape") onCancel();
          }}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="e.g. 5000"
        />
        <label className="text-xs text-gray-500 block mb-2">Colour</label>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {FLIGHT_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
              style={{ background: c, borderColor: color === c ? "#1d4ed8" : "transparent" }}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onConfirm(Math.max(0, parseInt(budget) || 0), color)}
            className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Add flight
          </button>
          <button onClick={onCancel} className="py-2 px-3 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add row modal ─────────────────────────────────────────────────────────────

interface AddRowModalProps {
  existingFunnels: string[];
  existingChannels: string[];
  onAdd: (row: Omit<PlanRow, "id" | "flights">) => void;
  onClose: () => void;
}

function AddRowModal({ existingFunnels, existingChannels, onAdd, onClose }: AddRowModalProps) {
  const [funnel, setFunnel] = useState(existingFunnels[0] ?? "");
  const [channel, setChannel] = useState("");
  const [detail, setDetail] = useState("");
  const [audience, setAudience] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-96">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Add row</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          {[
            { label: "Funnel stage", value: funnel, set: setFunnel, suggestions: existingFunnels, placeholder: "e.g. AWARENESS" },
            { label: "Channel", value: channel, set: setChannel, suggestions: existingChannels, placeholder: "e.g. META" },
            { label: "Detail / format", value: detail, set: setDetail, suggestions: [], placeholder: "e.g. APP INSTALLS" },
            { label: "Audience", value: audience, set: setAudience, suggestions: [], placeholder: "e.g. LOOKALIKE" },
          ].map(({ label, value, set, suggestions, placeholder }) => (
            <div key={label}>
              <label className="text-xs text-gray-500 block mb-1">{label}</label>
              <input
                list={`${label}-list`} value={value} onChange={e => set(e.target.value)}
                placeholder={placeholder}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {suggestions.length > 0 && (
                <datalist id={`${label}-list`}>{suggestions.map(s => <option key={s} value={s} />)}</datalist>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-5">
          <button
            onClick={() => { if (channel || funnel) { onAdd({ funnel, channel, detail, audience }); onClose(); } }}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
          >
            Add row
          </button>
          <button onClick={onClose} className="py-2.5 px-4 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inline editable cell ──────────────────────────────────────────────────────

interface EditableCellProps {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  style?: React.CSSProperties;
  rowSpan?: number;
  bold?: boolean;
}

function EditableCell({ value, onChange, className = "", style, rowSpan, bold }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  if (editing) {
    return (
      <td className={className} style={style} rowSpan={rowSpan}>
        <input
          ref={inputRef} value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { onChange(draft); setEditing(false); }}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === "Escape") { onChange(draft); setEditing(false); }
          }}
          className="w-full bg-transparent border-none outline-none text-xs p-0"
        />
      </td>
    );
  }

  return (
    <td className={`cursor-text ${className}`} style={style} rowSpan={rowSpan}
      onClick={() => { setDraft(value); setEditing(true); }}>
      <span className={bold ? "font-semibold" : ""}>{value || <span className="text-gray-300">—</span>}</span>
    </td>
  );
}

// ── Channel select cell ───────────────────────────────────────────────────────

interface LibraryChannel {
  id: string;
  title: string;
  channel_type: string;
}

interface ChannelSelectCellProps {
  value: string;
  onChange: (val: string) => void;
  libraryChannels: LibraryChannel[];
  className?: string;
  style?: React.CSSProperties;
  rowSpan?: number;
  autoOpen?: boolean;
}

function ChannelSelectCell({ value, onChange, libraryChannels, className = "", style, rowSpan, autoOpen }: ChannelSelectCellProps) {
  const [open, setOpen] = useState(!!autoOpen);
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const cellRef = useRef<HTMLTableCellElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        cellRef.current && !cellRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setCustom(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => { if (custom && inputRef.current) inputRef.current.focus(); }, [custom]);

  const selectChannel = (name: string) => {
    onChange(name);
    setOpen(false);
    setCustom(false);
  };

  const icon = getChannelLogo(value, "w-3.5 h-3.5 flex-shrink-0");

  return (
    <td
      ref={cellRef}
      className={`group cursor-pointer ${className}`}
      style={{ ...style, position: style?.position as React.CSSProperties["position"], overflow: open ? "visible" : "hidden", zIndex: open ? 40 : (style?.zIndex ?? 10) }}
      rowSpan={rowSpan}
      onClick={() => setOpen(o => !o)}
    >
      <div className="relative flex items-center gap-1.5 justify-center w-full min-w-0">
        {value ? (
          <>
            {icon}
            <span className="font-semibold text-xs truncate min-w-0" title={value}>{value}</span>
          </>
        ) : (
          <span className="text-black text-xs">Select a Channel</span>
        )}
        <ChevronDown className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" />

        {open && (
          <div
            ref={dropdownRef}
            className="absolute z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1 w-52"
            style={{ top: "calc(100% + 4px)", left: 0 }}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            {(() => {
              const presetSet = new Set(PRESET_CHANNELS.map(c => c.toLowerCase()));
              const extraLibrary = libraryChannels.filter(ch => !presetSet.has(ch.channel_type.toLowerCase()));
              const allChannels = [
                ...extraLibrary.map(ch => ch.channel_type),
                ...PRESET_CHANNELS,
              ];
              return allChannels.map(name => (
                <button
                  key={name}
                  onClick={() => selectChannel(name)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-800 transition-colors text-left"
                >
                  {getChannelLogo(name, "w-4 h-4 flex-shrink-0")}
                  <span className="truncate">{name}</span>
                </button>
              ));
            })()}
            <div className="border-t border-gray-100 mt-1 pt-1">
              {custom ? (
                <div className="px-2 pb-1">
                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && draft.trim()) selectChannel(draft.trim());
                      if (e.key === "Escape") { setCustom(false); setOpen(false); }
                    }}
                    placeholder="Type channel name…"
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              ) : (
                <button
                  onClick={() => { setDraft(value); setCustom(true); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 transition-colors"
                >
                  Write custom channel…
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </td>
  );
}

// ── Resize handle ─────────────────────────────────────────────────────────────

interface ResizeHandleProps {
  side: 'left' | 'right';
  onMouseDown: (e: React.MouseEvent) => void;
}

function ResizeHandle({ side, onMouseDown }: ResizeHandleProps) {
  return (
    <div
      onMouseDown={onMouseDown}
      title="Drag to resize"
      className="absolute top-0 bottom-0 w-3 flex items-center justify-center opacity-0 group-hover/flight:opacity-100 hover:opacity-100 transition-opacity z-10"
      style={{ [side]: 0, cursor: 'col-resize' }}
    >
      <div className="flex flex-col gap-[3px]">
        <div className="w-[2px] h-[14px] rounded-full bg-white/80" />
        <div className="w-[2px] h-[14px] rounded-full bg-white/80 -mt-[8px]" />
      </div>
    </div>
  );
}

// ── Add column modal ──────────────────────────────────────────────────────────

function AddColumnModal({ onAdd, onClose }: { onAdd: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-80">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Add column</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && name.trim()) { onAdd(name.trim()); onClose(); }
            if (e.key === "Escape") onClose();
          }}
          placeholder="e.g. Creative format"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 mb-4"
        />
        <div className="flex gap-2">
          <button
            onClick={() => { if (name.trim()) { onAdd(name.trim()); onClose(); } }}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
          >
            Add column
          </button>
          <button onClick={onClose} className="py-2.5 px-4 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Fee row renderer ──────────────────────────────────────────────────────────

const FEE_SUGGESTIONS = [
  "Set Up Fee",
  "Management Fee",
  "Community Management",
  "Reporting Dashboard",
  "Retainer",
  "Creative Fee",
  "Strategy Fee",
  "Analytics Fee",
];

interface FeeRowRendererProps {
  fee: FeeRow;
  weekCount: number;
  stickyBase: string;
  leftColSpan: number;
  onUpdateName: (name: string) => void;
  onUpdateAmount: (amount: number) => void;
  onDelete: () => void;
}

function FeeRowRenderer({ fee, weekCount, stickyBase, leftColSpan, onUpdateName, onUpdateAmount, onDelete }: FeeRowRendererProps) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(fee.name);
  const [draftAmount, setDraftAmount] = useState(fee.amount > 0 ? String(fee.amount) : "");

  // Keep draft in sync if fee changes externally
  useEffect(() => { setDraftAmount(fee.amount > 0 ? String(fee.amount) : ""); }, [fee.amount]);

  const commitAmount = () => {
    const parsed = parseFloat(draftAmount.replace(/[^0-9.]/g, ""));
    onUpdateAmount(isNaN(parsed) ? 0 : Math.max(0, parsed));
  };

  return (
    <tr style={{ height: ROW_H }} className="group">
      <td
        colSpan={leftColSpan}
        className={`${stickyBase} bg-amber-50/60 border-amber-100`}
        onDoubleClick={() => { setDraftName(fee.name); setEditingName(true); }}
      >
        {editingName ? (
          <input
            autoFocus
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onBlur={() => { onUpdateName(draftName); setEditingName(false); }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === 'Escape') { onUpdateName(draftName); setEditingName(false); }
            }}
            className="w-full bg-transparent border-none outline-none text-xs font-medium text-amber-900"
          />
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-amber-900">{fee.name}</span>
            <span className="text-[10px] text-amber-600 bg-amber-100 rounded px-1 py-0.5 font-medium tracking-wide">NON-MEDIA</span>
            <Edit2 className="w-2.5 h-2.5 text-amber-300 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        )}
      </td>
      <td
        className="border border-amber-200 px-2 py-1 text-right align-middle bg-amber-50 cursor-text"
        style={{ width: COL_WIDTHS.total, minWidth: COL_WIDTHS.total }}
      >
        <div className="flex items-center justify-end gap-1">
          <span className="text-amber-500 text-xs select-none">$</span>
          <input
            type="text"
            inputMode="numeric"
            value={draftAmount}
            onChange={e => setDraftAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            onBlur={commitAmount}
            onKeyDown={e => { if (e.key === 'Enter') commitAmount(); }}
            placeholder="0"
            className="w-full bg-transparent border-none outline-none text-sm font-semibold text-amber-900 text-right placeholder:text-amber-300 focus:placeholder:text-amber-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            onClick={onDelete}
            className="text-amber-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
            title="Delete fee"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </td>
      <td
        colSpan={weekCount}
        className="border border-amber-100 bg-amber-50/20"
      />
    </tr>
  );
}

// ── Fee menu (toolbar button + dropdown) ──────────────────────────────────────

function FeeMenu({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-amber-300 text-amber-700 bg-amber-50 rounded-lg text-xs font-medium hover:bg-amber-100 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Add fee
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1 w-48">
          {FEE_SUGGESTIONS.map(name => (
            <button
              key={name}
              onClick={() => { onAdd(name); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-amber-50 hover:text-amber-800 transition-colors"
            >
              {name}
            </button>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1">
            <button
              onClick={() => { onAdd("New Fee"); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 transition-colors"
            >
              Custom fee…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main PlanGrid component ───────────────────────────────────────────────────

interface DragState {
  rowId: string;
  startIdx: number;
  endIdx: number;
}

interface EditingFlight {
  rowId: string;
  flightId: string;
}

interface ResizeState {
  rowId: string;
  flightId: string;
  edge: 'start' | 'end';
  anchorIdx: number; // the fixed opposite edge index
}

interface Props {
  plan: SandboxPlan;
  onPlanChange: (plan: SandboxPlan) => void;
  onUpload: () => void;
  outerStyle?: React.CSSProperties;
  // Hidden in the create-client flow — PDF export isn't relevant during onboarding.
  showDownloadPdf?: boolean;
}

export function PlanGrid({ plan, onPlanChange, onUpload, outerStyle, showDownloadPdf = true }: Props) {
  const [rows, setRows] = useState<PlanRow[]>(plan.rows);
  const [libraryChannels, setLibraryChannels] = useState<LibraryChannel[]>([]);
  const [weeks, setWeeks] = useState<Week[]>(() => {
    const baseYear = plan.weeks[0]?.year ?? new Date().getFullYear();
    // Flights can land in a different calendar year than the plan's earliest week
    // (e.g. a plan spanning a year boundary) — generating only baseYear's weeks
    // would silently leave those flights with nowhere to render. Widen the
    // generated range to cover every year any row's flights actually touch.
    let minYear = baseYear;
    let maxYear = baseYear;
    for (const row of plan.rows) {
      for (const f of row.flights) {
        const startYear = new Date(f.startWeek).getFullYear();
        const endYear = new Date(f.endWeek).getFullYear();
        if (!Number.isNaN(startYear)) { minYear = Math.min(minYear, startYear); maxYear = Math.max(maxYear, startYear); }
        if (!Number.isNaN(endYear)) { minYear = Math.min(minYear, endYear); maxYear = Math.max(maxYear, endYear); }
      }
    }
    const yearSpan = maxYear - minYear + 1;
    return generateWeeksForYear(minYear, Math.max(52 * yearSpan, plan.weeks.length));
  });
  const [fees, setFees] = useState<FeeRow[]>(plan.fees ?? []);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>(plan.customColumns ?? []);
  const [weekWidth, setWeekWidth] = useState(WEEK_W_DEFAULT);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [editingFlight, setEditingFlight] = useState<EditingFlight | null>(null);
  const [showBudgetPrompt, setShowBudgetPrompt] = useState(false);
  const [pendingDrag, setPendingDrag] = useState<DragState | null>(null);
  const [dragEndPos, setDragEndPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedColor, setSelectedColor] = useState(FLIGHT_COLORS[0]);
  const flightAnchorRef = useRef<HTMLElement | null>(null);
  const resizeMoved = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef(rows);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  useEffect(() => {
    fetch('/api/media-channel-library')
      .then(r => r.ok ? r.json() : { data: [] })
      .then(res => { if (Array.isArray(res.data)) setLibraryChannels(res.data); })
      .catch(() => {});
  }, []);

  const isDragging = dragState !== null;
  const isResizing = resizeState !== null;

  // DEL + CHANNEL + custom cols (dynamic)
  const channelLeft = COL_WIDTHS.del;
  const dynamicTotalLeft = COL_WIDTHS.del + COL_WIDTHS.channel + customColumns.length * CUSTOM_COL_W;
  const totalLeftColsWidth = dynamicTotalLeft + COL_WIDTHS.total; // pixel offset where weeks begin
  const leftColSpan = 2 + customColumns.length; // DEL + CHANNEL + custom cols

  const todayStr = nzToday();
  const planYear = weeks[0]?.year ?? Number(todayStr.slice(0, 4));
  const yearOptions = Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 2 + i);

  // Finds the week column that contains today, or -1 if today falls outside
  // the range of weeks currently loaded (e.g. plan year doesn't match).
  const findTodayWeekIdx = useCallback((weeksList: Week[]) => {
    const first = weeksList[0];
    const last = weeksList[weeksList.length - 1];
    if (!first || !last) return -1;
    if (todayStr < first.weekStart) return -1;
    const lastEnd = new Date(last.weekStart);
    lastEnd.setUTCDate(lastEnd.getUTCDate() + 7);
    if (todayStr >= lastEnd.toISOString().slice(0, 10)) return -1;
    return weeksList.reduce((best, w, i) => (w.weekStart <= todayStr ? i : best), -1);
  }, [todayStr]);

  const scrollToTodayPending = useRef(false);

  const scrollToToday = useCallback((weeksList: Week[], weekW: number, behavior: ScrollBehavior = 'smooth') => {
    if (!scrollRef.current) return;
    const idx = findTodayWeekIdx(weeksList);
    if (idx < 0) return;
    scrollRef.current.scrollTo({ left: idx * weekW, behavior });
  }, [findTodayWeekIdx]);

  // Scroll to today's week on mount, switching to the current year first if
  // the persisted plan was left showing a stale year (e.g. last saved while
  // scrolled to a different year) — otherwise this silently no-ops and the
  // grid opens scrolled all the way to January.
  useEffect(() => {
    const currentYear = Number(todayStr.slice(0, 4));
    if (planYear !== currentYear) {
      scrollToTodayPending.current = true;
      handleYearChange(currentYear);
    } else {
      scrollToToday(weeks, weekWidth, 'auto');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  // "Today" button — jumps to the current year first if the plan isn't showing
  // it yet, then scrolls once the new weeks have been generated.
  const goToToday = useCallback(() => {
    const currentYear = Number(todayStr.slice(0, 4));
    if (planYear !== currentYear) {
      scrollToTodayPending.current = true;
      handleYearChange(currentYear);
    } else {
      scrollToToday(weeks, weekWidth);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planYear, weeks, weekWidth, scrollToToday, todayStr]);

  useEffect(() => {
    if (!scrollToTodayPending.current) return;
    scrollToTodayPending.current = false;
    scrollToToday(weeks, weekWidth);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks]);

  // Absolute pixel offset (from the left edge of the table) of the vertical
  // "today" line, or null when today falls outside the plan's date range.
  const todayLineOffset = useMemo(() => {
    const idx = findTodayWeekIdx(weeks);
    if (idx < 0) return null;
    const weekStart = new Date(weeks[idx].weekStart);
    const today = new Date(todayStr);
    const dayOffset = Math.round((today.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));
    return totalLeftColsWidth + idx * weekWidth + (Math.min(6, Math.max(0, dayOffset)) / 7) * weekWidth;
  }, [weeks, weekWidth, todayStr, findTodayWeekIdx, totalLeftColsWidth]);

  // Sync rows + weeks + fees + customColumns to parent
  useEffect(() => {
    onPlanChange({ ...plan, rows, weeks, fees, customColumns, updatedAt: new Date().toISOString() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, weeks, fees, customColumns]);

  const rowSpans = useMemo(() => computeRowSpans(rows), [rows]);
  const monthGroups = useMemo(() => groupWeeksByMonth(weeks), [weeks]);
  const totals = useMemo(() => weekTotals(rows, weeks), [rows, weeks]);
  const monthTotals = useMemo(() => {
    let wi = 0;
    return monthGroups.map(mg => {
      let sum = 0;
      for (let i = 0; i < mg.count; i++) sum += totals[wi++] ?? 0;
      return Math.round(sum);
    });
  }, [monthGroups, totals]);

  const flightGroups = useMemo(() => {
    const groups = new Map<string, number[]>();
    rows.forEach((row, i) => {
      if (row.flightGroupId) {
        if (!groups.has(row.flightGroupId)) groups.set(row.flightGroupId, []);
        groups.get(row.flightGroupId)!.push(i);
      }
    });
    return groups;
  }, [rows]);

  const grandTotal = rows.reduce((s, r) => s + totalForRow(r), 0) + fees.reduce((s, f) => s + f.amount, 0);

  // ── Year change ───────────────────────────────────────────────────────────

  const handleYearChange = useCallback((newYear: number) => {
    const newWeeks = generateWeeksForYear(newYear, weeks.length);
    setRows(prev => prev.map(row => ({
      ...row,
      flights: row.flights.map(f => {
        const si = weeks.findIndex(w => w.weekStart === f.startWeek);
        const ei = weeks.findIndex(w => w.weekStart === f.endWeek);
        if (si === -1 || ei === -1) return f;
        return {
          ...f,
          startWeek: (newWeeks[si] ?? newWeeks[0]).weekStart,
          endWeek: (newWeeks[ei] ?? newWeeks[newWeeks.length - 1]).weekStart,
        };
      }),
    })));
    setWeeks(newWeeks);
  }, [weeks]);

  // ── Row mutation helpers ──────────────────────────────────────────────────

  const updateRow = useCallback((rowId: string, updater: (r: PlanRow) => PlanRow) => {
    setRows(prev => prev.map(r => r.id === rowId ? updater(r) : r));
  }, []);

  const deleteRow = useCallback((rowId: string) => {
    setRows(prev => prev.filter(r => r.id !== rowId));
  }, []);

  const addBlankRow = useCallback(() => {
    setRows(prev => [...prev, { id: uid(), funnel: "", channel: "", detail: "", audience: "", flights: [] }]);
  }, []);

  const addFlight = useCallback((rowId: string, startIdx: number, endIdx: number, budget: number, color: string) => {
    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);
    const startWeek = weeks[lo].weekStart;
    const endWeek = weeks[hi].weekStart;
    const newFlight: Flight = { id: uid(), startWeek, endWeek, budget, color };
    updateRow(rowId, r => ({
      ...r,
      flights: [...r.flights.filter(f => f.endWeek < startWeek || f.startWeek > endWeek), newFlight],
    }));
  }, [weeks, updateRow]);

  const editFlight = useCallback((rowId: string, flightId: string, budget: number, color: string) => {
    updateRow(rowId, r => ({
      ...r,
      flights: r.flights.map(f => f.id === flightId ? { ...f, budget, color } : f),
    }));
    setEditingFlight(null);
  }, [updateRow]);

  const deleteFlight = useCallback((rowId: string, flightId: string) => {
    updateRow(rowId, r => ({ ...r, flights: r.flights.filter(f => f.id !== flightId) }));
    setEditingFlight(null);
  }, [updateRow]);

  // ── Fee helpers ───────────────────────────────────────────────────────────

  const addFee = useCallback((name: string) => {
    setFees(prev => [...prev, { id: uid(), name, amount: 0 }]);
  }, []);

  const updateFee = useCallback((feeId: string, updates: Partial<Omit<FeeRow, 'id'>>) => {
    setFees(prev => prev.map(f => f.id === feeId ? { ...f, ...updates } : f));
  }, []);

  const deleteFee = useCallback((feeId: string) => {
    setFees(prev => prev.filter(f => f.id !== feeId));
  }, []);

  // ── Custom column helpers ─────────────────────────────────────────────────

  const addCustomColumn = useCallback((name: string) => {
    const col: CustomColumn = { id: uid(), name };
    setCustomColumns(prev => [...prev, col]);
  }, []);

  const deleteCustomColumn = useCallback((colId: string) => {
    setCustomColumns(prev => prev.filter(c => c.id !== colId));
  }, []);

  const updateCustomField = useCallback((rowId: string, colId: string, value: string) => {
    setRows(prev => prev.map(r => r.id !== rowId ? r : {
      ...r,
      customFields: { ...(r.customFields ?? {}), [colId]: value },
    }));
  }, []);

  const renameCustomColumn = useCallback((colId: string, name: string) => {
    setCustomColumns(prev => prev.map(c => c.id === colId ? { ...c, name } : c));
  }, []);

  // ── Drag-to-create ────────────────────────────────────────────────────────

  const startDrag = useCallback((rowId: string, weekIdx: number) => {
    setEditingFlight(null);
    setDragState({ rowId, startIdx: weekIdx, endIdx: weekIdx });
  }, []);

const endDrag = useCallback((clientX: number, clientY: number) => {
    if (!dragState) return;
    setPendingDrag(dragState);
    setDragEndPos({ x: clientX, y: clientY });
    setDragState(null);
    setShowBudgetPrompt(true);
  }, [dragState]);

  useEffect(() => {
    const up = (e: MouseEvent) => { if (isDragging) endDrag(e.clientX, e.clientY); };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [isDragging, endDrag]);

  // ── Resize drag ───────────────────────────────────────────────────────────

  // Global cursor during drag / resize
  useEffect(() => {
    const cur = isResizing ? 'col-resize' : isDragging ? 'crosshair' : '';
    document.body.style.cursor = cur;
    document.body.style.userSelect = (isResizing || isDragging) ? 'none' : '';
    return () => { document.body.style.cursor = ''; document.body.style.userSelect = ''; };
  }, [isResizing, isDragging]);

  // Global mousemove tracks the drag across week columns (avoids closure-over-i bugs)
  // rAF-batched so rapid native mousemove events collapse to at most one state update per frame
  useEffect(() => {
    if (!isDragging) return;
    let frame: number | null = null;
    let lastEvent: MouseEvent | null = null;

    const process = () => {
      frame = null;
      const e = lastEvent;
      if (!e || !scrollRef.current) return;
      const rect = scrollRef.current.getBoundingClientRect();
      const weekX = e.clientX - rect.left - totalLeftColsWidth + scrollRef.current.scrollLeft;
      const rawIdx = Math.max(0, Math.min(weeks.length - 1, Math.floor(weekX / weekWidth)));
      setDragState(prev => {
        if (!prev) return null;
        let idx = rawIdx;
        const row = rowsRef.current.find(r => r.id === prev.rowId);
        if (row) {
          for (const f of row.flights) {
            const startI = weeks.findIndex(w => w.weekStart === f.startWeek);
            const endI = weeks.findIndex(w => w.weekStart === f.endWeek);
            if (startI === -1 || endI === -1) continue;
            // Dragging right: stop before this flight's start
            if (idx >= startI && prev.startIdx < startI) idx = Math.min(idx, startI - 1);
            // Dragging left: stop after this flight's end
            if (idx <= endI && prev.startIdx > endI) idx = Math.max(idx, endI + 1);
          }
        }
        return { ...prev, endIdx: idx };
      });
    };

    const handleMove = (e: MouseEvent) => {
      lastEvent = e;
      if (frame == null) frame = requestAnimationFrame(process);
    };
    window.addEventListener('mousemove', handleMove);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [isDragging, weeks.length, weekWidth]);

  useEffect(() => {
    if (!isResizing || !resizeState) return;

    let frame: number | null = null;
    let lastEvent: MouseEvent | null = null;

    const process = () => {
      frame = null;
      const e = lastEvent;
      if (!e || !scrollRef.current) return;
      resizeMoved.current = true;
      const rect = scrollRef.current.getBoundingClientRect();
      const scrollLeft = scrollRef.current.scrollLeft;
      const weekX = e.clientX - rect.left - totalLeftColsWidth + scrollLeft;
      const weekIdx = Math.max(0, Math.min(weeks.length - 1, Math.floor(weekX / weekWidth)));

      setRows(prev => prev.map(row => {
        if (row.id !== resizeState.rowId) return row;
        return {
          ...row,
          flights: row.flights.map(f => {
            if (f.id !== resizeState.flightId) return f;
            if (resizeState.edge === 'start') {
              const newStart = Math.min(weekIdx, resizeState.anchorIdx);
              return { ...f, startWeek: weeks[newStart].weekStart };
            } else {
              const newEnd = Math.max(weekIdx, resizeState.anchorIdx);
              return { ...f, endWeek: weeks[newEnd].weekStart };
            }
          }),
        };
      }));
    };

    const handleMove = (e: MouseEvent) => {
      lastEvent = e;
      if (frame == null) frame = requestAnimationFrame(process);
    };

    const handleUp = () => {
      setResizeState(null);
      // Delay reset so the click handler on the flight cell can read it
      setTimeout(() => { resizeMoved.current = false; }, 50);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [isResizing, resizeState, weeks, weekWidth]);

  // ── Week cell renderer ────────────────────────────────────────────────────

  function renderWeekCells(row: PlanRow, rowIdx: number) {
    if (row.flightGroupId && !row.isMasterRow) {
      const groupIdxs = flightGroups.get(row.flightGroupId) ?? [];
      const masterRow = rows[groupIdxs[0]];
      const cells: React.ReactNode[] = [];
      let i = 0;
      while (i < weeks.length) {
        const week = weeks[i];
        const coveredFlight = masterRow?.flights.find(f =>
          week.weekStart >= f.startWeek && week.weekStart <= f.endWeek
        );
        if (coveredFlight) {
          while (i < weeks.length && weeks[i].weekStart <= coveredFlight.endWeek) i++;
        } else {
          cells.push(
            <td
              key={week.weekStart}
              className="border border-gray-100 bg-white hover:bg-blue-50/60 cursor-crosshair select-none"
              onMouseDown={e => {
                if (isResizing) return;
                e.preventDefault();
                if (!scrollRef.current) return;
                const rect = scrollRef.current.getBoundingClientRect();
                const weekX = e.clientX - rect.left - totalLeftColsWidth + scrollRef.current.scrollLeft;
                const weekIdx = Math.max(0, Math.min(weeks.length - 1, Math.floor(weekX / weekWidth)));
                startDrag(row.id, weekIdx);
              }}
            />
          );
          i++;
        }
      }
      return cells;
    }

    const cells: React.ReactNode[] = [];
    let i = 0;
    const activeHighlight = dragState?.rowId === row.id
      ? dragState
      : (showBudgetPrompt && pendingDrag?.rowId === row.id ? pendingDrag : null);
    const dragLo = activeHighlight ? Math.min(activeHighlight.startIdx, activeHighlight.endIdx) : -1;
    const dragHi = activeHighlight ? Math.max(activeHighlight.startIdx, activeHighlight.endIdx) : -1;
    const flightRowSpan = (row.flightGroupId && row.isMasterRow)
      ? (flightGroups.get(row.flightGroupId)?.length ?? 1)
      : 1;

    while (i < weeks.length) {
      const week = weeks[i];
      const flight = flightAtWeek(row, week.weekStart);
      const prevFlight = i > 0 ? flightAtWeek(row, weeks[i - 1].weekStart) : null;

      if (activeHighlight && i >= dragLo && i <= dragHi && !flight) {
        cells.push(
          <td
            key={week.weekStart}
            style={{ background: lighten(selectedColor, 40), borderColor: "#e5e7eb" }}
            className="border text-center text-xs font-medium text-white"
          />
        );
        i++;
        continue;
      }

      if (flight && flight !== prevFlight) {
        const span = weekSpanForFlight(flight, weeks);
        const isEditing = editingFlight?.rowId === row.id && editingFlight?.flightId === flight.id;
        const isBeingResized = resizeState?.rowId === row.id && resizeState?.flightId === flight.id;

        const flightBg = row.isOrganic
          ? `repeating-linear-gradient(-45deg, ${flight.color}, ${flight.color} 5px, rgba(255,255,255,0.45) 5px, rgba(255,255,255,0.45) 10px)`
          : flight.color;

        cells.push(
          <td
            key={week.weekStart}
            colSpan={span}
            rowSpan={flightRowSpan}
            style={{
              background: flightBg,
              position: "relative",
              verticalAlign: "middle",
              outline: isBeingResized ? `2px solid white` : undefined,
              outlineOffset: '-2px',
            }}
            className="group/flight border border-white/30 text-center text-xs font-semibold text-white cursor-pointer"
            onClick={e => {
              if (resizeMoved.current) return;
              e.stopPropagation();
              flightAnchorRef.current = e.currentTarget as HTMLElement;
              setEditingFlight({ rowId: row.id, flightId: flight.id });
            }}
          >
            {/* Left resize handle */}
            <ResizeHandle
              side="left"
              onMouseDown={e => {
                e.stopPropagation();
                e.preventDefault();
                resizeMoved.current = false;
                const anchorIdx = weeks.findIndex(w => w.weekStart === flight.endWeek);
                setResizeState({ rowId: row.id, flightId: flight.id, edge: 'start', anchorIdx });
              }}
            />

            {flight.budget > 0 && (
              row.isOrganic ? (
                <span style={{
                  background: flight.color,
                  borderRadius: 4,
                  padding: '1px 5px',
                  display: 'inline-block',
                  lineHeight: 1.5,
                  pointerEvents: 'none',
                }}>
                  {fmt(flight.budget)}
                </span>
              ) : fmt(flight.budget)
            )}

            {/* Right resize handle */}
            <ResizeHandle
              side="right"
              onMouseDown={e => {
                e.stopPropagation();
                e.preventDefault();
                resizeMoved.current = false;
                const anchorIdx = weeks.findIndex(w => w.weekStart === flight.startWeek);
                setResizeState({ rowId: row.id, flightId: flight.id, edge: 'end', anchorIdx });
              }}
            />

            {isEditing && (
              <div
                style={{ position: "absolute", top: 0, left: 0 }}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
              >
                <FlightPopover
                  flight={flight}
                  anchorRef={flightAnchorRef}
                  onSave={(budget, color) => editFlight(row.id, flight.id, budget, color)}
                  onDelete={() => deleteFlight(row.id, flight.id)}
                  onClose={() => setEditingFlight(null)}
                />
              </div>
            )}
          </td>
        );
        i += span;
        continue;
      }

      if (flight) { i++; continue; }

      cells.push(
        <td
          key={week.weekStart}
          className="border border-gray-100 bg-white hover:bg-blue-50/60 cursor-crosshair select-none"
          onMouseDown={e => {
            if (isResizing) return;
            e.preventDefault();
            if (!scrollRef.current) return;
            const rect = scrollRef.current.getBoundingClientRect();
            const weekX = e.clientX - rect.left - totalLeftColsWidth + scrollRef.current.scrollLeft;
            const weekIdx = Math.max(0, Math.min(weeks.length - 1, Math.floor(weekX / weekWidth)));
            startDrag(row.id, weekIdx);
          }}
        />
      );
      i++;
    }
    return cells;
  }

  // ── PDF export ────────────────────────────────────────────────────────────

  const handleDownloadPdf = useCallback(async () => {
    setIsDownloadingPdf(true);
    setPdfError(null);
    try {
      const res = await fetch('/api/sandbox/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: { ...plan, rows, weeks, fees, customColumns } }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to generate PDF (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(plan.title || 'Media_Plan').replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Failed to generate PDF');
    } finally {
      setIsDownloadingPdf(false);
    }
  }, [plan, rows, weeks, fees, customColumns]);

  // ── Render ────────────────────────────────────────────────────────────────

  const stickyBase = "border border-gray-200 bg-white text-xs px-2 py-2";
  const stickyHeader = "border border-gray-200 bg-gray-800 text-white text-xs font-semibold uppercase tracking-wide px-2 py-2";

  return (
    <div className="flex flex-col h-screen bg-gray-100" style={outerStyle}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div>
          <span className="font-semibold text-gray-900 text-sm">{plan.title}</span>
          {plan.asAtLabel && <span className="ml-2 text-xs text-gray-400">{plan.asAtLabel}</span>}
        </div>

        <div className="flex-1" />

        {/* Year selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Year:</span>
          <select
            value={planYear}
            onChange={e => handleYearChange(Number(e.target.value))}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer"
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <button
          onClick={goToToday}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
          title="Jump to today"
        >
          <Calendar className="w-3.5 h-3.5" /> Today
        </button>

        {/* Zoom */}
        <div className="flex items-center gap-0.5 border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setWeekWidth(w => Math.max(WEEK_W_MIN, w - WEEK_W_STEP))}
            disabled={weekWidth <= WEEK_W_MIN}
            className="px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
            title="Zoom out"
          >
            −
          </button>
          <span className="text-xs text-gray-400 select-none px-1">{Math.round((weekWidth / WEEK_W) * 100)}%</span>
          <button
            onClick={() => setWeekWidth(w => Math.min(WEEK_W_MAX, w + WEEK_W_STEP))}
            disabled={weekWidth >= WEEK_W_MAX}
            className="px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
            title="Zoom in"
          >
            +
          </button>
        </div>

        {/* Color picker */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Draw colour:</span>
          <div className="flex gap-1">
            {FLIGHT_COLORS.slice(0, 6).map(c => (
              <button key={c} onClick={() => setSelectedColor(c)}
                className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                style={{ background: c, borderColor: selectedColor === c ? "#1d4ed8" : "transparent" }}
              />
            ))}
          </div>
        </div>

        <button
          onClick={addBlankRow}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add row
        </button>
        <FeeMenu onAdd={addFee} />
        {showDownloadPdf && (
          <button
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf}
            title={pdfError ?? undefined}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isDownloadingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {isDownloadingPdf ? 'Generating…' : 'Download PDF'}
          </button>
        )}
        <button
          onClick={onUpload}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
        >
          <Upload className="w-3.5 h-3.5" /> Upload new
        </button>
      </div>
      {pdfError && (
        <div className="px-4 py-1.5 bg-red-50 border-b border-red-100 text-xs text-red-600 flex-shrink-0">
          {pdfError}
        </div>
      )}

      {/* Grid */}
      <div ref={scrollRef} className="flex-1 overflow-auto bg-white">
        <div style={{ position: "relative", width: `${totalLeftColsWidth + weeks.length * weekWidth}px` }}>
        <table
          className="border-separate border-spacing-0"
          style={{ tableLayout: "fixed", minWidth: `${totalLeftColsWidth + weeks.length * weekWidth}px` }}
        >
          <colgroup>
            <col style={{ width: COL_WIDTHS.del }} />
            <col style={{ width: COL_WIDTHS.channel }} />
            {customColumns.map(c => <col key={c.id} style={{ width: CUSTOM_COL_W }} />)}
            <col style={{ width: COL_WIDTHS.total }} />
            {weeks.map(w => <col key={w.weekStart} style={{ width: weekWidth }} />)}
          </colgroup>

          <thead>
            <tr style={{ height: HEADER_H }}>
              <th className={stickyHeader}
                style={{ position: "sticky", willChange: "transform", left: 0, top: 0, zIndex: 30 }} />
              <th className={stickyHeader}
                style={{ position: "sticky", willChange: "transform", left: channelLeft, top: 0, zIndex: 30, textAlign: "left" }} />
              <th colSpan={customColumns.length + 1} className={stickyHeader}
                style={{ position: "sticky", willChange: "transform", top: 0, zIndex: 30, textAlign: "left" }} />
              {monthGroups.map(mg => (
                <th key={`${mg.month}-${mg.year}`} colSpan={mg.count}
                  className="border border-gray-300 bg-gray-700 text-white text-xs font-bold uppercase tracking-wider text-center"
                  style={{ position: "sticky", willChange: "transform", top: 0, zIndex: 2 }}>
                  {mg.month} {mg.year !== planYear ? mg.year : ""}
                </th>
              ))}
            </tr>

            <tr style={{ height: HEADER_H }}>
              <th className={stickyHeader}
                style={{ position: "sticky", willChange: "transform", left: 0, top: HEADER_H, zIndex: 20 }} />
              <th className={stickyHeader}
                style={{ position: "sticky", willChange: "transform", left: channelLeft, top: HEADER_H, zIndex: 20, textAlign: "left" }}>
                CHANNEL
              </th>
              {customColumns.map(col => (
                <th key={col.id}
                  className={`${stickyHeader} group/colhdr`}
                  style={{ position: "sticky", willChange: "transform", top: HEADER_H, zIndex: 20, width: CUSTOM_COL_W }}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate">{col.name}</span>
                    <button
                      onClick={() => deleteCustomColumn(col.id)}
                      className="opacity-0 group-hover/colhdr:opacity-100 text-gray-400 hover:text-red-400 transition-all flex-shrink-0"
                      title="Remove column"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </th>
              ))}
              <th className={stickyHeader}
                style={{ position: "sticky", willChange: "transform", top: HEADER_H, zIndex: 20 }}>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowAddColumn(true)}
                    className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
                    title="Add column"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <span className="flex-1 text-right">TOTAL</span>
                </div>
              </th>
              {weeks.map(w => (
                <th key={w.weekStart}
                  className="border border-gray-300 bg-gray-800 text-white text-xs font-medium text-center whitespace-nowrap"
                  style={{ position: "sticky", willChange: "transform", top: HEADER_H, zIndex: 2 }}>
                  {w.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIdx) => {
              const span = rowSpans[rowIdx];
              const rowTotal = totalForRow(row);
              return (
                <tr key={row.id} style={{ height: ROW_H }} className="group">
                  <td
                    className={`${stickyBase} text-center align-middle`}
                    style={{ position: "sticky", willChange: "transform", left: 0, zIndex: 10 }}
                  >
                    <button
                      onClick={() => deleteRow(row.id)}
                      className="text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete row"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                  {span.showChannel && (
                    <ChannelSelectCell
                      value={row.channel}
                      libraryChannels={libraryChannels}
                      rowSpan={span.channelSpan}
                      autoOpen={rows.length === 1 && !row.channel}
                      onChange={val => {
                        setRows(prev => {
                          const last = rowIdx + span.channelSpan;
                          return prev.map((r, i) => i >= rowIdx && i < last ? { ...r, channel: val } : r);
                        });
                      }}
                      className={`${stickyBase} text-center align-middle`}
                      style={{
                        position: "sticky", willChange: "transform",
                        left: channelLeft,
                        zIndex: 10,
                        ...(row.isOrganic ? { background: 'repeating-linear-gradient(-45deg, #f5f3ff, #f5f3ff 8px, #ede9fe 8px, #ede9fe 16px)' } : {}),
                      }}
                    />
                  )}
                  {customColumns.map(col => (
                    <EditableCell
                      key={col.id}
                      value={row.customFields?.[col.id] ?? ""}
                      onChange={val => updateCustomField(row.id, col.id, val)}
                      className={`${stickyBase} text-left align-middle`}
                    />
                  ))}
                  {(!row.flightGroupId || row.isMasterRow) && (
                    <td
                      className={`${stickyBase} text-right align-middle font-medium`}
                      rowSpan={row.isMasterRow ? (flightGroups.get(row.flightGroupId!)?.length ?? 1) : 1}
                    >
                      {rowTotal > 0 ? fmt(rowTotal) : ""}
                    </td>
                  )}
                  {renderWeekCells(row, rowIdx)}
                </tr>
              );
            })}

            {fees.map(fee => (
              <FeeRowRenderer
                key={fee.id}
                fee={fee}
                weekCount={weeks.length}
                stickyBase={stickyBase}
                leftColSpan={leftColSpan}
                onUpdateName={name => updateFee(fee.id, { name })}
                onUpdateAmount={amount => updateFee(fee.id, { amount })}
                onDelete={() => deleteFee(fee.id)}
              />
            ))}

            {fees.length > 0 && (() => {
              const feesTotal = fees.reduce((s, f) => s + f.amount, 0);
              return (
                <tr style={{ height: ROW_H }}>
                  <td
                    colSpan={leftColSpan}
                    className={`${stickyBase} bg-amber-100 border-amber-200 font-bold text-amber-900`}
                  >
                    TOTAL NON-MEDIA FEES
                  </td>
                  <td
                    className={`${stickyBase} text-right bg-amber-100 border-amber-200 font-bold text-amber-900`}
                  >
                    {feesTotal > 0 ? fmt(feesTotal) : <span className="text-amber-400">—</span>}
                  </td>
                  <td colSpan={weeks.length} className="border border-amber-100 bg-amber-50/20" />
                </tr>
              );
            })()}

            {/* Add channel row */}
            <tr style={{ height: 34 }}>
              <td
                colSpan={leftColSpan}
                className="border border-dashed border-blue-100 bg-white"
              >
                <button
                  onClick={addBlankRow}
                  className="flex items-center gap-1.5 px-2 text-xs text-black hover:text-blue-500 font-medium transition-colors w-full py-1"
                >
                  <Plus className="w-3 h-3" /> Add channel
                </button>
              </td>
              <td
                className="border border-dashed border-blue-100 bg-white"
                style={{ width: COL_WIDTHS.total, minWidth: COL_WIDTHS.total }}
              />
              <td colSpan={weeks.length} className="border border-dashed border-blue-100 bg-white" />
            </tr>

            <tr style={{ height: ROW_H + 4 }}>
              <td colSpan={leftColSpan} className="border border-gray-700 px-2 py-2 text-xs font-bold bg-gray-800 text-white uppercase tracking-wide">
                {fees.length > 0 ? "TOTAL MEDIA PLAN" : "TOTAL"}
              </td>
              <td className="border border-gray-700 px-2 py-2 text-right bg-gray-800 text-white font-bold text-sm">
                {grandTotal > 0 ? fmt(grandTotal) : "$0"}
              </td>
              {monthGroups.map((mg, i) => (
                <td key={`${mg.month}-${mg.year}`} colSpan={mg.count}
                  className="border border-gray-700 text-center text-xs font-semibold text-gray-300 bg-gray-800">
                  {monthTotals[i] > 0 ? fmt(monthTotals[i]) : ""}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        {todayLineOffset !== null && (
          <div
            className="pointer-events-none absolute top-0 bottom-0"
            style={{ left: todayLineOffset, width: 2, background: "#ef4444", zIndex: 1 }}
            title="Today"
          />
        )}
        </div>
      </div>

      {showBudgetPrompt && pendingDrag && dragEndPos && (
        <BudgetPrompt
          defaultColor={selectedColor}
          pos={dragEndPos}
          onConfirm={(budget, color) => {
            addFlight(pendingDrag.rowId, pendingDrag.startIdx, pendingDrag.endIdx, budget, color);
            setSelectedColor(color);
            setShowBudgetPrompt(false);
            setPendingDrag(null);
            setDragEndPos(null);
          }}
          onCancel={() => { setShowBudgetPrompt(false); setPendingDrag(null); setDragEndPos(null); }}
        />
      )}

      {showAddColumn && (
        <AddColumnModal
          onAdd={name => addCustomColumn(name)}
          onClose={() => setShowAddColumn(false)}
        />
      )}
    </div>
  );
}
