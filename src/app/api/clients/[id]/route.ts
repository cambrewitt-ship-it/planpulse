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

  // Explicitly delete all related rows before the client to avoid FK constraint failures
  const relatedTables = [
    "client_campaign_goals",
    "client_documents",
    "client_notes",
    "client_brief_versions",
    "client_briefs",
    "client_channel_presets",
    "channel_benchmarks",
    "metric_presets",
    "client_media_plan_builder",
    "client_action_point_completions",
    "client_health_status",
    "organic_social_actuals",
    "edm_actuals",
    "ad_performance_metrics",
    "google_analytics_metrics",
    "meta_ads_accounts",
    "media_plan_funnels",
    "client_tasks",
    "ad_platform_connections",
  ] as const;

  for (const table of relatedTables) {
    const { error } = await (supabase as any)
      .from(table)
      .delete()
      .eq("client_id", clientId);
    if (error) {
      console.warn(`Failed to delete rows from ${table} for client ${clientId}:`, error.message);
    }
  }

  // channels → weekly_plans have their own cascade, delete channels after other tables
  const { data: planRows } = await supabase
    .from("media_plans")
    .select("id")
    .eq("client_id", clientId);

  if (planRows && planRows.length > 0) {
    const planIds = planRows.map((p) => p.id);
    const { data: channelRows } = await supabase
      .from("channels")
      .select("id")
      .in("plan_id", planIds);
    if (channelRows && channelRows.length > 0) {
      const channelIds = channelRows.map((c) => c.id);
      await supabase.from("weekly_plans").delete().in("channel_id", channelIds);
      await supabase.from("channels").delete().in("plan_id", planIds);
    }
    await supabase.from("media_plans").delete().eq("client_id", clientId);
  }

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
