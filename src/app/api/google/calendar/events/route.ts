import { NextResponse } from "next/server";
import {
  deleteGoogleEvent,
  getGoogleEvent,
  insertGoogleEvent,
  patchGoogleEvent,
  GoogleApiError,
} from "@/lib/google/client";
import {
  googleErrorMessage,
  getUsableGoogleAccessToken,
  loadGoogleConnection,
  publicGoogleConnection,
  requireAuthenticatedGoogleContext,
} from "@/lib/google/server";
import { syncGoogleCalendar } from "@/lib/google/sync";

function toEventResponse(row: Record<string, unknown>) {
  return {
    id: row.event_key,
    providerEventId: row.provider_event_id,
    title: row.summary,
    description: row.description,
    location: row.location,
    start: row.start_at,
    end: row.end_at,
    startDate: row.start_date,
    endDate: row.end_date,
    allDay: row.is_all_day,
    hasAttendees: row.has_attendees,
    etag: row.etag,
    htmlLink: row.html_link,
    timeZone: row.time_zone,
    recurringEventId: row.recurring_event_id,
  };
}

async function getSelectedCalendarContext() {
  const context = await requireAuthenticatedGoogleContext();
  if (!context) {
    return { response: NextResponse.json({ error: "You must be signed in." }, { status: 401 }) } as const;
  }

  const connection = await loadGoogleConnection(context.client, context.user.id);
  if (!connection?.selected_calendar_id) {
    return { response: NextResponse.json({ error: "Connect and choose a Google Calendar first." }, { status: 400 }) } as const;
  }

  return { context, connection } as const;
}

