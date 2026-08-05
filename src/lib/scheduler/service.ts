import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteGoogleEventIfPresent,
  getGoogleEvent,
  GoogleApiError,
  insertGoogleEvent,
  patchGoogleEvent,
} from "@/lib/google/client";
import {
  getSupabaseAdminClient,
  getUsableGoogleAccessToken,
  googleErrorMessage,
  loadGoogleConnection,
  type GoogleConnection,
  type GoogleDbClient,
} from "@/lib/google/server";
import { getGoogleEventKey, recordGoogleEventDeletion, syncAllGoogleCalendars, upsertGoogleCalendarEvent } from "@/lib/google/sync";
import { queueSchedulerJob } from "@/lib/scheduler/queue";
import type { Database } from "@/lib/supabase/database.types";
import { normalizeUserSettings } from "@/lib/supabase/settings";
import type { CalendarTransparency, CalendarVisibility } from "@/lib/tasks";
import { loadSpaces } from "@/lib/spaces/server";
import { normalizeSchedulerPreferences } from "@/lib/scheduler/preferences";
import { planSchedule } from "@/lib/scheduler/planner";
import { getBusyIntervalsFromCalendarEvents } from "@/lib/scheduler/availability";
import { getManagedEventCleanupKey, getManagedEventProperties, selectManagedEventCleanup } from "@/lib/scheduler/reconcile";
import { getRowWorkedSeconds, loadWorkSessionRows, loadTimerSnapshot } from "@/lib/timer/data";
import { processTimerCalendarRepairs } from "@/lib/timer/repair";
import type {
  ScheduleBlockSnapshot,
  ScheduledBlock,
  SchedulerPreferences,
  SchedulerTask,
  TaskScheduleSnapshot,
  TaskScheduleStatus,
} from "@/lib/scheduler/types";

type SchedulerAdminClient = SupabaseClient<Database>;
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type BlockRow = Database["public"]["Tables"]["task_schedule_blocks"]["Row"];
type StatusRow = Database["public"]["Tables"]["task_schedule_status"]["Row"];
type CalendarEventRow = Database["public"]["Tables"]["google_calendar_events"]["Row"];
type TaskStatusWrite = Omit<StatusRow, "user_id" | "task_id" | "updated_at" | "worked_minutes" | "remaining_minutes" | "active_session_id" | "missed_minutes">
  & Partial<Pick<StatusRow, "worked_minutes" | "remaining_minutes" | "active_session_id" | "missed_minutes">>;

const RETRY_MINUTES = [1, 5, 15, 60];
const BUSY_RETRY_DELAY_MS = 750;
const BUSY_RETRY_TIMEOUT_MS = 45_000;
const MAX_QUEUE_RUNTIME_MS = 45_000;

export type SchedulerSummary = {
  userId: string;
  created: number;
  moved: number;
  deleted: number;
  locked: number;
  warnings: ReadonlyArray<string>;
};

function normalizeTask(row: TaskRow): SchedulerTask {
  return {
    id: row.id,
    title: row.title,
    spaceId: row.space_id,
    subSpaceId: row.sub_space_id,
    duration: row.duration,
    startDate: row.start_date,
    deadline: row.deadline,
    priority: row.priority === "urgent" || row.priority === "high" || row.priority === "low" ? row.priority : "normal",
    position: row.position,
    status: row.status === "focus" || row.status === "done" ? row.status : "open",
    autoSchedule: row.auto_schedule !== false,
    minBlockMinutes: row.min_block_minutes,
    maxBlockMinutes: row.max_block_minutes,
    calendarVisibility: isVisibility(row.calendar_visibility) ? row.calendar_visibility : null,
    calendarTransparency: isTransparency(row.calendar_transparency) ? row.calendar_transparency : null,
  };
}

function isVisibility(value: string | null): value is CalendarVisibility {
  return value === "default" || value === "public" || value === "private";
}

function isTransparency(value: string | null): value is CalendarTransparency {
  return value === "default" || value === "opaque" || value === "transparent";
}

function toScheduledBlock(row: BlockRow): ScheduledBlock {
  return {
    id: row.id,
    taskId: row.task_id,
    calendarId: row.calendar_id,
    spaceId: row.space_id,
    start: row.start_at,
    end: row.end_at,
    plannedStart: row.planned_start_at,
    plannedEnd: row.planned_end_at,
    state: row.state === "locked" || row.state === "replaced" || row.state === "cancelled" || row.state === "missed" ? row.state : "flexible",
    providerEventId: row.provider_event_id,
    etag: row.etag,
    syncVersion: row.sync_version,
  };
}

function isManagedEvent(event: CalendarEventRow, blockProviderIds: ReadonlySet<string>) {
  const privateProperties = event.private_properties;
  if (privateProperties && typeof privateProperties === "object" && !Array.isArray(privateProperties)) {
    const value = privateProperties as Record<string, unknown>;
    if (value.heavyuser === "task-block" || typeof value.heavyuserTaskId === "string") {
      return true;
    }
  }

  return blockProviderIds.has(`${event.calendar_id}:${event.provider_event_id}`);
}

function eventResource(input: {
  task: SchedulerTask;
  blockId: string;
  providerEventId: string;
  start: string;
  end: string;
  preferences: SchedulerPreferences;
}) {
  const visibility = input.task.calendarVisibility ?? input.preferences.defaultCalendarVisibility;
  const transparency = input.task.calendarTransparency ?? input.preferences.defaultCalendarTransparency;
  const resource: Record<string, unknown> = {
    id: input.providerEventId,
    summary: input.task.title,
    start: { dateTime: input.start, timeZone: input.preferences.timezone },
    end: { dateTime: input.end, timeZone: input.preferences.timezone },
    extendedProperties: {
      private: {
        heavyuser: "task-block",
        heavyuserTaskId: input.task.id,
        heavyuserBlockId: input.blockId,
      },
    },
  };

  if (visibility !== "default") {
    resource.visibility = visibility;
  }
  if (transparency !== "default") {
    resource.transparency = transparency;
  }

  // Send the reset values too. Otherwise changing a task from a custom
  // visibility/free setting back to the calendar default would leave the old
  // Google value in place forever.
  if (visibility === "default") {
    resource.visibility = "default";
  }
  if (transparency === "default") {
    resource.transparency = "opaque";
  }

  return resource;
}

function providerEventId(userId: string, taskId: string, blockId: string) {
  const digest = createHash("sha256").update(`${userId}:${taskId}:${blockId}`).digest("hex").slice(0, 32);
  return `hu${digest}`;
}

function plannedBlockId(userId: string, taskId: string, start: string, end: string) {
  const digest = createHash("sha256").update(`${userId}:${taskId}:${start}:${end}`).digest("hex").slice(0, 24);
  return `block-${digest}`;
}

function availablePlannedBlockId(userId: string, taskId: string, start: string, end: string, blockIds: ReadonlySet<string>) {
  const base = plannedBlockId(userId, taskId, start, end);
  if (!blockIds.has(base)) {
    return base;
  }

  let suffix = 1;
  while (blockIds.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function getFutureBlocks(blocks: ReadonlyArray<BlockRow>, taskId: string, now: number, includeLocked = false) {
  return blocks
    .filter((block) => block.task_id === taskId && block.state !== "replaced" && block.state !== "cancelled" && block.state !== "missed")
    .filter((block) => new Date(block.end_at).getTime() > now)
    .filter((block) => includeLocked || block.state !== "locked")
    .sort((first, second) => first.start_at.localeCompare(second.start_at));
}

function scheduleRangeKey(start: string, end: string) {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  return Number.isFinite(startTime) && Number.isFinite(endTime)
    ? `${startTime}:${endTime}`
    : `${start}:${end}`;
}

async function unlockFutureBlocksForPriorityReplan(
  client: SchedulerAdminClient,
  userId: string,
  now: number,
) {
  const { data, error } = await client
    .from("task_schedule_blocks")
    .select("id,sync_version")
    .eq("user_id", userId)
    .eq("state", "locked")
    .gte("start_at", new Date(now).toISOString());
  if (error) {
    throw error;
  }

  for (const block of data ?? []) {
    await updateBlock(client, userId, block.id, {
      state: "flexible",
      sync_version: block.sync_version + 1,
      last_error: null,
    });
  }
}

async function updateBlock(client: SchedulerAdminClient, userId: string, blockId: string, values: Database["public"]["Tables"]["task_schedule_blocks"]["Update"]) {
  const { error } = await client
    .from("task_schedule_blocks")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", blockId);
  if (error) {
    throw error;
  }
}

async function verifyMissingManagedEvent(input: {
  client: SchedulerAdminClient;
  block: BlockRow;
  accessToken: string;
  calendarId: string;
}) {
  try {
    const providerEvent = await getGoogleEvent({
      accessToken: input.accessToken,
      calendarId: input.calendarId,
      eventId: input.block.provider_event_id!,
    });

    // A concurrent sync can temporarily remove the cache row while the
    // provider event is still present. Restore the cache and keep the block
    // instead of treating that transient gap as a user deletion.
    if (providerEvent.status !== "cancelled") {
      await upsertGoogleCalendarEvent(input.client, input.block.user_id, providerEvent, { calendarId: input.calendarId, spaceId: input.block.space_id });
      return false;
    }

    return true;
  } catch (error) {
    // Google returns a cancelled event with a 200 in some cases, but a
    // recently deleted event can also return 404/410. Both are confirmed
    // deletion signals; rate limits and other transient failures are not.
    if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410)) {
      return true;
    }
    throw error;
  }
}

