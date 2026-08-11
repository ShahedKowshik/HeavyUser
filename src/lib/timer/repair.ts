import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteGoogleEventIfPresent,
  getGoogleEvent,
  GoogleApiError,
  insertGoogleEvent,
  patchGoogleEvent,
} from "@/lib/google/client";
import {
  getGoogleEventKey,
  recordGoogleEventDeletion,
  upsertGoogleCalendarEvent,
} from "@/lib/google/sync";
import type { GoogleConnection } from "@/lib/google/server";
import { googleErrorMessage } from "@/lib/google/server";
import { loadSpaces } from "@/lib/spaces/server";
import { queueSchedulerJob } from "@/lib/scheduler/queue";
import type { Database } from "@/lib/supabase/database.types";

type RepairClient = SupabaseClient<Database>;
type RepairRow = Database["public"]["Tables"]["task_calendar_repairs"]["Row"];
type SessionRow = Database["public"]["Tables"]["task_work_sessions"]["Row"];
type BlockRow = Database["public"]["Tables"]["task_schedule_blocks"]["Row"];
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];

const RETRY_MINUTES = [1, 5, 15, 60];

function nowIso(timestamp = Date.now()) {
  return new Date(timestamp).toISOString();
}

function fallbackProviderEventId(userId: string, sessionId: string | null, repairId: number) {
  const digest = createHash("sha256")
    .update(`${userId}:${sessionId ?? "repair"}:${repairId}`)
    .digest("hex")
    .slice(0, 30);
  return `hu${digest}`;
}

function makeManagedEventResource(input: {
  task: TaskRow;
  sessionId: string | null;
  blockId: string;
  providerEventId: string;
  start: string;
  end: string;
  timezone: string;
}) {
  const resource: Record<string, unknown> = {
    id: input.providerEventId,
    summary: input.task.title,
    start: { dateTime: input.start, timeZone: input.timezone },
    end: { dateTime: input.end, timeZone: input.timezone },
    extendedProperties: {
      private: {
        heavyuser: "task-block",
        heavyuserTaskId: input.task.id,
        heavyuserBlockId: input.blockId,
        ...(input.sessionId ? {
          heavyuserSessionId: input.sessionId,
          heavyuserWorkEvent: "true",
        } : {}),
      },
    },
    visibility: input.task.calendar_visibility === "public" || input.task.calendar_visibility === "private"
      ? input.task.calendar_visibility
      : "default",
    transparency: input.task.calendar_transparency === "transparent" || input.task.calendar_transparency === "opaque"
      ? input.task.calendar_transparency
      : "opaque",
  };
  return resource;
}

async function deleteCachedEvent(client: RepairClient, userId: string, calendarId: string, providerEventId: string, eventKey: string) {
  await recordGoogleEventDeletion(client, userId, eventKey, providerEventId, calendarId);
  const { error } = await client
    .from("google_calendar_events")
    .delete()
    .eq("user_id", userId)
    .eq("calendar_id", calendarId)
    .eq("provider_event_id", providerEventId);
  if (error) throw error;
}

async function updateSession(client: RepairClient, userId: string, sessionId: string, values: Database["public"]["Tables"]["task_work_sessions"]["Update"]) {
  const { error } = await client
    .from("task_work_sessions")
    .update({ ...values, updated_at: nowIso() })
    .eq("user_id", userId)
    .eq("id", sessionId);
  if (error) throw error;
}

async function updateBlock(client: RepairClient, userId: string, blockId: string, values: Database["public"]["Tables"]["task_schedule_blocks"]["Update"]) {
  const { error } = await client
    .from("task_schedule_blocks")
    .update({ ...values, updated_at: nowIso() })
    .eq("user_id", userId)
    .eq("id", blockId);
  if (error) throw error;
}

