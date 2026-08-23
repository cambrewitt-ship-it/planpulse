export const TOUR_SEEN_STORAGE_KEY = 'planpulse_tour_seen';

export function hasSeenTour(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(TOUR_SEEN_STORAGE_KEY) === 'true';
  } catch {
    return true;
  }
}

export function markTourSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TOUR_SEEN_STORAGE_KEY, 'true');
  } catch {
    // ignore
  }
}
