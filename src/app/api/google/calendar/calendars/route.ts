import { NextResponse } from "next/server";
import { listGoogleCalendars } from "@/lib/google/client";
import {
  googleErrorMessage,
  getUsableGoogleAccessToken,
  loadGoogleConnection,
  requireAuthenticatedGoogleContext,
} from "@/lib/google/server";

export async function GET() {
  const context = await requireAuthenticatedGoogleContext();
  if (!context) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const connection = await loadGoogleConnection(context.client, context.user.id);
  if (!connection) {
    return NextResponse.json({ calendars: [], connection: null });
  }

  try {
    const accessToken = await getUsableGoogleAccessToken(context.client, connection);
    const calendars = await listGoogleCalendars(accessToken);
    return NextResponse.json({
      calendars: calendars.map((calendar) => ({
        id: calendar.id,
        name: calendar.summary ?? calendar.id,
        description: calendar.description ?? null,
        timeZone: calendar.timeZone ?? null,
        primary: calendar.primary === true,
        backgroundColor: calendar.backgroundColor ?? null,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 502 });
  }
}
