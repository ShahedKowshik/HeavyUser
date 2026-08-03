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
  getSupabaseAdminClient,
  loadGoogleConnection,
  publicGoogleConnection,
  requireAuthenticatedGoogleContext,
} from "@/lib/google/server";
import { syncGoogleCalendar, upsertGoogleCalendarEvent } from "@/lib/google/sync";
import { runSchedulerForUserWithRetry } from "@/lib/scheduler/service";
import { rejectCrossOriginMutation, rejectOversizedBody } from "@/lib/security/http";

function toEventResponse(row: Record<string, unknown>) {
  const privateProperties = row.private_properties && typeof row.private_properties === "object"
    ? row.private_properties as Record<string, unknown>
    : {};
  return {
    id: row.event_key,
    providerEventId: row.provider_event_id,
    title: row.summary,
    description: row.description,
    location: row.location,
    meetingUrl: typeof row.meeting_url === "string" ? row.meeting_url : null,
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
    isTaskBlock: privateProperties.heavyuser === "task-block" || typeof privateProperties.heavyuserTaskId === "string",
    taskId: typeof privateProperties.heavyuserTaskId === "string" ? privateProperties.heavyuserTaskId : null,
    scheduleBlockId: typeof privateProperties.heavyuserBlockId === "string" ? privateProperties.heavyuserBlockId : null,
  };
}

async function getSelectedCalendarContext() {
  const context = await requireAuthenticatedGoogleContext();
  if (!context) {
    return { response: NextResponse.json({ error: "You must be signed in." }, { status: 401 }) } as const;
  }

  const connection = await loadGoogleConnection(context.admin, context.user.id);
  if (!connection?.selected_calendar_id) {
    return { response: NextResponse.json({ error: "Connect and choose a Google Calendar first." }, { status: 400 }) } as const;
  }

  return { context, connection } as const;
}

function getManagedBlockId(localEvent: Record<string, unknown>) {
  const properties = localEvent.private_properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    return null;
  }
  const blockId = (properties as Record<string, unknown>).heavyuserBlockId;
  return typeof blockId === "string" ? blockId : null;
}

function isTextWithinLimit(value: unknown, maximum: number) {
  return typeof value === "string" && value.length <= maximum;
}

