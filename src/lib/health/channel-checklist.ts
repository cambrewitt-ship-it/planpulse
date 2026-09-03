// src/lib/health/channel-checklist.ts
// Pure, DB-free helpers for the per-channel health-check checklist system.
// Shared between /api/agency/channel-health, the client-dashboard checklist
// modal (inline-action-points.tsx), and the agency Health view, so the
// staleness/status math lives in exactly one place.

export const DIGITAL_AD_CHANNEL_TYPES = [
  'Meta Ads',
  'Google Ads',
  'LinkedIn Ads',
  'TikTok Ads',
  'Instagram Ads',
  'Snapchat Ads',
  'Pinterest Ads',
  'Reddit Ads',
  'Twitter / X Ads',
] as const;

export type HealthCheckFrequency = 'daily' | 'weekly' | 'fortnightly' | 'monthly';

const FREQUENCY_INTERVAL_DAYS: Record<HealthCheckFrequency, number> = {
  daily: 1,
  weekly: 7,
  fortnightly: 14,
  monthly: 30,
};

/**
 * Normalizes a raw media-plan channel name (e.g. "Google Search") to the
 * canonical channel_type used by action_points (e.g. "Google Ads"). Mirrors
 * the mapping used across TodoSection / InlineActionPoints.
 */
export function normalizeChannelName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('meta') || lower.includes('facebook')) return 'Meta Ads';
  if (lower.includes('google')) return 'Google Ads';
  if (lower.includes('linkedin')) return 'LinkedIn Ads';
  if (lower.includes('tiktok')) return 'TikTok Ads';
  return name;
}

// --- date helpers (UTC, YYYY-MM-DD strings) ---
function dateStrToMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function msToDateStr(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** SET UP due date = channel's (upcoming) start date - days_before_live_due. */
export function calculateSetUpDueDate(
  daysBeforeLive: number | null | undefined,
  channelStartDate: string | null
): string | null {
  if (!channelStartDate || daysBeforeLive === null || daysBeforeLive === undefined) return null;
  return msToDateStr(dateStrToMs(channelStartDate) - daysBeforeLive * 24 * 60 * 60 * 1000);
}

/**
 * Next scheduled occurrence for a recurring HEALTH CHECK item, anchored to
 * the channel's start date. Informational only (e.g. for Gantt markers) —
 * does NOT drive completion state, see computeHealthCheckStaleness for that.
 */
export function computeHealthCheckNextOccurrence(
  frequency: HealthCheckFrequency,
  todayStr: string,
  channelStartDate: string | null
): string | null {
  const intervalDays = FREQUENCY_INTERVAL_DAYS[frequency];
  if (!intervalDays) return null;
  if (!channelStartDate) return todayStr;

  const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
  const todayMs = dateStrToMs(todayStr);
  const startMs = dateStrToMs(channelStartDate);
  const elapsed = todayMs - startMs;
  const n = elapsed > 0 ? Math.floor(elapsed / intervalMs) : 0;
  const nextOccMs = startMs + (n + 1) * intervalMs;
  return msToDateStr(nextOccMs);
}

export interface HealthCheckStaleness {
  checked: boolean;
  stale: boolean;
  daysSinceChecked: number | null;
}

/**
 * Non-reverting completion model: once ticked, an item stays checked
 * indefinitely — `checked` is purely `completedAt !== null`. Staleness is a
 * derived display property only and never flips `checked` back to false.
 */
export function computeHealthCheckStaleness(
  frequency: HealthCheckFrequency | null | undefined,
  completedAt: string | null | undefined,
  now: Date = new Date()
): HealthCheckStaleness {
  if (!completedAt) return { checked: false, stale: false, daysSinceChecked: null };
  const intervalDays = frequency ? FREQUENCY_INTERVAL_DAYS[frequency] : FREQUENCY_INTERVAL_DAYS.weekly;
  const daysSinceChecked = Math.floor((now.getTime() - new Date(completedAt).getTime()) / (24 * 60 * 60 * 1000));
  return { checked: true, stale: daysSinceChecked > intervalDays, daysSinceChecked };
}

export type ChannelChecklistStatus = 'red' | 'amber' | 'green';

/**
 * Rollup status for a channel's checklist: red if SET UP is incomplete or
 * any HEALTH CHECK item has never been checked; amber if everything's
 * checked but something's stale; green if fully checked and fresh.
 */
export function computeChannelStatus(
  setUpItems: { completed: boolean }[],
  healthCheckItems: { frequency: HealthCheckFrequency | null; completedAt: string | null }[],
  now: Date = new Date()
): ChannelChecklistStatus {
  if (setUpItems.some(i => !i.completed)) return 'red';
  const statuses = healthCheckItems.map(i => computeHealthCheckStaleness(i.frequency, i.completedAt, now));
  if (statuses.some(s => !s.checked)) return 'red';
  if (statuses.some(s => s.stale)) return 'amber';
  return 'green';
}
