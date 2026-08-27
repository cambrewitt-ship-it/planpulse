export interface Week {
  weekStart: string; // ISO "YYYY-MM-DD" Monday
  label: string;     // "30-Mar", "6-Apr"
  month: string;     // "APR", "MAY"
  year: number;
}

export interface Flight {
  id: string;
  startWeek: string; // ISO Monday
  endWeek: string;   // ISO Monday (last week of flight)
  budget: number;
  color: string;     // hex
}

export interface PlanRow {
  id: string;
  funnel: string;
  channel: string;
  detail: string;
  audience: string;
  flights: Flight[];
  customFields?: Record<string, string>;
  flightGroupId?: string; // rows sharing a vertically-merged flight block
  isMasterRow?: boolean;  // true = renders the flight cell with rowspan; false = skips it
  isOrganic?: boolean;    // true = organic (unpaid) social channel
}

export interface FeeRow {
  id: string;
  name: string;
  amount: number;
}

export interface CustomColumn {
  id: string;
  name: string;
}

export interface SandboxPlan {
  id: string;
  title: string;
  asAtLabel: string;
  weeks: Week[];
  rows: PlanRow[];
  fees?: FeeRow[];
  customColumns?: CustomColumn[];
  updatedAt: string;
  objective?: string;      // shown in the PDF export's stats row, blank if unset
  agencyName?: string;     // PDF footer / logo placeholder caption
  clientName?: string;     // PDF footer / logo placeholder caption
  agencyLogoUrl?: string;  // PDF header logo (left) — blank placeholder box if unset
  clientLogoUrl?: string;  // PDF header logo (right) — blank placeholder box if unset
}

export const FLIGHT_COLORS = [
  '#4CAF50',
  '#BA68C8',
  '#1565C0',
  '#FF7043',
  '#42A5F5',
  '#FFA726',
  '#EC407A',
  '#26A69A',
  '#78909C',
  '#8D6E63',
];
