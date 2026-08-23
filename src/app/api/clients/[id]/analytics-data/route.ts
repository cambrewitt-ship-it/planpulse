/**
 * Cache-first analytics endpoint for the client dashboard.
 *
 * Normal loads read straight from the DB cache (ad_performance_metrics,
 * google_analytics_metrics) instead of hitting the live Google Ads / Meta /
 * GA4 APIs — those are slow, rate-limited, and don't need to run on every
 * page view. Freshness is otherwise maintained by the 6-hour refresh cron
 * (src/app/api/cron/refresh-ad-data/route.ts); this route only fetches live
 * itself when:
 *   - `force=1` is passed (manual "Refresh Data" actions), or
 *   - a connection has never been synced or its cache has zero rows for the
 *     requested range (first-time / historical-range bootstrap), or
 *   - a connection's last sync is older than 6 hours and the cron hasn't
 *     caught up yet.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Nango } from '@nangohq/node';
import { getActiveConnection, isStale, type SyncPlatform } from '@/lib/ads/sync-status';
import { readCachedSpendData, readCachedGA4Data, hasCachedRows } from '@/lib/ads/cached-analytics';
import { syncGoogleAdsSpend } from '@/lib/ads/google-ads-live';
import { syncMetaAdsSpend } from '@/lib/ads/meta-ads-live';
import { syncGA4Data } from '@/lib/ads/ga4-live';

type Params = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(params: Params['params']): Promise<string> {
  return (await Promise.resolve(params)).id;
}

interface PlatformSyncStatus {
  connected: boolean;
  lastSyncedAt: string | null;
  refreshed: boolean;
  error?: string;
}

export async function GET(req: NextRequest, { params }: Params) {
  const clientId = await resolveId(params);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');
  const eventName = url.searchParams.get('eventName');
  const force = url.searchParams.get('force') === '1' || url.searchParams.get('force') === 'true';
  const metricsParam = url.searchParams.get('metrics');
  const requestedMetrics = metricsParam ? metricsParam.split(',').filter(Boolean) : undefined;

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'Missing required params: startDate, endDate' }, { status: 400 });
  }

  const nangoSecretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
  const nango = nangoSecretKey ? new Nango({ secretKey: nangoSecretKey }) : null;

  const syncStatus: Record<SyncPlatform, PlatformSyncStatus> = {
    'google-ads': { connected: false, lastSyncedAt: null, refreshed: false },
    'meta-ads': { connected: false, lastSyncedAt: null, refreshed: false },
    'google-analytics': { connected: false, lastSyncedAt: null, refreshed: false },
  };
  const errors: string[] = [];

  await Promise.all((['google-ads', 'meta-ads', 'google-analytics'] as SyncPlatform[]).map(async (platform) => {
    const connection = await getActiveConnection(supabase, user.id, clientId, platform);
    if (!connection || !nango) return;

    syncStatus[platform].connected = true;
    syncStatus[platform].lastSyncedAt = connection.last_synced_at;

    const cacheTable = platform === 'google-analytics' ? 'google_analytics_metrics' : 'ad_performance_metrics';
    const cachePlatformFilter = platform === 'google-analytics' ? null : platform;
    const hasAnyCache = await hasCachedRows(supabase, cacheTable, clientId, cachePlatformFilter, startDate, endDate);

    const needsLiveFetch = force || !hasAnyCache || isStale(connection.last_synced_at);
    if (!needsLiveFetch) return;

    try {
      if (platform === 'google-ads') {
        const result = await syncGoogleAdsSpend({
          supabase, nango, userId: user.id, clientId,
          connectionId: connection.connection_id, connectionRowId: connection.id,
          startDate, endDate,
        });
        if (!result.success) errors.push(`Google Ads: ${result.error}`);
      } else if (platform === 'meta-ads') {
        const result = await syncMetaAdsSpend({
          supabase, nango, userId: user.id, clientId,
          connectionId: connection.connection_id, connectionRowId: connection.id,
          startDate, endDate,
        });
        if (!result.success) errors.push(`Meta Ads: ${result.error}`);
      } else {
        const result = await syncGA4Data({
          supabase, nango, userId: user.id, clientId,
          connectionId: connection.connection_id, connectionRowId: connection.id,
          startDate, endDate, requestedMetrics, eventName: eventName || null,
        });
        if (!result.success) errors.push(`Google Analytics: ${result.error}`);
      }
      syncStatus[platform].refreshed = true;
    } catch (err: any) {
      errors.push(`${platform}: ${err.message}`);
      syncStatus[platform].error = err.message;
    }
  }));

  const [spendData, ga4Data] = await Promise.all([
    readCachedSpendData(supabase, clientId, startDate, endDate),
    readCachedGA4Data(supabase, clientId, startDate, endDate),
  ]);

  return NextResponse.json({
    success: true,
    spendData,
    ga4Data,
    syncStatus,
    errors: errors.length > 0 ? errors : undefined,
  });
}
