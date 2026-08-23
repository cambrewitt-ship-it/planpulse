/**
 * Tracks per-client, per-platform "last live-synced" state so the dashboard
 * can read cached ad/analytics data instead of hitting the live APIs on
 * every page load. A connection is considered stale after SIX_HOURS_MS —
 * the cron job (src/app/api/cron/refresh-ad-data/route.ts) refreshes stale
 * connections in the background, and manual "Refresh Data" actions stamp
 * last_synced_at immediately, resetting the 6-hour window.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export type SyncPlatform = 'google-ads' | 'meta-ads' | 'google-analytics';

export const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export interface ConnectionSyncRow {
  id: string;
  connection_id: string;
  client_id: string | null;
  last_synced_at: string | null;
}

/**
 * Resolves the active connection row for a given client + platform.
 * ad_platform_connections is scoped one row per (client_id, platform) — never
 * fall back to another client's connection when this client has none, as
 * that would attribute a different client's ad spend to this one.
 */
export async function getActiveConnection(
  supabase: AnySupabase,
  userId: string,
  clientId: string | null,
  platform: SyncPlatform,
): Promise<ConnectionSyncRow | null> {
  if (!clientId) return null;

  const { data } = await supabase
    .from('ad_platform_connections')
    .select('id, connection_id, client_id, last_synced_at')
    .eq('user_id', userId)
    .eq('platform', platform)
    .eq('connection_status', 'active')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1);

  return data?.[0] ?? null;
}

export function isStale(lastSyncedAt: string | null): boolean {
  if (!lastSyncedAt) return true;
  return Date.now() - new Date(lastSyncedAt).getTime() >= SIX_HOURS_MS;
}

/**
 * Stamps the connection row (by primary key, not connection_id — a single
 * Nango connection_id can be shared across several client rows) as freshly
 * synced, resetting its 6-hour staleness window.
 */
export async function markSynced(supabase: AnySupabase, connectionRowId: string): Promise<void> {
  await supabase
    .from('ad_platform_connections')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', connectionRowId);
}
