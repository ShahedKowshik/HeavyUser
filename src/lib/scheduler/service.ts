import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteGoogleEvent,
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
import { getGoogleEventKey, syncGoogleCalendar } from "@/lib/google/sync";
import type { Database } from "@/lib/supabase/database.types";
import type { CalendarTransparency, CalendarVisibility } from "@/lib/tasks";
import { normalizeSchedulerPreferences } from "@/lib/scheduler/preferences";
import { planSchedule } from "@/lib/scheduler/planner";
import type { BusyInterval, ScheduledBlock, SchedulerPreferences, SchedulerTask } from "@/lib/scheduler/types";

type SchedulerAdminClient = SupabaseClient<Database>;
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type BlockRow = Database["public"]["Tables"]["task_schedule_blocks"]["Row"];
type StatusRow = Database["public"]["Tables"]["task_schedule_status"]["Row"];
type CalendarEventRow = Database["public"]["Tables"]["google_calendar_events"]["Row"];

const RETRY_MINUTES = [1, 5, 15, 60];

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

  return resource;
}

function providerEventId(userId: string, taskId: string, blockId: string) {
  const digest = createHash("sha256").update(`${userId}:${taskId}:${blockId}`).digest("hex").slice(0, 32);
  return `hu${digest}`;
}

function plannedBlockId(taskId: string, start: string, end: string) {
  const digest = createHash("sha256").update(`${taskId}:${start}:${end}`).digest("hex").slice(0, 24);
  return `block-${digest}`;
}

