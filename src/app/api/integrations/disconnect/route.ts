import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { Nango } from "@nangohq/node";
import type { Database } from "@/types/database";

export async function POST(request: Request) {
  const secretKey = process.env.NANGO_SECRET_KEY;

  if (!secretKey) {
    console.error("NANGO_SECRET_KEY is not configured");
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 },
    );
  }

  // Get clientId and platform from request body
  const body = await request.json();
  const { clientId, platform } = body;

  if (!clientId || !platform) {
    return NextResponse.json(
      { error: "clientId and platform are required" },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

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
    // Get the connection from database
    const { data: connection, error: queryError } = await supabase
      .from("ad_platform_connections")
      .select("connection_id")
      .eq("user_id", user.id)
      .eq("client_id", clientId)
      .eq("platform", platform)
      .single();

    if (queryError || !connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 },
      );
    }

    // Delete connection via Nango
    const nango = new Nango({ secretKey });
    await nango.deleteConnection(platform, connection.connection_id);

    // Delete from database (webhook will also handle this, but do it here too for immediate effect)
    const { error: deleteError } = await supabase
      .from("ad_platform_connections")
      .delete()
      .eq("user_id", user.id)
      .eq("client_id", clientId)
      .eq("platform", platform);

    if (deleteError) {
      console.error("Failed to delete connection from database:", deleteError);
      return NextResponse.json(
        { error: "Failed to disconnect" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error disconnecting platform:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

