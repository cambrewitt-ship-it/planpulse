import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Nango } from '@nangohq/node';
import { toNangoPlatform } from '@/lib/platform-mapping';

/**
 * POST - Fetch organic social media posts from platform APIs
 * 
 * Fetches the actual number of posts published on Instagram, Facebook, or LinkedIn
 * for a given time period and updates the database.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const clientId = resolvedParams.id;

    if (!clientId) {
      return NextResponse.json(
        { error: 'client_id is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { channel_name, start_date, end_date } = body;

    if (!channel_name || !start_date || !end_date) {
      return NextResponse.json(
        { error: 'channel_name, start_date, and end_date are required' },
        { status: 400 }
      );
    }

    // Determine platform from channel name
    const channelLower = channel_name.toLowerCase();
    let platform: 'instagram' | 'facebook' | 'linkedin' | null = null;
    
    if (channelLower.includes('instagram')) {
      platform = 'instagram';
    } else if (channelLower.includes('facebook')) {
      platform = 'facebook';
    } else if (channelLower.includes('linkedin')) {
      platform = 'linkedin';
    }

    if (!platform) {
      return NextResponse.json(
        { error: `Unsupported channel: ${channel_name}. Supported: Instagram, Facebook, LinkedIn` },
        { status: 400 }
      );
    }

    // Get Nango connection for Meta platforms (Instagram/Facebook)
    let postCount = 0;
    let automaticPostCount = 0;

    if (platform === 'instagram' || platform === 'facebook') {
      // Get Meta connection from database - try both 'meta-ads' and 'facebook' platforms
      const { data: connections, error: connError } = await supabase
        .from('ad_platform_connections')
        .select('connection_id, platform')
        .eq('client_id', clientId)
        .in('platform', ['meta-ads', 'facebook'])
        .eq('connection_status', 'active')
        .order('platform', { ascending: true }) // Prefer 'facebook' if both exist
        .limit(1);

      if (connError || !connections || connections.length === 0) {
        return NextResponse.json(
          { error: 'No Meta connection found. Please connect your Facebook account first using the "Connect Page" button.' },
          { status: 404 }
        );
      }

      const connection = connections[0];
      
      // Determine which Nango platform to use based on the stored platform
      const nangoPlatform = connection.platform === 'facebook' 
        ? 'facebook' 
        : toNangoPlatform('meta-ads');
      const nangoSecretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
      
      if (!nangoSecretKey) {
        return NextResponse.json(
          { error: 'Server configuration error: Nango secret key not found' },
          { status: 500 }
        );
      }

      const nango = new Nango({ secretKey: nangoSecretKey });
      
      try {
        const nangoConnection = await nango.getConnection(
          nangoPlatform,
          connection.connection_id
        );
        const accessToken = (nangoConnection.credentials as any)?.access_token;

        if (!accessToken) {
          return NextResponse.json(
            { error: 'No access token found. Please reconnect your Meta account.' },
            { status: 401 }
          );
        }

        // For Instagram/Facebook, we need to:
        // 1. Get the page/account ID
        // 2. Fetch posts from the Graph API
        // 3. Count posts in the date range

        // First, get user's pages/accounts
        console.log('Fetching Facebook pages...');
        const meResponse = await fetch(
          `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token&access_token=${accessToken}`
        );

        if (!meResponse.ok) {
          const errorText = await meResponse.text();
          console.error('Error fetching pages:', errorText);
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { error: { message: errorText } };
          }
          
          // Check if it's a permissions issue
          if (errorData.error?.code === 200 || errorData.error?.message?.includes('permission')) {
            return NextResponse.json(
              { 
                error: 'Missing permissions. Please ensure your Meta account has "pages_read_engagement" and "pages_read_user_content" permissions.',
                details: errorData.error?.message || 'Permission denied'
              },
              { status: 403 }
            );
          }
          
          return NextResponse.json(
            { error: 'Failed to fetch pages from Meta API', details: errorData.error?.message || errorText },
            { status: 500 }
          );
        }

        const pagesData = await meResponse.json();
        const pages = pagesData.data || [];

        console.log(`Found ${pages.length} Facebook page(s)`);

        if (pages.length === 0) {
          // Try to get user info and check permissions
          const userInfoResponse = await fetch(
            `https://graph.facebook.com/v18.0/me?fields=id,name&access_token=${accessToken}`
          );
          
          let userInfo = null;
          if (userInfoResponse.ok) {
            userInfo = await userInfoResponse.json();
          }
          
          // Check what permissions the token has
          const permissionsResponse = await fetch(
            `https://graph.facebook.com/v18.0/me/permissions?access_token=${accessToken}`
          );
          
          let permissions: string[] = [];
          if (permissionsResponse.ok) {
            const permissionsData = await permissionsResponse.json();
            permissions = (permissionsData.data || [])
              .filter((p: any) => p.status === 'granted')
              .map((p: any) => p.permission);
          }
          
          const hasPagePermissions = permissions.some(p => 
            p.includes('pages_read') || p.includes('pages_show')
          );
          
          let errorMessage = 'No Facebook pages found.';
          if (!hasPagePermissions) {
            errorMessage += '\n\nYour connection is missing required permissions. Please:\n1. Disconnect and reconnect using the "Connect Page" button\n2. Grant "pages_read_engagement" and "pages_read_user_content" permissions';
          } else {
            errorMessage += '\n\nYou may not have access to any Facebook Pages. Please:\n1. Create a Facebook Page, or\n2. Ensure you have admin access to an existing Page';
          }
          
          return NextResponse.json(
            { 
              error: errorMessage,
              details: userInfo ? `Connected as: ${userInfo.name} (${userInfo.id})` : 'Please check your Meta account permissions.',
              hasPagePermissions,
              grantedPermissions: permissions
            },
            { status: 404 }
          );
        }

        // For Instagram, we need to get the Instagram Business Account ID from the page
        let instagramAccountId: string | null = null;
        let pageAccessToken = accessToken; // Use page access token if available
        
        if (platform === 'instagram') {
          // Get Instagram account for the first page
          const pageId = pages[0].id;
          console.log(`Fetching Instagram Business Account for page ${pageId}...`);
          
          // Use page access token if available (more reliable)
          if (pages[0].access_token) {
            pageAccessToken = pages[0].access_token;
          }
          
          const instagramResponse = await fetch(
            `https://graph.facebook.com/v18.0/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`
          );

          if (instagramResponse.ok) {
            const instagramData = await instagramResponse.json();
            instagramAccountId = instagramData.instagram_business_account?.id;
            console.log(`Instagram Business Account ID: ${instagramAccountId || 'Not found'}`);
          } else {
            const errorText = await instagramResponse.text();
            console.error('Error fetching Instagram account:', errorText);
          }

          if (!instagramAccountId) {
            return NextResponse.json(
              { 
                error: 'No Instagram Business Account found. Please:\n1. Convert your Instagram account to a Business Account\n2. Connect it to your Facebook Page\n3. Ensure you have the "instagram_basic" permission.',
                details: `Page ID: ${pageId}`
              },
              { status: 404 }
            );
          }
        }

        // Fetch posts from the appropriate endpoint
        const accountId = platform === 'instagram' ? instagramAccountId : pages[0].id;
        const sinceTimestamp = Math.floor(new Date(start_date).getTime() / 1000);
        const untilTimestamp = Math.floor(new Date(end_date).getTime() / 1000);
        
        console.log(`Fetching posts for ${platform} account ${accountId} from ${start_date} to ${end_date}...`);
        
        // For Facebook, use /posts endpoint; for Instagram, use /media endpoint
        const endpoint = platform === 'facebook' ? 'posts' : 'media';
        const fields = platform === 'facebook' 
          ? 'id,created_time,message' 
          : 'id,timestamp,media_type';
        
        const postsResponse = await fetch(
          `https://graph.facebook.com/v18.0/${accountId}/${endpoint}?` +
          `fields=${fields}&` +
          `since=${sinceTimestamp}&` +
          `until=${untilTimestamp}&` +
          `limit=100&` +
          `access_token=${pageAccessToken}`
        );

        if (!postsResponse.ok) {
          const errorText = await postsResponse.text();
          console.error('Error fetching posts:', errorText);
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { error: { message: errorText } };
          }
          
          return NextResponse.json(
            { 
              error: `Failed to fetch ${platform} posts from Meta API`,
              details: errorData.error?.message || errorText,
              code: errorData.error?.code
            },
            { status: postsResponse.status }
          );
        }

        const postsData = await postsResponse.json();
        const posts = postsData.data || [];
        
        console.log(`Found ${posts.length} ${platform} post(s) in date range`);

        // Count total posts
        postCount = posts.length;
        
        // Handle pagination if there are more posts
        if (postsData.paging?.next) {
          console.log('More posts available (pagination not fully implemented)');
        }

        // For automatic posts, we'd need to check if posts were scheduled/automated
        // This would require additional API calls or metadata that may not be available
        // For now, we'll set automatic posts to 0 and let users manually update if needed
        automaticPostCount = 0;

      } catch (nangoError: any) {
        console.error('Nango error:', nangoError);
        return NextResponse.json(
          { error: 'Failed to connect to Meta API', details: nangoError.message },
          { status: 500 }
        );
      }
    } else if (platform === 'linkedin') {
      // LinkedIn API integration would go here
      // This requires LinkedIn API v2 and different authentication
      return NextResponse.json(
        { error: 'LinkedIn integration not yet implemented' },
        { status: 501 }
      );
    }

    // Calculate week_commencing from start_date (Monday of the week)
    const startDate = new Date(start_date);
    const dayOfWeek = startDate.getDay();
    const diff = startDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust to Monday
    const monday = new Date(startDate.setDate(diff));
    const weekCommencing = monday.toISOString().split('T')[0];

    // Update or insert the actuals record
    const { data: updatedData, error: upsertError } = await supabase
      .from('organic_social_actuals')
      .upsert(
        {
          client_id: clientId,
          channel_name,
          week_commencing: weekCommencing,
          posts_published: postCount,
          posts_automatic: automaticPostCount,
        },
        {
          onConflict: 'client_id,channel_name,week_commencing',
        }
      )
      .select()
      .single();

    if (upsertError) {
      console.error('Error upserting organic social actuals:', upsertError);
      return NextResponse.json(
        { error: 'Failed to save post counts', details: upsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedData,
      posts_fetched: postCount,
      automatic_posts: automaticPostCount,
    });

  } catch (error: any) {
    console.error('Error in POST /api/clients/[id]/organic-social-actuals/fetch-posts:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
