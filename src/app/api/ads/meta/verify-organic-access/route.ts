import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isClientOwnedByUser } from '@/lib/client-hub/assert-ownership';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

/**
 * Throwaway access-verification spike for the Client Hub report-replication
 * plan (Chunk 1b) — NOT a shippable feature, delete once Chunk 5 is built
 * and its production sync code has confirmed real access.
 *
 * Hard gate: if the Page/IG Insights probes below 403, Chunk 5 (Organic
 * Social) is blocked until the agency reconnects Meta with
 * pages_read_engagement, pages_show_list, instagram_basic, and
 * instagram_manage_insights scopes. Reuses the connection/page/IG-account
 * resolution logic already proven correct in
 * src/app/api/clients/[id]/organic-social-actuals/fetch-posts/route.ts.
 *
 * Call: GET /api/ads/meta/verify-organic-access?clientId=<id>
 */

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId');
  if (!clientId) return NextResponse.json({ error: 'clientId query param is required' }, { status: 400 });

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isClientOwnedByUser(supabase, clientId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: connections } = await supabase
    .from('ad_platform_connections')
    .select('connection_id, platform')
    .eq('client_id', clientId)
    .in('platform', ['meta-ads', 'facebook'])
    .eq('connection_status', 'active')
    .order('platform', { ascending: true })
    .limit(1);

  if (!connections || connections.length === 0) {
    return NextResponse.json({ error: 'No active Meta connection found for this client.' }, { status: 404 });
  }
  const connection = connections[0];
  const nangoPlatform = connection.platform === 'facebook' ? 'facebook' : toNangoPlatform('meta-ads');

  const nangoSecretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
  if (!nangoSecretKey) return NextResponse.json({ error: 'Server configuration error: Nango secret key not found' }, { status: 500 });

  const nango = new Nango({ secretKey: nangoSecretKey });
  let accessToken: string | undefined;
  try {
    const nangoConnection = await nango.getConnection(nangoPlatform, connection.connection_id);
    accessToken = (nangoConnection.credentials as { access_token?: string })?.access_token;
  } catch (e: unknown) {
    return NextResponse.json({ error: `Nango connection failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 424 });
  }
  if (!accessToken) return NextResponse.json({ error: 'No access token in Nango connection' }, { status: 401 });

  const results: Record<string, unknown> = {};

  // Granted permissions (already probed in fetch-posts/route.ts — reused here to gate everything below)
  const permsRes = await fetch(`https://graph.facebook.com/v26.0/me/permissions?access_token=${accessToken}`);
  const grantedPermissions: string[] = permsRes.ok
    ? ((await permsRes.json()).data ?? []).filter((p: { status: string }) => p.status === 'granted').map((p: { permission: string }) => p.permission)
    : [];
  results.grantedPermissions = grantedPermissions;

  const requiredScopes = ['pages_read_engagement', 'pages_show_list', 'instagram_basic', 'instagram_manage_insights'];
  results.missingScopes = requiredScopes.filter(s => !grantedPermissions.includes(s));

  // Resolve page + IG business account, same as fetch-posts/route.ts
  const pagesRes = await fetch(`https://graph.facebook.com/v26.0/me/accounts?fields=id,name,access_token&access_token=${accessToken}`);
  if (!pagesRes.ok) {
    results.pagesError = await pagesRes.text();
    return NextResponse.json({ clientId, ...results, gate: 'FAIL — could not list Facebook pages' });
  }
  const pages = (await pagesRes.json()).data ?? [];
  results.pageCount = pages.length;
  if (pages.length === 0) {
    return NextResponse.json({ clientId, ...results, gate: 'FAIL — no Facebook pages accessible' });
  }

  const page = pages[0];
  const pageAccessToken = page.access_token || accessToken;
  results.pageId = page.id;
  results.pageName = page.name;

  const igRes = await fetch(`https://graph.facebook.com/v26.0/${page.id}?fields=instagram_business_account&access_token=${pageAccessToken}`);
  const igAccountId: string | null = igRes.ok ? (await igRes.json()).instagram_business_account?.id ?? null : null;
  results.instagramBusinessAccountId = igAccountId;

  // Page Insights probe
  const pageInsightsRes = await fetch(
    `https://graph.facebook.com/v26.0/${page.id}/insights?metric=page_fans,page_impressions_organic&period=day&access_token=${pageAccessToken}`
  );
  const pageInsightsBody = await pageInsightsRes.json().catch(() => null);
  results.pageInsights = { status: pageInsightsRes.status, ok: pageInsightsRes.ok, body: pageInsightsBody };

  // IG Insights probe (only if an IG business account is linked)
  if (igAccountId) {
    const igInsightsRes = await fetch(
      `https://graph.facebook.com/v26.0/${igAccountId}/insights?metric=follower_count,reach&period=day&access_token=${pageAccessToken}`
    );
    const igInsightsBody = await igInsightsRes.json().catch(() => null);
    results.igInsights = { status: igInsightsRes.status, ok: igInsightsRes.ok, body: igInsightsBody };
  } else {
    results.igInsights = { skipped: 'No Instagram Business Account linked to this page.' };
  }

  const pageOk = pageInsightsRes.ok;
  const igOk = !igAccountId || (results.igInsights as { ok?: boolean }).ok;
  results.gate = pageOk && igOk
    ? 'PASS — Chunk 5 (Organic Social) can proceed'
    : 'FAIL — Chunk 5 is blocked until the agency reconnects Meta with the scopes listed in missingScopes';

  return NextResponse.json({ clientId, ...results });
}
