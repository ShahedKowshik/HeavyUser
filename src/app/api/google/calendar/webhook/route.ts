import { NextResponse } from "next/server";
import { loadGoogleConnection, getSupabaseAdminClient } from "@/lib/google/server";
import { syncGoogleCalendar } from "@/lib/google/sync";
import { matchesSecret } from "@/lib/security/http";
import { loadSpaces } from "@/lib/spaces/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const channelId = request.headers.get("x-goog-channel-id");
  const resourceId = request.headers.get("x-goog-resource-id");
  const channelToken = request.headers.get("x-goog-channel-token");
  if (!channelId || !resourceId || !channelToken) {
    return new NextResponse(null, { status: 204 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return new NextResponse(null, { status: 204 });
  }

  const { data: state, error } = await admin
    .from("google_calendar_sync_states")
    .select("*")
    .eq("channel_id", channelId)
    .eq("resource_id", resourceId)
    .maybeSingle();
  if (error || !state || !state.channel_token_hash || !matchesSecret(channelToken, state.channel_token_hash)) {
    return new NextResponse(null, { status: 204 });
  }

  const connection = await loadGoogleConnection(admin, state.user_id);
  if (connection?.selected_calendar_id && state.calendar_id) {
    try {
      const spaces = await loadSpaces(admin, state.user_id);
      const space = spaces.find((candidate) => candidate.calendarId === state.calendar_id);
      if (space?.status === "active") {
        await syncGoogleCalendar(admin, connection, request, { calendarId: state.calendar_id, spaceId: space.id });
      }
    } catch {
      // Google will retry failed webhooks. The next app-load sync remains a fallback.
    }
  }

  return new NextResponse(null, { status: 204 });
}
