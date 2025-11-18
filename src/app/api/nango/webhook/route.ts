import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
  console.log('Request headers:', Object.fromEntries(request.headers.entries()));
  
  let payload: NangoWebhookPayload | null = null;

  try {
    const text = await request.text();
    console.log('Raw webhook body:', text);
    payload = JSON.parse(text);
  } catch (error) {
    console.error('Failed to parse Nango webhook payload', error);
  }

  if (!payload) {
    console.log('No payload, returning 200');
    return new Response(null, { status: 200 });
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

