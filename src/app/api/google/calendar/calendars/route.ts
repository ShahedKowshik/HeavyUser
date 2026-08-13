import { NextResponse } from "next/server";
import { listGoogleCalendars } from "@/lib/google/client";
import {
  googleErrorMessage,
  getUsableGoogleAccessToken,
  isGoogleAuthError,
  isGoogleCalendarUnavailableError,
  loadGoogleConnection,
  publicGoogleConnection,
  requireAuthenticatedGoogleContext,
  setGoogleConnectionError,
} from "@/lib/google/server";

export async function GET() {
  const context = await requireAuthenticatedGoogleContext();
  if (!context) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const connection = await loadGoogleConnection(context.admin, context.user.id);
  if (!connection) {
    return NextResponse.json({ calendars: [], connection: null });
  }
  if (connection.status === "error") {
    return NextResponse.json({
      code: "google_reconnect_required",
      reconnectRequired: true,
      connection: publicGoogleConnection(connection),
      error: connection.last_error ?? "Reconnect Google Calendar to continue.",
    }, { status: 409 });
  }

  try {
    const accessToken = await getUsableGoogleAccessToken(context.admin, connection);
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
    if (isGoogleAuthError(error) || isGoogleCalendarUnavailableError(error)) {
      await setGoogleConnectionError(context.admin, context.user.id, googleErrorMessage(error)).catch(() => undefined);
      const refreshedConnection = await loadGoogleConnection(context.admin, context.user.id).catch(() => connection);
      return NextResponse.json({
        code: "google_reconnect_required",
        reconnectRequired: true,
        connection: publicGoogleConnection(refreshedConnection),
        error: googleErrorMessage(error),
      }, { status: 409 });
    }
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 502 });
  }
}
