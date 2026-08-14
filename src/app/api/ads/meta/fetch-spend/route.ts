import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Nango } from '@nangohq/node';
import type { Database } from '@/types/database';
import { toNangoPlatform } from '@/lib/platform-mapping';
import { saveMetaAdsMetrics } from '@/lib/ad-metrics';

// TypeScript interface for Meta Ads performance metrics
interface MetaAdMetrics {
  accountId: string;
  accountName: string;
  campaignId: string;
  campaignName: string;
  dateStart: string;
  dateStop: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  currency: string;
  actions?: Array<{ action_type: string; value: string }>;
}

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

    // Look up user's connection for Meta Ads.
    // First try client-specific, then fall back to any active connection (same
    // pattern as the channel-account route so accounts saved at user level work).
    let connection: { connection_id: string; platform: string; connection_status: string } | null = null;

    if (clientId) {
      const { data: clientConnection } = await supabase
        .from('ad_platform_connections')
        .select('connection_id, platform, connection_status')
        .eq('user_id', user.id)
        .eq('platform', 'meta-ads')
        .eq('connection_status', 'active')
        .eq('client_id', clientId)
        .maybeSingle();
      connection = clientConnection;
    }

    if (!connection) {
      // Fall back to any active Meta Ads connection for this user
      const { data: anyConnection } = await supabase
        .from('ad_platform_connections')
        .select('connection_id, platform, connection_status')
        .eq('user_id', user.id)
        .eq('platform', 'meta-ads')
        .eq('connection_status', 'active')
        .limit(1)
        .maybeSingle();
      connection = anyConnection;
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
      // Step 1: Get Meta Ads accounts.
      // Try client-specific first; fall back to user-level accounts so accounts
      // saved without a client_id (or for a different client) still work here.
      let metaAdsAccounts: any[] = [];
      {
        if (clientId) {
          const { data: clientAccounts } = await (supabase as any)
            .from('meta_ads_accounts')
            .select('*')
            .eq('user_id', user.id)
            .eq('client_id', clientId)
            .eq('is_active', true);
          if (clientAccounts && clientAccounts.length > 0) {
            metaAdsAccounts = clientAccounts;
          }
        }

        if (metaAdsAccounts.length === 0) {
          // Fall back to any active account for this user (user-level or other clients)
          const { data: anyAccounts, error: accountsError } = await (supabase as any)
            .from('meta_ads_accounts')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_active', true);

          if (accountsError || !anyAccounts || anyAccounts.length === 0) {
            return Response.json({
              success: false,
              error: clientId
                ? 'No Meta Ads accounts configured for this client. Please add an account in Platform Connections.'
                : 'No Meta Ads accounts configured',
            }, { status: 404 });
          }

          metaAdsAccounts = anyAccounts;
        }
      }

      console.log(`Found ${metaAdsAccounts.length} Meta Ads account(s)`);

      // Step 2: Get the OAuth access token from Nango's connection
      let nangoConnection;
      try {
        nangoConnection = await nango.getConnection(toNangoPlatform('meta-ads'), connection.connection_id);
      } catch (nangoError: any) {
        const httpStatus = nangoError.response?.status || nangoError.status;
        if (httpStatus === 404) {
          // Nango has lost the connection — clean up our DB row so the UI shows disconnected
          await supabase
            .from('ad_platform_connections')
            .delete()
            .eq('connection_id', connection.connection_id);
          return Response.json({
            success: false,
            error: 'Meta Ads connection not found. Please reconnect your account in Platform Connections.',
            connectionExpired: true,
          }, { status: 424 });
        }
        throw nangoError;
      }
      const accessToken = (nangoConnection.credentials as any)?.access_token;

      if (!accessToken) {
        throw new Error('No access token found in Nango connection');
      }

      console.log('✓ Got OAuth token from Nango');

      // Step 3: For each account, call Meta Marketing API
      const allSpendData: MetaAdMetrics[] = [];
      const errors: Array<{ accountId: string; accountName: string; error: string }> = [];

      for (const account of metaAdsAccounts) {
        let accountId = account.account_id;
        
        // Ensure account ID has the 'act_' prefix if it doesn't already
        // Meta API returns account IDs with 'act_' prefix, but we should handle both cases
        if (accountId && !accountId.startsWith('act_')) {
          // If it's just a number, add the prefix
          accountId = `act_${accountId}`;
        }
        
        console.log(`\nFetching data for Meta account ${accountId}...`);

        try {
          // Build query params - fetch at campaign level to get campaign data
          const params = new URLSearchParams({
            fields: 'spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,account_name,campaign_id,campaign_name,date_start,date_stop,actions',
            time_range: JSON.stringify({
              since: startDate,
              until: endDate
            }),
            time_increment: '1',
            level: 'campaign',
            limit: '100', // Max allowed — reduces pagination round trips
            access_token: accessToken
          });

          const url = `https://graph.facebook.com/v26.0/${accountId}/insights?${params.toString()}`;

          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            }
          });

          console.log(`Response status: ${response.status}`);

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error response:`, errorText.substring(0, 500));
            
            // Try to parse the error response to get more details
            let errorMessage = `Meta Marketing API error: ${response.status}`;
            let isExpiredToken = false;
            
            try {
              const errorData = JSON.parse(errorText);
              if (errorData.error) {
                const metaError = errorData.error;
                
                // Check for expired/invalidated token (codes 460, 463)
                // 460 = session invalidated (password change or Facebook security reset)
                // 463 = session expired
                if (metaError.code === 460 || metaError.error_subcode === 460 ||
                    metaError.error_subcode === 463 ||
                    (metaError.message && metaError.message.includes('Session has expired')) ||
                    (metaError.message && metaError.message.includes('expired')) ||
                    (metaError.message && metaError.message.includes('invalidated'))) {
                  isExpiredToken = true;
                  errorMessage = 'Your Meta Ads connection has been invalidated. Please reconnect your Meta Ads account in the platform settings.';
                } else {
                  errorMessage = `Meta Marketing API error: ${metaError.message || metaError.type || response.status}`;
                  if (metaError.error_subcode) {
                    errorMessage += ` (Code: ${metaError.error_subcode})`;
                  }
                }
              }
            } catch (e) {
              // If parsing fails, use the raw error text (truncated)
              if (errorText) {
                // Check for expired token in raw text
                if (errorText.includes('Session has expired') || errorText.includes('expired') || errorText.includes('invalidated')) {
                  isExpiredToken = true;
                  errorMessage = 'Your Meta Ads connection has been invalidated. Please reconnect your Meta Ads account in the platform settings.';
                } else {
                  errorMessage += `: ${errorText.substring(0, 200)}`;
                }
              }
            }
            
            // If it's an expired/invalidated token, try to refresh via Nango first.
            // Note: Meta does NOT support standard OAuth refresh tokens — long-lived user
            // tokens expire after ~60 days. Nango may have a newer token if the user
            // re-authenticated, but if not this will also fail and we mark the connection expired.
            if (isExpiredToken) {
              try {
                console.log('Attempting to refresh Meta Ads token via Nango...');
                const refreshedConnection = await nango.getConnection(toNangoPlatform('meta-ads'), connection.connection_id);
                const refreshedToken = (refreshedConnection.credentials as any)?.access_token;
                
                if (refreshedToken && refreshedToken !== accessToken) {
                  console.log('Token was refreshed, retrying API call...');
                  // Retry the API call with the refreshed token
                  const retryParams = new URLSearchParams({
                    fields: 'spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,account_name,campaign_id,campaign_name,date_start,date_stop,actions',
                    time_range: JSON.stringify({
                      since: startDate,
                      until: endDate
                    }),
                    time_increment: '1',
                    level: 'campaign',
                    limit: '100',
                    access_token: refreshedToken
                  });
                  
                  const retryUrl = `https://graph.facebook.com/v26.0/${accountId}/insights?${retryParams.toString()}`;
                  const retryResponse = await fetch(retryUrl, {
                    method: 'GET',
                    headers: {
                      'Content-Type': 'application/json'
                    }
                  });
                  
                  if (retryResponse.ok) {
                    console.log('✓ Retry successful after token refresh');
                    const pushRetryResults = (results: any[]) => {
                      for (const result of results) {
                        allSpendData.push({
                          accountId: accountId,
                          accountName: result.account_name || account.account_name,
                          campaignId: result.campaign_id || '',
                          campaignName: result.campaign_name || '',
                          dateStart: result.date_start || '',
                          dateStop: result.date_stop || '',
                          spend: parseFloat(result.spend || '0'),
                          impressions: parseInt(result.impressions || '0', 10),
                          reach: parseInt(result.reach || '0', 10),
                          clicks: parseInt(result.clicks || '0', 10),
                          ctr: parseFloat(result.ctr || '0'),
                          cpc: parseFloat(result.cpc || '0'),
                          cpm: parseFloat(result.cpm || '0'),
                          frequency: parseFloat(result.frequency || '0'),
                          currency: account.currency || 'USD',
                          actions: result.actions || [],
                        });
                      }
                    };
                    let retryPageData = await retryResponse.json();
                    if (retryPageData.data && Array.isArray(retryPageData.data)) {
                      pushRetryResults(retryPageData.data);
                    }
                    while (retryPageData.paging?.next) {
                      const nextRetryResponse = await fetch(retryPageData.paging.next);
                      if (!nextRetryResponse.ok) break;
                      retryPageData = await nextRetryResponse.json();
                      if (retryPageData.data && Array.isArray(retryPageData.data)) {
                        pushRetryResults(retryPageData.data);
                      }
                    }
                    continue; // Skip to next account
                  }
                }
              } catch (refreshError) {
                console.error('Token refresh failed:', refreshError);
              }

              // Mark this connection as expired in the DB so the UI shows the
              // correct state (orange reconnect prompt) on the next page load.
              void supabase
                .from('ad_platform_connections')
                .update({ connection_status: 'expired', updated_at: new Date().toISOString() })
                .eq('user_id', user.id)
                .eq('connection_id', connection.connection_id)
                .then(({ error: e }) => {
                  if (e) console.error('Failed to mark connection expired:', e);
                  else console.log('Marked Meta connection as expired');
                });
            }

            throw new Error(errorMessage);
          }

          const pushResults = (results: any[]) => {
            for (const result of results) {
              allSpendData.push({
                accountId: accountId,
                accountName: result.account_name || account.account_name,
                campaignId: result.campaign_id || '',
                campaignName: result.campaign_name || '',
                dateStart: result.date_start || '',
                dateStop: result.date_stop || '',
                spend: parseFloat(result.spend || '0'),
                impressions: parseInt(result.impressions || '0', 10),
                reach: parseInt(result.reach || '0', 10),
                clicks: parseInt(result.clicks || '0', 10),
                ctr: parseFloat(result.ctr || '0'),
                cpc: parseFloat(result.cpc || '0'),
                cpm: parseFloat(result.cpm || '0'),
                frequency: parseFloat(result.frequency || '0'),
                currency: account.currency || 'USD',
                actions: result.actions || [],
              });
            }
          };

          let pageData = await response.json();
          let pageCount = 1;
          console.log(`✓ Page ${pageCount}: Got ${pageData.data?.length || 0} results`);

          if (pageData.data && Array.isArray(pageData.data)) {
            pushResults(pageData.data);
          }

          while (pageData.paging?.next) {
            const nextResponse = await fetch(pageData.paging.next);
            if (!nextResponse.ok) {
              console.error(`Pagination fetch failed on page ${pageCount + 1}: ${nextResponse.status}`);
              break;
            }
            pageData = await nextResponse.json();
            pageCount++;
            console.log(`✓ Page ${pageCount}: Got ${pageData.data?.length || 0} results`);
            if (pageData.data && Array.isArray(pageData.data)) {
              pushResults(pageData.data);
            }
          }

          console.log(`✓ Total pages fetched: ${pageCount}`);

        } catch (error: any) {
          console.error(`Failed for account ${accountId}:`, error.message);
          errors.push({
            accountId: accountId,
            accountName: account.account_name,
            error: error.message
          });
        }
      }

      // Persist spend data so the agency dashboard can read it per-client
      if (allSpendData.length > 0) {
        try {
          await saveMetaAdsMetrics(user.id, clientId || null, allSpendData);
          console.log(`✓ Saved ${allSpendData.length} Meta Ads metrics to database (clientId: ${clientId || 'none'})`);
        } catch (saveError) {
          // Non-fatal — log but still return the data to the caller
          console.error('Failed to persist Meta Ads metrics:', saveError);
        }
      }

      return Response.json({
        success: true,
        platform: 'meta-ads',
        dateRange: { startDate, endDate },
        data: allSpendData,
        accountsProcessed: metaAdsAccounts.length,
        errors: errors.length > 0 ? errors : undefined
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

