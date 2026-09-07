import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Nango } from '@nangohq/node';
import { runCampaignAudit } from '@/lib/setup-auditor/evaluate';
import type { PlatformCampaign, SetupAuditorPlatform } from '@/types/setup-auditor';

/**
 * Scheduled Setup Auditor scan (see vercel.json). Runs every 12 hours as a
 * safety net alongside the on-demand "Run Setup Audit" button — most
 * discrepancies should be caught on-demand, this just guarantees every
 * registered campaign gets checked periodically even if nobody clicks
 * anything.
 *
 * Batches campaigns per platform with a persisted cursor
 * (campaign_audit_cursor) rather than scanning everything in one tick — a
 * single invocation auditing every client's every campaign risks a Vercel
 * serverless timeout, and a naive full-scan-per-tick would silently drop
 * whatever didn't finish. The cursor means a slow/timed-out tick just
 * resumes where it left off next time instead of skipping campaigns.
 */

const BATCH_SIZE_PER_PLATFORM = 20;
const PLATFORMS: SetupAuditorPlatform[] = ['google-ads', 'meta-ads'];

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

  const summary: Record<string, { checked: number; opened: number; resolved: number; failed: number }> = {};

  for (const platform of PLATFORMS) {
    summary[platform] = { checked: 0, opened: 0, resolved: 0, failed: 0 };

    const { data: cursorRow } = await supabase
      .from('campaign_audit_cursor')
      .select('last_platform_campaign_id')
      .eq('platform', platform)
      .maybeSingle();

    let query = supabase
      .from('platform_campaigns')
      .select('*')
      .eq('platform', platform)
      .eq('is_active', true)
      .order('id', { ascending: true })
      .limit(BATCH_SIZE_PER_PLATFORM);

    if (cursorRow?.last_platform_campaign_id) {
      query = query.gt('id', cursorRow.last_platform_campaign_id);
    }

    let { data: batch } = await query;

    // Reached the end of the ordering — wrap around for next cycle.
    if ((!batch || batch.length === 0) && cursorRow?.last_platform_campaign_id) {
      const { data: fromStart } = await supabase
        .from('platform_campaigns')
        .select('*')
        .eq('platform', platform)
        .eq('is_active', true)
        .order('id', { ascending: true })
        .limit(BATCH_SIZE_PER_PLATFORM);
      batch = fromStart ?? [];
    }

    if (!batch || batch.length === 0) continue;

    let lastId: string | null = null;
    for (const row of batch as PlatformCampaign[]) {
      try {
        const result = await runCampaignAudit(supabase, nango, row);
        summary[platform].checked++;
        if (result.error) summary[platform].failed++;
        else {
          summary[platform].opened += result.opened.length;
          summary[platform].resolved += result.resolved.length;
        }
      } catch {
        summary[platform].failed++;
      }
      lastId = row.id;
      await new Promise((r) => setTimeout(r, 200)); // avoid hammering provider rate limits
    }

    // Check whether more rows remain after this batch; if not, reset the
    // cursor to null so the next tick starts a fresh cycle from the top.
    const { count } = await supabase
      .from('platform_campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('platform', platform)
      .eq('is_active', true)
      .gt('id', lastId ?? '');

    await supabase.from('campaign_audit_cursor').upsert(
      {
        platform,
        last_platform_campaign_id: (count ?? 0) > 0 ? lastId : null,
        last_run_started_at: new Date().toISOString(),
      },
      { onConflict: 'platform' },
    );
  }

  return NextResponse.json({ ok: true, summary });
}