async function ensureBlock(client: RepairClient, input: {
  userId: string;
  task: TaskRow;
  session: SessionRow | null;
  block: BlockRow | null;
  blockId: string;
  calendarId: string;
  providerEventId: string;
  providerEventKey: string;
  start: string;
  end: string;
  etag: string | null;
}) {
  if (input.block) {
    await updateBlock(client, input.userId, input.block.id, {
      work_session_id: input.session?.id ?? null,
      calendar_id: input.calendarId,
      provider_event_id: input.providerEventId,
      provider_event_key: input.providerEventKey,
      start_at: input.start,
      end_at: input.end,
      planned_start_at: input.start,
      planned_end_at: input.end,
      state: "locked",
      etag: input.etag,
      last_error: null,
    });
    return;
  }

  const { error } = await client.from("task_schedule_blocks").upsert({
    id: input.blockId,
    user_id: input.userId,
    task_id: input.task.id,
    space_id: input.session?.space_id ?? input.task.space_id,
    work_session_id: input.session?.id ?? null,
    calendar_id: input.calendarId,
    provider_event_id: input.providerEventId,
    provider_event_key: input.providerEventKey,
    start_at: input.start,
    end_at: input.end,
    planned_start_at: input.start,
    planned_end_at: input.end,
    state: "locked",
    sync_version: 1,
    etag: input.etag,
    last_error: null,
    updated_at: nowIso(),
  }, { onConflict: "user_id,id" });
  if (error) throw error;
}

async function createEvent(input: {
  accessToken: string;
  calendarId: string;
  resource: Record<string, unknown>;
}) {
  try {
    return await insertGoogleEvent(input);
  } catch (error) {
    if (!(error instanceof GoogleApiError) || error.status !== 409) throw error;
    return getGoogleEvent({
      accessToken: input.accessToken,
      calendarId: input.calendarId,
      eventId: String(input.resource.id),
    });
  }
}

async function repairCalendarEvent(input: {
  repair: RepairRow;
  client: RepairClient;
  userId: string;
  accessToken: string;
  connection: GoogleConnection;
  task: TaskRow | null;
  session: SessionRow | null;
  block: BlockRow | null;
  spaceTimezone: string;
}) {
  const { repair, client, userId, accessToken, connection, task, session, block, spaceTimezone } = input;
  const calendarId = repair.calendar_id || session?.calendar_id || block?.calendar_id || connection.selected_calendar_id;
  if (!calendarId) throw new Error("The saved Calendar identity is missing.");

  const blockId = session?.block_id ?? repair.block_id ?? block?.id ?? `repair-${repair.id}`;
  const sessionId = session?.id ?? repair.session_id;
  const providerEventId = repair.provider_event_id ?? session?.provider_event_id ?? block?.provider_event_id
    ?? fallbackProviderEventId(userId, sessionId, repair.id);
  const providerEventKey = session?.provider_event_key ?? block?.provider_event_key ?? `${providerEventId}::`;
  const start = session?.started_at ?? block?.start_at;
  const end = session?.stopped_at ?? block?.end_at;
  const timezone = spaceTimezone || connection.selected_calendar_timezone || "UTC";

  if (repair.operation === "delete") {
    await deleteGoogleEventIfPresent({ accessToken, calendarId, eventId: providerEventId });
    await deleteCachedEvent(client, userId, calendarId, providerEventId, providerEventKey);
    if (block?.id) {
      await updateBlock(client, userId, block.id, { state: "cancelled", last_error: null });
    }
    if (session?.id) {
      await updateSession(client, userId, session.id, {
        calendar_sync_state: "history_only",
        repair_needed: false,
        warning: null,
      });
    }
    return;
  }

  if (repair.operation === "reconcile") {
    try {
      const event = await getGoogleEvent({ accessToken, calendarId, eventId: providerEventId });
      if (event.status !== "cancelled") {
        await upsertGoogleCalendarEvent(client, userId, event, { calendarId, spaceId: session?.space_id ?? block?.space_id ?? task?.space_id ?? null });
        if (block?.id && event.start?.dateTime && event.end?.dateTime) {
          await updateBlock(client, userId, block.id, {
            state: "locked",
            start_at: new Date(event.start.dateTime).toISOString(),
            end_at: new Date(event.end.dateTime).toISOString(),
            etag: event.etag ?? null,
            last_error: null,
          });
        }
        if (session?.id) {
          await updateSession(client, userId, session.id, { calendar_sync_state: "synced", repair_needed: false });
        }
        return;
      }
    } catch (error) {
      if (!(error instanceof GoogleApiError) || (error.status !== 404 && error.status !== 410)) throw error;
    }
    if (session?.id) {
      await updateSession(client, userId, session.id, { calendar_sync_state: "history_only", repair_needed: false });
    }
    return;
  }

  if (!task) throw new Error("The task for this Calendar repair no longer exists.");
  if (!start || !end) throw new Error("The saved work range is missing.");

  const resource = makeManagedEventResource({
    task,
    sessionId,
    blockId,
    providerEventId,
    start,
    end,
    timezone,
  });
  let event;
  if (repair.operation === "patch") {
    try {
      const latest = await getGoogleEvent({ accessToken, calendarId, eventId: providerEventId });
      if (latest.status === "cancelled") throw new Error("Google Calendar cancelled the owned work event.");
      event = await patchGoogleEvent({
        accessToken,
        calendarId,
        eventId: providerEventId,
        etag: latest.etag,
        resource,
      });
    } catch (error) {
      // A temporary outage can look like a missing event. Since this event is
      // HeavyUser-owned, recreate it with the stable provider id when Google
      // confirms it no longer exists.
      if (!(error instanceof GoogleApiError) || (error.status !== 404 && error.status !== 410)) throw error;
      event = await createEvent({ accessToken, calendarId, resource });
    }
  } else {
    event = await createEvent({ accessToken, calendarId, resource });
  }

  await upsertGoogleCalendarEvent(client, userId, event, { calendarId, spaceId: session?.space_id ?? block?.space_id ?? task.space_id });
  await ensureBlock(client, {
    userId,
    task,
    session,
    block,
    blockId,
    calendarId,
    providerEventId: event.id,
    providerEventKey: getGoogleEventKey(event),
    start,
    end,
    etag: event.etag ?? null,
  });
  if (session?.id) {
    await updateSession(client, userId, session.id, {
      calendar_id: calendarId,
      block_id: blockId,
      provider_event_id: event.id,
      provider_event_key: getGoogleEventKey(event),
      calendar_sync_state: "synced",
      repair_needed: false,
      warning: null,
    });
  }
}

