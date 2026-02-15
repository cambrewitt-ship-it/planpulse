export interface TimeFrame {
  period: string; // e.g., "Nov 2025"
  planned: number;
  actual: number;
  startDate: string; // ISO date
  endDate: string; // ISO date
  // Performance metrics (optional - populated when syncing with ad platforms)
  impressions?: number;
  reach?: number; // Meta Ads only
  clicks?: number;
  ctr?: number; // Click-through rate as decimal (0.05 = 5%)
  cpc?: number; // Cost per click
  cpm?: number; // Cost per 1000 impressions (Meta Ads)
  conversions?: number; // Google Ads only
  frequency?: number; // Meta Ads only - average impressions per person
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  priority?: "critical" | "normal";
}

export interface MediaChannel {
  id: string;
  name: string;
  detail: string;
  schedule: string;
  costPerMonth: number;
  color: string; // hex color
  status: "active" | "paused" | "draft";
  timeFrames: TimeFrame[];
  checklist: ChecklistItem[];
  platformType: "meta-ads" | "google-ads" | "organic" | "other";
  adAccountId?: string; // for API integration
}

export interface MediaPlanSummary {
  totalBudget: number;
  actualSpend: number;
  spendRate: number; // percentage
  onTrackCount: number;
  totalChannels: number;
}

export type ViewMode = "month" | "week";

