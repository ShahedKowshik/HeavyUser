import { NextResponse } from "next/server";
import { listGoogleCalendars } from "@/lib/google/client";
import {
  googleErrorMessage,
  getUsableGoogleAccessToken,
  loadGoogleConnection,
  publicGoogleConnection,
  requireAuthenticatedGoogleContext,
} from "@/lib/google/server";
import { syncGoogleCalendar } from "@/lib/google/sync";
import { runSchedulerForUserWithRetry } from "@/lib/scheduler/service";
import { rejectCrossOriginMutation, rejectOversizedBody } from "@/lib/security/http";

export async function POST(request: Request) {
  const originError = rejectCrossOriginMutation(request) ?? rejectOversizedBody(request);
  if (originError) {
    return originError;
  }

  const context = await requireAuthenticatedGoogleContext();
  if (!context) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { calendarId?: unknown } | null;
  const calendarId = typeof body?.calendarId === "string" ? body.calendarId : "";
  if (!calendarId || calendarId.length > 512) {
    return NextResponse.json({ error: "Choose a calendar." }, { status: 400 });
  }

  const connection = await loadGoogleConnection(context.admin, context.user.id);
  if (!connection) {
    return NextResponse.json({ error: "Connect Google Calendar first." }, { status: 400 });
  }

  try {
    const accessToken = await getUsableGoogleAccessToken(context.admin, connection);
    const calendars = await listGoogleCalendars(accessToken);
    const selected = calendars.find((calendar) => calendar.id === calendarId);
    if (!selected) {
      return NextResponse.json({ error: "That calendar is not writable or is no longer available." }, { status: 403 });
    }

    const cleanupResults = await Promise.all([
      context.admin.from("google_calendar_events").delete().eq("user_id", context.user.id),
      context.admin.from("google_calendar_sync_states").delete().eq("user_id", context.user.id),
    ]);
    const cleanupFailure = cleanupResults.find((result) => result.error);
    if (cleanupFailure?.error) {
      throw cleanupFailure.error;
    }

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

    const sync = await syncGoogleCalendar(context.admin, updatedConnection, request);
    const scheduler = await runSchedulerForUserWithRetry(context.user.id, request);
    return NextResponse.json({ connection: publicGoogleConnection(updatedConnection), sync, scheduler });
  } catch (error) {
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 502 });
  }
}
