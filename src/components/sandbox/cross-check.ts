import type { SandboxPlan } from './types';
import type { VisionExtraction } from '@/app/api/media-plan-agent/vision-extract/route';

export interface CrossCheckResult {
  totalMatch: boolean;
  sandboxTotal: number;
  visionTotal: number;
  dateRangeMatch: boolean;
  sandboxRange: [string, string] | null;
  visionRange: [string, string] | null;
}

// Deliberately coarse: the two extraction pipelines produce structurally different
// shapes (one flight budget per flight vs. a per-month spend map, and channel-name
// conventions that won't line up 1:1), so a row-by-row diff would be fragile. Total
// spend and date range are the two signals robust enough to compare directly — and
// exactly what would have caught the reported date-rollover bug.

function sandboxTotal(plan: SandboxPlan): number {
  const flightsTotal = plan.rows.reduce(
    (sum, row) => sum + row.flights.reduce((s, f) => s + (f.budget || 0), 0),
    0
  );
  const feesTotal = (plan.fees ?? []).reduce((s, f) => s + (f.amount || 0), 0);
  return flightsTotal + feesTotal;
}

function visionTotal(vision: VisionExtraction): number {
  const flightsTotal = vision.channels.reduce(
    (sum, ch) =>
      sum +
      ch.flights.reduce((s, f) => s + Object.values(f.monthlySpend || {}).reduce((a, b) => a + b, 0), 0),
    0
  );
  const feesTotal = (vision.fees ?? []).reduce((s, f) => s + (f.amount || 0), 0);
  return flightsTotal + feesTotal;
}

function sandboxDateRange(plan: SandboxPlan): [string, string] | null {
  const starts = plan.rows.flatMap(r => r.flights.map(f => f.startWeek)).filter(Boolean).sort();
  const ends = plan.rows.flatMap(r => r.flights.map(f => f.endWeek)).filter(Boolean).sort();
  if (starts.length === 0 || ends.length === 0) return null;
  return [starts[0], ends[ends.length - 1]];
}

function visionDateRange(vision: VisionExtraction): [string, string] | null {
  const starts = vision.channels.flatMap(ch => ch.flights.map(f => f.startDate)).filter(Boolean).sort();
  const ends = vision.channels.flatMap(ch => ch.flights.map(f => f.endDate)).filter(Boolean).sort();
  if (starts.length === 0 || ends.length === 0) return null;
  return [starts[0], ends[ends.length - 1]];
}

// Both sides emit "YYYY-MM-DD" — compare on the YYYY-MM prefix so a Monday-snap vs.
// an exact human-read day doesn't register as a false mismatch.
function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function compareExtractions(plan: SandboxPlan, vision: VisionExtraction): CrossCheckResult {
  const sTotal = sandboxTotal(plan);
  const vTotal = visionTotal(vision);
  const totalMatch =
    sTotal === 0 || vTotal === 0 ? true : Math.abs(sTotal - vTotal) / Math.max(sTotal, vTotal) <= 0.02;

  const sandboxRange = sandboxDateRange(plan);
  const visionRange = visionDateRange(vision);
  const dateRangeMatch =
    !sandboxRange || !visionRange
      ? true
      : monthKey(sandboxRange[0]) === monthKey(visionRange[0]) &&
        monthKey(sandboxRange[1]) === monthKey(visionRange[1]);

  return { totalMatch, sandboxTotal: sTotal, visionTotal: vTotal, dateRangeMatch, sandboxRange, visionRange };
}
