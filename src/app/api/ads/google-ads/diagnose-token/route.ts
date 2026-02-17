import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: connections } = await supabase
      .from('ad_platform_connections')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('platform', 'google-ads')
      .eq('connection_status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!connections || connections.length === 0) {
      return NextResponse.json({ error: 'No connection' }, { status: 404 });
    }

    const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK || '' });
    const nangoConnection = await nango.getConnection(toNangoPlatform('google-ads'), connections[0].connection_id);
    const accessToken = (nangoConnection.credentials as any)?.access_token;
    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

    if (!accessToken) {
      return NextResponse.json({ error: 'No token' }, { status: 401 });
    }

    // Test with BOTH v16 and v18 APIs
    const tests = [];

    // Test 1: v16 listAccessibleCustomers
    const v16List = await fetch('https://googleads.googleapis.com/v16/customers:listAccessibleCustomers', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': devToken || '',
      },
    });

    tests.push({
      name: 'v16 listAccessibleCustomers',
      status: v16List.status,
      statusText: v16List.statusText,
      headers: Object.fromEntries(v16List.headers.entries()),
      body: v16List.ok ? await v16List.json() : await v16List.text().then(t => t.substring(0, 500))
    });

    // Test 2: v18 listAccessibleCustomers
    const v18List = await fetch('https://googleads.googleapis.com/v18/customers:listAccessibleCustomers', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': devToken || '',
      },
    });

    tests.push({
      name: 'v18 listAccessibleCustomers',
      status: v18List.status,
      statusText: v18List.statusText,
      headers: Object.fromEntries(v18List.headers.entries()),
      body: v18List.ok ? await v18List.json() : await v18List.text().then(t => t.substring(0, 500))
    });

    // Test 3: Try with a simple customer query (using MCC ID if available)
    const testCustomerId = process.env.GOOGLE_ADS_MCC_ID?.replace(/-/g, '') || '7977327674';
    const customerQuery = await fetch(`https://googleads.googleapis.com/v16/customers/${testCustomerId}/googleAds:search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': devToken || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'SELECT customer.id FROM customer LIMIT 1'
      })
    });

    tests.push({
      name: `v16 customer query (${testCustomerId})`,
      status: customerQuery.status,
      statusText: customerQuery.statusText,
      headers: Object.fromEntries(customerQuery.headers.entries()),
      body: customerQuery.ok ? await customerQuery.json() : await customerQuery.text().then(t => t.substring(0, 500))
    });

    return NextResponse.json({
      devTokenMasked: devToken ? `${devToken.substring(0, 4)}...${devToken.substring(devToken.length - 4)}` : 'NOT SET',
      hasAccessToken: !!accessToken,
      accessTokenPrefix: accessToken ? accessToken.substring(0, 10) + '...' : 'N/A',
      tests,
      diagnosis: {
        allReturn404: tests.every(t => t.status === 404),
        allReturnHTML: tests.every(t => typeof t.body === 'string' && t.body.includes('<!DOCTYPE')),
        suggestion: tests.every(t => t.status === 404 && typeof t.body === 'string' && t.body.includes('<!DOCTYPE'))
          ? 'Developer token is either invalid, not approved, or being blocked. Check: 1) Token is copied correctly from API Center, 2) Account has Basic Access approved (not just pending), 3) Try generating a new token, 4) Ensure the Google account that owns the developer token is the same one you OAuth\'d with'
          : 'See test results for details'
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}
