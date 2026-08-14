import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

// Nango signs each webhook with HMAC-SHA256 using your Nango secret key.
// Header: x-nango-signature   Value: hex-encoded HMAC of the raw request body.
function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Events that tell us a connection's token is dead or the connection is gone.
const EXPIRED_EVENT_TYPES = new Set([
  'connection.deleted',
  'connection.refresh.failed',
  'auth.error',
]);

interface NangoWebhookPayload {
  from?: string;
  type?: string;
  connectionId?: string;
  providerConfigKey?: string;
  operation?: string;
  success?: boolean;
  error?: string;
  // Nango also uses these event type strings in some versions:
  eventType?: string;
}

export async function POST(req: NextRequest) {
  const nangoSecret = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
  if (!nangoSecret) {
    console.error('NANGO_SECRET_KEY_DEV_PLAN_CHECK not configured');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-nango-signature');

  if (!verifySignature(rawBody, signature, nangoSecret)) {
    console.warn('Nango webhook: invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: NangoWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log('Nango webhook received:', JSON.stringify(payload));

  const connectionId = payload.connectionId;
  if (!connectionId) {
    // Some Nango events (e.g. sync events) don't carry a connection ID — ignore them.
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Determine whether this event signals an expired/gone connection.
  const eventType = payload.eventType ?? (payload.type ? `${payload.type}${payload.operation ? `.${payload.operation}` : ''}` : '');
  const isAuthFailure = payload.type === 'auth' && payload.success === false;
  const isExpiredEvent = EXPIRED_EVENT_TYPES.has(eventType) || isAuthFailure;

  if (!isExpiredEvent) {
    return NextResponse.json({ ok: true, ignored: true, eventType });
  }

  console.log(`Nango webhook: marking connection ${connectionId} as expired (event: ${eventType})`);

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceKey) {
    console.error('Supabase env vars not configured');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { error, count } = await supabase
    .from('ad_platform_connections')
    .update({ connection_status: 'expired', updated_at: new Date().toISOString() })
    .eq('connection_id', connectionId);

  if (error) {
    console.error('Failed to mark connection expired:', error.message);
    return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
  }

  console.log(`Marked ${count ?? 'unknown'} row(s) as expired for connection ${connectionId}`);
  return NextResponse.json({ ok: true, connectionId, rowsUpdated: count });
}
