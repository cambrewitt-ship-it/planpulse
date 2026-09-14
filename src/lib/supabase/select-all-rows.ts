/**
 * Supabase/PostgREST caps a single select response at a server-configured
 * max row count (1000 by default on Supabase-hosted projects) even when no
 * `.limit()` is specified in the query. Any read that can plausibly exceed
 * that — a time-series table queried over a wide date range, e.g. a year of
 * daily ad_performance_metrics rows across several campaigns — will silently
 * come back truncated with no error, which reads as "missing data" rather
 * than an obvious failure.
 *
 * This pages through with `.range()` until a page comes back short. Pass a
 * factory that returns a *fresh* query builder (filters + `.order()`
 * already applied, but not `.range()`) — a fresh instance is required each
 * call since a Postgrest builder fires its request once awaited/chained.
 * An explicit `.order()` on the query is required for `.range()` to page
 * correctly: without one, Postgres doesn't guarantee stable row order
 * between separate requests, so pages could skip or repeat rows.
 */
export async function selectAllRows<T = any>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildQuery: () => any,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await buildQuery().range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}