export async function GET(request: Request) {
  const result = await getSelectedCalendarContext();
  if ("response" in result) {
    return result.response;
  }

  try {
    await syncGoogleCalendar(result.context.client, result.connection, request);
    const { data, error } = await result.context.client
      .from("google_calendar_events")
      .select("*")
      .eq("user_id", result.context.user.id)
      .neq("status", "cancelled")
      .order("start_at", { ascending: true, nullsFirst: false })
      .order("start_date", { ascending: true, nullsFirst: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      connection: publicGoogleConnection(result.connection),
      events: (data ?? []).map((row) => toEventResponse(row as unknown as Record<string, unknown>)),
    });
  } catch (error) {
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const result = await getSelectedCalendarContext();
  if ("response" in result) {
    return result.response;
  }

  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    description?: unknown;
    location?: unknown;
    start?: unknown;
    end?: unknown;
  } | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const start = typeof body?.start === "string" ? body.start : "";
  const end = typeof body?.end === "string" ? body.end : "";
  if (!title || !start || !end || Number.isNaN(new Date(start).getTime()) || Number.isNaN(new Date(end).getTime())) {
    return NextResponse.json({ error: "Enter an event title, start time, and end time." }, { status: 400 });
  }

  try {
    const accessToken = await getUsableGoogleAccessToken(result.context.client, result.connection);
    await insertGoogleEvent({
      accessToken,
      calendarId: result.connection.selected_calendar_id!,
      resource: {
        summary: title,
        description: typeof body?.description === "string" ? body.description : undefined,
        location: typeof body?.location === "string" ? body.location : undefined,
        start: { dateTime: new Date(start).toISOString(), timeZone: result.connection.selected_calendar_timezone ?? "UTC" },
        end: { dateTime: new Date(end).toISOString(), timeZone: result.connection.selected_calendar_timezone ?? "UTC" },
      },
    });
    await syncGoogleCalendar(result.context.client, result.connection, request);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  const result = await getSelectedCalendarContext();
  if ("response" in result) {
    return result.response;
  }

  const body = (await request.json().catch(() => null)) as {
    eventKey?: unknown;
    source?: unknown;
    etag?: unknown;
    title?: unknown;
    description?: unknown;
    location?: unknown;
    start?: unknown;
    end?: unknown;
  } | null;
  const isTimelineMove = body?.source === "timeline";
  const eventKey = typeof body?.eventKey === "string" ? body.eventKey : "";
  if (!eventKey) {
    return NextResponse.json({ error: "The event could not be identified." }, { status: 400 });
  }

  const { data: localEvent, error: localError } = await result.context.client
    .from("google_calendar_events")
    .select("*")
    .eq("user_id", result.context.user.id)
    .eq("event_key", eventKey)
    .maybeSingle();
  if (localError) {
    return NextResponse.json({ error: localError.message }, { status: 500 });
  }
  if (!localEvent) {
    return NextResponse.json({ error: "That event is no longer available. Refresh the planner." }, { status: 404 });
  }
  if (!isTimelineMove && typeof body?.etag === "string" && localEvent.etag && body.etag !== localEvent.etag) {
    return NextResponse.json({ conflict: true, error: "This event changed in Google Calendar. Refresh before editing it." }, { status: 409 });
  }

  try {
    const accessToken = await getUsableGoogleAccessToken(result.context.client, result.connection);
    const latest = await getGoogleEvent({
      accessToken,
      calendarId: result.connection.selected_calendar_id!,
      eventId: localEvent.provider_event_id,
    });
    if (latest.status === "cancelled") {
      return NextResponse.json({ conflict: true, error: "This event changed in Google Calendar. Refresh before editing it." }, { status: 409 });
    }
    if (!isTimelineMove && localEvent.etag && latest.etag && localEvent.etag !== latest.etag) {
      return NextResponse.json({ conflict: true, error: "This event changed in Google Calendar. Refresh before editing it." }, { status: 409 });
    }

    const resource: Record<string, unknown> = {};
    if (typeof body?.title === "string") resource.summary = body.title.trim() || "Untitled event";
    if (typeof body?.description === "string") resource.description = body.description;
    if (typeof body?.location === "string") resource.location = body.location;
    if (typeof body?.start === "string" && typeof body?.end === "string") {
      resource.start = { dateTime: new Date(body.start).toISOString(), timeZone: result.connection.selected_calendar_timezone ?? "UTC" };
      resource.end = { dateTime: new Date(body.end).toISOString(), timeZone: result.connection.selected_calendar_timezone ?? "UTC" };
    }

    await patchGoogleEvent({
      accessToken,
      calendarId: result.connection.selected_calendar_id!,
      eventId: localEvent.provider_event_id,
      etag: latest.etag ?? localEvent.etag,
      sendUpdates: localEvent.has_attendees ? "all" : "none",
      resource,
    });
    // The client performs one serialized read sync after the write. Keeping
    // sync-token advancement out of this request prevents a drag write and a
    // nearby modal edit from running competing Google syncs at the same time.
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof GoogleApiError && error.status === 412) {
      return NextResponse.json({ conflict: true, error: "This event changed in Google Calendar. Refresh before editing it." }, { status: 409 });
    }
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const result = await getSelectedCalendarContext();
  if ("response" in result) {
    return result.response;
  }

  const eventKey = new URL(request.url).searchParams.get("eventKey") ?? "";
  if (!eventKey) {
    return NextResponse.json({ error: "The event could not be identified." }, { status: 400 });
  }
  const { data: localEvent, error: localError } = await result.context.client
    .from("google_calendar_events")
    .select("*")
    .eq("user_id", result.context.user.id)
    .eq("event_key", eventKey)
    .maybeSingle();
  if (localError) {
    return NextResponse.json({ error: localError.message }, { status: 500 });
  }
  if (!localEvent) {
    return NextResponse.json({ ok: true });
  }
  if (localEvent.has_attendees) {
    return NextResponse.json({ error: "Events with guests are read-only in this private MVP." }, { status: 403 });
  }

  try {
    const accessToken = await getUsableGoogleAccessToken(result.context.client, result.connection);
    await deleteGoogleEvent({
      accessToken,
      calendarId: result.connection.selected_calendar_id!,
      eventId: localEvent.provider_event_id,
    });
    await syncGoogleCalendar(result.context.client, result.connection, request);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 502 });
  }
}
