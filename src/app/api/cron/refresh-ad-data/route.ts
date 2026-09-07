import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Nango } from '@nangohq/node';
import { subDays, format } from 'date-fns';
import { syncGoogleAdsSpend } from '@/lib/ads/google-ads-live';
import { syncMetaAdsSpend } from '@/lib/ads/meta-ads-live';
import { syncGA4Data } from '@/lib/ads/ga4-live';
import { syncGA4Breakdowns } from '@/lib/ads/ga4-breakdowns';
import { SIX_HOURS_MS } from '@/lib/ads/sync-status';
import { nzToday, nzStartOfYear } from '@/lib/timezone';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

// syncGA4Breakdowns is ~6 GA4 report calls per property vs. syncGA4Data's 1,
// so it doesn't need to re-run on every 6h tick — only once its cached rows
// are this stale. See ga4-breakdowns.ts's header comment.
const BREAKDOWN_STALE_MS = 20 * 60 * 60 * 1000;

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

/**
 * Auto-syncs GA4 dimension breakdowns (Traffic donuts, Behaviour tables, the
 * Dimension Explorer) once a client's cached rows are >~20h old, so those
 * cards populate without anyone remembering to click "Sync breakdown data".
 * Best-effort: a failure here shouldn't fail the metrics refresh above it.
 */
async function maybeSyncGA4Breakdowns(
  supabase: AnySupabase,
  nango: Nango,
  row: { user_id: string; client_id: string; connection_id: string },
): Promise<void> {
  try {
    const { data: lastRow } = await supabase
      .from('google_analytics_breakdowns')
      .select('updated_at')
      .eq('client_id', row.client_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const isStale = !lastRow || Date.now() - new Date(lastRow.updated_at).getTime() >= BREAKDOWN_STALE_MS;
    if (!isStale) return;

    const { data: client } = await supabase.from('clients').select('name').eq('id', row.client_id).maybeSingle();
    const today = new Date();
    await syncGA4Breakdowns({
      supabase, nango, userId: row.user_id, clientId: row.client_id, clientName: client?.name ?? 'Client',
      connectionId: row.connection_id,
      startDate: format(subDays(today, 29), 'yyyy-MM-dd'),
      endDate: format(today, 'yyyy-MM-dd'),
    });
  } catch {
    // Best-effort — the section's manual "Sync" button remains available if this keeps failing.
  }
}

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

      if (row.platform === 'google-analytics' && row.client_id) {
        await maybeSyncGA4Breakdowns(supabase, nango, row);
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