async function markExternalChanges(
  client: SchedulerAdminClient,
  blocks: BlockRow[],
  events: CalendarEventRow[],
  now: number,
  accessToken: string,
) {
  const eventsByProviderId = new Map(events.map((event) => [`${event.calendar_id}:${event.provider_event_id}`, event]));
  let locked = 0;
  for (const block of blocks) {
    if (block.state === "replaced" || block.state === "cancelled" || !block.provider_event_id) {
      continue;
    }

    const event = eventsByProviderId.get(`${block.calendar_id}:${block.provider_event_id}`);
    if (!event) {
      const deleted = await verifyMissingManagedEvent({ client, block, accessToken, calendarId: block.calendar_id });
      if (!deleted) {
        continue;
      }

      await updateBlock(client, block.user_id, block.id, {
        state: "replaced",
        sync_version: block.sync_version + 1,
        last_error: "The Google Calendar event was deleted.",
      });
      continue;
    }

    if (block.state === "locked" || new Date(block.end_at).getTime() <= now) {
      continue;
    }

    // Any Google-side edit to a flexible block is user intent. Preserve it by
    // locking the local record, including title/visibility edits that do not
    // change the time. All-day conversions have no timed values to copy, so
    // retain the last known local range while keeping the Google event intact.
    const timeChanged = !event.start_at || !event.end_at
      || new Date(event.start_at).getTime() !== new Date(block.start_at).getTime()
      || new Date(event.end_at).getTime() !== new Date(block.end_at).getTime();
    const metadataChanged = Boolean(event.etag && block.etag && event.etag !== block.etag);
    if (timeChanged || metadataChanged) {
      await updateBlock(client, block.user_id, block.id, {
        state: "locked",
        start_at: event.start_at ?? block.start_at,
        end_at: event.end_at ?? block.end_at,
        etag: event.etag,
        sync_version: block.sync_version + 1,
        last_error: null,
      });
      locked += 1;
    }
  }

  return locked;
}

