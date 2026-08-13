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
} from "@/lib/google/server";
import { syncGoogleCalendar } from "@/lib/google/sync";
import { ensureSpaceForCalendar, loadSpaces } from "@/lib/spaces/server";
import { runSchedulerForUserWithRetry } from "@/lib/scheduler/service";
import { readJsonBody, rejectCrossOriginMutation } from "@/lib/security/http";

export async function POST(request: Request) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) {
    return originError;
  }
  const parsedBody = await readJsonBody<{ calendarId?: unknown }>(request);
  if (parsedBody.errorResponse) return parsedBody.errorResponse;

  const context = await requireAuthenticatedGoogleContext();
  if (!context) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const body = parsedBody.data;
  const calendarId = typeof body?.calendarId === "string" ? body.calendarId : "";
  if (!calendarId || calendarId.length > 512) {
    return NextResponse.json({ error: "Choose a calendar." }, { status: 400 });
  }

  const connection = await loadGoogleConnection(context.admin, context.user.id);
  if (!connection) {
    return NextResponse.json({ error: "Connect Google Calendar first." }, { status: 400 });
  }
  if (connection.status === "error") {
    return NextResponse.json({
      code: "google_reconnect_required",
      reconnectRequired: true,
      error: connection.last_error ?? "Reconnect Google Calendar before choosing a calendar.",
    }, { status: 409 });
  }

  try {
    const accessToken = await getUsableGoogleAccessToken(context.admin, connection);
    const calendars = await listGoogleCalendars(accessToken);
    const selected = calendars.find((calendar) => calendar.id === calendarId);
    if (!selected) {
      return NextResponse.json({ error: "That calendar is not writable or is no longer available." }, { status: 403 });
    }

    const space = await ensureSpaceForCalendar({
      client: context.admin,
      userId: context.user.id,
      calendarId: selected.id,
      calendarName: selected.summary ?? selected.id,
      timeZone: selected.timeZone ?? "UTC",
    });
    if (!space) throw new Error("The Space could not be created.");
    const { error } = await context.admin.from("google_calendar_connections").update({
      selected_calendar_id: selected.id,
      selected_calendar_name: selected.summary ?? selected.id,
      selected_calendar_timezone: selected.timeZone ?? "UTC",
      status: "connected",
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", context.user.id);
    if (error) {
      throw error;
    }

    const updatedConnection = await loadGoogleConnection(context.admin, context.user.id);
    if (!updatedConnection) {
      throw new Error("The calendar connection could not be saved.");
    }

    let sync: Awaited<ReturnType<typeof syncGoogleCalendar>> | null = null;
    let syncError: string | null = null;
    let scheduler: Awaited<ReturnType<typeof runSchedulerForUserWithRetry>> | null = null;
    let schedulerError: string | null = null;
    try {
      sync = await syncGoogleCalendar(context.admin, updatedConnection, request, { spaceId: space.id });
    } catch (error) {
      syncError = googleErrorMessage(error);
    }
    try {
      scheduler = await runSchedulerForUserWithRetry(context.user.id, request);
    } catch (error) {
      schedulerError = googleErrorMessage(error);
    }
    const latestConnection = await loadGoogleConnection(context.admin, context.user.id);
    return NextResponse.json({
      connection: publicGoogleConnection(latestConnection),
      space,
      spaces: await loadSpaces(context.admin, context.user.id),
      sync,
      scheduler,
      syncError,
      schedulerError,
    });
  } catch (error) {
    if (isGoogleAuthError(error) || isGoogleCalendarUnavailableError(error)) {
      return NextResponse.json({
        code: "google_reconnect_required",
        reconnectRequired: true,
        error: googleErrorMessage(error),
      }, { status: 409 });
    }
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 502 });
  }
}
