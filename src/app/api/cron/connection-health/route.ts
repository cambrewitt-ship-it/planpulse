import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

// Lightweight token probe — returns true if the token is still valid with the provider.
// Uses the cheapest possible API call for each platform.
async function probeToken(platform: string, accessToken: string): Promise<boolean> {
  try {
    if (platform === 'google-ads') {
      const res = await fetch(
        'https://googleads.googleapis.com/v25/customers:listAccessibleCustomers',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
          },
        }
      );
      // 401 = invalid token. 403 = valid token but no accessible customers (still healthy).
      return res.status !== 401;
    }

    if (platform === 'meta-ads') {
      const res = await fetch(
        `https://graph.facebook.com/v26.0/me?fields=id&access_token=${encodeURIComponent(accessToken)}`
      );
      return res.ok;
    }

    if (platform === 'google-analytics') {
      const res = await fetch(
        'https://analyticsdata.googleapis.com/v1beta/properties',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      return res.status !== 401;
    }

    // Unknown platform — assume healthy so we don't incorrectly expire it.
    return true;
  } catch {
    // Network error — don't penalise the connection, try again next run.
    return true;
  }
}

async function markConnectionStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  connectionId: string,
  status: 'expired'
) {
  const { error } = await supabase
    .from('ad_platform_connections')
    .update({ connection_status: status, updated_at: new Date().toISOString() })
    .eq('connection_id', connectionId);

  if (error) {
    console.error(`Failed to mark connection ${connectionId} as ${status}:`, error.message);
  }
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

  // Fetch all active connections across all users.
  const { data: rows, error: fetchError } = await supabase
    .from('ad_platform_connections')
    .select('connection_id, platform, user_id')
    .eq('connection_status', 'active');

  if (fetchError) {
    console.error('Failed to fetch active connections:', fetchError.message);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!rows?.length) {
    return NextResponse.json({ ok: true, checked: 0, expired: 0 });
  }

  // Deduplicate by connection_id — one Nango connection may be linked to several clients,
  // but we only need to probe the token once.
  const seen = new Map<string, { connection_id: string; platform: string }>();
  for (const row of rows) {
    if (!seen.has(row.connection_id)) {
      seen.set(row.connection_id, { connection_id: row.connection_id, platform: row.platform });
    }
  }

  let checked = 0;
  let expired = 0;
  let healthy = 0;
  const failures: string[] = [];

  for (const { connection_id, platform } of seen.values()) {
    checked++;

    let accessToken: string | null = null;

    try {
      const nangoConn = await nango.getConnection(toNangoPlatform(platform), connection_id);
      accessToken = (nangoConn.credentials as any)?.access_token ?? null;
    } catch (err: any) {
      // Nango couldn't find or refresh the connection at all.
      console.warn(`Nango error for ${connection_id} (${platform}):`, err?.message);
      await markConnectionStatus(supabase, connection_id, 'expired');
      failures.push(`${connection_id}: nango error — ${err?.message}`);
      expired++;
      continue;
    }

    if (!accessToken) {
      console.warn(`No access token for ${connection_id} (${platform})`);
      await markConnectionStatus(supabase, connection_id, 'expired');
      failures.push(`${connection_id}: no access token`);
      expired++;
      continue;
    }

    const isHealthy = await probeToken(platform, accessToken);

    if (!isHealthy) {
      console.warn(`Token probe failed for ${connection_id} (${platform})`);
      await markConnectionStatus(supabase, connection_id, 'expired');
      failures.push(`${connection_id}: token probe failed`);
      expired++;
    } else {
      healthy++;
    }

    // Small pause to avoid hammering provider rate limits when there are many connections.
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`Connection health check complete: ${checked} checked, ${healthy} healthy, ${expired} expired`);

  return NextResponse.json({
    ok: true,
    checked,
    healthy,
    expired,
    ...(failures.length ? { failures } : {}),
  });
}
