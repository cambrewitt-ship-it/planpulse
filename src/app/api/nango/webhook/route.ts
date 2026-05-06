import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

type NangoWebhookPayload = {
  type?: string;
  operation?: string;
  success?: boolean;
  connectionId?: string;
  providerConfigKey?: string;
  endUser?: {
    endUserId?: string;
  };
};

const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const supabase: SupabaseClient | null =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

async function handleCreation(payload: NangoWebhookPayload) {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return;
  }

  const {
    connectionId,
    providerConfigKey: platform,
    endUser,
    success,
  } = payload;

  if (!success) {
    console.warn('Skipping unsuccessful auth creation webhook', payload);
    return;
  }

  if (!connectionId || !platform || !endUser?.endUserId) {
    console.error('Missing required fields for auth creation', payload);
    return;
  }

  // Parse endUserId format: "userId:clientId"
  const endUserId = endUser.endUserId;
  const [userId, clientId] = endUserId.split(':');

  if (!userId || !clientId) {
    console.error('Invalid endUserId format, expected "userId:clientId"', endUserId);
    return;
  }

  const { error } = await supabase
    .from('ad_platform_connections')
    .upsert(
      [
        {
          user_id: userId,
          client_id: clientId,
          platform,
          connection_id: connectionId,
          connection_status: 'active',
        },
      ],
      { onConflict: 'client_id,platform' },
    );

  if (error) {
    console.error(
      'Failed to upsert ad_platform_connections for webhook creation',
      error,
    );
  } else {
    console.info(
      'Upserted ad_platform_connections for connection',
      connectionId,
    );
  }
}

async function handleDeletion(payload: NangoWebhookPayload) {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return;
  }

  const { connectionId } = payload;

  if (!connectionId) {
    console.error('Missing connectionId for auth deletion webhook', payload);
    return;
  }

  const { error } = await supabase
    .from('ad_platform_connections')
    .delete()
    .eq('connection_id', connectionId);

  if (error) {
    console.error(
      'Failed to delete ad_platform_connections for webhook deletion',
      error,
    );
  } else {
    console.info('Deleted ad_platform_connections for connection', connectionId);
  }
}

export async function POST(request: Request) {
  console.log('=== WEBHOOK RECEIVED ===');

  const rawBody = await request.text();

  // Verify Nango webhook signature using HMAC-SHA256
  const webhookSecret = process.env.NANGO_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('NANGO_WEBHOOK_SECRET is not configured — rejecting webhook');
    return new Response('Server misconfiguration', { status: 500 });
  }

  const signature = request.headers.get('x-nango-signature');
  if (!signature) {
    console.error('Missing x-nango-signature header');
    return new Response('Unauthorized: Missing signature', { status: 401 });
  }

  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  try {
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      console.error('Invalid webhook signature');
      return new Response('Unauthorized: Invalid signature', { status: 401 });
    }
  } catch {
    console.error('Webhook signature comparison failed');
    return new Response('Unauthorized: Invalid signature', { status: 401 });
  }

  let payload: NangoWebhookPayload | null = null;

  try {
    payload = JSON.parse(rawBody);
    console.log('Raw webhook body (truncated):', rawBody.substring(0, 200));
  } catch (error) {
    console.error('Failed to parse Nango webhook payload', error);
    return new Response('Bad Request: Invalid JSON', { status: 400 });
  }

  if (!payload) {
    console.log('No payload, returning 400');
    return new Response('Bad Request: Empty payload', { status: 400 });
  }

  console.info('=== Received Nango webhook ===', {
    type: payload.type,
    operation: payload.operation,
    success: payload.success,
    connectionId: payload.connectionId,
    providerConfigKey: payload.providerConfigKey,
    endUserId: payload.endUser?.endUserId,
  });

  try {
    if (payload.type === 'auth') {
      if (payload.operation === 'creation') {
        await handleCreation(payload);
      } else if (payload.operation === 'deletion') {
        await handleDeletion(payload);
      } else {
        console.warn('Unsupported auth operation', payload.operation);
      }
    } else {
      console.warn('Unsupported webhook type', payload.type);
    }
  } catch (error) {
    console.error('Error processing Nango webhook', error);
  }

  return new Response(null, { status: 200 });
}

