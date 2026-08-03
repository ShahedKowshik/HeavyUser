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
import { getGoogleEventKey, recordGoogleEventDeletion, syncGoogleCalendar, upsertGoogleCalendarEvent } from "@/lib/google/sync";
import { queueSchedulerJob } from "@/lib/scheduler/queue";
import type { Database } from "@/lib/supabase/database.types";
import { normalizeUserSettings } from "@/lib/supabase/settings";
import type { CalendarTransparency, CalendarVisibility } from "@/lib/tasks";
import { normalizeSchedulerPreferences } from "@/lib/scheduler/preferences";
import { planSchedule } from "@/lib/scheduler/planner";
import { getManagedEventProperties, selectManagedEventCleanup } from "@/lib/scheduler/reconcile";
import type {
  BusyInterval,
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
    start: row.start_at,
    end: row.end_at,
    plannedStart: row.planned_start_at,
    plannedEnd: row.planned_end_at,
    state: row.state === "locked" || row.state === "replaced" || row.state === "cancelled" ? row.state : "flexible",
    providerEventId: row.provider_event_id,
    etag: row.etag,
    syncVersion: row.sync_version,
  };
}

function getLocalDateParts(timestamp: number, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function getLocalMidnight(date: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  let timestamp = Date.UTC(year, month - 1, day);
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const parts = getLocalDateParts(timestamp, timezone);
    const localAsUtc = Date.UTC(Number(parts.date.slice(0, 4)), Number(parts.date.slice(5, 7)) - 1, Number(parts.date.slice(8, 10)), parts.hour, parts.minute);
    const targetAsUtc = Date.UTC(year, month - 1, day);
    timestamp += targetAsUtc - localAsUtc;
  }
  return timestamp;
}

function getEventInterval(event: CalendarEventRow, timezone: string): BusyInterval | null {
  if (event.transparency === "transparent") {
    return null;
  }

  if (event.start_at && event.end_at) {
    return { start: event.start_at, end: event.end_at, source: "calendar" };
  }

  if (event.start_date && event.end_date) {
    const start = getLocalMidnight(event.start_date, timezone);
    const end = getLocalMidnight(event.end_date, timezone);
    return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), source: "calendar" };
  }

  return null;
}

