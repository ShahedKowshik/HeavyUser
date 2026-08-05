import { NextResponse } from "next/server";
import { googleErrorMessage, loadGoogleConnection, publicGoogleConnection, requireAuthenticatedGoogleContext } from "@/lib/google/server";
import { syncAllGoogleCalendars } from "@/lib/google/sync";
import { rejectCrossOriginMutation } from "@/lib/security/http";

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
    const sync = await syncAllGoogleCalendars(context.admin, connection, request);
    return NextResponse.json({ connection: publicGoogleConnection(connection), sync });
  } catch (error) {
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 502 });
  }
}
