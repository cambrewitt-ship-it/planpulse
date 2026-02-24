import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

/**
 * Comprehensive Google Ads API diagnostic endpoint
 *
 * This endpoint tests ALL aspects of the Google Ads integration:
 * 1. Environment variables
 * 2. Nango connection and OAuth token
 * 3. OAuth scopes (inferred from token behavior)
 * 4. Developer token validity
 * 5. MCC account access
 * 6. Individual customer account access
 * 7. GAQL query execution
 *
 * Call: GET /api/ads/google-ads/diagnose
 */
export async function GET() {
  const diagnostics: Record<string, any> = {
    timestamp: new Date().toISOString(),
    steps: [],
    errors: [],
    warnings: [],
    summary: {},
  };

  const addStep = (name: string, status: 'pass' | 'fail' | 'warn', details: any) => {
    diagnostics.steps.push({ name, status, details, time: new Date().toISOString() });
    console.log(`[DIAGNOSE] ${status.toUpperCase()}: ${name}`, JSON.stringify(details, null, 2));
  };

  try {
    // ========== STEP 1: Check Environment Variables ==========
    console.log('\n========== STEP 1: Environment Variables ==========');

    const envCheck = {
      NANGO_SECRET_KEY_DEV_PLAN_CHECK: !!process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK,
      GOOGLE_ADS_DEVELOPER_TOKEN: !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
      GOOGLE_ADS_MCC_ID: process.env.GOOGLE_ADS_MCC_ID || 'NOT SET (optional)',
      developerTokenPrefix: process.env.GOOGLE_ADS_DEVELOPER_TOKEN
        ? `${process.env.GOOGLE_ADS_DEVELOPER_TOKEN.substring(0, 6)}...`
        : 'MISSING',
      mccIdFormat: process.env.GOOGLE_ADS_MCC_ID
        ? (process.env.GOOGLE_ADS_MCC_ID.includes('-') ? 'WITH_DASHES' : 'NO_DASHES')
        : 'N/A',
    };

    if (!process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK) {
      addStep('Environment: Nango Secret Key', 'fail', { message: 'NANGO_SECRET_KEY_DEV_PLAN_CHECK is not set' });
      diagnostics.errors.push('Missing NANGO_SECRET_KEY_DEV_PLAN_CHECK');
    } else {
      addStep('Environment: Nango Secret Key', 'pass', { message: 'Configured' });
    }

    if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
      addStep('Environment: Developer Token', 'fail', { message: 'GOOGLE_ADS_DEVELOPER_TOKEN is not set' });
      diagnostics.errors.push('Missing GOOGLE_ADS_DEVELOPER_TOKEN - This is REQUIRED for Google Ads API');
    } else {
      addStep('Environment: Developer Token', 'pass', {
        message: 'Configured',
        prefix: envCheck.developerTokenPrefix,
        length: process.env.GOOGLE_ADS_DEVELOPER_TOKEN.length
      });
    }

    if (!process.env.GOOGLE_ADS_MCC_ID) {
      addStep('Environment: MCC ID', 'warn', {
        message: 'GOOGLE_ADS_MCC_ID is not set (optional if not using MCC)',
        impact: 'Direct customer access will be used instead of MCC hierarchy'
      });
      diagnostics.warnings.push('MCC ID not configured - using direct customer access');
    } else {
      addStep('Environment: MCC ID', 'pass', {
        value: process.env.GOOGLE_ADS_MCC_ID,
        format: envCheck.mccIdFormat
      });
    }

    diagnostics.summary.envCheck = envCheck;

    // ========== STEP 2: Authenticate User ==========
    console.log('\n========== STEP 2: User Authentication ==========');

    const supabase = await createClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      addStep('User Authentication', 'fail', { error: authError?.message || 'No session found' });
      return NextResponse.json({
        ...diagnostics,
        error: 'Unauthorized - Please log in first'
      }, { status: 401 });
    }

    addStep('User Authentication', 'pass', {
      userId: session.user.id.substring(0, 8) + '...',
      email: session.user.email?.replace(/(.{3}).*(@.*)/, '$1***$2')
    });

    // ========== STEP 3: Check Database Connection Record ==========
    console.log('\n========== STEP 3: Database Connection ==========');

    const { data: connections, error: dbError } = await supabase
      .from('ad_platform_connections')
      .select('connection_id, platform, connection_status, created_at, client_id')
      .eq('user_id', session.user.id)
      .eq('platform', 'google-ads')
      .order('created_at', { ascending: false });

    if (dbError) {
      addStep('Database: Connection Query', 'fail', { error: dbError.message });
      diagnostics.errors.push(`Database error: ${dbError.message}`);
    } else if (!connections || connections.length === 0) {
      addStep('Database: Connection Query', 'fail', {
        message: 'No Google Ads connection found in database',
        action: 'Please connect your Google Ads account via the OAuth flow'
      });
      diagnostics.errors.push('No Google Ads connection in database');
    } else {
      const activeConnections = connections.filter(c => c.connection_status === 'active');
      addStep('Database: Connection Query', activeConnections.length > 0 ? 'pass' : 'warn', {
        totalConnections: connections.length,
        activeConnections: activeConnections.length,
        connections: connections.map(c => ({
          connectionId: c.connection_id,
          status: c.connection_status,
          clientId: c.client_id,
          createdAt: c.created_at
        }))
      });

      if (activeConnections.length === 0) {
        diagnostics.warnings.push('No active connections found');
      }
    }

    const activeConnection = connections?.find(c => c.connection_status === 'active');
    if (!activeConnection) {
      return NextResponse.json({
        ...diagnostics,
        error: 'No active Google Ads connection found'
      }, { status: 404 });
    }

    // ========== STEP 4: Check Saved Google Ads Accounts ==========
    console.log('\n========== STEP 4: Saved Google Ads Accounts ==========');

    const { data: savedAccounts, error: accountsError } = await supabase
      .from('google_ads_accounts')
      .select('*')
      .eq('user_id', session.user.id);

    if (accountsError) {
      addStep('Database: Saved Accounts', 'fail', { error: accountsError.message });
    } else {
      const activeAccounts = savedAccounts?.filter(a => a.is_active) || [];
      addStep('Database: Saved Accounts', savedAccounts && savedAccounts.length > 0 ? 'pass' : 'warn', {
        totalAccounts: savedAccounts?.length || 0,
        activeAccounts: activeAccounts.length,
        accounts: savedAccounts?.map(a => ({
          customerId: a.customer_id,
          customerIdFormat: a.customer_id.includes('-') ? 'WITH_DASHES' : 'NO_DASHES',
          customerIdClean: a.customer_id.replace(/-/g, ''),
          accountName: a.account_name,
          isActive: a.is_active
        }))
      });

      if (!savedAccounts || savedAccounts.length === 0) {
        diagnostics.warnings.push('No Google Ads accounts saved - visit /api/ads/google-ads/accounts to discover accounts');
      }
    }

    diagnostics.summary.savedAccounts = savedAccounts || [];

    // ========== STEP 5: Test Nango Connection ==========
    console.log('\n========== STEP 5: Nango Connection ==========');

    const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK! });
    const nangoProviderKey = toNangoPlatform('google-ads');

    // First, list ALL connections in Nango to see what actually exists
    let allNangoConnections: any[] = [];
    try {
      const listResult = await nango.listConnections();
      allNangoConnections = listResult.connections || [];

      // Filter to just google-ads connections
      const googleAdsConnections = allNangoConnections.filter(
        (c: any) => c.provider_config_key === 'google-ads'
      );

      addStep('Nango: List All Connections', 'pass', {
        totalConnections: allNangoConnections.length,
        googleAdsConnections: googleAdsConnections.length,
        googleAdsConnectionDetails: googleAdsConnections.map((c: any) => ({
          connectionId: c.connection_id,
          provider: c.provider_config_key,
          createdAt: c.created_at,
          // Check if this matches our database connection
          matchesDbConnection: c.connection_id === activeConnection.connection_id
        })),
        // Check if our database connection_id exists in Nango
        dbConnectionExistsInNango: googleAdsConnections.some(
          (c: any) => c.connection_id === activeConnection.connection_id
        )
      });
    } catch (listError: any) {
      addStep('Nango: List All Connections', 'warn', {
        error: listError.message,
        note: 'Could not list connections, will try direct connection fetch'
      });
    }

    let nangoConnection: any;
    let accessToken: string | null = null;

    try {
      nangoConnection = await nango.getConnection(nangoProviderKey, activeConnection.connection_id);
      accessToken = (nangoConnection.credentials as any)?.access_token;

      addStep('Nango: Get Connection', 'pass', {
        providerKey: nangoProviderKey,
        connectionId: activeConnection.connection_id,
        hasAccessToken: !!accessToken,
        tokenLength: accessToken?.length || 0,
        tokenPrefix: accessToken ? `${accessToken.substring(0, 20)}...` : 'NONE',
        credentialKeys: nangoConnection.credentials ? Object.keys(nangoConnection.credentials) : [],
        // Check for refresh token (important for long-term access)
        hasRefreshToken: !!nangoConnection.credentials?.refresh_token,
        // Check token expiry if available
        tokenExpiry: nangoConnection.credentials?.expires_at || 'unknown',
        // Check scopes if available in connection metadata
        scopes: nangoConnection.credentials?.scope || nangoConnection.connection_config?.oauth_scopes_requested || 'not available in response',
      });
    } catch (nangoError: any) {
      // Extract more details from Nango error
      const errorDetails: any = {
        providerKey: nangoProviderKey,
        connectionId: activeConnection.connection_id,
        error: nangoError.message,
        status: nangoError.status,
        code: nangoError.code,
      };

      // Try to get response body for more details
      if (nangoError.response) {
        errorDetails.responseStatus = nangoError.response.status;
        errorDetails.responseData = nangoError.response.data;
      }

      // Check if this connection exists in Nango at all
      const existsInNango = allNangoConnections.some(
        (c: any) => c.connection_id === activeConnection.connection_id && c.provider_config_key === 'google-ads'
      );
      errorDetails.connectionExistsInNango = existsInNango;

      // Provide specific diagnosis based on error
      if (nangoError.status === 424) {
        errorDetails.diagnosis = '424 Failed Dependency - This usually means the OAuth refresh token failed. The user needs to re-authenticate.';
        errorDetails.possibleCauses = [
          'OAuth refresh token expired or was revoked',
          'User revoked access in Google Account settings',
          'Google Ads API access was revoked',
          'The connection was created but token refresh failed'
        ];
        errorDetails.solution = 'User needs to disconnect and reconnect their Google Ads account through the OAuth flow';
      } else if (nangoError.status === 404) {
        errorDetails.diagnosis = '404 Not Found - Connection does not exist in Nango';
        errorDetails.solution = 'The connection_id in your database does not match any connection in Nango. User needs to reconnect.';
      }

      addStep('Nango: Get Connection', 'fail', errorDetails);
      diagnostics.errors.push(`Nango connection failed: ${nangoError.message}`);

      // Add recommendation for re-authentication
      diagnostics.recommendations = diagnostics.recommendations || [];
      diagnostics.recommendations.push({
        priority: 'CRITICAL',
        issue: 'Google Ads OAuth connection is broken',
        diagnosis: errorDetails.diagnosis,
        action: 'The user must re-authenticate: Go to your ad platform connections page and disconnect then reconnect Google Ads',
        connectionId: activeConnection.connection_id
      });

      return NextResponse.json({
        ...diagnostics,
        error: 'Failed to get Nango connection - OAuth may need to be re-established'
      }, { status: 424 });
    }

    if (!accessToken) {
      addStep('Nango: Access Token', 'fail', { message: 'No access token in Nango connection' });
      return NextResponse.json({
        ...diagnostics,
        error: 'No access token found in Nango connection'
      }, { status: 401 });
    }

    // ========== STEP 6: Test Google Ads API - listAccessibleCustomers ==========
    console.log('\n========== STEP 6: Google Ads API - listAccessibleCustomers ==========');

    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!;
    const mccId = process.env.GOOGLE_ADS_MCC_ID;
    const cleanMccId = mccId?.replace(/-/g, '');

    // Log the exact request we're about to make (for debugging)
    addStep('Google Ads API: Request Details', 'pass', {
      url: 'https://googleads.googleapis.com/v21/customers:listAccessibleCustomers',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken.substring(0, 20)}...`,
        'developer-token': `${developerToken.substring(0, 6)}... (length: ${developerToken.length})`,
        'Content-Type': 'application/json',
      },
      note: 'This is the exact request being sent to Google Ads API'
    });

    const listCustomersUrl = 'https://googleads.googleapis.com/v21/customers:listAccessibleCustomers';
    const listHeaders: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    };

    // Note: listAccessibleCustomers does NOT require login-customer-id
    // It returns ALL customers accessible to the authenticated user

    let accessibleCustomerIds: string[] = [];

    try {
      const listResponse = await fetch(listCustomersUrl, {
        method: 'GET',
        headers: listHeaders
      });

      const responseText = await listResponse.text();

      // Log raw response for debugging
      console.log('Google Ads API raw response:', {
        status: listResponse.status,
        statusText: listResponse.statusText,
        headers: Object.fromEntries(listResponse.headers.entries()),
        bodyPreview: responseText.substring(0, 500)
      });

      if (listResponse.ok) {
        const listData = JSON.parse(responseText);
        accessibleCustomerIds = (listData.resourceNames || []).map((name: string) =>
          name.replace('customers/', '')
        );

        addStep('Google Ads API: listAccessibleCustomers', 'pass', {
          status: listResponse.status,
          accessibleCustomerCount: accessibleCustomerIds.length,
          accessibleCustomerIds: accessibleCustomerIds,
          rawResourceNames: listData.resourceNames
        });
      } else {
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch {
          errorData = responseText.substring(0, 1000); // Limit HTML output
        }

        addStep('Google Ads API: listAccessibleCustomers', 'fail', {
          status: listResponse.status,
          statusText: listResponse.statusText,
          error: errorData,
          possibleCauses: [
            'Invalid or expired access token',
            'Invalid developer token',
            'Developer token not approved for Basic Access',
            'OAuth scope missing: https://www.googleapis.com/auth/adwords'
          ]
        });
        diagnostics.errors.push(`listAccessibleCustomers failed: ${listResponse.status}`);
      }
    } catch (fetchError: any) {
      addStep('Google Ads API: listAccessibleCustomers', 'fail', {
        error: fetchError.message,
        type: 'Network/Fetch Error'
      });
      diagnostics.errors.push(`Network error: ${fetchError.message}`);
    }

    diagnostics.summary.accessibleCustomers = accessibleCustomerIds;

    // ========== STEP 6b: Query MCC for linked client accounts ==========
    console.log('\n========== STEP 6b: Query MCC for Client Accounts ==========');

    if (cleanMccId) {
      try {
        // Query the MCC to get all linked client accounts
        const mccQuery = `
          SELECT
            customer_client.id,
            customer_client.descriptive_name,
            customer_client.level,
            customer_client.manager,
            customer_client.status
          FROM customer_client
          WHERE customer_client.level <= 1
        `;

        const mccSearchUrl = `https://googleads.googleapis.com/v21/customers/${cleanMccId}/googleAds:search`;
        const mccResponse = await fetch(mccSearchUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'developer-token': developerToken,
            'Content-Type': 'application/json',
            'login-customer-id': cleanMccId,
          },
          body: JSON.stringify({ query: mccQuery })
        });

        const mccResponseText = await mccResponse.text();

        if (mccResponse.ok) {
          const mccData = JSON.parse(mccResponseText);
          const clientAccounts = (mccData.results || []).map((result: any) => ({
            id: result.customerClient?.id?.toString(),
            name: result.customerClient?.descriptiveName,
            level: result.customerClient?.level,
            isManager: result.customerClient?.manager,
            status: result.customerClient?.status
          }));

          addStep('MCC Client Accounts', 'pass', {
            mccId: cleanMccId,
            clientAccountCount: clientAccounts.length,
            clientAccounts: clientAccounts,
            note: 'These are all accounts linked to your MCC'
          });

          diagnostics.summary.mccClientAccounts = clientAccounts;
        } else {
          let errorData;
          try {
            errorData = JSON.parse(mccResponseText);
          } catch {
            errorData = mccResponseText.substring(0, 500);
          }

          addStep('MCC Client Accounts', 'warn', {
            mccId: cleanMccId,
            status: mccResponse.status,
            error: errorData,
            note: 'Could not query MCC for client accounts'
          });
        }
      } catch (mccError: any) {
        addStep('MCC Client Accounts', 'warn', {
          error: mccError.message,
          note: 'Failed to query MCC for client accounts'
        });
      }
    } else {
      addStep('MCC Client Accounts', 'warn', {
        note: 'No MCC ID configured, skipping client account lookup'
      });
    }

    // ========== STEP 7: Test GAQL Query on First Accessible Customer ==========
    console.log('\n========== STEP 7: Test GAQL Query ==========');

    if (accessibleCustomerIds.length > 0) {
      const testCustomerId = accessibleCustomerIds[0];
      const minimalQuery = `SELECT campaign.id, campaign.name FROM campaign LIMIT 1`;
      const searchUrl = `https://googleads.googleapis.com/v21/customers/${testCustomerId}/googleAds:search`;

      const queryHeaders: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'Content-Type': 'application/json',
      };

      // Add login-customer-id if MCC is configured
      if (cleanMccId) {
        queryHeaders['login-customer-id'] = cleanMccId;
      }

      try {
        const queryResponse = await fetch(searchUrl, {
          method: 'POST',
          headers: queryHeaders,
          body: JSON.stringify({ query: minimalQuery })
        });

        const queryText = await queryResponse.text();

        if (queryResponse.ok) {
          let queryData;
          try {
            queryData = JSON.parse(queryText);
          } catch {
            queryData = queryText;
          }

          addStep('Google Ads API: GAQL Query', 'pass', {
            customerId: testCustomerId,
            query: minimalQuery,
            status: queryResponse.status,
            resultCount: queryData.results?.length || 0,
            hasResults: !!(queryData.results && queryData.results.length > 0),
            sampleResult: queryData.results?.[0] || 'No campaigns found (this may be normal)',
            fieldMask: queryData.fieldMask,
            requestId: queryData.requestId
          });
        } else {
          let errorData;
          try {
            errorData = JSON.parse(queryText);
          } catch {
            errorData = queryText;
          }

          addStep('Google Ads API: GAQL Query', 'fail', {
            customerId: testCustomerId,
            query: minimalQuery,
            status: queryResponse.status,
            error: errorData,
            requestHeaders: {
              hasAuth: true,
              hasDeveloperToken: true,
              hasLoginCustomerId: !!cleanMccId,
              loginCustomerId: cleanMccId || 'NOT SET'
            }
          });
        }
      } catch (queryError: any) {
        addStep('Google Ads API: GAQL Query', 'fail', {
          error: queryError.message,
          type: 'Network/Fetch Error'
        });
      }
    } else {
      addStep('Google Ads API: GAQL Query', 'warn', {
        message: 'Skipped - no accessible customers found',
        action: 'Fix listAccessibleCustomers first'
      });
    }

    // ========== STEP 8: Test Each Saved Account ==========
    console.log('\n========== STEP 8: Test Saved Accounts ==========');

    const accountTests: any[] = [];
    const activeAccounts = savedAccounts?.filter(a => a.is_active) || [];

    for (const account of activeAccounts) {
      const cleanCustomerId = account.customer_id.replace(/-/g, '');
      const isInAccessibleList = accessibleCustomerIds.includes(cleanCustomerId);

      const testResult: any = {
        customerId: account.customer_id,
        cleanCustomerId,
        accountName: account.account_name,
        isInAccessibleList,
        customerIdFormat: account.customer_id.includes('-') ? 'WITH_DASHES' : 'NO_DASHES',
      };

      if (!isInAccessibleList) {
        testResult.status = 'fail';
        testResult.error = 'Customer ID not in accessible list';
        testResult.possibleCauses = [
          'Customer is not linked to your MCC account',
          'OAuth was done with a different Google account',
          'Customer ID was entered incorrectly'
        ];
      } else {
        // Try to query this specific customer
        const testQuery = `SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1`;
        const testUrl = `https://googleads.googleapis.com/v21/customers/${cleanCustomerId}/googleAds:search`;

        const testHeaders: Record<string, string> = {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'Content-Type': 'application/json',
        };

        if (cleanMccId) {
          testHeaders['login-customer-id'] = cleanMccId;
        }

        try {
          const testResponse = await fetch(testUrl, {
            method: 'POST',
            headers: testHeaders,
            body: JSON.stringify({ query: testQuery })
          });

          testResult.apiStatus = testResponse.status;
          testResult.status = testResponse.ok ? 'pass' : 'fail';

          if (!testResponse.ok) {
            const errorText = await testResponse.text();
            try {
              testResult.error = JSON.parse(errorText);
            } catch {
              testResult.error = errorText.substring(0, 500);
            }
          } else {
            const data = await testResponse.json();
            testResult.customerName = data.results?.[0]?.customer?.descriptiveName || 'N/A';
          }
        } catch (e: any) {
          testResult.status = 'fail';
          testResult.error = e.message;
        }
      }

      accountTests.push(testResult);
    }

    if (accountTests.length > 0) {
      const passCount = accountTests.filter(t => t.status === 'pass').length;
      addStep('Saved Accounts Test', passCount === accountTests.length ? 'pass' : 'warn', {
        tested: accountTests.length,
        passed: passCount,
        failed: accountTests.length - passCount,
        results: accountTests
      });
    } else {
      addStep('Saved Accounts Test', 'warn', {
        message: 'No active saved accounts to test',
        action: 'Save accounts via /api/ads/google-ads/save-account'
      });
    }

    diagnostics.summary.accountTests = accountTests;

    // ========== FINAL SUMMARY ==========
    console.log('\n========== FINAL SUMMARY ==========');

    const passCount = diagnostics.steps.filter((s: any) => s.status === 'pass').length;
    const failCount = diagnostics.steps.filter((s: any) => s.status === 'fail').length;
    const warnCount = diagnostics.steps.filter((s: any) => s.status === 'warn').length;

    diagnostics.summary.overall = {
      totalSteps: diagnostics.steps.length,
      passed: passCount,
      failed: failCount,
      warnings: warnCount,
      status: failCount > 0 ? 'ISSUES_FOUND' : (warnCount > 0 ? 'WARNINGS' : 'ALL_PASS')
    };

    // Generate recommendations
    diagnostics.recommendations = [];

    if (diagnostics.errors.length > 0) {
      diagnostics.recommendations.push({
        priority: 'HIGH',
        issue: 'Critical errors found',
        errors: diagnostics.errors,
        action: 'Fix these errors before proceeding'
      });
    }

    if (accessibleCustomerIds.length === 0) {
      diagnostics.recommendations.push({
        priority: 'HIGH',
        issue: 'No accessible customers found',
        possibleCauses: [
          'OAuth token may have wrong scope (needs https://www.googleapis.com/auth/adwords)',
          'Developer token may not be approved',
          'The Google account used for OAuth may not have access to any Google Ads accounts'
        ],
        action: 'Check Nango integration OAuth scopes and reconnect if needed'
      });
    }

    const inaccessibleAccounts = accountTests.filter(t => !t.isInAccessibleList);
    if (inaccessibleAccounts.length > 0) {
      diagnostics.recommendations.push({
        priority: 'HIGH',
        issue: `${inaccessibleAccounts.length} saved account(s) are not accessible`,
        accounts: inaccessibleAccounts.map(a => a.customerId),
        action: 'These accounts may need to be linked to your MCC or removed from saved accounts'
      });
    }

    console.log('Diagnostics complete:', JSON.stringify(diagnostics.summary.overall, null, 2));

    return NextResponse.json(diagnostics);

  } catch (error: any) {
    console.error('=== DIAGNOSTIC ERROR ===', error);
    diagnostics.errors.push(`Unexpected error: ${error.message}`);
    diagnostics.summary.overall = { status: 'ERROR', error: error.message };

    return NextResponse.json(diagnostics, { status: 500 });
  }
}
