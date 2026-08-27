import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Nango } from '@nangohq/node';
import { syncGoogleAdsSpend } from '@/lib/ads/google-ads-live';
import { syncMetaAdsSpend } from '@/lib/ads/meta-ads-live';
import { syncGA4Data } from '@/lib/ads/ga4-live';
import { SIX_HOURS_MS } from '@/lib/ads/sync-status';
import { nzToday, nzStartOfYear } from '@/lib/timezone';

/**
 * Refreshes any ad spend / GA4 connection whose cache has gone stale
 * (last_synced_at missing or >6h old), so the dashboard's cache-first reads
 * (src/app/api/clients/[id]/analytics-data/route.ts) stay fresh without
 * ever blocking a page load on a live API call. Runs every 6 hours (see
 * vercel.json). Manual "Refresh Data" actions stamp last_synced_at
 * immediately on success, so this cron naturally skips anything a user just
 * refreshed by hand.
 *
 * Fetches year-to-date through today for every stale connection — the same
 * default range the dashboard shows. Historical days rarely change, so
 * re-fetching the full range every cycle is wasteful in theory but cheap in
 * practice, and it avoids tracking partial date-range coverage per client.
 */

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const nangoSecretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase env vars not configured' }, { status: 500 });
  }
  if (!nangoSecretKey) {
    return NextResponse.json({ error: 'NANGO_SECRET_KEY_DEV_PLAN_CHECK not configured' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const nango = new Nango({ secretKey: nangoSecretKey });

  const staleCutoff = new Date(Date.now() - SIX_HOURS_MS).toISOString();

  const { data: rows, error: fetchError } = await supabase
    .from('ad_platform_connections')
    .select('id, connection_id, user_id, client_id, platform, last_synced_at')
    .eq('connection_status', 'active')
    .not('client_id', 'is', null)
    .or(`last_synced_at.is.null,last_synced_at.lt.${staleCutoff}`);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!rows?.length) {
    return NextResponse.json({ ok: true, refreshed: 0, failed: 0 });
  }

  const startDate = nzStartOfYear();
  const endDate = nzToday();

  let refreshed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const row of rows) {
    try {
      const args = {
        supabase,
        nango,
        userId: row.user_id,
        clientId: row.client_id,
        connectionId: row.connection_id,
        connectionRowId: row.id,
        startDate,
        endDate,
      };

      const result = row.platform === 'google-ads' ? await syncGoogleAdsSpend(args)
        : row.platform === 'meta-ads' ? await syncMetaAdsSpend(args)
        : row.platform === 'google-analytics' ? await syncGA4Data(args)
        : null;

      if (!result) {
        continue; // Unknown platform — nothing to refresh
      }

      if (result.success) {
        refreshed++;
      } else {
        failed++;
        failures.push(`${row.platform}/${row.client_id}: ${result.error}`);
      }
    } catch (err: any) {
      failed++;
      failures.push(`${row.platform}/${row.client_id}: ${err.message}`);
    }

    // Small pause between connections to avoid hammering provider rate limits.
    await new Promise((r) => setTimeout(r, 200));
  }

  return NextResponse.json({
    ok: true,
    checked: rows.length,
    refreshed,
    failed,
    failures: failures.length > 0 ? failures.slice(0, 20) : undefined,
  });
}
