import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Nango } from '@nangohq/node';
import { syncMetaAdsSpend } from '@/lib/ads/meta-ads-live';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startDate, endDate, clientId } = body;

    // Validate required parameters
    if (!startDate || !endDate) {
      return Response.json(
        { error: 'Missing required parameters: startDate, endDate' },
        { status: 400 }
      );
    }

    // Validate date range
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return Response.json(
        { error: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    if (end < start) {
      return Response.json(
        { error: 'endDate must be after startDate' },
        { status: 400 }
      );
    }

    // Get authenticated user
    const supabase = await createClient();

    const { data: { user }, error: sessionError } = await supabase.auth.getUser();

    if (sessionError) {
      console.error('Failed to retrieve user:', sessionError);
      return Response.json(
        { error: 'Unable to verify session' },
        { status: 500 }
      );
    }

    if (!user || !user.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Look up this client's own Meta Ads connection. ad_platform_connections is
    // scoped one row per (client_id, platform) — never fall back to another
    // client's connection, as that would attribute its ad spend to this client.
    let connection: { id: string; connection_id: string; platform: string; connection_status: string } | null = null;

    if (clientId) {
      const { data: clientConnection } = await supabase
        .from('ad_platform_connections')
        .select('id, connection_id, platform, connection_status')
        .eq('user_id', user.id)
        .eq('platform', 'meta-ads')
        .eq('connection_status', 'active')
        .eq('client_id', clientId)
        .maybeSingle();
      connection = clientConnection;
    }

    if (!connection) {
      return Response.json(
        { error: 'Meta Ads not connected. Please connect your account first.' },
        { status: 404 }
      );
    }

    // Initialize Nango with correct secret key
    const nangoSecretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
    if (!nangoSecretKey) {
      console.error('NANGO_SECRET_KEY_DEV_PLAN_CHECK not configured');
      return Response.json(
        { error: 'Server configuration error: Nango secret key not found' },
        { status: 500 }
      );
    }

    const nango = new Nango({ secretKey: nangoSecretKey });

    try {
      const result = await syncMetaAdsSpend({
        supabase,
        nango,
        userId: user.id,
        clientId: clientId || null,
        connectionId: connection.connection_id,
        connectionRowId: connection.id,
        startDate,
        endDate,
      });

      if (!result.success) {
        const status = result.connectionExpired ? 424 : 404;
        return Response.json({
          success: false,
          error: result.error,
          connectionExpired: result.connectionExpired,
        }, { status });
      }

      return Response.json({
        success: true,
        platform: 'meta-ads',
        dateRange: { startDate, endDate },
        data: result.data,
        accountsProcessed: result.accountsProcessed,
        errors: result.errors,
      });

    } catch (error: any) {
      console.error('=== Meta Ads Error ===', error);
      return Response.json({
        success: false,
        error: error.message
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('=== Error in meta/fetch-spend API route ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error stack:', error.stack);

    return Response.json(
      {
        error: 'Internal server error',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
