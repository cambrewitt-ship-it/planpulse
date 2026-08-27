import type { SandboxPlan, PlanRow, Flight, Week, FeeRow, CustomColumn } from '@/components/sandbox/types';
import { FLIGHT_COLORS } from '@/components/sandbox/types';
import type { MediaPlanChannel } from '@/components/legacy-plan-builder/media-plan-grid';

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function toMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const out = new Date(d);
  out.setDate(d.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekLabel(d: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()}-${months[d.getMonth()]}`;
}

function monthLabel(d: Date): string {
  return ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getMonth()];
}

function buildWeeksForRange(start: Date, end: Date): Week[] {
  const weeks: Week[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const thu = new Date(cur.getTime() + 3 * 86400000);
    weeks.push({ weekStart: isoDate(cur), label: weekLabel(cur), month: monthLabel(thu), year: cur.getFullYear() });
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

/**
 * A fresh, empty SandboxPlan spanning one calendar year — same shape UploadWizard's
 * own "Start from scratch" builds, reused here so the AI-screenshot entry point on
 * that same screen can hand off into the grid+chat view before anything is parsed.
 */
export function createBlankSandboxPlan(year: number = new Date().getFullYear()): SandboxPlan {
  const firstMonday = toMonday(new Date(year, 0, 1));
  const weeks = buildWeeksForRange(firstMonday, toMonday(new Date(year, 11, 31)));
  return {
    id: `plan-${Date.now()}`,
    title: 'New Media Plan',
    asAtLabel: '',
    weeks,
    rows: [{ id: `row-${Date.now()}`, funnel: 'AWARENESS', channel: '', detail: '', audience: '', flights: [] }],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Rebuilds a full SandboxPlan (the grid's canonical shape) from a MediaPlanChannel[]
 * array. Used whenever a write touches `channels` but no `sandbox_plan` exists yet
 * to sync into — mirrors the dashboard's own channels→SandboxPlan reverse-sync effect
 * (src/app/clients/[id]/dashboard/page.tsx) so both stay visually consistent.
 */
export function channelsToSandboxPlan(channels: MediaPlanChannel[], existingPlan?: SandboxPlan | null): SandboxPlan {
  const rows: PlanRow[] = channels.map((ch, chIdx) => {
    const isOrganic = ch.channelCategory === 'organic_social';
    const flights: Flight[] = (ch.flights || []).map((f, fIdx) => {
      const startWeek = toMonday(new Date(f.startWeek));
      const endWeek = toMonday(new Date(f.endWeek));
      const numWeeks = Math.max(1, Math.round((endWeek.getTime() - startWeek.getTime()) / MS_PER_WEEK) + 1);
      const budget = f.monthlySpend && Object.keys(f.monthlySpend).length > 0
        ? Object.values(f.monthlySpend).reduce((a, b) => a + b, 0)
        : (f.weeklyBudget ?? 0) * numWeeks;
      return {
        id: `sb-${f.id || `${chIdx}-${fIdx}`}-${Date.now()}`,
        startWeek: isoDate(startWeek),
        endWeek: isoDate(endWeek),
        budget: Math.round(budget),
        color: f.color || FLIGHT_COLORS[chIdx % FLIGHT_COLORS.length],
      };
    });
    return {
      id: `row-${ch.id || chIdx}-${Date.now()}`,
      funnel: '',
      channel: ch.customChannelName || ch.channelName,
      detail: ch.channelSubType || '',
      audience: '',
      flights,
      isMasterRow: true,
      isOrganic,
    };
  });

  const allTimes: number[] = [];
  for (const row of rows) for (const f of row.flights) {
    allTimes.push(new Date(f.startWeek).getTime(), new Date(f.endWeek).getTime());
  }
  const now = new Date();
  const planStart = allTimes.length ? toMonday(new Date(Math.min(...allTimes))) : toMonday(now);
  const planEnd = allTimes.length ? toMonday(new Date(Math.max(...allTimes))) : toMonday(now);

  return {
    id: existingPlan?.id || `plan-${Date.now()}`,
    title: existingPlan?.title || 'Media Plan',
    asAtLabel: existingPlan?.asAtLabel || '',
    weeks: buildWeeksForRange(planStart, planEnd),
    rows,
    fees: existingPlan?.fees || [],
    customColumns: existingPlan?.customColumns || [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Applies a single month's budget delta to the matching flight in an existing
 * SandboxPlan. SandboxPlan flights carry one aggregate `budget` for their whole
 * date span (no per-month breakdown like MediaPlanChannel.monthlySpend), so a
 * month-level edit is represented as a delta against whichever flight overlaps
 * that month — exact when the flight is scoped to a single month (the common
 * case), an approximation for flights spanning several months.
 */
export function patchSandboxPlanFlightBudget(
  plan: SandboxPlan,
  channelName: string,
  month: string, // "YYYY-MM"
  budgetDelta: number
): SandboxPlan {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthIdx = Number(monthStr) - 1;
  if (Number.isNaN(year) || Number.isNaN(monthIdx)) return plan;

  const monthStart = new Date(year, monthIdx, 1);
  const monthEnd = new Date(year, monthIdx + 1, 0);

  const targetRow = plan.rows.find(
    r => r.isMasterRow !== false && r.channel?.toLowerCase().includes(channelName.toLowerCase())
  );
  if (!targetRow || !targetRow.flights.length) return plan;

  const overlapping = targetRow.flights.find(f => {
    const s = new Date(f.startWeek);
    const e = new Date(f.endWeek);
    return s <= monthEnd && e >= monthStart;
  });
  const targetFlight = overlapping ?? targetRow.flights[0];

  const rows = plan.rows.map(row =>
    row.id === targetRow.id
      ? {
          ...row,
          flights: row.flights.map(f =>
            f.id === targetFlight.id ? { ...f, budget: Math.max(0, Math.round(f.budget + budgetDelta)) } : f
          ),
        }
      : row
  );

  return { ...plan, rows, updatedAt: new Date().toISOString() };
}

/** Snaps an arbitrary calendar date to its week-commencing Monday, as "YYYY-MM-DD". */
export function snapToWeekCommencing(dateStr: string): string {
  return isoDate(toMonday(new Date(dateStr)));
}

/**
 * Creates or updates a single flight (a W/C date-range burst) on a channel row,
 * without touching that channel's other flights — used by the
 * update_media_plan_flight agent tool so a week-commencing edit stays surgical
 * instead of replacing the whole channel the way set_media_plan_channels does.
 * A new flight whose range overlaps an existing one on the same channel replaces
 * it (same burst, adjusted); otherwise it's appended as a new burst.
 */
export function upsertSandboxPlanFlight(
  plan: SandboxPlan | null,
  channelName: string,
  flight: { startWeek: string; endWeek: string; budget: number },
  rowDefaults?: { detail?: string; isOrganic?: boolean }
): SandboxPlan {
  const base: SandboxPlan = plan ?? {
    id: `plan-${Date.now()}`,
    title: 'Media Plan',
    asAtLabel: '',
    weeks: [],
    rows: [],
    fees: [],
    customColumns: [],
    updatedAt: new Date().toISOString(),
  };

  const rows = [...base.rows];
  const rowIdx = rows.findIndex(r => r.isMasterRow !== false && r.channel.toLowerCase() === channelName.toLowerCase());
  const usedColors = new Set(rows.flatMap(r => r.flights.map(f => f.color)));
  const pickColor = () => {
    for (const c of FLIGHT_COLORS) if (!usedColors.has(c)) return c;
    return FLIGHT_COLORS[rows.length % FLIGHT_COLORS.length];
  };

  if (rowIdx === -1) {
    rows.push({
      id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      funnel: '',
      channel: channelName,
      detail: rowDefaults?.detail || '',
      audience: '',
      flights: [{ id: `flight-${Date.now()}`, startWeek: flight.startWeek, endWeek: flight.endWeek, budget: Math.round(flight.budget), color: pickColor() }],
      isMasterRow: true,
      isOrganic: rowDefaults?.isOrganic ?? false,
    });
  } else {
    const row = rows[rowIdx];
    const flights = [...row.flights];
    const start = new Date(flight.startWeek).getTime();
    const end = new Date(flight.endWeek).getTime();
    const overlapIdx = flights.findIndex(f => new Date(f.startWeek).getTime() <= end && new Date(f.endWeek).getTime() >= start);
    if (overlapIdx >= 0) {
      flights[overlapIdx] = { ...flights[overlapIdx], startWeek: flight.startWeek, endWeek: flight.endWeek, budget: Math.round(flight.budget) };
    } else {
      flights.push({ id: `flight-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, startWeek: flight.startWeek, endWeek: flight.endWeek, budget: Math.round(flight.budget), color: pickColor() });
    }
    rows[rowIdx] = { ...row, flights };
  }

  const allTimes: number[] = [];
  for (const row of rows) for (const f of row.flights) allTimes.push(new Date(f.startWeek).getTime(), new Date(f.endWeek).getTime());
  const weeks = allTimes.length
    ? buildWeeksForRange(toMonday(new Date(Math.min(...allTimes))), toMonday(new Date(Math.max(...allTimes))))
    : base.weeks;

  return { ...base, rows, weeks, updatedAt: new Date().toISOString() };
}

