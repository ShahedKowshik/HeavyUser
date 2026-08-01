import { NextResponse } from "next/server";
import { loadGoogleConnection, getSupabaseAdminClient } from "@/lib/google/server";
import { syncGoogleCalendar } from "@/lib/google/sync";

export async function POST(request: Request) {
  const channelId = request.headers.get("x-goog-channel-id");
  const resourceId = request.headers.get("x-goog-resource-id");
  if (!channelId || !resourceId) {
    return new NextResponse(null, { status: 204 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return new NextResponse(null, { status: 204 });
  }

  const { data: state } = await admin
    .from("google_calendar_sync_states")
    .select("*")
    .eq("channel_id", channelId)
    .eq("resource_id", resourceId)
    .maybeSingle();
  if (!state) {
    return new NextResponse(null, { status: 204 });
  }

  const connection = await loadGoogleConnection(admin, state.user_id);
  if (connection?.selected_calendar_id) {
    try {
      await syncGoogleCalendar(admin, connection, request);
    } catch {
      // Google will retry failed webhooks. The next app-load sync remains a fallback.
    }
  }

  return new NextResponse(null, { status: 204 });
}
