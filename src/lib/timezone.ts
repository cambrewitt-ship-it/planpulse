/**
 * All "what day/time is it" logic in this app must be anchored to New Zealand
 * time (the agency's operating timezone), not server UTC or the visiting
 * browser's local zone. Use these helpers instead of raw `new Date()` /
 * `toISOString()` for anything that represents "today", a date-range default,
 * or a user-facing date/time display.
 */

export const NZ_TIMEZONE = 'Pacific/Auckland';

const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: NZ_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: NZ_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function getNZParts(date: Date) {
  const parts = partsFormatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** "YYYY-MM-DD" for the given instant, as a calendar date in NZ time. */
export function toNZDateString(date: Date = new Date()): string {
  return dateKeyFormatter.format(date);
}

/** Today's calendar date in NZ time, as "YYYY-MM-DD". */
export function nzToday(): string {
  return toNZDateString(new Date());
}

/** Current hour (0-23) in NZ time, accounting for NZST/NZDT. */
export function nzHour(date: Date = new Date()): number {
  return getNZParts(date).hour;
}

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: NZ_TIMEZONE,
  weekday: 'short',
});

/** Day of week (0 = Sunday .. 6 = Saturday) as it falls on the NZ calendar. */
export function nzDayOfWeek(date: Date = new Date()): number {
  const short = weekdayFormatter.format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short);
}

/**
 * A "YYYY-MM-DD" NZ date key, shifted by `days` (negative = past, positive =
 * future). Arithmetic is done on the NZ calendar date, so it stays correct
 * across DST transitions.
 */
export function nzDateKeyOffset(days: number, from: Date = new Date()): string {
  const { year, month, day } = getNZParts(from);
  // Construct as UTC noon to avoid any DST edge cases in plain Date math,
  // then re-read only the Y/M/D fields.
  const base = new Date(Date.UTC(year, month - 1, day, 12));
  base.setUTCDate(base.getUTCDate() + days);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(
    base.getUTCDate()
  ).padStart(2, '0')}`;
}

/** Start of the current NZ calendar month, as "YYYY-MM-DD". */
export function nzStartOfMonth(from: Date = new Date()): string {
  const { year, month } = getNZParts(from);
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/** Start of the current NZ calendar quarter, as "YYYY-MM-DD". */
export function nzStartOfQuarter(from: Date = new Date()): string {
  const { year, month } = getNZParts(from);
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`;
}

/** Start of the current NZ calendar year, as "YYYY-MM-DD". */
export function nzStartOfYear(from: Date = new Date()): string {
  const { year } = getNZParts(from);
  return `${year}-01-01`;
}

/** Format an instant using NZ time. Thin wrapper around Intl.DateTimeFormat. */
export function formatNZ(date: Date, options: Intl.DateTimeFormatOptions = {}, locale = 'en-NZ'): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: NZ_TIMEZONE }).format(date);
}

/** e.g. "27 August 2026" */
export function formatNZDate(date: Date): string {
  return formatNZ(date, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** e.g. "Thursday, 27 August" */
export function formatNZWeekdayDate(date: Date): string {
  return formatNZ(date, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** e.g. "3:45 pm" */
export function formatNZTime(date: Date): string {
  return formatNZ(date, { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
}
