/**
 * Canonical list of Client Hub sections — the source of truth for keys,
 * default display order, and sidebar labels. Shared between the frontend
 * (nav + section rendering) and the hub API routes (validation + order
 * normalization) so the two can't drift apart.
 */

export interface SectionMetaItem {
  key: string;
  label: string;
}

export const SECTION_META: SectionMetaItem[] = [
  { key: 'snapshot', label: 'Overview' },
  { key: 'cpaTrend', label: 'CPA trend' },
  { key: 'charts', label: 'Performance' },
  { key: 'funnels', label: 'Funnels' },
  { key: 'costPerMetric', label: 'Cost per metric' },
  { key: 'trends', label: 'Trend builder' },
  { key: 'demographics', label: 'Audience' },
  { key: 'pacing', label: 'Pacing' },
  { key: 'goals', label: 'Goals' },
  { key: 'brief', label: 'Brief' },
  { key: 'notes', label: 'Notes' },
  { key: 'documents', label: 'Documents' },
  { key: 'spend', label: 'Spend by channel' },
  { key: 'creatives', label: 'Ad Creatives' },
];

export const SECTION_KEYS: string[] = SECTION_META.map(s => s.key);

/**
 * Filters a stored order down to valid, deduped keys, then appends any
 * section keys missing from it (new sections, or a client with no saved
 * order yet) in canonical order. Guarantees the result is a permutation of
 * SECTION_KEYS regardless of what was persisted.
 */
export function normalizeSectionOrder(stored: unknown): string[] {
  const validKeys = new Set(SECTION_KEYS);
  const fromStored = Array.isArray(stored)
    ? stored.filter((k): k is string => typeof k === 'string' && validKeys.has(k))
    : [];
  const seen = new Set(fromStored);
  const missing = SECTION_KEYS.filter(k => !seen.has(k));
  return [...fromStored, ...missing];
}