async function markRepairSuccess(client: RepairClient, repair: RepairRow) {
  const { error } = await client.from("task_calendar_repairs").update({
    status: "repaired",
    attempts: Math.min(repair.attempts + 1, 20),
    next_attempt_at: nowIso(),
    last_error: null,
    updated_at: nowIso(),
  }).eq("id", repair.id).eq("user_id", repair.user_id);
  if (error) throw error;
}

async function markRepairFailure(client: RepairClient, repair: RepairRow, error: unknown) {
  const attempts = Math.min(repair.attempts + 1, 20);
  const delay = RETRY_MINUTES[Math.min(repair.attempts, RETRY_MINUTES.length - 1)];
  const { error: updateError } = await client.from("task_calendar_repairs").update({
    status: "error",
    attempts,
    next_attempt_at: nowIso(Date.now() + delay * 60_000),
    last_error: googleErrorMessage(error),
    updated_at: nowIso(),
  }).eq("id", repair.id).eq("user_id", repair.user_id);
  if (updateError) throw updateError;
}

export async function processTimerCalendarRepairs(input: {
  client: RepairClient;
  userId: string;
  accessToken: string;
  connection: GoogleConnection;
  now?: number;
  calendarIds?: ReadonlySet<string>;
}) {
  const now = input.now ?? Date.now();
  let repairsQuery = input.client
    .from("task_calendar_repairs")
    .select("*")
    .eq("user_id", input.userId)
    .in("status", ["pending", "error"])
    .lte("next_attempt_at", nowIso(now))
    .lt("attempts", 20);
  if (input.calendarIds) {
    repairsQuery = repairsQuery.in("calendar_id", [...input.calendarIds]);
  }
  const { data: repairs, error: repairsError } = await repairsQuery
    .order("created_at", { ascending: true })
    .limit(50);
  if (repairsError) throw repairsError;
  if (!repairs || repairs.length === 0) {
    let pendingQuery = input.client
      .from("task_calendar_repairs")
      .select("id,next_attempt_at", { count: "exact" })
      .eq("user_id", input.userId)
      .in("status", ["pending", "error"])
      .lt("attempts", 20)
      .order("next_attempt_at", { ascending: true })
      .limit(1);
    if (input.calendarIds) {
      pendingQuery = pendingQuery.in("calendar_id", [...input.calendarIds]);
    }
    const { data: pendingRows, count: pendingCount, error: pendingError } = await pendingQuery;
    if (pendingError) throw pendingError;
    const nextAttemptAt = (pendingRows ?? []).map((row) => row.next_attempt_at).sort()[0];
    if (pendingRows && pendingRows.length > 0) {
      await queueSchedulerJob(input.client, input.userId, "timer_repair", nextAttemptAt);
    }
    return { repaired: 0, failures: 0, pending: pendingCount ?? 0, warnings: [] as ReadonlyArray<string> };
  }

  const repairRows = repairs as RepairRow[];
  const sessionIds = [...new Set(repairRows.map((repair) => repair.session_id).filter((id): id is string => Boolean(id)))];
  const blockIds = [...new Set(repairRows.map((repair) => repair.block_id).filter((id): id is string => Boolean(id)))];
  const [sessionsResult, blocksResult, spaces] = await Promise.all([
    sessionIds.length > 0
      ? input.client.from("task_work_sessions").select("*").eq("user_id", input.userId).in("id", sessionIds)
      : Promise.resolve({ data: [], error: null }),
    blockIds.length > 0
      ? input.client.from("task_schedule_blocks").select("*").eq("user_id", input.userId).in("id", blockIds)
      : Promise.resolve({ data: [], error: null }),
    loadSpaces(input.client, input.userId),
  ]);
  if (sessionsResult.error) throw sessionsResult.error;
  if (blocksResult.error) throw blocksResult.error;

  const sessionsById = new Map(((sessionsResult.data ?? []) as SessionRow[]).map((session) => [session.id, session]));
  const blocksById = new Map(((blocksResult.data ?? []) as BlockRow[]).map((block) => [block.id, block]));
  const taskIds = [...new Set([
    ...((sessionsResult.data ?? []) as SessionRow[]).map((session) => session.task_id),
    ...((blocksResult.data ?? []) as BlockRow[]).map((block) => block.task_id),
  ])];
  const { data: taskRows, error: taskError } = taskIds.length > 0
    ? await input.client.from("tasks").select("*").eq("user_id", input.userId).in("id", taskIds)
    : { data: [], error: null };
  if (taskError) throw taskError;
  const tasksById = new Map(((taskRows ?? []) as TaskRow[]).map((task) => [task.id, task]));
  const spacesById = new Map(spaces.map((space) => [space.id, space]));
  const warnings: string[] = [];
  let repaired = 0;
  let failures = 0;

  for (const repair of repairRows) {
    const session = repair.session_id ? sessionsById.get(repair.session_id) ?? null : null;
    const block = repair.block_id ? blocksById.get(repair.block_id) ?? null : session?.block_id ? blocksById.get(session.block_id) ?? null : null;
    const taskId = session?.task_id ?? block?.task_id;
    const task = taskId ? tasksById.get(taskId) ?? null : null;

    try {
      await repairCalendarEvent({
        // Once a task is deleted there is no valid scheduler block to create
        // or patch. Finish the queued operation by removing any HeavyUser-owned
        // provider event while preserving the work session as history.
        repair: !task && (repair.operation === "create" || repair.operation === "patch")
          ? { ...repair, operation: "delete" }
          : repair,
        client: input.client,
        userId: input.userId,
        accessToken: input.accessToken,
        connection: input.connection,
        task,
        session,
        block,
        spaceTimezone: spacesById.get(session?.space_id ?? block?.space_id ?? task?.space_id ?? "")?.timeZone ?? "",
      });
      await markRepairSuccess(input.client, repair);
      repaired += 1;
    } catch (error) {
      await markRepairFailure(input.client, repair, error);
      failures += 1;
      warnings.push(`Calendar repair for ${task?.title ?? "a deleted task"}: ${googleErrorMessage(error)}`);
    }
  }

  let pendingQuery = input.client
    .from("task_calendar_repairs")
    .select("id,next_attempt_at", { count: "exact" })
    .eq("user_id", input.userId)
    .in("status", ["pending", "error"])
    .lt("attempts", 20)
    .order("next_attempt_at", { ascending: true })
    .limit(1);
  if (input.calendarIds) {
    pendingQuery = pendingQuery.in("calendar_id", [...input.calendarIds]);
  }
  const { data: pendingRows, count: pendingCount, error: pendingError } = await pendingQuery;
  if (pendingError) throw pendingError;

  const nextAttemptAt = pendingRows?.[0]?.next_attempt_at;
  if (pendingRows && pendingRows.length > 0) {
    await queueSchedulerJob(input.client, input.userId, "timer_repair", nextAttemptAt);
  }

  return { repaired, failures, pending: pendingCount ?? 0, warnings };
}
