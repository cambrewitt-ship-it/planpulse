import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Nango } from "@nangohq/node";
import { toNangoPlatform } from "@/lib/platform-mapping";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;

  const secretKey = process.env.NANGO_SECRET_KEY_DEV_PLAN_CHECK;
  if (!secretKey) {
    return NextResponse.json(
      { error: "Server misconfiguration: Nango secret key not found" },
      { status: 500 }
    );
  }

  const supabase = await createClient();

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Fetch all Nango connections for this client
  const { data: connections } = await supabase
    .from("ad_platform_connections")
    .select("connection_id, platform")
    .eq("client_id", clientId)
    .eq("user_id", userId);

  // Delete each connection from Nango (best-effort)
  if (connections && connections.length > 0) {
    const nango = new Nango({ secretKey });
    await Promise.all(
      connections.map(async ({ connection_id, platform }) => {
        try {
          await nango.deleteConnection(toNangoPlatform(platform), connection_id);
        } catch (err: any) {
          console.warn(`Failed to delete Nango connection ${connection_id}:`, err.message);
        }
      })
    );
  }

  // Delete the client (DB cascade handles ad_platform_connections and other related rows)
  const { error: deleteError } = await supabase
    .from("clients")
    .delete()
    .eq("id", clientId)
    .eq("user_id", userId);

  if (deleteError) {
    return NextResponse.json(
      { error: "Failed to delete client", details: deleteError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
