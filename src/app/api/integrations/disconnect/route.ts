import { NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { Nango } from "@nangohq/node";
import type { Database } from "@/types/database";
import { toInternalPlatform, toNangoPlatform } from "@/lib/platform-mapping";

export async function POST(request: Request) {
  console.log('=== POST /api/integrations/disconnect ===');
  
  const secretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;

  if (!secretKey) {
    console.error("NANGO_SECRET_KEY_DEV_PLAN_CHECK is not configured");
    return NextResponse.json(
      { error: "Server misconfiguration: Nango secret key not found" },
      { status: 500 },
    );
  }

  // Get clientId and platform from request body
  const body = await request.json();
  const { clientId, platform: rawPlatform } = body;

  console.log('Disconnect request:', { clientId, platform: rawPlatform });

  if (!clientId || !rawPlatform) {
    console.error('Missing required parameters');
    return NextResponse.json(
      { error: "clientId and platform are required" },
      { status: 400 },
    );
  }

  // Use platform mapping utility
  const platform = toInternalPlatform(rawPlatform);
  const nangoPlatform = toNangoPlatform(rawPlatform);

  console.log('Platform mapping:', { raw: rawPlatform, internal: platform, nango: nangoPlatform });

  const supabase = await createClient();

  // Get authenticated user
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    console.error("Failed to retrieve session:", sessionError);
    return NextResponse.json(
      { error: "Unable to verify session" },
      { status: 500 },
    );
  }

  const user = session?.user;

  if (!user || !user.id) {
    console.error('No authenticated user');
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log('User authenticated:', user.id);

  try {
    // Get the connection from database
    console.log('Looking up connection in database...');
    const { data: connection, error: queryError } = await supabase
      .from("ad_platform_connections")
      .select("connection_id")
      .eq("user_id", user.id)
      .eq("client_id", clientId)
      .eq("platform", platform)
      .single();

    if (queryError || !connection) {
      console.error('Connection not found in database:', queryError);
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 },
      );
    }

    console.log('Found connection:', connection.connection_id);

    // Delete connection via Nango
    console.log('Deleting connection from Nango...');
    const nango = new Nango({ secretKey });
    
    try {
      await nango.deleteConnection(nangoPlatform, connection.connection_id);
      console.log('Successfully deleted from Nango');
    } catch (nangoError: any) {
      console.error('Failed to delete from Nango (continuing anyway):', nangoError.message);
      // Continue anyway - we'll delete from our database
    }

    // Delete from database (webhook will also handle this, but do it here too for immediate effect)
    console.log('Deleting from database...');
    const { error: deleteError } = await supabase
      .from("ad_platform_connections")
      .delete()
      .eq("user_id", user.id)
      .eq("client_id", clientId)
      .eq("platform", platform);

    if (deleteError) {
      console.error("Failed to delete connection from database:", deleteError);
      return NextResponse.json(
        { error: "Failed to disconnect", details: deleteError.message },
        { status: 500 },
      );
    }

    console.log('Successfully disconnected');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Unexpected error disconnecting platform:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 },
    );
  }
}

