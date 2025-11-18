import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { Nango } from '@nangohq/node';
import type { Database } from '@/types/database';
import { toInternalPlatform, toNangoPlatform } from '@/lib/platform-mapping';

export async function POST(request: Request) {
  console.log('=== Manual Sync Connection ===');
  
  try {
    const body = await request.json();
    const { platform: rawPlatform, clientId } = body;

    console.log('Sync request:', { platform: rawPlatform, clientId });

    if (!rawPlatform || !clientId) {
      return NextResponse.json(
        { error: 'Missing required fields: platform, clientId' },
        { status: 400 }
      );
    }

    // Use platform mapping utility
    const platform = toInternalPlatform(rawPlatform);
    const nangoPlatform = toNangoPlatform(rawPlatform);

    console.log('Platform mapping:', { raw: rawPlatform, internal: platform, nango: nangoPlatform });

    // Get authenticated user
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ 
      cookies: () => cookieStore 
    });

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      console.error('Auth error:', sessionError);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = session.user;
    console.log('User:', user.id);

    // Initialize Nango to check if connection exists
    const secretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
    if (!secretKey) {
      return NextResponse.json(
        { error: 'Nango not configured' },
        { status: 500 }
      );
    }

    const nango = new Nango({ secretKey });

    // The connection ID in Nango is the endUserId we created
    const nangoConnectionId = `${user.id}:${clientId}`;
    
    console.log('Attempting to sync connection:', { 
      providerConfigKey: nangoPlatform, 
      connectionId: nangoConnectionId,
      userId: user.id,
      clientId: clientId,
      normalizedPlatform: platform
    });

    try {
      // Try to get the connection from Nango
      let connection;
      try {
        connection = await nango.getConnection(nangoPlatform, nangoConnectionId);
        console.log('Nango connection found:', {
          id: connection.id,
          connection_id: connection.connection_id,
          provider: connection.provider_config_key,
          createdAt: connection.created_at,
        });
      } catch (getError: any) {
        console.error('Failed to get connection, trying to list all connections:', getError.message);
        
        // If getConnection fails, try listing all connections
        // This is a fallback to see what connections exist
        try {
          const connections = await nango.listConnections();
          console.log('All Nango connections:', JSON.stringify(connections, null, 2));
          
          // Try to find matching connection by end_user.id
          const matchingConnection = connections.connections?.find(
            (conn: any) => conn.provider_config_key === nangoPlatform && 
                          conn.end_user?.id === nangoConnectionId
          );
          
          if (matchingConnection) {
            console.log('Found matching connection in list:', matchingConnection);
            connection = matchingConnection;
          } else {
            console.error('No matching connection found. Looking for end_user.id:', nangoConnectionId);
            console.error('Available connections:', 
              connections.connections?.map((c: any) => ({
                provider: c.provider_config_key,
                connectionId: c.connection_id,
                endUserId: c.end_user?.id
              }))
            );
          }
        } catch (listError: any) {
          console.error('Failed to list connections:', listError);
        }
      }

      if (!connection) {
        console.log('No connection found. This might be a timing issue.');
        console.log('Attempting to save anyway - webhook might have already handled it or will handle it soon.');
        
        // Save to database anyway - the webhook might save it or it might already be there
        const { error: upsertError } = await supabase
          .from('ad_platform_connections')
          .upsert(
            {
              user_id: user.id,
              client_id: clientId,
              platform: platform,
              connection_id: nangoConnectionId,
              connection_status: 'active',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'client_id,platform' }
          );

        if (upsertError) {
          console.error('Database upsert error:', upsertError);
          return NextResponse.json(
            { error: 'Failed to save connection', details: upsertError.message },
            { status: 500 }
          );
        }

        console.log('Connection saved to database (without Nango verification)');

        return NextResponse.json({
          success: true,
          message: 'Connection saved (pending Nango sync)',
          connection: {
            platform,
            connectionId: nangoConnectionId,
            status: 'active',
          },
          warning: 'Connection saved but not yet verified with Nango'
        });
      }

      // Save to our database with verified connection
      // IMPORTANT: Save the Nango connection_id (UUID), not the end_user.id
      const actualConnectionId = connection.connection_id;
      
      console.log('Saving to database:', {
        user_id: user.id,
        client_id: clientId,
        platform: platform,
        connection_id: actualConnectionId,
      });

      const { error: upsertError } = await supabase
        .from('ad_platform_connections')
        .upsert(
          {
            user_id: user.id,
            client_id: clientId,
            platform: platform,
            connection_id: actualConnectionId,
            connection_status: 'active',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'client_id,platform' }
        );

      if (upsertError) {
        console.error('Database upsert error:', upsertError);
        return NextResponse.json(
          { error: 'Failed to save connection', details: upsertError.message },
          { status: 500 }
        );
      }

      console.log('Connection synced successfully with Nango verification');

      return NextResponse.json({
        success: true,
        message: 'Connection synced successfully',
        connection: {
          platform,
          connectionId: actualConnectionId,
          status: 'active',
        },
      });

    } catch (nangoError: any) {
      console.error('Nango sync error:', nangoError);
      console.error('Error details:', {
        message: nangoError.message,
        response: nangoError.response?.data,
        status: nangoError.response?.status
      });

      return NextResponse.json(
        { 
          error: 'Failed to sync with Nango', 
          details: nangoError.message,
          suggestion: 'The connection may still work. Try refreshing the page.'
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
