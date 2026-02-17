import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

export async function GET() {
  console.log('=== GET /api/ads/google-ads/test-access ===');
  
  try {
    // Initialize Nango
    const secretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
    if (!secretKey) {
      return NextResponse.json({ error: 'NANGO_SECRET_KEY not configured' }, { status: 500 });
    }
    
    const nango = new Nango({ secretKey });
    
    // Get authenticated user
    const supabase = await createClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user;

    // Get Google Ads connection
    const { data: connections, error: dbError } = await supabase
      .from('ad_platform_connections')
      .select('connection_id')
      .eq('user_id', user.id)
      .eq('platform', 'google-ads')
      .eq('connection_status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    if (dbError || !connections || connections.length === 0) {
      return NextResponse.json({
        error: 'No Google Ads connection found',
        details: 'Please connect your Google Ads account first'
      }, { status: 404 });
    }

    const connection = connections[0];

    // Get OAuth token
    const nangoConnection = await nango.getConnection(toNangoPlatform('google-ads'), connection.connection_id);
    const accessToken = (nangoConnection.credentials as any)?.access_token;

    if (!accessToken) {
      return NextResponse.json({ error: 'No access token found' }, { status: 401 });
    }

    // Get environment variables
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const mccId = process.env.GOOGLE_ADS_MCC_ID;

    if (!developerToken || !mccId) {
      return NextResponse.json({
        error: 'Missing environment variables',
        details: 'GOOGLE_ADS_DEVELOPER_TOKEN or GOOGLE_ADS_MCC_ID not set'
      }, { status: 500 });
    }

    // Test 1: List all accessible customers
    console.log('Test 1: Listing accessible customers...');
    const listUrl = 'https://googleads.googleapis.com/v19/customers:listAccessibleCustomers';
    
    const listResponse = await fetch(listUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'Content-Type': 'application/json',
      },
    });

    let accessibleCustomers: string[] = [];
    if (listResponse.ok) {
      const listData = await listResponse.json();
      accessibleCustomers = (listData.resourceNames || []).map((name: string) => 
        name.replace('customers/', '')
      );
      console.log('✓ Accessible customers:', accessibleCustomers);
    } else {
      const errorText = await listResponse.text();
      console.error('✗ Failed to list customers:', errorText);
    }

    // Get saved accounts
    const { data: savedAccounts } = await supabase
      .from('google_ads_accounts')
      .select('customer_id, account_name')
      .eq('user_id', user.id)
      .eq('is_active', true);

    // Test 2: Test access to each saved account
    const accountTests: any[] = [];
    
    if (savedAccounts) {
      for (const account of savedAccounts) {
        console.log(`Test 2: Testing access to ${account.customer_id}...`);
        
        // Check if account is in accessible list
        const isAccessible = accessibleCustomers.includes(account.customer_id);
        
        // Try to query the account
        const query = `SELECT customer.id FROM customer LIMIT 1`;
        const searchUrl = `https://googleads.googleapis.com/v19/customers/${account.customer_id}/googleAds:search`;
        
        const testResponse = await fetch(searchUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'developer-token': developerToken,
            'Content-Type': 'application/json',
            'login-customer-id': mccId,
          },
          body: JSON.stringify({ query }),
        });

        const testResult: any = {
          customerId: account.customer_id,
          accountName: account.account_name,
          isInAccessibleList: isAccessible,
          apiStatus: testResponse.status,
          canAccess: testResponse.ok,
        };

        if (!testResponse.ok) {
          const errorText = await testResponse.text();
          testResult.error = errorText.substring(0, 200);
        }

        accountTests.push(testResult);
        console.log(`${testResponse.ok ? '✓' : '✗'} Account ${account.customer_id}: ${testResponse.status}`);
      }
    }

    // Return diagnostic results
    return NextResponse.json({
      success: true,
      mccId,
      accessibleCustomers,
      savedAccounts: savedAccounts || [],
      accountTests,
      recommendations: generateRecommendations(accessibleCustomers, savedAccounts || [], accountTests),
    });

  } catch (error: any) {
    console.error('Test error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

function generateRecommendations(
  accessible: string[], 
  saved: any[], 
  tests: any[]
): string[] {
  const recommendations: string[] = [];

  // Check if any saved accounts are not accessible
  const inaccessible = tests.filter(t => !t.canAccess);
  if (inaccessible.length > 0) {
    recommendations.push(
      `⚠️ ${inaccessible.length} saved account(s) cannot be accessed. They may not be linked to your MCC.`
    );
    inaccessible.forEach(acc => {
      recommendations.push(
        `  - Account ${acc.customerId} (${acc.accountName || 'unnamed'}): Status ${acc.apiStatus}`
      );
    });
  }

  // Check if there are accessible accounts not yet saved
  const savedIds = saved.map(s => s.customer_id);
  const notSaved = accessible.filter(id => !savedIds.includes(id));
  if (notSaved.length > 0) {
    recommendations.push(
      `💡 ${notSaved.length} accessible account(s) found that are not yet saved: ${notSaved.join(', ')}`
    );
  }

  // If all tests pass
  if (tests.length > 0 && tests.every(t => t.canAccess)) {
    recommendations.push('✅ All saved accounts are accessible!');
  }

  return recommendations;
}


