import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';

export async function GET(request: Request) {
  console.log('=== GET /api/connections/user-status ===');
  
  try {
    // Get authenticated user
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });
    
    console.log('Getting session...');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('Failed to retrieve session:', sessionError);
      return Response.json(
        { error: 'Unable to verify session', details: sessionError.message },
        { status: 500 }
      );
    }

    const user = session?.user;
    console.log('User ID:', user?.id || 'none');

    if (!user || !user.id) {
      console.log('No authenticated user found');
      return Response.json({ error: 'Unauthorized - Please log in' }, { status: 401 });
    }

    // Query ad_platform_connections for this user
    console.log('Querying ad_platform_connections for user:', user.id);
    const { data: connections, error: queryError } = await supabase
      .from('ad_platform_connections')
      .select('platform, connection_status, connection_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (queryError) {
      console.error('Failed to query connections:', queryError);
      return Response.json(
        { error: 'Failed to fetch connections', details: queryError.message },
        { status: 500 }
      );
    }

    console.log('Found connections:', connections?.length || 0);

    // Format response
    const formattedConnections = (connections || []).map((conn) => ({
      platform: conn.platform,
      status: conn.connection_status,
      connection_id: conn.connection_id,
      connectedAt: conn.created_at,
    }));

    return Response.json({
      success: true,
      connections: formattedConnections,
      count: formattedConnections.length,
    });
  } catch (error: any) {
    console.error('Unexpected error fetching connections:', error);
    return Response.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