async function lockManagedBlock(userId: string, localEvent: Record<string, unknown>, start: string | null, end: string | null, etag: string | null) {
  const blockId = getManagedBlockId(localEvent);
  if (!blockId) {
    return;
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return;
  }

  const { data: block, error: blockError } = await admin
    .from("task_schedule_blocks")
    .select("sync_version")
    .eq("user_id", userId)
    .eq("id", blockId)
    .maybeSingle();
  if (blockError) {
    throw blockError;
  }
  const { error: updateError } = await admin
    .from("task_schedule_blocks")
    .update({
      state: "locked",
      start_at: start ?? undefined,
      end_at: end ?? undefined,
      etag,
      sync_version: (block?.sync_version ?? 0) + 1,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", blockId);
  if (updateError) {
    throw updateError;
  }
}

async function replaceManagedBlock(userId: string, localEvent: Record<string, unknown>) {
  const blockId = getManagedBlockId(localEvent);
  const admin = getSupabaseAdminClient();
  if (!admin || !blockId) {
    return;
  }

  const { data: block, error: blockError } = await admin
    .from("task_schedule_blocks")
    .select("sync_version")
    .eq("user_id", userId)
    .eq("id", blockId)
    .maybeSingle();
  if (blockError) {
    throw blockError;
  }
  const { error: updateError } = await admin
    .from("task_schedule_blocks")
    .update({ state: "replaced", sync_version: (block?.sync_version ?? 0) + 1, last_error: "The calendar block was deleted.", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", blockId);
  if (updateError) {
    throw updateError;
  }
}

export async function GET() {
  const result = await getSelectedCalendarContext();
  if ("response" in result) {
    return result.response;
  }

  try {
    const { data, error } = await result.context.admin
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
  const originError = rejectCrossOriginMutation(request) ?? rejectOversizedBody(request);
  if (originError) {
    return originError;
  }

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
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (!title || title.length > 240 || !start || !end || !Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    return NextResponse.json({ error: "Enter an event title, start time, and end time." }, { status: 400 });
  }
  if ((body?.description !== undefined && !isTextWithinLimit(body.description, 10_000))
    || (body?.location !== undefined && !isTextWithinLimit(body.location, 2_000))) {
    return NextResponse.json({ error: "Event details are too long." }, { status: 400 });
  }

  try {
    const accessToken = await getUsableGoogleAccessToken(result.context.admin, result.connection);
    const createdEvent = await insertGoogleEvent({
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
    let syncPending = false;
    try {
      await syncGoogleCalendar(result.context.admin, result.connection, request);
    } catch {
      // The Google write succeeded. Keep the event locally visible even if
      // Google's follow-up list sync is temporarily unavailable or delayed.
      syncPending = true;
    }
    const localEvent = await upsertGoogleCalendarEvent(result.context.admin, result.context.user.id, createdEvent);
    return NextResponse.json({ ok: true, event: toEventResponse(localEvent), syncPending });
  } catch (error) {
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  const originError = rejectCrossOriginMutation(request) ?? rejectOversizedBody(request);
  if (originError) {
    return originError;
  }

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
  if (!eventKey || eventKey.length > 512) {
    return NextResponse.json({ error: "The event could not be identified." }, { status: 400 });
  }
  const hasStart = typeof body?.start === "string";
  const hasEnd = typeof body?.end === "string";
  if (hasStart !== hasEnd) {
    return NextResponse.json({ error: "Provide both a start and end time." }, { status: 400 });
  }
  if (hasStart && hasEnd) {
    const startTime = new Date(body?.start as string).getTime();
    const endTime = new Date(body?.end as string).getTime();
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
      return NextResponse.json({ error: "The end time must be after the start time." }, { status: 400 });
    }
  }
  if ((body?.title !== undefined && !isTextWithinLimit(body.title, 240))
    || (body?.description !== undefined && !isTextWithinLimit(body.description, 10_000))
    || (body?.location !== undefined && !isTextWithinLimit(body.location, 2_000))) {
    return NextResponse.json({ error: "Event details are too long." }, { status: 400 });
  }

  const { data: localEvent, error: localError } = await result.context.admin
    .from("google_calendar_events")
    .select("*")
    .eq("user_id", result.context.user.id)
    .eq("event_key", eventKey)
    .maybeSingle();
  if (localError) {
    return NextResponse.json({ error: "The event could not be loaded." }, { status: 500 });
  }
  if (!localEvent) {
    return NextResponse.json({ error: "That event is no longer available. Refresh the planner." }, { status: 404 });
  }
  if (!isTimelineMove && typeof body?.etag === "string" && localEvent.etag && body.etag !== localEvent.etag) {
    return NextResponse.json({ conflict: true, error: "This event changed in Google Calendar. Refresh before editing it." }, { status: 409 });
  }

  try {
    const accessToken = await getUsableGoogleAccessToken(result.context.admin, result.connection);
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

    const updatedEvent = await patchGoogleEvent({
      accessToken,
      calendarId: result.connection.selected_calendar_id!,
      eventId: localEvent.provider_event_id,
      etag: latest.etag ?? localEvent.etag,
      sendUpdates: localEvent.has_attendees ? "all" : "none",
      resource,
    });
    if (localEvent.private_properties && typeof localEvent.private_properties === "object") {
      await lockManagedBlock(
        result.context.user.id,
        localEvent as unknown as Record<string, unknown>,
        typeof body?.start === "string" ? new Date(body.start).toISOString() : localEvent.start_at,
        typeof body?.end === "string" ? new Date(body.end).toISOString() : localEvent.end_at,
        updatedEvent.etag ?? latest.etag ?? localEvent.etag,
      );
    }
    const localUpdatedEvent = await upsertGoogleCalendarEvent(result.context.admin, result.context.user.id, updatedEvent);
    // The client performs one serialized read sync after the write. Keeping
    // sync-token advancement out of this request prevents a drag write and a
    // nearby modal edit from running competing Google syncs at the same time.
    return NextResponse.json({ ok: true, event: toEventResponse(localUpdatedEvent) });
  } catch (error) {
    if (error instanceof GoogleApiError && error.status === 412) {
      return NextResponse.json({ conflict: true, error: "This event changed in Google Calendar. Refresh before editing it." }, { status: 409 });
    }
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) {
    return originError;
  }

  const result = await getSelectedCalendarContext();
  if ("response" in result) {
    return result.response;
  }

  const eventKey = new URL(request.url).searchParams.get("eventKey") ?? "";
  if (!eventKey || eventKey.length > 512) {
    return NextResponse.json({ error: "The event could not be identified." }, { status: 400 });
  }
  const { data: localEvent, error: localError } = await result.context.admin
    .from("google_calendar_events")
    .select("*")
    .eq("user_id", result.context.user.id)
    .eq("event_key", eventKey)
    .maybeSingle();
  if (localError) {
    return NextResponse.json({ error: "The event could not be loaded." }, { status: 500 });
  }
  if (!localEvent) {
    return NextResponse.json({ ok: true });
  }
  if (localEvent.has_attendees) {
    return NextResponse.json({ error: "Events with guests are read-only in this private MVP." }, { status: 403 });
  }

  try {
    const accessToken = await getUsableGoogleAccessToken(result.context.admin, result.connection);
    await deleteGoogleEvent({
      accessToken,
      calendarId: result.connection.selected_calendar_id!,
      eventId: localEvent.provider_event_id,
    });
    const { error: eventDeleteError } = await result.context.admin
      .from("google_calendar_events")
      .delete()
      .eq("user_id", result.context.user.id)
      .eq("event_key", eventKey);
    if (eventDeleteError) {
      throw eventDeleteError;
    }
    await syncGoogleCalendar(result.context.admin, result.connection, request);
    if (localEvent.private_properties && typeof localEvent.private_properties === "object") {
      await replaceManagedBlock(result.context.user.id, localEvent as unknown as Record<string, unknown>);
      await runSchedulerForUserWithRetry(result.context.user.id, request);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 502 });
  }
}
