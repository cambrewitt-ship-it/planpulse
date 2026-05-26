"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Plus, Trash2, Upload, Download, X, Check, Edit2 } from "lucide-react";
import type { SandboxPlan, PlanRow, Flight, Week, FeeRow, CustomColumn } from "./types";
import { FLIGHT_COLORS } from "./types";

// ── Constants ─────────────────────────────────────────────────────────────────

const COL_WIDTHS = { del: 32, funnel: 100, channel: 140, detail: 140, audience: 160, total: 110 };
const CUSTOM_COL_W = 140;
const WEEK_W = 72;
const WEEK_W_MIN = 28;
const WEEK_W_MAX = 120;
const WEEK_W_STEP = 8;
const ROW_H = 38;
const HEADER_H = 32;
const LEFT_COLS_WIDTH =
  COL_WIDTHS.del + COL_WIDTHS.funnel + COL_WIDTHS.channel + COL_WIDTHS.detail + COL_WIDTHS.audience + COL_WIDTHS.total;

const LEFT_OFFSETS = {
  del: 0,
  funnel: COL_WIDTHS.del,
  channel: COL_WIDTHS.del + COL_WIDTHS.funnel,
  detail: COL_WIDTHS.del + COL_WIDTHS.funnel + COL_WIDTHS.channel,
  audience: COL_WIDTHS.del + COL_WIDTHS.funnel + COL_WIDTHS.channel + COL_WIDTHS.detail,
  total: COL_WIDTHS.del + COL_WIDTHS.funnel + COL_WIDTHS.channel + COL_WIDTHS.detail + COL_WIDTHS.audience,
};

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
    const thu = new Date(d.getTime() + 3 * 86400000); // Thursday determines the month
    const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return { weekStart: iso, label: `${d.getDate()}-${short[d.getMonth()]}`, month: full[thu.getMonth()], year: thu.getFullYear() };
  });
}

interface RowSpan {
  showFunnel: boolean; funnelSpan: number;
  showChannel: boolean; channelSpan: number;
}