function availablePlannedBlockId(taskId: string, start: string, end: string, blocks: ReadonlyArray<BlockRow>) {
  const base = plannedBlockId(taskId, start, end);
  if (!blocks.some((block) => block.id === base)) {
    return base;
  }

  let suffix = 1;
  while (blocks.some((block) => block.id === `${base}-${suffix}`)) {
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

async function updateBlock(client: SchedulerAdminClient, blockId: string, values: Database["public"]["Tables"]["task_schedule_blocks"]["Update"]) {
  const { error } = await client
    .from("task_schedule_blocks")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", blockId);
  if (error) {
    throw error;
  }
}

async function markExternalChanges(client: SchedulerAdminClient, blocks: BlockRow[], events: CalendarEventRow[], now: number) {
  const eventsByProviderId = new Map(events.map((event) => [event.provider_event_id, event]));
  let locked = 0;
  for (const block of blocks) {
    if (block.state === "replaced" || block.state === "cancelled" || !block.provider_event_id) {
      continue;
    }

    const event = eventsByProviderId.get(block.provider_event_id);
    if (!event) {
      await updateBlock(client, block.id, {
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
      await updateBlock(client, block.id, {
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
  const { data, error } = await client
    .from("task_scheduling_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw error;
  }

  return normalizeSchedulerPreferences(data, fallbackTimezone);
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
  try {
    await deleteGoogleEvent(input);
  } catch (error) {
    if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410)) {
      return;
    }
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
  }
  await updateBlock(client, block.id, { state: "cancelled", sync_version: block.sync_version + 1, last_error: null });
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
      await client
        .from("google_calendar_events")
        .delete()
        .eq("user_id", userId)
        .eq("provider_event_id", cleanup.provider_event_id);
      await client.from("task_schedule_cleanup").update({ processed_at: new Date().toISOString(), last_error: null }).eq("id", cleanup.id);
    } catch (cleanupError) {
      failures += 1;
      await client.from("task_schedule_cleanup").update({ last_error: googleErrorMessage(cleanupError) }).eq("id", cleanup.id);
    }
  }
  return failures;
}

async function queueBlockCleanup(client: SchedulerAdminClient, block: BlockRow, lastError: string) {
  if (!block.provider_event_id) {
    return;
  }
  await client.from("task_schedule_cleanup").insert({
    user_id: block.user_id,
    calendar_id: block.calendar_id,
    provider_event_id: block.provider_event_id,
    last_error: lastError,
  });
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
      }
      await updateBlock(client, block.id, { state: "cancelled", sync_version: block.sync_version + 1, last_error: null });
    } catch (cleanupError) {
      failures += 1;
      const message = googleErrorMessage(cleanupError);
      await updateBlock(client, block.id, { state: "cancelled", sync_version: block.sync_version + 1, last_error: message });
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
      }
      await updateBlock(client, block.id, { state: "cancelled", sync_version: block.sync_version + 1, last_error: null });
      deleted += 1;
    } catch (cleanupError) {
      const message = googleErrorMessage(cleanupError);
      errors.push(message);
      await updateBlock(client, block.id, { state: "cancelled", sync_version: block.sync_version + 1, last_error: message });
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
  preferences: SchedulerPreferences;
  now: number;
}) {
  const { client, connection, accessToken, task, plan, blocks, preferences, now } = input;
  const isDone = task.status === "done";
  const existingFuture = getFutureBlocks(blocks, task.id, now, isDone);
  const existingFlexible = existingFuture.filter((block) => block.state !== "locked");
  const lockedFuture = existingFuture.filter((block) => block.state === "locked");
  const desiredFlexible = isDone || !task.autoSchedule || task.duration === null
    ? []
    : plan.blocks
      .filter((block) => new Date(block.end).getTime() > now)
      .slice(lockedFuture.length);
  let created = 0;
  let moved = 0;
  let deleted = 0;

  if (isDone) {
    for (const block of existingFuture) {
      await removeBlockEvent(client, connection, accessToken, block);
      deleted += 1;
    }
  } else {
    for (let index = 0; index < existingFlexible.length; index += 1) {
      if (index >= desiredFlexible.length) {
        await removeBlockEvent(client, connection, accessToken, existingFlexible[index]);
        deleted += 1;
      }
    }

    for (let index = 0; index < desiredFlexible.length; index += 1) {
      const desired = desiredFlexible[index];
      const existing = existingFlexible[index];
      const blockId = existing?.id ?? availablePlannedBlockId(task.id, desired.start, desired.end, blocks);
      const eventId = existing?.provider_event_id ?? providerEventId(connection.user_id, task.id, blockId);
      const resource = eventResource({
        task,
        blockId,
        providerEventId: eventId,
        start: desired.start,
        end: desired.end,
        preferences,
      });

      if (!existing) {
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
        const { error: insertError } = await client.from("task_schedule_blocks").insert({
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
        });
        if (insertError) {
          throw insertError;
        }
        created += 1;
        continue;
      }

      const changed = existing.start_at !== desired.start || existing.end_at !== desired.end;
      if (changed || existing.etag === null) {
        const event = await patchGoogleEvent({
          accessToken,
          calendarId: connection.selected_calendar_id!,
          eventId: existing.provider_event_id!,
          etag: existing.etag,
          resource,
        });
        await updateBlock(client, existing.id, {
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
      } else {
        await updateBlock(client, existing.id, {
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

async function runSchedulerForUserWithClient(client: SchedulerAdminClient, userId: string, request?: Request) {
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
  const data = await loadSchedulerData(client, userId, connection);
  const blocks = data.blocks;
  const locked = await markExternalChanges(client, blocks, data.events, now);
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
  let hasCalendarErrors = cleanupFailures > 0;
  const warnings: string[] = [];
  for (const task of data.tasks) {
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

  const { data: claimed, error: claimError } = await client.rpc("try_claim_scheduler_lock", { p_user_id: userId });
  if (claimError) {
    throw claimError;
  }
  if (!claimed) {
    throw new SchedulerBusyError();
  }

  try {
    return await runSchedulerForUserWithClient(client, userId, request);
  } catch (error) {
    if (!(error instanceof SchedulerBusyError)) {
      await markCalendarErrorForUser(client, userId, googleErrorMessage(error));
    }
    throw error;
  } finally {
    await client.rpc("release_scheduler_lock", { p_user_id: userId });
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
  const { data: tasks } = await client.from("tasks").select("id,duration").eq("user_id", userId);
  for (const task of tasks ?? []) {
    await setTaskStatus(client, userId, task.id, {
      state: "calendar_error",
      scheduled_minutes: 0,
      missing_minutes: task.duration ?? 0,
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
  const { data: queue, error } = await client
    .from("scheduler_queue")
    .select("*")
    .lte("run_after", now.toISOString())
    .or(`locked_at.is.null,locked_at.lt.${new Date(Date.now() - 10 * 60_000).toISOString()}`)
    .order("requested_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  const results: SchedulerSummary[] = [];
  for (const job of queue ?? []) {
    const lockedAt = new Date().toISOString();
    const { data: claimed } = await client
      .from("scheduler_queue")
      .update({ locked_at: lockedAt, attempts: job.attempts + 1, updated_at: lockedAt })
      .eq("user_id", job.user_id)
      .or(`locked_at.is.null,locked_at.lt.${new Date(Date.now() - 10 * 60_000).toISOString()}`)
      .select("user_id")
      .maybeSingle();
    if (!claimed) continue;

    try {
      const result = await runSchedulerForUser(job.user_id, request);
      // A task/settings/calendar change can enqueue a newer request while this
      // run is in flight. Only remove the row we actually claimed; otherwise
      // the newer request would be lost.
      await client
        .from("scheduler_queue")
        .delete()
        .eq("user_id", job.user_id)
        .eq("requested_at", job.requested_at);
      results.push(result);
    } catch (queueError) {
      const attemptIndex = Math.min(job.attempts, RETRY_MINUTES.length - 1);
      const nextRun = new Date(Date.now() + RETRY_MINUTES[attemptIndex] * 60_000).toISOString();
      await client.from("scheduler_queue").update({
        run_after: nextRun,
        locked_at: null,
        last_error: googleErrorMessage(queueError),
        updated_at: new Date().toISOString(),
      }).eq("user_id", job.user_id).eq("requested_at", job.requested_at);
    }
  }

  return results;
}
