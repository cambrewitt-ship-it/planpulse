// src/types/media-plan.ts
import { format, addWeeks, differenceInWeeks, startOfWeek } from 'date-fns';

export interface MediaChannel {
  id: string;
  channel: string;
  detail: string;
  schedule?: string;
  weeklyBudget: number;
  totalBudget: number;
  startWeek: string;
  endWeek: string;
  numberOfWeeks: number;
  isOrganic: boolean;
  postsPerWeek?: number;
  notes?: string;
}

export interface WeeklyBreakdown {
  weekCommencing: string;
  weekNumber: number;
  budget: number;
  postsPlanned?: number;
  actual?: number;
}

export const CHANNEL_OPTIONS = [
  { value: 'facebook', label: 'Facebook', type: 'paid' },
  { value: 'instagram', label: 'Instagram', type: 'paid' },
  { value: 'facebook-instagram', label: 'Facebook & Instagram', type: 'both' },
  { value: 'google-search', label: 'Google Search Ads', type: 'paid' },
  { value: 'google-display', label: 'Google Display Ads', type: 'paid' },
  { value: 'linkedin', label: 'LinkedIn', type: 'both' },
  { value: 'tiktok', label: 'TikTok', type: 'both' },
  { value: 'website', label: 'Website', type: 'other' },
  { value: 'email', label: 'Email Marketing', type: 'other' },
  { value: 'seo', label: 'SEO', type: 'other' },
];

// Helper to get Monday of the week
export const getWeekCommencing = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
};

// Helper to format W/C date
export const formatWeekCommencing = (date: Date): string => {
  return `W/C ${format(date, 'dd/MM/yyyy')}`;
};