function computeRowSpans(rows: PlanRow[]): RowSpan[] {
  const result: RowSpan[] = rows.map(() => ({ showFunnel: false, funnelSpan: 1, showChannel: false, channelSpan: 1 }));
  let i = 0;
  while (i < rows.length) {
    const funnel = rows[i].funnel;
    let j = i;
    while (j < rows.length && rows[j].funnel === funnel) j++;
    result[i].showFunnel = true;
    result[i].funnelSpan = j - i;
    let k = i;
    while (k < j) {
      const channel = rows[k].channel;
      let m = k;
      while (m < j && rows[m].channel === channel) m++;
      result[k].showChannel = true;
      result[k].channelSpan = m - k;
      k = m;
    }
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
    <td className={`group cursor-text ${className}`} style={style} rowSpan={rowSpan}
      onDoubleClick={() => { setDraft(value); setEditing(true); }} title="Double-click to edit">
      <span className={bold ? "font-semibold" : ""}>{value || <span className="text-gray-300">—</span>}</span>
      <Edit2 className="w-2.5 h-2.5 text-gray-300 inline ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
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
  totalOffset: number;
  leftColSpan: number;
  onUpdateName: (name: string) => void;
  onUpdateAmount: (amount: number) => void;
  onDelete: () => void;
}

function FeeRowRenderer({ fee, weekCount, stickyBase, totalOffset, leftColSpan, onUpdateName, onUpdateAmount, onDelete }: FeeRowRendererProps) {
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
        style={{ position: "sticky", left: 0, zIndex: 10 }}
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
        style={{ position: "sticky", left: totalOffset, zIndex: 10, width: COL_WIDTHS.total, minWidth: COL_WIDTHS.total }}
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
}

export function PlanGrid({ plan, onPlanChange, onUpload, outerStyle }: Props) {
  const [rows, setRows] = useState<PlanRow[]>(plan.rows);
  const [weeks, setWeeks] = useState<Week[]>(() => {
    if (plan.weeks.length >= 52) return plan.weeks;
    const year = plan.weeks[0]?.year ?? new Date().getFullYear();
    return generateWeeksForYear(year, 52);
  });
  const [fees, setFees] = useState<FeeRow[]>(plan.fees ?? []);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>(plan.customColumns ?? []);
  const [weekWidth, setWeekWidth] = useState(WEEK_W);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [editingFlight, setEditingFlight] = useState<EditingFlight | null>(null);
  const [showBudgetPrompt, setShowBudgetPrompt] = useState(false);
  const [pendingDrag, setPendingDrag] = useState<DragState | null>(null);
  const [dragEndPos, setDragEndPos] = useState<{ x: number; y: number } | null>(null);
  const [showAddRow, setShowAddRow] = useState(false);
  const [selectedColor, setSelectedColor] = useState(FLIGHT_COLORS[0]);
  const flightAnchorRef = useRef<HTMLElement | null>(null);
  const resizeMoved = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isDragging = dragState !== null;
  const isResizing = resizeState !== null;

  const dynamicTotalLeft = LEFT_OFFSETS.audience + COL_WIDTHS.audience + customColumns.length * CUSTOM_COL_W;
  const leftColSpan = 5 + customColumns.length; // DEL + FUNNEL + CHANNEL + DETAIL + AUDIENCE + custom cols

  const planYear = weeks[0]?.year ?? new Date().getFullYear();
  const yearOptions = Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 2 + i);

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
  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      if (!scrollRef.current) return;
      const rect = scrollRef.current.getBoundingClientRect();
      const weekX = e.clientX - rect.left - LEFT_COLS_WIDTH + scrollRef.current.scrollLeft;
      const idx = Math.max(0, Math.min(weeks.length - 1, Math.floor(weekX / weekWidth)));
      setDragState(prev => prev ? { ...prev, endIdx: idx } : null);
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, [isDragging, weeks.length, weekWidth]);

  useEffect(() => {
    if (!isResizing || !resizeState) return;

    const handleMove = (e: MouseEvent) => {
      if (!scrollRef.current) return;
      resizeMoved.current = true;
      const rect = scrollRef.current.getBoundingClientRect();
      const scrollLeft = scrollRef.current.scrollLeft;
      const weekX = e.clientX - rect.left - LEFT_COLS_WIDTH + scrollLeft;
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
              className="border border-gray-100 bg-white hover:bg-blue-50/60 cursor-crosshair select-none transition-colors"
              onMouseDown={e => {
                if (isResizing) return;
                e.preventDefault();
                if (!scrollRef.current) return;
                const rect = scrollRef.current.getBoundingClientRect();
                const weekX = e.clientX - rect.left - LEFT_COLS_WIDTH + scrollRef.current.scrollLeft;
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

      if (flight && flight.startWeek === week.weekStart) {
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

            {flight.budget > 0 && fmt(flight.budget)}

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
          className="border border-gray-100 bg-white hover:bg-blue-50/60 cursor-crosshair select-none transition-colors"
          onMouseDown={e => {
            if (isResizing) return;
            e.preventDefault();
            if (!scrollRef.current) return;
            const rect = scrollRef.current.getBoundingClientRect();
            const weekX = e.clientX - rect.left - LEFT_COLS_WIDTH + scrollRef.current.scrollLeft;
            const weekIdx = Math.max(0, Math.min(weeks.length - 1, Math.floor(weekX / weekWidth)));
            startDrag(row.id, weekIdx);
          }}
        />
      );
      i++;
    }
    return cells;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const stickyBase = "border border-gray-200 bg-white text-xs px-2 py-2";
  const stickyHeader = "border border-gray-200 bg-gray-800 text-white text-xs font-semibold uppercase tracking-wide px-2 py-2";

  return (
    <div className="flex flex-col h-screen bg-gray-100" style={outerStyle}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
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
          onClick={() => setShowAddRow(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add row
        </button>
        <FeeMenu onAdd={addFee} />
        <button
          onClick={onUpload}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
        >
          <Upload className="w-3.5 h-3.5" /> Upload new
        </button>
      </div>

      {/* Grid */}
      <div ref={scrollRef} className="flex-1 overflow-auto bg-white">
        <table
          className="border-collapse"
          style={{ tableLayout: "fixed", minWidth: `${LEFT_COLS_WIDTH + weeks.length * weekWidth}px` }}
        >
          <colgroup>
            <col style={{ width: COL_WIDTHS.del }} />
            <col style={{ width: COL_WIDTHS.funnel }} />
            <col style={{ width: COL_WIDTHS.channel }} />
            <col style={{ width: COL_WIDTHS.detail }} />
            <col style={{ width: COL_WIDTHS.audience }} />
            {customColumns.map(c => <col key={c.id} style={{ width: CUSTOM_COL_W }} />)}
            <col style={{ width: COL_WIDTHS.total }} />
            {weeks.map(w => <col key={w.weekStart} style={{ width: weekWidth }} />)}
          </colgroup>

          <thead>
            <tr style={{ height: HEADER_H }}>
              <th colSpan={6 + customColumns.length} className={stickyHeader}
                style={{ position: "sticky", left: 0, top: 0, zIndex: 30, textAlign: "left" }} />
              {monthGroups.map(mg => (
                <th key={`${mg.month}-${mg.year}`} colSpan={mg.count}
                  className="border border-gray-300 bg-gray-700 text-white text-xs font-bold uppercase tracking-wider text-center"
                  style={{ position: "sticky", top: 0, zIndex: 2 }}>
                  {mg.month} {mg.year !== planYear ? mg.year : ""}
                </th>
              ))}
            </tr>

            <tr style={{ height: HEADER_H }}>
              <th className={stickyHeader}
                style={{ position: "sticky", left: LEFT_OFFSETS.del, top: HEADER_H, zIndex: 20 }} />
              {(["FUNNEL", "CHANNEL", "DETAIL", "AUDIENCE"] as const).map((label, i) => {
                const offsets = [LEFT_OFFSETS.funnel, LEFT_OFFSETS.channel, LEFT_OFFSETS.detail, LEFT_OFFSETS.audience];
                return (
                  <th key={label} className={stickyHeader}
                    style={{ position: "sticky", left: offsets[i], top: HEADER_H, zIndex: 20, textAlign: "left" }}>
                    {label}
                  </th>
                );
              })}
              {customColumns.map((col, ci) => {
                const colLeft = LEFT_OFFSETS.audience + COL_WIDTHS.audience + ci * CUSTOM_COL_W;
                return (
                  <th key={col.id}
                    className={`${stickyHeader} group/colhdr`}
                    style={{ position: "sticky", left: colLeft, top: HEADER_H, zIndex: 20, width: CUSTOM_COL_W }}>
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
                );
              })}
              <th className={stickyHeader}
                style={{ position: "sticky", left: dynamicTotalLeft, top: HEADER_H, zIndex: 20 }}>
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
                  style={{ position: "sticky", top: HEADER_H, zIndex: 2 }}>
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
                    style={{ position: "sticky", left: LEFT_OFFSETS.del, zIndex: 10 }}
                  >
                    <button
                      onClick={() => deleteRow(row.id)}
                      className="text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete row"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                  {span.showFunnel && (
                    <EditableCell value={row.funnel} rowSpan={span.funnelSpan} bold
                      onChange={val => {
                        setRows(prev => {
                          const last = rowIdx + span.funnelSpan;
                          return prev.map((r, i) => i >= rowIdx && i < last ? { ...r, funnel: val } : r);
                        });
                      }}
                      className={`${stickyBase} text-center align-middle bg-gray-50`}
                      style={{ position: "sticky", left: LEFT_OFFSETS.funnel, zIndex: 10 }}
                    />
                  )}
                  {span.showChannel && (
                    <EditableCell value={row.channel} rowSpan={span.channelSpan} bold
                      onChange={val => {
                        setRows(prev => {
                          const last = rowIdx + span.channelSpan;
                          return prev.map((r, i) => i >= rowIdx && i < last ? { ...r, channel: val } : r);
                        });
                      }}
                      className={`${stickyBase} text-center align-middle`}
                      style={{
                        position: "sticky",
                        left: LEFT_OFFSETS.channel,
                        zIndex: 10,
                        ...(row.isOrganic ? { background: 'repeating-linear-gradient(-45deg, #f5f3ff, #f5f3ff 8px, #ede9fe 8px, #ede9fe 16px)' } : {}),
                      }}
                    />
                  )}
                  <EditableCell value={row.detail}
                    onChange={val => updateRow(row.id, r => ({ ...r, detail: val }))}
                    className={`${stickyBase} text-left align-middle`}
                    style={{ position: "sticky", left: LEFT_OFFSETS.detail, zIndex: 10 }}
                  />
                  <EditableCell value={row.audience}
                    onChange={val => updateRow(row.id, r => ({ ...r, audience: val }))}
                    className={`${stickyBase} text-left align-middle`}
                    style={{ position: "sticky", left: LEFT_OFFSETS.audience, zIndex: 10 }}
                  />
                  {customColumns.map((col, ci) => {
                    const colLeft = LEFT_OFFSETS.audience + COL_WIDTHS.audience + ci * CUSTOM_COL_W;
                    return (
                      <EditableCell
                        key={col.id}
                        value={row.customFields?.[col.id] ?? ""}
                        onChange={val => updateCustomField(row.id, col.id, val)}
                        className={`${stickyBase} text-left align-middle`}
                        style={{ position: "sticky", left: colLeft, zIndex: 10 }}
                      />
                    );
                  })}
                  {(!row.flightGroupId || row.isMasterRow) && (
                    <td
                      className={`${stickyBase} text-right align-middle font-medium`}
                      style={{ position: "sticky", left: dynamicTotalLeft, zIndex: 10 }}
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
                totalOffset={dynamicTotalLeft}
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
                    style={{ position: "sticky", left: 0, zIndex: 10 }}
                  >
                    TOTAL NON-MEDIA FEES
                  </td>
                  <td
                    className={`${stickyBase} text-right bg-amber-100 border-amber-200 font-bold text-amber-900`}
                    style={{ position: "sticky", left: dynamicTotalLeft, zIndex: 10 }}
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
                style={{ position: "sticky", left: 0, zIndex: 10 }}
              >
                <button
                  onClick={() => setShowAddRow(true)}
                  className="flex items-center gap-1.5 px-2 text-xs text-gray-300 hover:text-blue-500 font-medium transition-colors w-full py-1"
                >
                  <Plus className="w-3 h-3" /> Add channel
                </button>
              </td>
              <td
                className="border border-dashed border-blue-100 bg-white"
                style={{ position: "sticky", left: dynamicTotalLeft, zIndex: 10, width: COL_WIDTHS.total, minWidth: COL_WIDTHS.total }}
              />
              <td colSpan={weeks.length} className="border border-dashed border-blue-100 bg-white" />
            </tr>

            <tr style={{ height: ROW_H + 4 }}>
              <td colSpan={leftColSpan} className="border border-gray-700 px-2 py-2 text-xs font-bold bg-gray-800 text-white uppercase tracking-wide"
                style={{ position: "sticky", left: 0, zIndex: 10 }}>
                {fees.length > 0 ? "TOTAL MEDIA PLAN" : "TOTAL"}
              </td>
              <td className="border border-gray-700 px-2 py-2 text-right bg-gray-800 text-white font-bold text-sm"
                style={{ position: "sticky", left: dynamicTotalLeft, zIndex: 10 }}>
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

      {showAddRow && (
        <AddRowModal
          existingFunnels={[...new Set(rows.map(r => r.funnel).filter(Boolean))]}
          existingChannels={[...new Set(rows.map(r => r.channel).filter(Boolean))]}
          onAdd={({ funnel, channel, detail, audience }) => {
            setRows(prev => [...prev, { id: uid(), funnel, channel, detail, audience, flights: [] }]);
          }}
          onClose={() => setShowAddRow(false)}
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