async function loadPreferences(client: SchedulerAdminClient, userId: string, fallbackTimezone: string) {
  const [preferencesResult, userResult] = await Promise.all([
    client
      .from("task_scheduling_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    client.auth.admin.getUserById(userId),
  ]);
  if (preferencesResult.error) {
    throw preferencesResult.error;
  }
  if (userResult.error) {
    throw userResult.error;
  }

  const daySettings = normalizeUserSettings(userResult.data.user?.user_metadata?.heavyuser_settings);
  return normalizeSchedulerPreferences(preferencesResult.data, fallbackTimezone, daySettings);
}

async function loadSchedulerData(client: SchedulerAdminClient, userId: string, connection: GoogleConnection, fallbackTimezone = connection.selected_calendar_timezone ?? "UTC") {
  const [tasksResult, blocksResult, eventsResult] = await Promise.all([
    client.from("tasks").select("*").eq("user_id", userId).order("position", { ascending: true }),
    client.from("task_schedule_blocks").select("*").eq("user_id", userId),
    client.from("google_calendar_events").select("*").eq("user_id", userId),
  ]);
  if (tasksResult.error) throw tasksResult.error;
  if (blocksResult.error) throw blocksResult.error;
  if (eventsResult.error) throw eventsResult.error;

  const blocks = blocksResult.data ?? [];
  const blockProviderIds = new Set(blocks
    .filter((block) => Boolean(block.provider_event_id))
    .map((block) => `${block.calendar_id}:${block.provider_event_id}`));
  const events = (eventsResult.data ?? []) as CalendarEventRow[];
  const preferences = await loadPreferences(client, userId, fallbackTimezone);
  const busyIntervals = getBusyIntervalsFromCalendarEvents(events
    .filter((event) => !isManagedEvent(event, blockProviderIds))
    .map((event) => ({ status: event.status, transparency: event.transparency, startAt: event.start_at, endAt: event.end_at, startDate: event.start_date, endDate: event.end_date, timeZone: event.time_zone })), preferences.timezone);

  return {
    tasks: (tasksResult.data ?? []).map(normalizeTask),
    blocks,
    events,
    preferences,
    busyIntervals,
  };
}

async function pauseActiveSessionsForExternalChanges(
  client: SchedulerAdminClient,
  userId: string,
  blocks: ReadonlyArray<BlockRow>,
  events: ReadonlyArray<CalendarEventRow>,
  accessToken: string,
  now: number,
) {
  const sessions = await loadWorkSessionRows(client, userId);
  const { data: taskRows, error: taskRowsError } = await client.from("tasks").select("id,status").eq("user_id", userId);
  if (taskRowsError) throw taskRowsError;
  const completedTaskIds = new Set((taskRows ?? []).filter((task) => task.status === "done").map((task) => task.id));
  const running = sessions.filter((session) => session.state === "running");
  const eventsByProvider = new Map(events.map((event) => [`${event.calendar_id}:${event.provider_event_id}`, event]));
  const blocksById = new Map(blocks.map((block) => [block.id, block]));
  const warnings: string[] = [];

  for (const session of running) {
    if (!session.provider_event_id || !session.calendar_id) continue;
    if (completedTaskIds.has(session.task_id)) {
      const started = new Date(session.started_at).getTime();
      const stopAt = Math.max(now, Number.isFinite(started) ? started + 1000 : now);
      const stopIso = new Date(stopAt).toISOString();
      const workedSeconds = Number.isFinite(started) ? Math.max(0, Math.round((stopAt - started) / 1000)) : 0;
      const warning = "The task was completed on another device, so its timer was stopped.";
      let calendarSyncState: "synced" | "pending" = "synced";
      try {
        const providerEvent = await getGoogleEvent({ accessToken, calendarId: session.calendar_id, eventId: session.provider_event_id });
        if (providerEvent.status === "cancelled") {
          calendarSyncState = "pending";
        } else {
          const updatedEvent = await patchGoogleEvent({
            accessToken,
            calendarId: session.calendar_id,
            eventId: session.provider_event_id,
            etag: providerEvent.etag,
            resource: { end: { dateTime: stopIso, timeZone: providerEvent.end?.timeZone ?? "UTC" } },
          });
          await upsertGoogleCalendarEvent(client, userId, updatedEvent, { calendarId: session.calendar_id, spaceId: session.space_id });
          const block = session.block_id ? blocksById.get(session.block_id) : undefined;
          if (block) {
            await updateBlock(client, userId, block.id, { end_at: stopIso, planned_end_at: stopIso, etag: updatedEvent.etag ?? providerEvent.etag ?? null, state: "locked", last_error: null });
          }
        }
      } catch (error) {
        calendarSyncState = "pending";
        const { error: repairError } = await client.from("task_calendar_repairs").insert({
          user_id: userId,
          session_id: session.id,
          block_id: session.block_id,
          calendar_id: session.calendar_id,
          provider_event_id: session.provider_event_id,
          operation: "patch",
          status: "pending",
          attempts: 0,
          next_attempt_at: new Date().toISOString(),
          last_error: googleErrorMessage(error),
          updated_at: new Date().toISOString(),
        });
        if (repairError) throw repairError;
        if (session.block_id) {
          await updateBlock(client, userId, session.block_id, { end_at: stopIso, planned_end_at: stopIso, state: "locked", last_error: googleErrorMessage(error) });
        }
      }
      const { error: sessionError } = await client.from("task_work_sessions").update({
        state: "stopped",
        stopped_at: stopIso,
        original_stopped_at: session.original_stopped_at ?? stopIso,
        worked_seconds: workedSeconds,
        calendar_sync_state: calendarSyncState,
        repair_needed: calendarSyncState === "pending",
        warning,
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId).eq("id", session.id);
      if (sessionError) throw sessionError;
      const { error: ownerError } = await client.from("task_active_session_owners").delete().eq("user_id", userId).eq("session_id", session.id);
      if (ownerError) throw ownerError;
      warnings.push(warning);
      continue;
    }
    const event = eventsByProvider.get(`${session.calendar_id}:${session.provider_event_id}`);
    const cachedDeletion = event?.status === "cancelled";
    if (!event || cachedDeletion) {
      try {
        const providerEvent = await getGoogleEvent({ accessToken, calendarId: session.calendar_id, eventId: session.provider_event_id });
        if (providerEvent.status !== "cancelled") {
          await upsertGoogleCalendarEvent(client, userId, providerEvent, { calendarId: session.calendar_id, spaceId: session.space_id });
          continue;
        }
      } catch (error) {
        if (!(error instanceof GoogleApiError) || (error.status !== 404 && error.status !== 410)) {
          continue;
        }
      }
    }

    const expectedStart = new Date(session.started_at).getTime();
    const actualStart = event?.start_at ? new Date(event.start_at).getTime() : Number.NaN;
    const expectedEnd = session.planned_end_at ? new Date(session.planned_end_at).getTime() : Number.NaN;
    const actualEnd = event?.end_at ? new Date(event.end_at).getTime() : Number.NaN;
    const changed = cachedDeletion || !event || !Number.isFinite(actualStart) || Math.abs(actualStart - expectedStart) > 1000
      || (Number.isFinite(expectedEnd) && Number.isFinite(actualEnd) && Math.abs(actualEnd - expectedEnd) > 1000)
      || Boolean(event?.etag && blocksById.get(session.block_id ?? "")?.etag && event.etag !== blocksById.get(session.block_id ?? "")?.etag);
    if (!changed) continue;

    const elapsedSeconds = Math.max(0, Math.round((now - expectedStart) / 1000));
    const warning = event && !cachedDeletion
      ? "Google Calendar changed the active block, so the timer is paused for review."
      : "The active Google Calendar block was deleted, so the timer is paused for review.";
    const { error: sessionError } = await client.from("task_work_sessions").update({
      state: "paused",
      worked_seconds: elapsedSeconds,
      warning,
      repair_needed: !event || cachedDeletion,
      calendar_sync_state: !event || cachedDeletion ? "pending" : "synced",
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("id", session.id);
    if (sessionError) throw sessionError;
    const { error: ownerError } = await client.from("task_active_session_owners").delete().eq("user_id", userId).eq("session_id", session.id);
    if (ownerError) throw ownerError;
    const block = session.block_id ? blocksById.get(session.block_id) : undefined;
    if (block) {
      await updateBlock(client, userId, block.id, {
        state: event && !cachedDeletion ? "locked" : "replaced",
        start_at: event?.start_at ?? block.start_at,
        end_at: event?.end_at ?? block.end_at,
        etag: event?.etag ?? block.etag,
        sync_version: block.sync_version + 1,
        last_error: warning,
      });
    }
    warnings.push(warning);
  }

  return warnings;
}

async function markPastBlocksMissed(
  client: SchedulerAdminClient,
  userId: string,
  blocks: ReadonlyArray<BlockRow>,
  events: ReadonlyArray<CalendarEventRow>,
  accessToken: string,
  now: number,
) {
  const sessions = await loadWorkSessionRows(client, userId);
  const sessionBlockIds = new Set(sessions.filter((session) => session.state !== "cancelled" && session.block_id).map((session) => session.block_id));
  const sessionProviderIds = new Set(sessions
    .filter((session) => session.state !== "cancelled" && session.calendar_id && session.provider_event_id)
    .map((session) => `${session.calendar_id}:${session.provider_event_id}`));
  const sessionIds = new Set(sessions.filter((session) => session.state !== "cancelled").map((session) => session.id));
  const eventsByProvider = new Map(events.map((event) => [`${event.calendar_id}:${event.provider_event_id}`, event]));
  const missed: BlockRow[] = [];

  for (const block of blocks) {
    if (!["flexible", "locked"].includes(block.state) || new Date(block.end_at).getTime() > now) continue;
    const providerKey = block.provider_event_id ? `${block.calendar_id}:${block.provider_event_id}` : "";
    const eventSessionId = eventsByProvider.get(providerKey)?.private_properties;
    const propertySessionId = eventSessionId && typeof eventSessionId === "object" && !Array.isArray(eventSessionId)
      ? (eventSessionId as Record<string, unknown>).heavyuserSessionId
      : null;
    if (sessionBlockIds.has(block.id) || (block.work_session_id && sessionIds.has(block.work_session_id)) || sessionProviderIds.has(providerKey) || (typeof propertySessionId === "string" && sessionIds.has(propertySessionId))) continue;

    let deleteError: unknown = null;
    try {
      if (block.provider_event_id) {
        await safeDeleteGoogleEvent({ accessToken, calendarId: block.calendar_id, eventId: block.provider_event_id });
        await rememberAndDeleteCachedProviderEvent(client, userId, block.provider_event_id, block.provider_event_key ?? undefined, block.calendar_id);
      }
    } catch (error) {
      deleteError = error;
      await queueBlockCleanup(client, block, googleErrorMessage(error));
    }
    await updateBlock(client, userId, block.id, {
      state: "missed",
      sync_version: block.sync_version + 1,
      last_error: deleteError ? googleErrorMessage(deleteError) : "This block ended without a timer or logged work.",
    });
    missed.push(block);
  }
  return missed;
}

async function reconcileManagedEvents(
  client: SchedulerAdminClient,
  connection: GoogleConnection,
  tasks: ReadonlyArray<SchedulerTask>,
  blocks: ReadonlyArray<BlockRow>,
  events: ReadonlyArray<CalendarEventRow>,
  accessToken: string,
  now = Date.now(),
) {
  const activeTaskIds = new Set(tasks.map((task) => task.id));
  const cleanup = selectManagedEventCleanup(
    events.map((event) => ({
      eventKey: event.event_key,
      providerEventId: event.provider_event_id,
      calendarId: event.calendar_id,
      taskId: null,
      blockId: null,
      startAt: event.start_at,
      endAt: event.end_at,
      status: event.status,
      googleUpdatedAt: event.google_updated_at,
      privateProperties: event.private_properties,
    })),
    activeTaskIds,
    blocks.map((block) => ({
      id: block.id,
      taskId: block.task_id,
      calendarId: block.calendar_id,
      startAt: block.start_at,
      endAt: block.end_at,
      state: block.state,
      providerEventId: block.provider_event_id,
    })),
    now,
  );
  if (cleanup.eventKeys.size === 0) {
    return { deleted: 0, failures: 0, warnings: [] as ReadonlyArray<string> };
  }

  const blocksById = new Map(blocks.map((block) => [block.id, block]));
  let deleted = 0;
  let failures = 0;
  const warnings: string[] = [];
  // A bad deploy can leave hundreds of managed copies behind. Delete a small
  // bounded batch at a time so recovery finishes within the worker budget
  // without flooding Google's API.
  const cleanupEvents = events.filter((event) => cleanup.eventKeys.has(getManagedEventCleanupKey(event.event_key, event.calendar_id)));
  const cleanupConcurrency = 8;
  for (let index = 0; index < cleanupEvents.length; index += cleanupConcurrency) {
    await Promise.all(cleanupEvents.slice(index, index + cleanupConcurrency).map(async (event) => {
      try {
        await safeDeleteGoogleEvent({
          accessToken,
          calendarId: event.calendar_id,
          eventId: event.provider_event_id,
        });
        await recordGoogleEventDeletion(client, connection.user_id, event.event_key, event.provider_event_id, event.calendar_id);
        const { error: cacheDeleteError } = await client
          .from("google_calendar_events")
          .delete()
          .eq("user_id", connection.user_id)
          .eq("calendar_id", event.calendar_id)
          .eq("event_key", event.event_key);
        if (cacheDeleteError) {
          throw cacheDeleteError;
        }

        const properties = getManagedEventProperties(event.private_properties);
        const block = blocksById.get(properties.blockId ?? "")
          ?? blocks.find((candidate) => candidate.calendar_id === event.calendar_id && candidate.provider_event_id === event.provider_event_id);
        if (block && cleanup.blockIds.has(block.id)) {
          await updateBlock(client, connection.user_id, block.id, {
            state: "replaced",
            sync_version: block.sync_version + 1,
            last_error: "A duplicate or orphaned calendar block was removed.",
          });
        }
        deleted += 1;
      } catch (cleanupError) {
        failures += 1;
        warnings.push(`${event.summary}: ${googleErrorMessage(cleanupError)}`);
      }
    }));
  }

  return { deleted, failures, warnings };
}

async function setTaskStatus(client: SchedulerAdminClient, userId: string, taskId: string, status: TaskStatusWrite) {
  const { error } = await client.from("task_schedule_status").upsert({
    user_id: userId,
    task_id: taskId,
    worked_minutes: 0,
    remaining_minutes: status.missing_minutes,
    active_session_id: null,
    missed_minutes: 0,
    ...status,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,task_id" });
  if (error) {
    throw error;
  }
}

async function safeDeleteGoogleEvent(input: { accessToken: string; calendarId: string; eventId: string }) {
  await deleteGoogleEventIfPresent(input);
}

async function rememberAndDeleteCachedProviderEvent(
  client: SchedulerAdminClient,
  userId: string,
  providerEventId: string,
  eventKey = `${providerEventId}::`,
  calendarId = "",
) {
  await recordGoogleEventDeletion(client, userId, eventKey, providerEventId, calendarId);
  let query = client
    .from("google_calendar_events")
    .delete()
    .eq("user_id", userId)
    .eq("provider_event_id", providerEventId);
  if (calendarId) query = query.eq("calendar_id", calendarId);
  const { error } = await query;
  if (error) {
    throw error;
  }
}

async function removeBlockEvent(client: SchedulerAdminClient, connection: GoogleConnection, accessToken: string, block: BlockRow) {
  if (block.provider_event_id) {
    await safeDeleteGoogleEvent({
      accessToken,
      calendarId: block.calendar_id,
      eventId: block.provider_event_id,
    });
    await rememberAndDeleteCachedProviderEvent(client, block.user_id, block.provider_event_id, block.provider_event_key ?? undefined, block.calendar_id);
  }
  await updateBlock(client, block.user_id, block.id, { state: "cancelled", sync_version: block.sync_version + 1, last_error: null });
}

async function processTaskCleanup(client: SchedulerAdminClient, userId: string, accessToken: string) {
  const { data, error } = await client
    .from("task_schedule_cleanup")
    .select("*")
    .eq("user_id", userId)
    .is("processed_at", null)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) {
    throw error;
  }

  let failures = 0;
  for (const cleanup of data ?? []) {
    try {
      await safeDeleteGoogleEvent({
        accessToken,
        calendarId: cleanup.calendar_id,
        eventId: cleanup.provider_event_id,
      });
      await rememberAndDeleteCachedProviderEvent(client, userId, cleanup.provider_event_id, undefined, cleanup.calendar_id);
      const { error: processedError } = await client.from("task_schedule_cleanup")
        .update({ processed_at: new Date().toISOString(), last_error: null })
        .eq("id", cleanup.id);
      if (processedError) {
        throw processedError;
      }
    } catch (cleanupError) {
      failures += 1;
      const { error: cleanupUpdateError } = await client.from("task_schedule_cleanup")
        .update({ last_error: googleErrorMessage(cleanupError) })
        .eq("id", cleanup.id);
      if (cleanupUpdateError) {
        throw cleanupUpdateError;
      }
    }
  }
  const { count: pendingCount, error: pendingError } = await client
    .from("task_schedule_cleanup")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("processed_at", null);
  if (pendingError) {
    throw pendingError;
  }

  return { failures, pendingCount: pendingCount ?? 0 };
}

async function queueBlockCleanup(client: SchedulerAdminClient, block: BlockRow, lastError: string) {
  if (!block.provider_event_id) {
    return;
  }
  const { error } = await client.from("task_schedule_cleanup").insert({
    user_id: block.user_id,
    calendar_id: block.calendar_id,
    provider_event_id: block.provider_event_id,
    last_error: lastError,
  });
  if (error) {
    throw error;
  }
}

/** Best-effort cleanup used immediately before a user disconnects Calendar. */
export async function removeManagedBlocksForConnection(connection: GoogleConnection) {
  const client = getSupabaseAdminClient();
  if (!client) {
    return { deleted: 0, errors: [] as ReadonlyArray<string> };
  }

  const accessToken = await getUsableGoogleAccessToken(client, connection);
  await processTaskCleanup(client, connection.user_id, accessToken);
  const now = Date.now();
  const { data, error } = await client
    .from("task_schedule_blocks")
    .select("*")
    .eq("user_id", connection.user_id)
    .in("state", ["flexible", "locked"]);
  if (error) {
    throw error;
  }

  let deleted = 0;
  const errors: string[] = [];
  for (const block of data ?? []) {
    if (new Date(block.end_at).getTime() <= now) {
      continue;
    }
    try {
      if (block.provider_event_id) {
        await safeDeleteGoogleEvent({
          accessToken,
          calendarId: block.calendar_id,
          eventId: block.provider_event_id,
        });
        await recordGoogleEventDeletion(
          client,
          block.user_id,
          block.provider_event_key ?? `${block.provider_event_id}::`,
          block.provider_event_id,
          block.calendar_id,
        );
      }
      await updateBlock(client, block.user_id, block.id, { state: "cancelled", sync_version: block.sync_version + 1, last_error: null });
      deleted += 1;
    } catch (cleanupError) {
      const message = googleErrorMessage(cleanupError);
      errors.push(message);
      await updateBlock(client, block.user_id, block.id, { state: "cancelled", sync_version: block.sync_version + 1, last_error: message });
      await queueBlockCleanup(client, block, message);
    }
  }

  return { deleted, errors };
}

async function applyTaskPlan(input: {
  client: SchedulerAdminClient;
  connection: GoogleConnection;
  accessToken: string;
  task: SchedulerTask;
  plan: ReturnType<typeof planSchedule>["tasks"][number];
  blocks: BlockRow[];
  events: CalendarEventRow[];
  preferences: SchedulerPreferences;
  calendarId: string;
  spaceId: string;
  now: number;
  workedMinutes: number;
  remainingMinutes: number;
  activeSessionId: string | null;
  missedMinutes: number;
}) {
  const { client, connection, accessToken, task, plan, blocks, events, preferences, calendarId, spaceId, now, workedMinutes, remainingMinutes, activeSessionId, missedMinutes } = input;
  const isDone = task.status === "done";
  const existingFuture = getFutureBlocks(blocks, task.id, now, true);
  const activeBlockIds = new Set(
    blocks
      .filter((block) => activeSessionId && block.work_session_id === activeSessionId)
      .map((block) => block.id),
  );
  // A task belongs to one Space. When it moves, every future block in the old
  // calendar must leave with it, including blocks the user previously locked.
  // Keeping an old locked block would make the task appear scheduled in two
  // Spaces and would reserve time that no longer belongs to the task.
  const movedFromAnotherSpace = existingFuture.filter((block) => block.calendar_id !== calendarId && !activeBlockIds.has(block.id));
  const targetFuture = existingFuture.filter((block) => block.calendar_id === calendarId);
  const protectedFuture = targetFuture.filter((block) => block.state === "locked" || new Date(block.start_at).getTime() < now);
  const existingFlexible = targetFuture.filter((block) => !protectedFuture.includes(block));
  const protectedFutureRanges = new Set(protectedFuture.map((block) => scheduleRangeKey(block.start_at, block.end_at)));
  const desiredRangeKeys = new Set<string>();
  const desiredFlexible = isDone || !task.autoSchedule || task.duration === null
    ? []
    : plan.blocks
      .filter((block) => new Date(block.end).getTime() > now)
      // The planner returns protected locked blocks together with new work.
      // Only create/update flexible work here; otherwise a locked block left
      // in an old Space during a task move could be copied into the new Space.
      .filter((block) => !block.state || block.state === "flexible")
      .filter((block) => {
        const key = scheduleRangeKey(block.start, block.end);
        if (protectedFutureRanges.has(key)) {
          return false;
        }
        if (desiredRangeKeys.has(key)) {
          return false;
        }
        desiredRangeKeys.add(key);
        return true;
      });
  const allocatedBlockIds = new Set(blocks.map((block) => block.id));
  let created = 0;
  let moved = 0;
  let deleted = 0;

  // Match by the actual time range before falling back to position. This is
  // the idempotency guard: a replan must reuse an already-created block even
  // if an earlier run inserted it with a different string representation of
  // the same timestamp.
  const availableFlexible = [...existingFlexible];
  const assignments = desiredFlexible.map((desired) => {
    const exactIndex = availableFlexible.findIndex((block) => (
      scheduleRangeKey(block.start_at, block.end_at) === scheduleRangeKey(desired.start, desired.end)
    ));
    const index = exactIndex >= 0 ? exactIndex : (availableFlexible.length > 0 ? 0 : -1);
    if (index < 0) {
      return undefined;
    }
    return availableFlexible.splice(index, 1)[0];
  });

  if (isDone) {
    for (const block of existingFuture) {
      await removeBlockEvent(client, connection, accessToken, block);
      deleted += 1;
    }
  } else {
    for (const movedBlock of movedFromAnotherSpace) {
      await removeBlockEvent(client, connection, accessToken, movedBlock);
      deleted += 1;
    }
    for (const staleBlock of availableFlexible) {
      await removeBlockEvent(client, connection, accessToken, staleBlock);
      deleted += 1;
    }

    for (let index = 0; index < desiredFlexible.length; index += 1) {
      const desired = desiredFlexible[index];
      const existing = assignments[index];
      const blockId = existing?.id ?? availablePlannedBlockId(connection.user_id, task.id, desired.start, desired.end, allocatedBlockIds);
      const eventId = existing?.provider_event_id ?? providerEventId(connection.user_id, task.id, blockId);
      const resource = eventResource({
        task,
        blockId,
        providerEventId: eventId,
        start: desired.start,
        end: desired.end,
        preferences,
      });

      if (!existing || !existing.provider_event_id) {
        let event;
        try {
          event = await insertGoogleEvent({
            accessToken,
            calendarId,
            resource,
          });
        } catch (error) {
          if (!(error instanceof GoogleApiError) || error.status !== 409) {
            throw error;
          }
          event = await getGoogleEvent({
            accessToken,
            calendarId,
            eventId: eventId,
          });
        }
        const { error: insertError } = await client.from("task_schedule_blocks").upsert({
          id: blockId,
          user_id: connection.user_id,
          task_id: task.id,
          calendar_id: calendarId,
          space_id: spaceId,
          provider_event_id: event.id,
          provider_event_key: getGoogleEventKey(event),
          start_at: desired.start,
          end_at: desired.end,
          planned_start_at: desired.start,
          planned_end_at: desired.end,
          state: "flexible",
          etag: event.etag ?? null,
          sync_version: 1,
          last_error: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,id" });
        if (insertError) {
          // Two workers can finish their Google insert at nearly the same
          // time. If another active block won the same task/time range, keep
          // that canonical row and remove only the provider event created by
          // this losing attempt.
          if ((insertError as { code?: string }).code === "23505") {
            const { data: conflictingBlocks, error: conflictLoadError } = await client
              .from("task_schedule_blocks")
              .select("id,provider_event_id,start_at,end_at,state")
              .eq("user_id", connection.user_id)
              .eq("task_id", task.id)
              .in("state", ["flexible", "locked"]);
            if (conflictLoadError) {
              throw conflictLoadError;
            }
            const conflictingBlock = (conflictingBlocks ?? []).find((candidate) => (
              scheduleRangeKey(candidate.start_at, candidate.end_at) === scheduleRangeKey(desired.start, desired.end)
            ));
            if (conflictingBlock) {
              if (conflictingBlock.provider_event_id !== event.id) {
                await safeDeleteGoogleEvent({
                  accessToken,
                  calendarId,
                  eventId: event.id,
                });
                await recordGoogleEventDeletion(client, connection.user_id, getGoogleEventKey(event), event.id, calendarId);
              }
              allocatedBlockIds.add(conflictingBlock.id);
              continue;
            }
          }
          throw insertError;
        }
        allocatedBlockIds.add(blockId);
        await upsertGoogleCalendarEvent(client, connection.user_id, event, { calendarId, spaceId });
        created += 1;
        continue;
      }

      const cachedEvent = events.find((event) => event.calendar_id === calendarId && event.provider_event_id === existing.provider_event_id);
      const desiredVisibility = task.calendarVisibility ?? preferences.defaultCalendarVisibility;
      const desiredTransparency = task.calendarTransparency ?? preferences.defaultCalendarTransparency;
      const detailsChanged = !cachedEvent
        || cachedEvent.summary !== task.title
        || (desiredVisibility === "default"
          ? cachedEvent.visibility !== null && cachedEvent.visibility !== "default"
          : cachedEvent.visibility !== desiredVisibility)
        || (desiredTransparency === "default"
          ? cachedEvent.transparency !== null && cachedEvent.transparency !== "opaque"
          : cachedEvent.transparency !== desiredTransparency);
      const changed = existing.start_at !== desired.start || existing.end_at !== desired.end;
      if (changed || detailsChanged || existing.etag === null) {
        const event = await patchGoogleEvent({
          accessToken,
          calendarId,
          eventId: existing.provider_event_id,
          etag: existing.etag,
          resource,
        });
        await updateBlock(client, connection.user_id, existing.id, {
          calendar_id: calendarId,
          space_id: spaceId,
          provider_event_id: event.id,
          provider_event_key: getGoogleEventKey(event),
          start_at: desired.start,
          end_at: desired.end,
          planned_start_at: desired.start,
          planned_end_at: desired.end,
          state: "flexible",
          etag: event.etag ?? null,
          sync_version: existing.sync_version + 1,
          last_error: null,
        });
        if (changed) moved += 1;
        await upsertGoogleCalendarEvent(client, connection.user_id, event, { calendarId, spaceId });
      } else {
        await updateBlock(client, connection.user_id, existing.id, {
          planned_start_at: desired.start,
          planned_end_at: desired.end,
          last_error: null,
        });
      }
    }
  }

  await setTaskStatus(client, connection.user_id, task.id, {
    state: isDone ? "paused" : plan.state,
    scheduled_minutes: plan.scheduledMinutes,
    missing_minutes: plan.missingMinutes,
    warning: plan.warning,
    worked_minutes: workedMinutes,
    remaining_minutes: remainingMinutes,
    active_session_id: activeSessionId,
    missed_minutes: missedMinutes,
  });

  return { created, moved, deleted, warning: plan.warning };
}

export class SchedulerBusyError extends Error {
  constructor() {
    super("The scheduler is already running for this workspace.");
    this.name = "SchedulerBusyError";
  }
}

async function refreshSchedulerLock(client: SchedulerAdminClient, userId: string, lockToken: string) {
  const { data, error } = await client.rpc("refresh_scheduler_lock", {
    p_user_id: userId,
    p_lock_token: lockToken,
  });
  if (error) {
    throw error;
  }
  if (!data) {
    throw new SchedulerBusyError();
  }
}

async function runSchedulerForUserWithClient(
  client: SchedulerAdminClient,
  userId: string,
  request: Request | undefined,
  lockToken: string,
  options: { forceReplan?: boolean } = {},
) {
  await refreshSchedulerLock(client, userId, lockToken);
  const connection = await loadGoogleConnection(client, userId);
  const spaces = connection ? await loadSpaces(client, userId) : [];
  if (!connection || spaces.length === 0) {
    await pauseSchedulerForUser(userId);
    return { userId, created: 0, moved: 0, deleted: 0, locked: 0, warnings: [!connection ? "Connect a Google Calendar to schedule tasks." : "Add a Google Calendar Space to schedule tasks."] } satisfies SchedulerSummary;
  }

  const syncClient = client as GoogleDbClient;
  const initialSync = await syncAllGoogleCalendars(syncClient, connection, request, { skipSchedulerQueue: true });
  if (initialSync.errors.length > 0) {
    throw new Error(`Some Spaces could not be refreshed: ${initialSync.errors.join(" ")}`);
  }
  const now = Date.now();
  const accessToken = await getUsableGoogleAccessToken(client, connection);
  const repairResult = await processTimerCalendarRepairs({
    client,
    userId,
    accessToken,
    connection,
    now,
  });
  // Clean up provider deletions before loading the global plan. Blocks in
  // every Space remain valid; adding a calendar must never cancel another
  // Space's work.
  const cleanupResult = await processTaskCleanup(client, userId, accessToken);
  if (cleanupResult.failures > 0 || cleanupResult.pendingCount > 0) {
    const pendingWarning = cleanupResult.pendingCount > 0
      ? ` ${cleanupResult.pendingCount} calendar cleanup item${cleanupResult.pendingCount === 1 ? " is" : "s are"} still waiting.`
      : "";
    throw new Error(`Scheduling is paused until previous calendar changes are cleaned up.${pendingWarning}`);
  }
  const fallbackTimezone = spaces[0]?.timeZone ?? connection.selected_calendar_timezone ?? "UTC";
  let data = await loadSchedulerData(client, userId, connection, fallbackTimezone);
  const activeSessionWarnings = await pauseActiveSessionsForExternalChanges(
    client,
    userId,
    data.blocks,
    data.events,
    accessToken,
    now,
  );
  if (activeSessionWarnings.length > 0) {
    data = await loadSchedulerData(client, userId, connection, fallbackTimezone);
  }
  const reconciliation = await reconcileManagedEvents(
    client,
    connection,
    data.tasks,
    data.blocks,
    data.events,
    accessToken,
    now,
  );
  if (reconciliation.failures > 0) {
    throw new Error(`Scheduling is paused until duplicate or missing HeavyUser calendar events are repaired. ${reconciliation.warnings.join(" ")}`);
  }
  if (reconciliation.deleted > 0) {
    data = await loadSchedulerData(client, userId, connection, fallbackTimezone);
  }
  const missedBlocks = await markPastBlocksMissed(client, userId, data.blocks, data.events, accessToken, now);
  if (missedBlocks.length > 0) {
    data = await loadSchedulerData(client, userId, connection, fallbackTimezone);
  }
  const blocks = data.blocks;
  const locked = await markExternalChanges(client, blocks, data.events, now, accessToken);
  if (options.forceReplan) {
    // A priority change is an explicit request to rebuild future work. It may
    // move blocks that were previously locked, but never touches past blocks.
    await unlockFutureBlocksForPriorityReplan(client, userId, now);
    data = await loadSchedulerData(client, userId, connection, fallbackTimezone);
  }
  const refreshedBlocksResult = await client.from("task_schedule_blocks").select("*").eq("user_id", userId);
  if (refreshedBlocksResult.error) throw refreshedBlocksResult.error;
  const refreshedBlocks = refreshedBlocksResult.data ?? [];
  const refreshedEventsResult = await client.from("google_calendar_events").select("*").eq("user_id", userId);
  if (refreshedEventsResult.error) throw refreshedEventsResult.error;
  const workSessions = await loadWorkSessionRows(client, userId);
  const workedSecondsByTask = new Map<string, number>();
  const workedMinutesByTask = new Map<string, number>();
  const activeBlockIds = new Set<string>();
  const activeSessionIdsByTask = new Map<string, string>();
  for (const session of workSessions) {
    const workedSeconds = getRowWorkedSeconds(session, now);
    workedSecondsByTask.set(session.task_id, (workedSecondsByTask.get(session.task_id) ?? 0) + workedSeconds);
    if (session.state === "running") {
      if (session.block_id) activeBlockIds.add(session.block_id);
      activeSessionIdsByTask.set(session.task_id, session.id);
    }
  }
  for (const [taskId, workedSeconds] of workedSecondsByTask) {
    workedMinutesByTask.set(taskId, Math.floor(workedSeconds / 60));
  }
  const missedMinutesByTask = new Map<string, number>();
  for (const block of refreshedBlocks) {
    if (block.state === "missed") {
      missedMinutesByTask.set(block.task_id, (missedMinutesByTask.get(block.task_id) ?? 0) + Math.max(0, Math.round((new Date(block.end_at).getTime() - new Date(block.start_at).getTime()) / 60_000)));
    }
  }
  const spacesById = new Map(spaces.map((space) => [space.id, space]));
  const spacesByCalendarId = new Map(spaces.map((space) => [space.calendarId, space]));
  const blockProviderIds = new Set(refreshedBlocks
    .filter((block) => Boolean(block.provider_event_id))
    .map((block) => `${block.calendar_id}:${block.provider_event_id}`));
  const busyIntervals = getBusyIntervalsFromCalendarEvents((refreshedEventsResult.data ?? [])
    .filter((event) => !isManagedEvent(event as CalendarEventRow, blockProviderIds))
    .map((event) => ({
      status: event.status,
      transparency: event.transparency,
      startAt: event.start_at,
      endAt: event.end_at,
      startDate: event.start_date,
      endDate: event.end_date,
      timeZone: event.time_zone ?? spacesByCalendarId.get(event.calendar_id)?.timeZone ?? data.preferences.timezone,
    })), data.preferences.timezone);
  const schedulableTasks = data.tasks.filter((task) => task.spaceId && spacesById.get(task.spaceId)?.status === "active");
  const schedulableTaskIds = new Set(schedulableTasks.map((task) => task.id));
  const reservedUnschedulableBlocks = refreshedBlocks
    .filter((block) => (
      block.state !== "replaced"
      && block.state !== "cancelled"
      && !schedulableTaskIds.has(block.task_id)
      && new Date(block.end_at).getTime() > now
    ))
    .map((block) => ({ start: block.start_at, end: block.end_at, source: "locked" as const }));
  const planningBlocksWithActiveTime = refreshedBlocks.map((block) => {
    if (!activeBlockIds.has(block.id)) return block;
    const activeEnd = new Date(Math.max(new Date(block.end_at).getTime(), now)).toISOString();
    return { ...block, end_at: activeEnd, planned_end_at: activeEnd };
  });
  const activeSessionIntervals = workSessions
    .filter((session) => session.state === "running" && session.calendar_id)
    .map((session) => ({
      start: session.started_at,
      end: new Date(Math.max(new Date(session.started_at).getTime() + 1000, now)).toISOString(),
      source: "locked" as const,
    }));
  const planningBlocks = planningBlocksWithActiveTime.filter((block) => {
    const task = schedulableTasks.find((candidate) => candidate.id === block.task_id);
    if (!task) return false;
    const targetSpace = spacesById.get(task.spaceId ?? "");
    // Calendar identity is the authoritative placement for an existing
    // provider block. The Space column can be null on older rows, but a block
    // in the task's target calendar must still remain protected.
    return block.calendar_id === targetSpace?.calendarId || activeBlockIds.has(block.id);
  });
  const plan = planSchedule({
    tasks: schedulableTasks,
    existingBlocks: planningBlocks.map(toScheduledBlock),
    busyIntervals: [...busyIntervals, ...reservedUnschedulableBlocks, ...activeSessionIntervals],
    preferences: data.preferences,
    now,
    workedMinutesByTask,
    activeBlockIds,
  });
  await Promise.all(data.tasks.filter((task) => !task.spaceId || spacesById.get(task.spaceId)?.status !== "active").map((task) => setTaskStatus(client, userId, task.id, {
    state: task.duration === null ? "needs_duration" : "paused",
    scheduled_minutes: 0,
    missing_minutes: task.duration ?? 0,
    warning: "Choose an active Space for this task before scheduling it.",
    worked_minutes: workedMinutesByTask.get(task.id) ?? 0,
    remaining_minutes: task.duration === null ? 0 : Math.max(0, task.duration - (workedMinutesByTask.get(task.id) ?? 0)),
    active_session_id: activeSessionIdsByTask.get(task.id) ?? null,
    missed_minutes: missedMinutesByTask.get(task.id) ?? 0,
  })));
  await Promise.all(plan.tasks.map((taskPlan) => setTaskStatus(client, userId, taskPlan.taskId, {
    state: "scheduling",
    scheduled_minutes: taskPlan.scheduledMinutes,
    missing_minutes: taskPlan.missingMinutes,
    warning: taskPlan.warning,
    worked_minutes: workedMinutesByTask.get(taskPlan.taskId) ?? 0,
    remaining_minutes: (() => {
      const task = data.tasks.find((candidate) => candidate.id === taskPlan.taskId);
      return task?.duration === null || !task ? 0 : Math.max(0, task.duration - (workedMinutesByTask.get(taskPlan.taskId) ?? 0));
    })(),
    active_session_id: activeSessionIdsByTask.get(taskPlan.taskId) ?? null,
    missed_minutes: missedMinutesByTask.get(taskPlan.taskId) ?? 0,
  })));
  let created = 0;
  let moved = 0;
  let deleted = 0;
  let hasCalendarErrors = false;
  const warnings: string[] = [...repairResult.warnings, ...reconciliation.warnings, ...activeSessionWarnings];
  for (const task of schedulableTasks) {
    await refreshSchedulerLock(client, userId, lockToken);
    const taskPlan = plan.tasks.find((candidate) => candidate.taskId === task.id);
    if (!taskPlan) continue;
    try {
      const result = await applyTaskPlan({
        client,
        connection,
        accessToken,
        task,
        plan: taskPlan,
        blocks: planningBlocksWithActiveTime,
        events: (refreshedEventsResult.data ?? []) as CalendarEventRow[],
        preferences: data.preferences,
        calendarId: spacesById.get(task.spaceId!)!.calendarId,
        spaceId: task.spaceId!,
        now,
        workedMinutes: workedMinutesByTask.get(task.id) ?? 0,
        remainingMinutes: task.duration === null ? 0 : Math.max(0, task.duration - (workedMinutesByTask.get(task.id) ?? 0)),
        activeSessionId: activeSessionIdsByTask.get(task.id) ?? null,
        missedMinutes: missedMinutesByTask.get(task.id) ?? 0,
      });
      created += result.created;
      moved += result.moved;
      deleted += result.deleted;
      if (result.warning) warnings.push(`${task.title}: ${result.warning}`);
    } catch (error) {
      hasCalendarErrors = true;
      const message = googleErrorMessage(error);
      await setTaskStatus(client, userId, task.id, {
        state: "calendar_error",
        scheduled_minutes: taskPlan.scheduledMinutes,
        missing_minutes: taskPlan.missingMinutes,
        warning: message,
        worked_minutes: workedMinutesByTask.get(task.id) ?? 0,
        remaining_minutes: task.duration === null ? 0 : Math.max(0, task.duration - (workedMinutesByTask.get(task.id) ?? 0)),
        active_session_id: activeSessionIdsByTask.get(task.id) ?? null,
        missed_minutes: missedMinutesByTask.get(task.id) ?? 0,
      });
      warnings.push(`${task.title}: ${message}`);
    }
  }

  const finalSync = await syncAllGoogleCalendars(syncClient, connection, request, { skipSchedulerQueue: true });
  if (finalSync.errors.length > 0) {
    hasCalendarErrors = true;
    warnings.push(`Some Spaces could not be refreshed: ${finalSync.errors.join(" ")}`);
  }
  if (hasCalendarErrors) {
    throw new Error(warnings.join(" ") || "Google Calendar changes will be retried.");
  }
  return { userId, created, moved, deleted, locked, warnings } satisfies SchedulerSummary;
}

export async function runSchedulerForUser(userId: string, request?: Request) {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error("The scheduler is not configured on this deployment.");
  }

  const lockToken = randomUUID();
  const { data: claimed, error: claimError } = await client.rpc("try_claim_scheduler_lock", {
    p_user_id: userId,
    p_lock_token: lockToken,
  });
  if (claimError) {
    throw claimError;
  }
  if (!claimed) {
    throw new SchedulerBusyError();
  }

  try {
    const { data: queuedJob, error: queueReadError } = await client
      .from("scheduler_queue")
      .select("requested_at,force_replan")
      .eq("user_id", userId)
      .maybeSingle();
    if (queueReadError) {
      throw queueReadError;
    }

    const result = await runSchedulerForUserWithClient(client, userId, request, lockToken, {
      forceReplan: queuedJob?.force_replan === true,
    });
    if (queuedJob?.requested_at) {
      // Immediate runs also satisfy the queued repair request. Keep a newer
      // request if another change arrived while this run was in flight.
      const { error: queueDeleteError } = await client
        .from("scheduler_queue")
        .delete()
        .eq("user_id", userId)
        .eq("requested_at", queuedJob.requested_at);
      if (queueDeleteError) {
        throw queueDeleteError;
      }
    }
    return result;
  } catch (error) {
    if (!(error instanceof SchedulerBusyError)) {
      const message = googleErrorMessage(error);
      try {
        await markCalendarErrorForUser(client, userId, message);
      } finally {
        // Keep a durable repair request even when an immediate run was
        // started outside the queue (for example after calendar selection).
        await queueSchedulerJob(client, userId, "scheduler_retry");
      }
    }
    throw error;
  } finally {
    const { error: releaseError } = await client.rpc("release_scheduler_lock", {
      p_user_id: userId,
      p_lock_token: lockToken,
    });
    if (releaseError) {
      throw releaseError;
    }
  }
}

export async function runSchedulerForUserWithRetry(userId: string, request?: Request) {
  const retryUntil = Date.now() + BUSY_RETRY_TIMEOUT_MS;
  while (true) {
    try {
      return await runSchedulerForUser(userId, request);
    } catch (error) {
      if (!(error instanceof SchedulerBusyError) || Date.now() >= retryUntil) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, BUSY_RETRY_DELAY_MS));
    }
  }
}

export async function loadTaskScheduleStatus(userId: string) {
  const client = getSupabaseAdminClient();
  if (!client) {
    return [] as ReadonlyArray<StatusRow>;
  }
  const { data, error } = await client.from("task_schedule_status").select("*").eq("user_id", userId);
  if (error) throw error;
  return data ?? [];
}

export async function loadTaskScheduleSnapshot(userId: string): Promise<TaskScheduleSnapshot> {
  const client = getSupabaseAdminClient();
  if (!client) {
    return { statuses: [], blocks: [], activeSession: null, sessionsByTask: {}, missedBlocks: [], alerts: [] };
  }

  const [statusesResult, blocksResult, timerSnapshot] = await Promise.all([
    client.from("task_schedule_status").select("*").eq("user_id", userId),
    client
      .from("task_schedule_blocks")
      .select("id,task_id,space_id,calendar_id,provider_event_id,start_at,end_at,planned_start_at,planned_end_at,state")
      .eq("user_id", userId)
      .not("state", "in", "(replaced,cancelled)")
      .not("provider_event_id", "is", null)
      .order("start_at", { ascending: true }),
    loadTimerSnapshot(client, userId),
  ]);
  if (statusesResult.error) throw statusesResult.error;
  if (blocksResult.error) throw blocksResult.error;

  const statuses: TaskScheduleStatus[] = (statusesResult.data ?? []).map((status) => ({
    taskId: status.task_id,
    state: status.state as TaskScheduleStatus["state"],
    scheduledMinutes: status.scheduled_minutes,
    missingMinutes: status.missing_minutes,
    workedMinutes: status.worked_minutes ?? 0,
    remainingMinutes: status.remaining_minutes ?? status.missing_minutes,
    missedMinutes: status.missed_minutes ?? 0,
    activeSessionId: status.active_session_id ?? null,
    warning: status.warning,
    updatedAt: status.updated_at,
  }));
  const blocks: ScheduleBlockSnapshot[] = (blocksResult.data ?? []).map((block) => ({
    id: block.id,
    taskId: block.task_id,
    calendarId: block.calendar_id,
    spaceId: block.space_id,
    providerEventId: block.provider_event_id,
    start: block.start_at,
    end: block.end_at,
    plannedStart: block.planned_start_at,
    plannedEnd: block.planned_end_at,
    state: block.state === "locked" || block.state === "replaced" || block.state === "cancelled" || block.state === "missed"
      ? block.state
      : "flexible",
  }));

  return {
    statuses,
    blocks,
    activeSession: timerSnapshot.activeSession,
    sessionsByTask: timerSnapshot.sessionsByTask,
    missedBlocks: timerSnapshot.missedBlocks,
    alerts: timerSnapshot.alerts,
  };
}

export async function pauseSchedulerForUser(userId: string, warning = "Connect a Google Calendar to schedule this task.") {
  const client = getSupabaseAdminClient();
  if (!client) {
    return;
  }
  const { data: tasks, error } = await client.from("tasks").select("id,duration").eq("user_id", userId);
  if (error) {
    throw error;
  }
  let sessions = await loadWorkSessionRows(client, userId);
  for (const session of sessions.filter((candidate) => candidate.state === "running")) {
    const started = new Date(session.started_at).getTime();
    const stoppedAt = Math.max(Date.now(), Number.isFinite(started) ? started + 1000 : Date.now());
    const warningText = "Google Calendar is disconnected, so the timer was paused and saved for review.";
    const { error: sessionError } = await client.from("task_work_sessions").update({
      state: "paused",
      worked_seconds: Number.isFinite(started) ? Math.max(0, Math.round((stoppedAt - started) / 1000)) : 0,
      calendar_sync_state: session.provider_event_id && session.calendar_id ? "pending" : "history_only",
      repair_needed: Boolean(session.provider_event_id && session.calendar_id),
      warning: warningText,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("id", session.id);
    if (sessionError) throw sessionError;
    const { error: ownerError } = await client.from("task_active_session_owners").delete().eq("user_id", userId).eq("session_id", session.id);
    if (ownerError) throw ownerError;
    if (session.provider_event_id && session.calendar_id) {
      const { error: repairError } = await client.from("task_calendar_repairs").insert({
        user_id: userId,
        session_id: session.id,
        block_id: session.block_id,
        calendar_id: session.calendar_id,
        provider_event_id: session.provider_event_id,
        operation: "patch",
        status: "pending",
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
        last_error: warningText,
        updated_at: new Date().toISOString(),
      });
      if (repairError) throw repairError;
    }
  }
  sessions = await loadWorkSessionRows(client, userId);
  const workedSecondsByTask = new Map<string, number>();
  const workedMinutesByTask = new Map<string, number>();
  for (const session of sessions) {
    workedSecondsByTask.set(session.task_id, (workedSecondsByTask.get(session.task_id) ?? 0) + getRowWorkedSeconds(session));
  }
  for (const [taskId, workedSeconds] of workedSecondsByTask) {
    workedMinutesByTask.set(taskId, Math.floor(workedSeconds / 60));
  }
  for (const task of tasks ?? []) {
    const workedMinutes = workedMinutesByTask.get(task.id) ?? 0;
    await setTaskStatus(client, userId, task.id, {
      state: task.duration === null ? "needs_duration" : "paused",
      scheduled_minutes: 0,
      missing_minutes: task.duration === null ? 0 : Math.max(0, task.duration - workedMinutes),
      warning,
      worked_minutes: workedMinutes,
      remaining_minutes: task.duration === null ? 0 : Math.max(0, task.duration - workedMinutes),
    });
  }
}

async function markCalendarErrorForUser(client: SchedulerAdminClient, userId: string, warning: string) {
  const [tasksResult, statusesResult] = await Promise.all([
    client.from("tasks").select("id,duration").eq("user_id", userId),
    client.from("task_schedule_status").select("task_id,state,scheduled_minutes,missing_minutes,missed_minutes,active_session_id").eq("user_id", userId),
  ]);
  if (tasksResult.error) throw tasksResult.error;
  if (statusesResult.error) throw statusesResult.error;
  const sessions = await loadWorkSessionRows(client, userId);
  const workedSecondsByTask = new Map<string, number>();
  const workedMinutesByTask = new Map<string, number>();
  const activeSessionIdsByTask = new Map<string, string>();
  for (const session of sessions) {
    workedSecondsByTask.set(session.task_id, (workedSecondsByTask.get(session.task_id) ?? 0) + getRowWorkedSeconds(session));
    if (session.state === "running") activeSessionIdsByTask.set(session.task_id, session.id);
  }
  for (const [taskId, workedSeconds] of workedSecondsByTask) {
    workedMinutesByTask.set(taskId, Math.floor(workedSeconds / 60));
  }

  const statuses = new Map((statusesResult.data ?? []).map((status) => [status.task_id, status]));
  for (const task of tasksResult.data ?? []) {
    const current = statuses.get(task.id);
    if (current && ["scheduled", "locked", "awaiting_completion", "paused", "needs_duration"].includes(current.state)) {
      // A later sync failure must not turn blocks that were already saved into
      // a false error state. The queue still carries the repair request.
      continue;
    }

    const scheduledMinutes = current?.scheduled_minutes ?? 0;
    const workedMinutes = workedMinutesByTask.get(task.id) ?? 0;
    await setTaskStatus(client, userId, task.id, {
      state: "calendar_error",
      scheduled_minutes: scheduledMinutes,
      missing_minutes: Math.max(0, (task.duration ?? 0) - scheduledMinutes),
      warning,
      worked_minutes: workedMinutes,
      remaining_minutes: Math.max(0, (task.duration ?? 0) - workedMinutes),
      active_session_id: activeSessionIdsByTask.get(task.id) ?? current?.active_session_id ?? null,
      missed_minutes: current?.missed_minutes ?? 0,
    });
  }
}

export async function processSchedulerQueue(limit = 10, request?: Request) {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new Error("The scheduler is not configured on this deployment.");
  }

  const now = new Date();
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 10);
  const startedAt = Date.now();
  const { data: queue, error } = await client
    .from("scheduler_queue")
    .select("*")
    .lte("run_after", now.toISOString())
    .lt("attempts", 20)
    .or(`locked_at.is.null,locked_at.lt.${new Date(Date.now() - 10 * 60_000).toISOString()}`)
    .order("requested_at", { ascending: true })
    .limit(boundedLimit);
  if (error) throw error;

  const results: SchedulerSummary[] = [];
  for (const job of queue ?? []) {
    if (Date.now() - startedAt >= MAX_QUEUE_RUNTIME_MS) {
      break;
    }
    const lockedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await client
      .from("scheduler_queue")
      .update({ locked_at: lockedAt, attempts: Math.min(job.attempts + 1, 20), updated_at: lockedAt })
      .eq("user_id", job.user_id)
      .or(`locked_at.is.null,locked_at.lt.${new Date(Date.now() - 10 * 60_000).toISOString()}`)
      .select("user_id")
      .maybeSingle();
    if (claimError) {
      throw claimError;
    }
    if (!claimed) continue;

    try {
      const result = await runSchedulerForUser(job.user_id, request);
      // A task/settings/calendar change can enqueue a newer request while this
      // run is in flight. Only remove the row we actually claimed; otherwise
      // the newer request would be lost.
      const { error: queueDeleteError } = await client
        .from("scheduler_queue")
        .delete()
        .eq("user_id", job.user_id)
        .eq("requested_at", job.requested_at);
      if (queueDeleteError) {
        throw queueDeleteError;
      }
      results.push(result);
    } catch (queueError) {
      const nextAttempt = Math.min(job.attempts + 1, 20);
      const attemptIndex = Math.min(job.attempts, RETRY_MINUTES.length - 1);
      const delay = nextAttempt >= 20 ? 24 * 60 : RETRY_MINUTES[attemptIndex];
      const nextRun = new Date(Date.now() + delay * 60_000).toISOString();
      const { error: retryUpdateError } = await client.from("scheduler_queue").update({
        attempts: nextAttempt,
        run_after: nextRun,
        locked_at: null,
        last_error: googleErrorMessage(queueError),
        updated_at: new Date().toISOString(),
      }).eq("user_id", job.user_id).eq("requested_at", job.requested_at);
      if (retryUpdateError) {
        throw retryUpdateError;
      }
    }
  }

  return results;
}
