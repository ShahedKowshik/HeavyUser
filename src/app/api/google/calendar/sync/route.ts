import { NextResponse } from "next/server";
import { googleErrorMessage, loadGoogleConnection, publicGoogleConnection, requireAuthenticatedGoogleContext } from "@/lib/google/server";
import { syncAllGoogleCalendars } from "@/lib/google/sync";
import { rejectCrossOriginMutation } from "@/lib/security/http";
import { consumeUserOperation } from "@/lib/security/rate-limit";

export const maxDuration = 60;

export async function POST(request: Request) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) {
    return originError;
  }

  const context = await requireAuthenticatedGoogleContext();
  if (!context) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const connection = await loadGoogleConnection(context.admin, context.user.id);
  if (!connection?.selected_calendar_id) {
    return NextResponse.json({ error: "Connect and choose a Google Calendar first." }, { status: 400 });
  }

  try {
    if (!await consumeUserOperation(context.admin, context.user.id, "calendar_sync", 4, 60)) {
      return NextResponse.json({ code: "rate_limited", error: "Calendar refresh is already running often. Try again in a minute." }, { status: 429, headers: { "Retry-After": "60" } });
    }
    const sync = await syncAllGoogleCalendars(context.admin, connection, request);
    const refreshedConnection = await loadGoogleConnection(context.admin, context.user.id);
    return NextResponse.json({ connection: publicGoogleConnection(refreshedConnection), sync });
  } catch (error) {
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 502 });
  }
}
