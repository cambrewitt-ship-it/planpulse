import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { Nango } from "@nangohq/node";

import type { Database } from "@/types/database";

export async function POST(request: Request) {
  const secretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;

  if (!secretKey) {
    console.error("NANGO_SECRET_KEY_DEV_PLAN_CHECK is not configured");
    return NextResponse.json(
      { error: "Server misconfiguration: NANGO_SECRET_KEY_DEV_PLAN_CHECK not configured" },
      { status: 500 },
    );
  }

  // Get clientId from request body
  let body;
  try {
    body = await request.json();
  } catch (error) {
    console.error("Failed to parse request body:", error);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { clientId, platform } = body;

  console.log("Session token request:", { clientId, platform });

  if (!clientId) {
    return NextResponse.json(
      { error: "clientId is required" },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  
  // Debug: Check what cookies we have
  const allCookies = cookieStore.getAll();
  console.log("Available cookies:", allCookies.map(c => c.name));
  
  const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore });

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  console.log("Session check:", { hasSession: !!session, hasUser: !!session?.user, error: sessionError });

  if (sessionError) {
    console.error("Failed to retrieve session:", sessionError);
    return NextResponse.json(
      { error: "Unable to verify session" },
      { status: 500 },
    );
  }

  const user = session?.user;

  if (!user || !user.id || !user.email) {
    console.error("No authenticated user found");
    return NextResponse.json({ error: "Unauthorized - Please log in to connect ad platforms" }, { status: 401 });
  }

  console.log("Authenticated user:", { id: user.id, email: user.email });

  const nango = new Nango({ secretKey });

  try {
    console.log("Creating Nango connect session for user:", user.id, "client:", clientId);
    console.log("NANGO_SECRET_KEY_DEV_PLAN_CHECK is set:", !!secretKey);
    console.log("Secret key preview:", secretKey?.substring(0, 10) + "...");
    
    const requestBody = {
      end_user: {
        id: `${user.id}:${clientId}`,
        email: user.email,
        display_name:
          typeof user.user_metadata?.full_name === "string" &&
          user.user_metadata.full_name.trim().length > 0
            ? user.user_metadata.full_name
            : user.email,
      },
      allowed_integrations: [platform], // Only allow the specific platform being connected
    };
    
    console.log("Request body:", JSON.stringify(requestBody, null, 2));
    
    const connectSession = await nango.createConnectSession(requestBody);

    console.log("Nango connect session created:", connectSession);

    const sessionToken = connectSession.data?.token;

    if (!sessionToken) {
      console.error("No session token returned from Nango:", connectSession);
      return NextResponse.json(
        { error: "Failed to create session token - no token returned" },
        { status: 502 },
      );
    }

    return NextResponse.json({ sessionToken });
  } catch (error: any) {
    console.error("Failed to create Nango connect session:", error);
    console.error("Full error response:", JSON.stringify(error?.response?.data, null, 2));
    console.error("Error details:", {
      message: error?.message,
      response: error?.response?.data,
      errors: error?.response?.data?.error?.errors,
      status: error?.response?.status,
      statusText: error?.response?.statusText,
    });
    
    const errorMessage = error?.response?.data?.error?.message || 
                         error?.response?.data?.message || 
                         error?.message || 
                         "Unknown error";
    
    const validationErrors = error?.response?.data?.error?.errors;
    const fullErrorMessage = validationErrors 
      ? `${errorMessage}: ${JSON.stringify(validationErrors)}`
      : errorMessage;
    
    return NextResponse.json(
      { error: `Failed to create session token: ${fullErrorMessage}` },
      { status: 502 },
    );
  }
}

