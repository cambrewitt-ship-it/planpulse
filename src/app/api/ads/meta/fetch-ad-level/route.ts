import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Nango } from '@nangohq/node';
import { syncMetaAdLevelInsights } from '@/lib/ads/meta-ad-level';

/**
 * On-demand sync for the Client Hub "Meta Ads — Paid" section's "Top
 * Performing Paid Ads" widget (ad-level engagement). Triggered by the
 * section's "Sync paid ads data" button — never the always-on 6h cron.
 * Mirrors the auth/connection-resolution shape of
 * src/app/api/ads/google-ads/fetch-performance-extras/route.ts.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clientId, startDate, endDate } = body;

    if (!clientId || !startDate || !endDate) {
      return Response.json({ error: 'Missing required parameters: clientId, startDate, endDate' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: sessionError } = await supabase.auth.getUser();
    if (sessionError) return Response.json({ error: 'Unable to verify session' }, { status: 500 });
    if (!user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: client } = await supabase.from('clients').select('id').eq('id', clientId).eq('user_id', user.id).maybeSingle();
    if (!client) return Response.json({ error: 'Not found' }, { status: 404 });

    const { data: connections } = await supabase
      .from('ad_platform_connections')
      .select('connection_id')
      .eq('user_id', user.id).eq('client_id', clientId).eq('platform', 'meta-ads').eq('connection_status', 'active')
      .order('created_at', { ascending: false }).limit(1);
    const connection = connections?.[0];
    if (!connection) return Response.json({ error: 'Meta Ads not connected. Please connect your account first.' }, { status: 404 });

    const nangoSecretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
    if (!nangoSecretKey) return Response.json({ error: 'Server configuration error: Nango secret key not found' }, { status: 500 });
    const nango = new Nango({ secretKey: nangoSecretKey });

    const result = await syncMetaAdLevelInsights({
      supabase, nango, userId: user.id, clientId, connectionId: connection.connection_id, startDate, endDate,
    });

    if (!result.success) {
      return Response.json({ success: false, error: result.error, errors: result.errors }, { status: 404 });
    }
    return Response.json({ success: true, rowsSaved: result.rowsSaved, accountsProcessed: result.accountsProcessed, errors: result.errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return Response.json({ error: 'Internal server error', details: message }, { status: 500 });
  }
}
