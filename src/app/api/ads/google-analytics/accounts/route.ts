import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/database';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

export async function GET() {
  console.log('=== GET /api/ads/google-analytics/accounts ===');
  
  try {
    // Initialize Nango with secret key
    const secretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
    if (!secretKey) {
      console.error('NANGO_SECRET_KEY_DEV_PLAN_CHECK is not configured');
      return NextResponse.json(
        { error: 'Server misconfiguration' },
        { status: 500 }
      );
    }
    
    const nango = new Nango({ secretKey });
    
    // 1. Get authenticated user's ID
    console.log('Step 1: Authenticating user...');
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      console.error('Authentication error:', authError);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = session.user;
    console.log('Step 2: Looking up Google Analytics connection for user:', user.id);

    // 2. Look up their Google Analytics connection_id from the database
    const { data: connection, error: dbError } = await supabase
      .from('ad_platform_connections')
      .select('connection_id')
      .eq('user_id', user.id)
      .eq('platform', 'google-analytics')
      .eq('connection_status', 'active')
      .single();

    if (dbError || !connection) {
      console.error('Database error fetching connection:', dbError);
      return NextResponse.json(
        { error: 'Google Analytics connection not found', details: dbError?.message },
        { status: 404 }
      );
    }

    console.log('Step 3: Found Google Analytics connection:', connection.connection_id);

    // 3. Get the OAuth access token from Nango
    console.log('Step 4: Getting access token from Nango...');
    const nangoConnection = await nango.getConnection(toNangoPlatform('google-analytics'), connection.connection_id);
    const accessToken = nangoConnection.credentials?.access_token;

    if (!accessToken) {
      throw new Error('No access token found in Nango connection');
    }

    console.log('Step 5: Calling Google Analytics Admin API to list properties...');

    // 4. Call Google Analytics Admin API to get account summaries
    // First, get account summaries which include account, property, and view info
    const accountsResponse = await fetch(
      'https://analyticsadmin.googleapis.com/v1beta/accountSummaries',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        }
      }
    );

    if (!accountsResponse.ok) {
      const errorText = await accountsResponse.text();
      console.error('Google Analytics API error:', errorText);
      throw new Error(`Failed to fetch account summaries: ${accountsResponse.status}`);
    }

    const accountsData = await accountsResponse.json();
    console.log('Step 6: Successfully fetched account summaries');

    // 5. Extract properties from account summaries
    // The response structure: accountSummaries[] -> propertySummaries[]
    const properties: Array<{
      propertyId: string;
      propertyName: string;
      accountId: string;
      accountName: string;
    }> = [];

    if (accountsData.accountSummaries) {
      for (const accountSummary of accountsData.accountSummaries) {
        const accountId = accountSummary.account?.replace('accounts/', '') || '';
        const accountName = accountSummary.displayName || '';
        
        if (accountSummary.propertySummaries) {
          for (const propertySummary of accountSummary.propertySummaries) {
            const propertyId = propertySummary.property?.replace('properties/', '') || '';
            const propertyName = propertySummary.displayName || '';
            
            properties.push({
              propertyId,
              propertyName,
              accountId,
              accountName,
            });
          }
        }
      }
    }

    console.log('Step 7: Found', properties.length, 'properties');

    // 6. Format and return the properties
    return NextResponse.json({ 
      accounts: properties
    });
    
  } catch (error: any) {
    console.error('=== ERROR in /api/ads/google-analytics/accounts ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch Google Analytics properties',
        details: error?.message || 'Unknown error',
        type: error?.constructor?.name
      },
      { status: 500 }
    );
  }
}


