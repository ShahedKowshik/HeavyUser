import { NextResponse } from "next/server";
import { googleErrorMessage, loadGoogleConnection, publicGoogleConnection, requireAuthenticatedGoogleContext } from "@/lib/google/server";
import { syncGoogleCalendar } from "@/lib/google/sync";

export async function POST(request: Request) {
  const context = await requireAuthenticatedGoogleContext();
  if (!context) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const connection = await loadGoogleConnection(context.client, context.user.id);
  if (!connection?.selected_calendar_id) {
    return NextResponse.json({ error: "Connect and choose a Google Calendar first." }, { status: 400 });
  }

  try {
    const sync = await syncGoogleCalendar(context.client, connection, request);
    return NextResponse.json({ connection: publicGoogleConnection(connection), sync });
  } catch (error) {
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 502 });
  }
}