function isManagedEvent(event: CalendarEventRow, blockProviderIds: ReadonlySet<string>) {
  const privateProperties = event.private_properties;
  if (privateProperties && typeof privateProperties === "object" && !Array.isArray(privateProperties)) {
    const value = privateProperties as Record<string, unknown>;
    if (value.heavyuser === "task-block" || typeof value.heavyuserTaskId === "string") {
      return true;
    }
  }

  return blockProviderIds.has(event.provider_event_id);
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
    .filter((block) => block.task_id === taskId && block.state !== "replaced" && block.state !== "cancelled")
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
  calendarId: string,
  now: number,
) {
  const { data, error } = await client
    .from("task_schedule_blocks")
    .select("id,sync_version")
    .eq("user_id", userId)
    .eq("calendar_id", calendarId)
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
      await upsertGoogleCalendarEvent(input.client, input.block.user_id, providerEvent);
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
  calendarId: string,
) {
  const eventsByProviderId = new Map(events.map((event) => [event.provider_event_id, event]));
  let locked = 0;
  for (const block of blocks) {
    if (block.state === "replaced" || block.state === "cancelled" || !block.provider_event_id) {
      continue;
    }

    const event = eventsByProviderId.get(block.provider_event_id);
    if (!event) {
      const deleted = await verifyMissingManagedEvent({ client, block, accessToken, calendarId });
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

async function loadSchedulerData(client: SchedulerAdminClient, userId: string, connection: GoogleConnection) {
  const [tasksResult, blocksResult, eventsResult] = await Promise.all([
    client.from("tasks").select("*").eq("user_id", userId).order("position", { ascending: true }),
    client.from("task_schedule_blocks").select("*").eq("user_id", userId),
    client.from("google_calendar_events").select("*").eq("user_id", userId),
  ]);
  if (tasksResult.error) throw tasksResult.error;
  if (blocksResult.error) throw blocksResult.error;
  if (eventsResult.error) throw eventsResult.error;

  const blocks = blocksResult.data ?? [];
  const blockProviderIds = new Set(blocks.map((block) => block.provider_event_id).filter((value): value is string => Boolean(value)));
  const events = (eventsResult.data ?? []) as CalendarEventRow[];
  const preferences = await loadPreferences(client, userId, connection.selected_calendar_timezone ?? "UTC");
  const busyIntervals = events
    .filter((event) => event.status !== "cancelled")
    .filter((event) => !isManagedEvent(event, blockProviderIds))
    .map((event) => getEventInterval(event, preferences.timezone))
    .filter((interval): interval is BusyInterval => interval !== null);

  return {
    tasks: (tasksResult.data ?? []).map(normalizeTask),
    blocks,
    events,
    preferences,
    busyIntervals,
  };
}

async function reconcileManagedEvents(
  client: SchedulerAdminClient,
  connection: GoogleConnection,
  tasks: ReadonlyArray<SchedulerTask>,
  blocks: ReadonlyArray<BlockRow>,
  events: ReadonlyArray<CalendarEventRow>,
  accessToken: string,
) {
  const activeTaskIds = new Set(tasks.map((task) => task.id));
  const cleanup = selectManagedEventCleanup(
    events.map((event) => ({
      eventKey: event.event_key,
      providerEventId: event.provider_event_id,
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
      startAt: block.start_at,
      endAt: block.end_at,
      state: block.state,
      providerEventId: block.provider_event_id,
    })),
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
  const cleanupEvents = events.filter((event) => cleanup.eventKeys.has(event.event_key));
  const cleanupConcurrency = 8;
  for (let index = 0; index < cleanupEvents.length; index += cleanupConcurrency) {
    await Promise.all(cleanupEvents.slice(index, index + cleanupConcurrency).map(async (event) => {
      try {
        await safeDeleteGoogleEvent({
          accessToken,
          calendarId: connection.selected_calendar_id!,
          eventId: event.provider_event_id,
        });
        await recordGoogleEventDeletion(client, connection.user_id, event.event_key, event.provider_event_id);
        const { error: cacheDeleteError } = await client
          .from("google_calendar_events")
          .delete()
          .eq("user_id", connection.user_id)
          .eq("event_key", event.event_key);
        if (cacheDeleteError) {
          throw cacheDeleteError;
        }

        const properties = getManagedEventProperties(event.private_properties);
        const block = blocksById.get(properties.blockId ?? "")
          ?? blocks.find((candidate) => candidate.provider_event_id === event.provider_event_id);
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

async function setTaskStatus(client: SchedulerAdminClient, userId: string, taskId: string, status: Omit<StatusRow, "user_id" | "task_id" | "updated_at">) {
  const { error } = await client.from("task_schedule_status").upsert({
    user_id: userId,
    task_id: taskId,
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
) {
  await recordGoogleEventDeletion(client, userId, eventKey, providerEventId);
  const { error } = await client
    .from("google_calendar_events")
    .delete()
    .eq("user_id", userId)
    .eq("provider_event_id", providerEventId);
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
    await rememberAndDeleteCachedProviderEvent(client, block.user_id, block.provider_event_id, block.provider_event_key ?? undefined);
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
      await rememberAndDeleteCachedProviderEvent(client, userId, cleanup.provider_event_id);
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
  return failures;
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

async function removeBlocksFromPreviousCalendars(
  client: SchedulerAdminClient,
  userId: string,
  selectedCalendarId: string,
  accessToken: string,
  now: number,
) {
  const { data, error } = await client
    .from("task_schedule_blocks")
    .select("*")
    .eq("user_id", userId)
    .neq("calendar_id", selectedCalendarId)
    .in("state", ["flexible", "locked"]);
  if (error) {
    throw error;
  }

  let failures = 0;
  for (const block of data ?? []) {
    if (new Date(block.end_at).getTime() <= now) {
      continue;
    }
    try {
      if (block.provider_event_id) {
        await safeDeleteGoogleEvent({ accessToken, calendarId: block.calendar_id, eventId: block.provider_event_id });
        await rememberAndDeleteCachedProviderEvent(client, userId, block.provider_event_id, block.provider_event_key ?? undefined);
      }
      await updateBlock(client, userId, block.id, { state: "cancelled", sync_version: block.sync_version + 1, last_error: null });
    } catch (cleanupError) {
      failures += 1;
      const message = googleErrorMessage(cleanupError);
      await updateBlock(client, userId, block.id, { state: "cancelled", sync_version: block.sync_version + 1, last_error: message });
      await queueBlockCleanup(client, block, message);
    }
  }
  return failures;
}

/** Best-effort cleanup used immediately before a user disconnects Calendar. */
export async function removeManagedBlocksForConnection(connection: GoogleConnection) {
  const client = getSupabaseAdminClient();
  if (!client || !connection.selected_calendar_id) {
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
  now: number;
}) {
  const { client, connection, accessToken, task, plan, blocks, events, preferences, now } = input;
  const isDone = task.status === "done";
  const existingFuture = getFutureBlocks(blocks, task.id, now, true);
  const protectedFuture = existingFuture.filter((block) => block.state === "locked" || new Date(block.start_at).getTime() < now);
  const existingFlexible = existingFuture.filter((block) => !protectedFuture.includes(block));
  const protectedFutureRanges = new Set(protectedFuture.map((block) => scheduleRangeKey(block.start_at, block.end_at)));
  const desiredRangeKeys = new Set<string>();
  const desiredFlexible = isDone || !task.autoSchedule || task.duration === null
    ? []
    : plan.blocks
      .filter((block) => new Date(block.end).getTime() > now)
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
            calendarId: connection.selected_calendar_id!,
            resource,
          });
        } catch (error) {
          if (!(error instanceof GoogleApiError) || error.status !== 409) {
            throw error;
          }
          event = await getGoogleEvent({
            accessToken,
            calendarId: connection.selected_calendar_id!,
            eventId: eventId,
          });
        }
        const { error: insertError } = await client.from("task_schedule_blocks").upsert({
          id: blockId,
          user_id: connection.user_id,
          task_id: task.id,
          calendar_id: connection.selected_calendar_id!,
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
                  calendarId: connection.selected_calendar_id!,
                  eventId: event.id,
                });
                await recordGoogleEventDeletion(client, connection.user_id, getGoogleEventKey(event), event.id);
              }
              allocatedBlockIds.add(conflictingBlock.id);
              continue;
            }
          }
          throw insertError;
        }
        allocatedBlockIds.add(blockId);
        await upsertGoogleCalendarEvent(client, connection.user_id, event);
        created += 1;
        continue;
      }

      const cachedEvent = events.find((event) => event.provider_event_id === existing.provider_event_id);
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
          calendarId: connection.selected_calendar_id!,
          eventId: existing.provider_event_id,
          etag: existing.etag,
          resource,
        });
        await updateBlock(client, connection.user_id, existing.id, {
          calendar_id: connection.selected_calendar_id!,
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
        await upsertGoogleCalendarEvent(client, connection.user_id, event);
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
  if (!connection?.selected_calendar_id) {
    await pauseSchedulerForUser(userId);
    return { userId, created: 0, moved: 0, deleted: 0, locked: 0, warnings: ["Connect a Google Calendar to schedule tasks."] } satisfies SchedulerSummary;
  }

  const syncClient = client as GoogleDbClient;
  await syncGoogleCalendar(syncClient, connection, request, { skipSchedulerQueue: true });
  const now = Date.now();
  const accessToken = await getUsableGoogleAccessToken(client, connection);
  // Clean up deletion and calendar-switch work before loading the plan. This
  // prevents a stale block row from being reused on the newly selected
  // calendar during the same scheduler run.
  const cleanupFailures = (await processTaskCleanup(client, userId, accessToken))
    + (await removeBlocksFromPreviousCalendars(client, userId, connection.selected_calendar_id, accessToken, now));
  let data = await loadSchedulerData(client, userId, connection);
  const reconciliation = await reconcileManagedEvents(
    client,
    connection,
    data.tasks,
    data.blocks,
    data.events,
    accessToken,
  );
  if (reconciliation.deleted > 0) {
    data = await loadSchedulerData(client, userId, connection);
  }
  const blocks = data.blocks;
  const locked = await markExternalChanges(client, blocks, data.events, now, accessToken, connection.selected_calendar_id);
  if (options.forceReplan) {
    // A priority change is an explicit request to rebuild future work. It may
    // move blocks that were previously locked, but never touches past blocks.
    await unlockFutureBlocksForPriorityReplan(client, userId, connection.selected_calendar_id, now);
    data = await loadSchedulerData(client, userId, connection);
  }
  const refreshedBlocksResult = await client.from("task_schedule_blocks").select("*").eq("user_id", userId);
  if (refreshedBlocksResult.error) throw refreshedBlocksResult.error;
  const refreshedBlocks = refreshedBlocksResult.data ?? [];
  const refreshedEventsResult = await client.from("google_calendar_events").select("*").eq("user_id", userId);
  if (refreshedEventsResult.error) throw refreshedEventsResult.error;
  const blockProviderIds = new Set(refreshedBlocks.map((block) => block.provider_event_id).filter((value): value is string => Boolean(value)));
  const busyIntervals = (refreshedEventsResult.data ?? [])
    .filter((event) => event.status !== "cancelled")
    .filter((event) => !isManagedEvent(event as CalendarEventRow, blockProviderIds))
    .map((event) => getEventInterval(event as CalendarEventRow, data.preferences.timezone))
    .filter((interval): interval is BusyInterval => interval !== null);
  const plan = planSchedule({
    tasks: data.tasks,
    existingBlocks: refreshedBlocks.map(toScheduledBlock),
    busyIntervals,
    preferences: data.preferences,
    now,
  });
  await Promise.all(plan.tasks.map((taskPlan) => setTaskStatus(client, userId, taskPlan.taskId, {
    state: "scheduling",
    scheduled_minutes: taskPlan.scheduledMinutes,
    missing_minutes: taskPlan.missingMinutes,
    warning: taskPlan.warning,
  })));
  let created = 0;
  let moved = 0;
  let deleted = 0;
  let hasCalendarErrors = cleanupFailures > 0 || reconciliation.failures > 0;
  const warnings: string[] = [...reconciliation.warnings];
  for (const task of data.tasks) {
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
        blocks: refreshedBlocks,
        events: (refreshedEventsResult.data ?? []) as CalendarEventRow[],
        preferences: data.preferences,
        now,
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
      });
      warnings.push(`${task.title}: ${message}`);
    }
  }

  await syncGoogleCalendar(syncClient, connection, request, { skipSchedulerQueue: true });
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
    return { statuses: [], blocks: [] };
  }

  const [statusesResult, blocksResult] = await Promise.all([
    client.from("task_schedule_status").select("*").eq("user_id", userId),
    client
      .from("task_schedule_blocks")
      .select("id,task_id,calendar_id,provider_event_id,start_at,end_at,planned_start_at,planned_end_at,state")
      .eq("user_id", userId)
      .not("state", "in", "(replaced,cancelled)")
      .not("provider_event_id", "is", null)
      .order("start_at", { ascending: true }),
  ]);
  if (statusesResult.error) throw statusesResult.error;
  if (blocksResult.error) throw blocksResult.error;

  const statuses: TaskScheduleStatus[] = (statusesResult.data ?? []).map((status) => ({
    taskId: status.task_id,
    state: status.state as TaskScheduleStatus["state"],
    scheduledMinutes: status.scheduled_minutes,
    missingMinutes: status.missing_minutes,
    warning: status.warning,
    updatedAt: status.updated_at,
  }));
  const blocks: ScheduleBlockSnapshot[] = (blocksResult.data ?? []).map((block) => ({
    id: block.id,
    taskId: block.task_id,
    calendarId: block.calendar_id,
    providerEventId: block.provider_event_id,
    start: block.start_at,
    end: block.end_at,
    plannedStart: block.planned_start_at,
    plannedEnd: block.planned_end_at,
    state: block.state === "locked" || block.state === "replaced" || block.state === "cancelled"
      ? block.state
      : "flexible",
  }));

  return { statuses, blocks };
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
  for (const task of tasks ?? []) {
    await setTaskStatus(client, userId, task.id, {
      state: task.duration === null ? "needs_duration" : "paused",
      scheduled_minutes: 0,
      missing_minutes: 0,
      warning,
    });
  }
}

async function markCalendarErrorForUser(client: SchedulerAdminClient, userId: string, warning: string) {
  const [tasksResult, statusesResult] = await Promise.all([
    client.from("tasks").select("id,duration").eq("user_id", userId),
    client.from("task_schedule_status").select("task_id,state,scheduled_minutes,missing_minutes").eq("user_id", userId),
  ]);
  if (tasksResult.error) throw tasksResult.error;
  if (statusesResult.error) throw statusesResult.error;

  const statuses = new Map((statusesResult.data ?? []).map((status) => [status.task_id, status]));
  for (const task of tasksResult.data ?? []) {
    const current = statuses.get(task.id);
    if (current && ["scheduled", "locked", "awaiting_completion", "paused", "needs_duration"].includes(current.state)) {
      // A later sync failure must not turn blocks that were already saved into
      // a false error state. The queue still carries the repair request.
      continue;
    }

    const scheduledMinutes = current?.scheduled_minutes ?? 0;
    await setTaskStatus(client, userId, task.id, {
      state: "calendar_error",
      scheduled_minutes: scheduledMinutes,
      missing_minutes: Math.max(0, (task.duration ?? 0) - scheduledMinutes),
      warning,
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
