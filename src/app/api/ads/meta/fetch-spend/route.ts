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
}

export async function POST(request: NextRequest) {
  console.log('=== POST /api/ads/meta/fetch-spend ===');
  console.log('Request received');
  
  try {
    // Parse request body
    const body = await request.json();
    console.log('Request body:', body);
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
    
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('Failed to retrieve session:', sessionError);
      return Response.json(
        { error: 'Unable to verify session' },
        { status: 500 }
      );
    }

    const user = session?.user;

    if (!user || !user.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Look up user's connection for Meta Ads
    // If clientId is provided, filter by it; otherwise find any active connection
    let query = supabase
      .from('ad_platform_connections')
      .select('connection_id, platform, connection_status')
      .eq('user_id', user.id)
      .eq('platform', 'meta-ads')
      .eq('connection_status', 'active');
    
    if (clientId) {
      query = query.eq('client_id', clientId);
    }
    
    const { data: connection, error: dbError } = await query.single();

    if (dbError || !connection) {
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

    console.log('=== META ADS DATA FETCH ===');
    console.log('Date Range:', { startDate, endDate });
    console.log('User ID:', user.id);
    console.log('Connection ID:', connection.connection_id);

    try {
      // Step 1: Get Meta Ads accounts from database
      const { data: metaAdsAccounts, error: accountsError } = await supabase
        .from('meta_ads_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (accountsError || !metaAdsAccounts || metaAdsAccounts.length === 0) {
        return Response.json({
          success: false,
          error: 'No Meta Ads accounts configured'
        }, { status: 404 });
      }

      console.log(`Found ${metaAdsAccounts.length} Meta Ads account(s)`);

      // Step 2: Get the OAuth access token from Nango's connection
      const nangoConnection = await nango.getConnection(toNangoPlatform('meta-ads'), connection.connection_id);
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
            fields: 'spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,account_name,campaign_id,campaign_name,date_start,date_stop',
            time_range: JSON.stringify({
              since: startDate,
              until: endDate
            }),
            time_increment: '1', // Get daily breakdown
            level: 'campaign', // Changed from 'account' to 'campaign' to get campaign-level data
            access_token: accessToken
          });

          const url = `https://graph.facebook.com/v18.0/${accountId}/insights?${params.toString()}`;

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
                
                // Check for expired token (error code 463)
                if (metaError.error_subcode === 463 || 
                    (metaError.message && metaError.message.includes('Session has expired')) ||
                    (metaError.message && metaError.message.includes('expired'))) {
                  isExpiredToken = true;
                  errorMessage = 'Your Meta Ads connection has expired. Please reconnect your Meta Ads account in the platform settings.';
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
                if (errorText.includes('Session has expired') || errorText.includes('expired')) {
                  isExpiredToken = true;
                  errorMessage = 'Your Meta Ads connection has expired. Please reconnect your Meta Ads account in the platform settings.';
                } else {
                  errorMessage += `: ${errorText.substring(0, 200)}`;
                }
              }
            }
            
            // If it's an expired token, try to refresh via Nango first
            if (isExpiredToken) {
              try {
                console.log('Attempting to refresh Meta Ads token via Nango...');
                // Nango should handle token refresh automatically, but we can try to get a fresh connection
                const refreshedConnection = await nango.getConnection(toNangoPlatform('meta-ads'), connection.connection_id);
                const refreshedToken = (refreshedConnection.credentials as any)?.access_token;
                
                if (refreshedToken && refreshedToken !== accessToken) {
                  console.log('Token was refreshed, retrying API call...');
                  // Retry the API call with the refreshed token
                  const retryParams = new URLSearchParams({
                    fields: 'spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,account_name,campaign_id,campaign_name,date_start,date_stop',
                    time_range: JSON.stringify({
                      since: startDate,
                      until: endDate
                    }),
                    time_increment: '1',
                    level: 'campaign',
                    access_token: refreshedToken
                  });
                  
                  const retryUrl = `https://graph.facebook.com/v18.0/${accountId}/insights?${retryParams.toString()}`;
                  const retryResponse = await fetch(retryUrl, {
                    method: 'GET',
                    headers: {
                      'Content-Type': 'application/json'
                    }
                  });
                  
                  if (retryResponse.ok) {
                    console.log('✓ Retry successful after token refresh');
                    const retryData = await retryResponse.json();
                    if (retryData.data && Array.isArray(retryData.data)) {
                      for (const result of retryData.data) {
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
                          currency: account.currency || 'USD'
                        });
                      }
                    }
                    continue; // Skip to next account
                  }
                }
              } catch (refreshError) {
                console.error('Token refresh failed:', refreshError);
                // Continue with the expired token error message
              }
            }
            
            throw new Error(errorMessage);
          }

          const data = await response.json();
          console.log(`✓ Success! Got ${data.data?.length || 0} results`);

          // Process results
          if (data.data && Array.isArray(data.data)) {
            for (const result of data.data) {
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
                currency: account.currency || 'USD'
              });
            }
          }

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

