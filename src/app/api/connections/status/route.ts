import { NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';
import type { Database } from "@/types/database";

export async function GET(request: Request) {
  const supabase = await createClient();

  // Get clientId from query params
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");

  if (!clientId) {
    return NextResponse.json(
      { error: "clientId is required" },
      { status: 400 },
    );
  }

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Query ad_platform_connections for this client and user
    const { data: connections, error: queryError } = await supabase
      .from("ad_platform_connections")
      .select("platform, connection_status, created_at")
      .eq("user_id", user.id)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (queryError) {
      console.error("Failed to query connections:", queryError);
      return NextResponse.json(
        { error: "Failed to fetch connections" },
        { status: 500 },
      );
    }

    // Format response
    const formattedConnections = (connections || []).map((conn) => ({
      platform: conn.platform,
      status: conn.connection_status,
      connectedAt: conn.created_at,
    }));

    return NextResponse.json({
      connections: formattedConnections,
    });
  } catch (error) {
    console.error("Unexpected error fetching connections:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

