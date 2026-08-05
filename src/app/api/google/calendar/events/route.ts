import { NextResponse } from "next/server";
import {
  deleteGoogleEventIfPresent,
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
import { recordGoogleEventDeletion, syncGoogleCalendar, upsertGoogleCalendarEvent } from "@/lib/google/sync";
import { runSchedulerForUserWithRetry } from "@/lib/scheduler/service";
import { getCalendarBusyInterval } from "@/lib/scheduler/availability";
import { rejectCrossOriginMutation, rejectOversizedBody } from "@/lib/security/http";
import { loadSpaces } from "@/lib/spaces/server";

function toEventResponse(row: Record<string, unknown>, managedBlock?: { id: string; task_id: string }, space?: { name: string; subSpaceName?: string | null }) {
  const privateProperties = row.private_properties && typeof row.private_properties === "object"
    ? row.private_properties as Record<string, unknown>
    : {};
  const taskId = typeof privateProperties.heavyuserTaskId === "string" ? privateProperties.heavyuserTaskId : managedBlock?.task_id ?? null;
  const scheduleBlockId = typeof privateProperties.heavyuserBlockId === "string" ? privateProperties.heavyuserBlockId : managedBlock?.id ?? null;
  return {
    id: row.event_key,
    providerEventId: row.provider_event_id,
    calendarId: row.calendar_id ?? null,
    spaceId: row.space_id ?? null,
    spaceName: space?.name ?? null,
    subSpaceName: space?.subSpaceName ?? null,
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
    isTaskBlock: privateProperties.heavyuser === "task-block" || typeof privateProperties.heavyuserTaskId === "string" || Boolean(managedBlock),
    taskId,
    scheduleBlockId,
    transparency: row.transparency ?? null,
    visibility: row.visibility ?? null,
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

function getManagedBlockIdFromProperties(localEvent: Record<string, unknown>) {
  const properties = localEvent.private_properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    return null;
  }
  const blockId = (properties as Record<string, unknown>).heavyuserBlockId;
  return typeof blockId === "string" ? blockId : null;
}

async function getManagedBlockId(userId: string, localEvent: Record<string, unknown>) {
  const propertyBlockId = getManagedBlockIdFromProperties(localEvent);
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return null;
  }

  const providerEventId = typeof localEvent.provider_event_id === "string" ? localEvent.provider_event_id : "";
  let blockQuery = admin
    .from("task_schedule_blocks")
    .select("id,calendar_id,provider_event_id")
    .eq("user_id", userId);
  if (propertyBlockId) blockQuery = blockQuery.eq("id", propertyBlockId);
  else if (providerEventId) blockQuery = blockQuery.eq("provider_event_id", providerEventId);
  else return null;
  if (typeof localEvent.calendar_id === "string") blockQuery = blockQuery.eq("calendar_id", localEvent.calendar_id);
  if (propertyBlockId && providerEventId) blockQuery = blockQuery.eq("provider_event_id", providerEventId);
  const { data, error } = await blockQuery.maybeSingle();
  if (error) {
    throw error;
  }
  return data?.id ?? null;
}

function isTextWithinLimit(value: unknown, maximum: number) {
  return typeof value === "string" && value.length <= maximum;
}

function rangesOverlap(firstStart: string, firstEnd: string, secondStart: string | null, secondEnd: string | null) {
  if (!secondStart || !secondEnd) return false;
  const firstStartTime = new Date(firstStart).getTime();
  const firstEndTime = new Date(firstEnd).getTime();
  const secondStartTime = new Date(secondStart).getTime();
  const secondEndTime = new Date(secondEnd).getTime();
  return Number.isFinite(firstStartTime) && Number.isFinite(firstEndTime) && Number.isFinite(secondStartTime) && Number.isFinite(secondEndTime)
    && firstStartTime < secondEndTime && firstEndTime > secondStartTime;
}

async function findManagedMoveConflict(userId: string, localEvent: Record<string, unknown>, start: string, end: string) {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const blockId = await getManagedBlockId(userId, localEvent);
  if (!blockId) return null;
  const spaces = await loadSpaces(admin, userId);
  const timeZonesByCalendarId = new Map(spaces.map((space) => [space.calendarId, space.timeZone]));
  const [eventsResult, blocksResult] = await Promise.all([
    admin.from("google_calendar_events").select("calendar_id,provider_event_id,status,start_at,end_at,start_date,end_date,time_zone,transparency,private_properties").eq("user_id", userId).neq("status", "cancelled"),
    admin.from("task_schedule_blocks").select("id,start_at,end_at,state").eq("user_id", userId).in("state", ["flexible", "locked"]).neq("id", blockId),
  ]);
  if (eventsResult.error) throw eventsResult.error;
  if (blocksResult.error) throw blocksResult.error;
  const busyEvent = (eventsResult.data ?? []).find((event) => {
    if (event.calendar_id === localEvent.calendar_id && event.provider_event_id === localEvent.provider_event_id) return false;
    if (event.transparency === "transparent") return false;
    const properties = event.private_properties;
    if (properties && typeof properties === "object" && !Array.isArray(properties)) {
      const privateValues = properties as Record<string, unknown>;
      if (privateValues.heavyuser === "task-block" || typeof privateValues.heavyuserTaskId === "string" || typeof privateValues.heavyuserBlockId === "string") return false;
    }
    const busyInterval = getCalendarBusyInterval({
      status: event.status,
      transparency: event.transparency,
      startAt: event.start_at,
      endAt: event.end_at,
      startDate: event.start_date,
      endDate: event.end_date,
      timeZone: event.time_zone ?? timeZonesByCalendarId.get(event.calendar_id) ?? "UTC",
    }, event.time_zone ?? timeZonesByCalendarId.get(event.calendar_id) ?? "UTC");
    return busyInterval ? rangesOverlap(start, end, busyInterval.start, busyInterval.end) : false;
  });
  if (busyEvent) return "That task block overlaps a busy calendar event.";
  const busyBlock = (blocksResult.data ?? []).find((block) => rangesOverlap(start, end, block.start_at, block.end_at));
  return busyBlock ? "Task blocks cannot overlap one another." : null;
}

async function lockManagedBlock(userId: string, localEvent: Record<string, unknown>, start: string | null, end: string | null, etag: string | null) {
  const blockId = await getManagedBlockId(userId, localEvent);
  if (!blockId) {
    return;
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return;
  }

  let blockQuery = admin
    .from("task_schedule_blocks")
    .select("sync_version")
    .eq("user_id", userId)
    .eq("id", blockId);
  if (typeof localEvent.calendar_id === "string") blockQuery = blockQuery.eq("calendar_id", localEvent.calendar_id);
  const { data: block, error: blockError } = await blockQuery.maybeSingle();
  if (blockError) {
    throw blockError;
  }
  let updateQuery = admin
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
  if (typeof localEvent.calendar_id === "string") updateQuery = updateQuery.eq("calendar_id", localEvent.calendar_id);
  const { error: updateError } = await updateQuery;
  if (updateError) {
    throw updateError;
  }
}

async function replaceManagedBlock(userId: string, localEvent: Record<string, unknown>) {
  const blockId = await getManagedBlockId(userId, localEvent);
  if (!blockId) {
    return false;
  }
  await replaceManagedBlockById(userId, blockId, typeof localEvent.calendar_id === "string" ? localEvent.calendar_id : null);
  return true;
}

async function replaceManagedBlockById(userId: string, blockId: string, calendarId?: string | null) {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return;
  }

  let blockQuery = admin
    .from("task_schedule_blocks")
    .select("sync_version")
    .eq("user_id", userId)
    .eq("id", blockId);
  if (calendarId) blockQuery = blockQuery.eq("calendar_id", calendarId);
  const { data: block, error: blockError } = await blockQuery.maybeSingle();
  if (blockError) {
    throw blockError;
  }
  let updateQuery = admin
    .from("task_schedule_blocks")
    .update({ state: "replaced", sync_version: (block?.sync_version ?? 0) + 1, last_error: "The calendar block was deleted.", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", blockId);
  if (calendarId) updateQuery = updateQuery.eq("calendar_id", calendarId);
  const { error: updateError } = await updateQuery;
  if (updateError) {
    throw updateError;
  }
}

async function pauseActiveTimerForBlock(userId: string, blockId: string, warning: string) {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { data: session, error } = await admin
    .from("task_work_sessions")
    .select("id,started_at")
    .eq("user_id", userId)
    .eq("block_id", blockId)
    .eq("state", "running")
    .maybeSingle();
  if (error) throw error;
  if (!session) return false;
  const started = new Date(session.started_at).getTime();
  const workedSeconds = Number.isFinite(started) ? Math.max(0, Math.round((Date.now() - started) / 1000)) : 0;
  const { error: updateError } = await admin.from("task_work_sessions").update({
    state: "paused",
    worked_seconds: workedSeconds,
    warning,
    calendar_sync_state: "history_only",
    repair_needed: false,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("id", session.id);
  if (updateError) throw updateError;
  const { error: ownerError } = await admin.from("task_active_session_owners").delete().eq("user_id", userId).eq("session_id", session.id);
  if (ownerError) throw ownerError;
  return true;
}

export async function GET() {
  const result = await getSelectedCalendarContext();
  if ("response" in result) {
    return result.response;
  }

  try {
    const [eventsResult, blocksResult, tasksResult, spaces] = await Promise.all([
      result.context.admin
        .from("google_calendar_events")
        .select("*")
        .eq("user_id", result.context.user.id)
        .neq("status", "cancelled")
        .order("start_at", { ascending: true, nullsFirst: false })
        .order("start_date", { ascending: true, nullsFirst: false }),
      result.context.admin
        .from("task_schedule_blocks")
        .select("id,task_id,provider_event_id,calendar_id")
        .eq("user_id", result.context.user.id)
        .not("provider_event_id", "is", null),
      result.context.admin.from("tasks").select("id,space_id,sub_space_id").eq("user_id", result.context.user.id),
      loadSpaces(result.context.admin, result.context.user.id),
    ]);

    if (eventsResult.error) throw eventsResult.error;
    if (blocksResult.error) throw blocksResult.error;
    const tasksById = new Map((tasksResult.data ?? []).map((task) => [task.id, task]));
    const blocksByProviderId = new Map((blocksResult.data ?? []).map((block) => [`${block.calendar_id}:${block.provider_event_id}`, block]));
    const spacesById = new Map(spaces.map((space) => [space.id, space]));
    const spacesByCalendarId = new Map(spaces.map((space) => [space.calendarId, space]));

    return NextResponse.json({
      connection: publicGoogleConnection(result.connection),
      events: (eventsResult.data ?? []).map((row) => {
        const managedBlock = blocksByProviderId.get(`${row.calendar_id}:${row.provider_event_id}`);
        const task = managedBlock ? tasksById.get(managedBlock.task_id) : undefined;
        const space = task?.space_id ? spacesById.get(task.space_id) : row.space_id ? spacesById.get(row.space_id) : spacesByCalendarId.get(row.calendar_id);
        const subSpace = task?.sub_space_id ? space?.subSpaces.find((candidate) => candidate.id === task.sub_space_id) : undefined;
        return toEventResponse(row as unknown as Record<string, unknown>, managedBlock, space ? { name: space.name, subSpaceName: subSpace?.name ?? null } : undefined);
      }),
      spaces,
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
    calendarId?: unknown;
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
    const requestedCalendarId = typeof body?.calendarId === "string" ? body.calendarId.trim() : "";
    const spaces = await loadSpaces(result.context.admin, result.context.user.id);
    const targetCalendarId = requestedCalendarId || result.connection.selected_calendar_id!;
    const targetSpace = spaces.find((space) => space.calendarId === targetCalendarId);
    if (requestedCalendarId && !targetSpace) {
      return NextResponse.json({ error: "Add that calendar as a Space before creating an event there." }, { status: 400 });
    }
    const accessToken = await getUsableGoogleAccessToken(result.context.admin, result.connection);
    const createdEvent = await insertGoogleEvent({
      accessToken,
      calendarId: targetCalendarId,
      resource: {
        summary: title,
        description: typeof body?.description === "string" ? body.description : undefined,
        location: typeof body?.location === "string" ? body.location : undefined,
        start: { dateTime: new Date(start).toISOString(), timeZone: targetSpace?.timeZone ?? result.connection.selected_calendar_timezone ?? "UTC" },
        end: { dateTime: new Date(end).toISOString(), timeZone: targetSpace?.timeZone ?? result.connection.selected_calendar_timezone ?? "UTC" },
      },
    });
    let syncPending = false;
    try {
      await syncGoogleCalendar(result.context.admin, result.connection, request, { calendarId: targetCalendarId, spaceId: targetSpace?.id ?? null });
    } catch {
      // The Google write succeeded. Keep the event locally visible even if
      // Google's follow-up list sync is temporarily unavailable or delayed.
      syncPending = true;
    }
    const localEvent = await upsertGoogleCalendarEvent(result.context.admin, result.context.user.id, createdEvent, { calendarId: targetCalendarId, spaceId: targetSpace?.id ?? null });
    return NextResponse.json({ ok: true, event: toEventResponse(localEvent, undefined, targetSpace ? { name: targetSpace.name } : undefined), syncPending });
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
    calendarId?: unknown;
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
  const requestedCalendarId = typeof body?.calendarId === "string" ? body.calendarId : "";
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

  const localEventQuery = result.context.admin
    .from("google_calendar_events")
    .select("*")
    .eq("user_id", result.context.user.id)
    .eq("event_key", eventKey)
    .eq("calendar_id", requestedCalendarId || result.connection.selected_calendar_id!);
  const { data: localEvent, error: localError } = await localEventQuery.maybeSingle();
  if (localError) {
    return NextResponse.json({ error: "The event could not be loaded." }, { status: 500 });
  }
  if (!localEvent) {
    return NextResponse.json({ error: "That event is no longer available. Refresh the planner." }, { status: 404 });
  }
  const managedBlockId = await getManagedBlockId(result.context.user.id, localEvent as unknown as Record<string, unknown>);
  if (managedBlockId) {
    const { data: activeSession, error: activeSessionError } = await result.context.admin
      .from("task_work_sessions")
      .select("id")
      .eq("user_id", result.context.user.id)
      .eq("block_id", managedBlockId)
      .eq("state", "running")
      .maybeSingle();
    if (activeSessionError) return NextResponse.json({ error: "The active timer could not be checked." }, { status: 500 });
    if (activeSession) return NextResponse.json({ code: "active_timer", error: "Stop the active timer before moving or resizing this block." }, { status: 409 });
  }
  if (hasStart && hasEnd) {
    const moveConflict = await findManagedMoveConflict(result.context.user.id, localEvent as unknown as Record<string, unknown>, body.start as string, body.end as string);
    if (moveConflict) return NextResponse.json({ conflict: true, error: moveConflict }, { status: 409 });
  }
  if (!isTimelineMove && typeof body?.etag === "string" && localEvent.etag && body.etag !== localEvent.etag) {
    return NextResponse.json({ conflict: true, error: "This event changed in Google Calendar. Refresh before editing it." }, { status: 409 });
  }

  try {
    const accessToken = await getUsableGoogleAccessToken(result.context.admin, result.connection);
    const latest = await getGoogleEvent({
      accessToken,
      calendarId: localEvent.calendar_id,
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
      calendarId: localEvent.calendar_id,
      eventId: localEvent.provider_event_id,
      etag: latest.etag ?? localEvent.etag,
      sendUpdates: localEvent.has_attendees ? "all" : "none",
      resource,
    });
    await lockManagedBlock(
      result.context.user.id,
      localEvent as unknown as Record<string, unknown>,
      typeof body?.start === "string" ? new Date(body.start).toISOString() : localEvent.start_at,
      typeof body?.end === "string" ? new Date(body.end).toISOString() : localEvent.end_at,
      updatedEvent.etag ?? latest.etag ?? localEvent.etag,
    );
    const localUpdatedEvent = await upsertGoogleCalendarEvent(result.context.admin, result.context.user.id, updatedEvent, { calendarId: localEvent.calendar_id, spaceId: localEvent.space_id });
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

  const searchParams = new URL(request.url).searchParams;
  const eventKey = searchParams.get("eventKey") ?? "";
  const scheduleBlockId = searchParams.get("scheduleBlockId") ?? "";
  const requestedCalendarId = searchParams.get("calendarId") ?? "";
  if ((!eventKey && !scheduleBlockId) || eventKey.length > 512 || scheduleBlockId.length > 512) {
    return NextResponse.json({ error: "The event could not be identified." }, { status: 400 });
  }
  let localEvent = null;
  let timerPaused = false;
  if (eventKey) {
    const localEventQuery = result.context.admin
      .from("google_calendar_events")
      .select("*")
      .eq("user_id", result.context.user.id)
      .eq("event_key", eventKey)
      .eq("calendar_id", requestedCalendarId || result.connection.selected_calendar_id!);
    const { data, error: localError } = await localEventQuery.maybeSingle();
    if (localError) {
      return NextResponse.json({ error: "The event could not be loaded." }, { status: 500 });
    }
    localEvent = data;
  }

  let scheduleBlock = null;
  if (!localEvent && scheduleBlockId) {
    const { data, error: scheduleBlockError } = await result.context.admin
      .from("task_schedule_blocks")
      .select("id,calendar_id,provider_event_id,provider_event_key,state")
      .eq("user_id", result.context.user.id)
      .eq("id", scheduleBlockId)
      .eq("calendar_id", requestedCalendarId || result.connection.selected_calendar_id!)
      .maybeSingle();
    if (scheduleBlockError) {
      return NextResponse.json({ error: "The scheduled block could not be loaded." }, { status: 500 });
    }
    scheduleBlock = data;
  }

  if (!localEvent && !scheduleBlock) {
    return NextResponse.json({ ok: true });
  }
  if (localEvent?.has_attendees) {
    return NextResponse.json({ error: "Events with guests are read-only in this private MVP." }, { status: 403 });
  }

  try {
    const blockId = localEvent
      ? await getManagedBlockId(result.context.user.id, localEvent as unknown as Record<string, unknown>)
      : scheduleBlock?.id ?? null;
    if (blockId) {
      timerPaused = await pauseActiveTimerForBlock(result.context.user.id, blockId, "The calendar block was deleted, so the timer is paused for review.");
    }
    const accessToken = await getUsableGoogleAccessToken(result.context.admin, result.connection);
    const targetCalendarId = localEvent?.calendar_id ?? scheduleBlock?.calendar_id ?? (requestedCalendarId || result.connection.selected_calendar_id!);
    const providerEventId = localEvent?.provider_event_id ?? scheduleBlock?.provider_event_id;
    const deletionEventKey = localEvent?.event_key
      || scheduleBlock?.provider_event_key
      || eventKey
      || `${scheduleBlock?.id ?? "event"}::`;
    if (providerEventId) {
      await deleteGoogleEventIfPresent({
        accessToken,
        calendarId: targetCalendarId,
        eventId: providerEventId,
      });
      await recordGoogleEventDeletion(
        result.context.admin,
        result.context.user.id,
        deletionEventKey,
        providerEventId,
        targetCalendarId,
      );
    }
    if (localEvent) {
      const { error: eventDeleteError } = await result.context.admin
        .from("google_calendar_events")
        .delete()
        .eq("user_id", result.context.user.id)
        .eq("calendar_id", targetCalendarId)
        .eq("event_key", localEvent.event_key);
      if (eventDeleteError) {
        throw eventDeleteError;
      }
    } else if (providerEventId) {
      const { error: eventDeleteError } = await result.context.admin
        .from("google_calendar_events")
        .delete()
        .eq("user_id", result.context.user.id)
        .eq("calendar_id", targetCalendarId)
        .eq("provider_event_id", providerEventId);
      if (eventDeleteError) {
        throw eventDeleteError;
      }
    }
    let schedulerPending = false;
    if (scheduleBlock) {
      await replaceManagedBlockById(result.context.user.id, scheduleBlock.id, scheduleBlock.calendar_id);
      try {
        await runSchedulerForUserWithRetry(result.context.user.id, request);
      } catch {
        schedulerPending = true;
      }
    } else if (localEvent) {
      try {
        const replaced = await replaceManagedBlock(result.context.user.id, localEvent as unknown as Record<string, unknown>);
        if (replaced) {
          await runSchedulerForUserWithRetry(result.context.user.id, request);
        }
      } catch {
        // The provider event and local cache are already deleted. A later
        // scheduler run can repair the task block if this immediate repair is
        // temporarily busy or unavailable.
        schedulerPending = true;
      }
    }
    return NextResponse.json({ ok: true, schedulerPending, timerPaused });
  } catch (error) {
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 502 });
  }
}