export interface ExtractionFlight {
  startDate: string; // ISO
  endDate: string; // ISO
  monthlySpend?: Record<string, number>;
  budget?: number;
}

export interface ExtractionChannel {
  channelName: string;
  customChannelName?: string;
  format?: string;
  isOrganic?: boolean;
  flights: ExtractionFlight[];
  customFields?: Record<string, string>;
}

export interface ExtractionFee {
  name: string;
  amount: number;
}

export interface ExtractionCustomColumn {
  name: string;
}

export interface PlanExtraction {
  channels: ExtractionChannel[];
  fees?: ExtractionFee[];
  customColumns?: ExtractionCustomColumn[];
}

/**
 * Non-destructive merge of a confirmed vision extraction into the current
 * SandboxPlan: rows are matched/updated by channel name, unmatched existing
 * rows/fees/columns are preserved untouched, new ones are appended.
 */
export function mergeExtractionIntoPlan(existingPlan: SandboxPlan | null, extraction: PlanExtraction): SandboxPlan {
  const base: SandboxPlan = existingPlan ?? {
    id: `plan-${Date.now()}`,
    title: 'Media Plan',
    asAtLabel: '',
    weeks: [],
    rows: [],
    fees: [],
    customColumns: [],
    updatedAt: new Date().toISOString(),
  };

  const existingCustomColumns = base.customColumns ?? [];
  const newColumnNames = (extraction.customColumns ?? [])
    .map(c => c.name)
    .filter(name => !existingCustomColumns.some(ec => ec.name.toLowerCase() === name.toLowerCase()));
  const customColumns: CustomColumn[] = [
    ...existingCustomColumns,
    ...newColumnNames.map(name => ({ id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name })),
  ];

  const columnIdByName = new Map(customColumns.map(c => [c.name.toLowerCase(), c.id]));

  const usedColors = new Set(base.rows.flatMap(r => r.flights.map(f => f.color)));
  let colorIdx = 0;
  const nextColor = () => {
    while (usedColors.has(FLIGHT_COLORS[colorIdx % FLIGHT_COLORS.length])) colorIdx++;
    const c = FLIGHT_COLORS[colorIdx % FLIGHT_COLORS.length];
    usedColors.add(c);
    colorIdx++;
    return c;
  };

  const updatedRows: PlanRow[] = [...base.rows];
  // Rows appended by this same extraction batch must never be matched/overwritten
  // by a later channel in the same batch, even if two channels resolve to the same
  // display name (e.g. two distinct channels both mapping to "Google Ads") — only
  // pre-existing plan rows are eligible merge targets, and each can be claimed once.
  const priorRowCount = base.rows.length;
  const claimedPriorRows = new Set<number>();

  for (const ch of extraction.channels) {
    const displayName = ch.customChannelName || ch.channelName;
    const flights: Flight[] = ch.flights.map((f, fIdx) => {
      const startWeek = toMonday(new Date(f.startDate));
      const endWeek = toMonday(new Date(f.endDate));
      const budget = f.budget != null
        ? f.budget
        : f.monthlySpend
          ? Object.values(f.monthlySpend).reduce((a, b) => a + b, 0)
          : 0;
      return {
        id: `flight-${Date.now()}-${fIdx}-${Math.random().toString(36).slice(2, 7)}`,
        startWeek: isoDate(startWeek),
        endWeek: isoDate(endWeek),
        budget: Math.round(budget),
        color: nextColor(),
      };
    });

    const existingIdx = updatedRows.findIndex((r, idx) =>
      idx < priorRowCount && !claimedPriorRows.has(idx) && r.channel.toLowerCase() === displayName.toLowerCase()
    );
    const prior = existingIdx >= 0 ? updatedRows[existingIdx] : null;

    // ch.customFields is keyed by the custom column's display NAME (that's what the
    // vision extraction produces); PlanRow.customFields is keyed by CustomColumn.id
    // (that's what the grid reads/writes), so remap name -> id before merging.
    const remappedCustomFields: Record<string, string> = {};
    for (const [name, value] of Object.entries(ch.customFields ?? {})) {
      const colId = columnIdByName.get(name.toLowerCase());
      if (colId) remappedCustomFields[colId] = value;
    }

    const newRow: PlanRow = {
      id: prior?.id ?? `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      funnel: prior?.funnel ?? '',
      channel: displayName,
      detail: ch.format || prior?.detail || '',
      audience: prior?.audience ?? '',
      flights,
      isMasterRow: true,
      isOrganic: ch.isOrganic ?? prior?.isOrganic ?? false,
      customFields: { ...(prior?.customFields || {}), ...remappedCustomFields },
    };

    if (existingIdx >= 0) {
      updatedRows[existingIdx] = newRow;
      claimedPriorRows.add(existingIdx);
    } else {
      updatedRows.push(newRow);
    }
  }

  const existingFees = base.fees ?? [];
  const mergedFees: FeeRow[] = [...existingFees];
  for (const fee of extraction.fees ?? []) {
    const idx = mergedFees.findIndex(f => f.name.toLowerCase() === fee.name.toLowerCase());
    if (idx >= 0) mergedFees[idx] = { ...mergedFees[idx], amount: fee.amount };
    else mergedFees.push({ id: `fee-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: fee.name, amount: fee.amount });
  }

  const allTimes: number[] = [];
  for (const row of updatedRows) for (const f of row.flights) {
    allTimes.push(new Date(f.startWeek).getTime(), new Date(f.endWeek).getTime());
  }
  const weeks = allTimes.length
    ? buildWeeksForRange(toMonday(new Date(Math.min(...allTimes))), toMonday(new Date(Math.max(...allTimes))))
    : base.weeks;

  return {
    ...base,
    rows: updatedRows,
    fees: mergedFees,
    customColumns,
    weeks,
    updatedAt: new Date().toISOString(),
  };
}
