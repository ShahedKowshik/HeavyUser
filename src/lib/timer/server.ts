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
import type { GoogleEvent } from "@/lib/google/client";
import {
  getSupabaseAdminClient,
  getUsableGoogleAccessToken,
  googleErrorMessage,
  loadGoogleConnection,
  type GoogleConnection,
} from "@/lib/google/server";
import { getGoogleEventKey, recordGoogleEventDeletion, upsertGoogleCalendarEvent } from "@/lib/google/sync";
import { getCalendarBusyInterval } from "@/lib/scheduler/availability";
import { normalizeSchedulerPreferences } from "@/lib/scheduler/preferences";
import { queueSchedulerJob } from "@/lib/scheduler/queue";
import { runSchedulerForUserWithRetry, SchedulerBusyError } from "@/lib/scheduler/service";
import type { Database, Json } from "@/lib/supabase/database.types";
import { getUserSettings } from "@/lib/supabase/settings";
import { loadSpaces } from "@/lib/spaces/server";
import { releaseLockBestEffort } from "@/lib/reliability/locks";
import { loadCachedEvents, type CalendarEventRow } from "@/lib/timer/calendar-events";
import { loadActiveSessionRow, loadTimerSnapshot } from "@/lib/timer/data";
import { getTimerBlockDurationMinutes } from "@/lib/timer/types";
import type { TaskWorkSession } from "@/lib/timer/types";

type TimerClient = SupabaseClient<Database>;
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type BlockRow = Database["public"]["Tables"]["task_schedule_blocks"]["Row"];
type SessionRow = Database["public"]["Tables"]["task_work_sessions"]["Row"];
type TimerReceiptOperation = "add_time" | "log_work";
type AddTimeResult = { taskId: string; duration: number; warning: string | null; replayed?: boolean };

const SHORT_SESSION_SECONDS = 60;
const MAX_STOP_CLOCK_SKEW_MS = 5_000;
const MIN_TIMER_CLOCK_SKEW_MS = 30_000;
const MAX_MANUAL_WORK_MS = 24 * 60 * 60 * 1000;

export class TimerOperationError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(code: string, message: string, status = 400, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "TimerOperationError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class TimerBusyError extends TimerOperationError {
  constructor() {
    super("timer_busy", "Another timer change is being saved. Try again in a moment.", 409);
  }
}

function nowIso(timestamp = Date.now()) {
  return new Date(timestamp).toISOString();
}

function secondsDifference(start: string, end: string) {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
}

function hashId(prefix: string, value: string, length = 28) {
  return `${prefix}${createHash("sha256").update(value).digest("hex").slice(0, length)}`;
}

function stableUuid(value: string) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function timerBlockId(userId: string, sessionId: string, suffix = "main") {
  return `timer-${hashId("", `${userId}:${sessionId}:${suffix}`, 24)}`;
}

function timerEventId(userId: string, sessionId: string, suffix = "main") {
  return `hu${hashId("", `${userId}:${sessionId}:${suffix}`, 30)}`.slice(0, 63);
}

function taskVisibility(task: TaskRow) {
  return task.calendar_visibility === "public" || task.calendar_visibility === "private" ? task.calendar_visibility : "default";
}

function taskTransparency(task: TaskRow) {
  return task.calendar_transparency === "transparent" || task.calendar_transparency === "opaque" ? task.calendar_transparency : "default";
}

function makeManagedEventResource(input: {
  userId: string;
  task: TaskRow;
  sessionId: string;
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
        heavyuserSessionId: input.sessionId,
        heavyuserWorkEvent: "true",
      },
    },
  };
  const visibility = taskVisibility(input.task);
  const transparency = taskTransparency(input.task);
  resource.visibility = visibility === "default" ? "default" : visibility;
  resource.transparency = transparency === "default" ? "opaque" : transparency;
  return resource;
}

async function claimTimerLock(client: TimerClient, userId: string) {
  const lockToken = randomUUID();
  const { data, error } = await client.rpc("try_claim_scheduler_lock", {
    p_user_id: userId,
    p_lock_token: lockToken,
  });
  if (error) throw error;
  if (!data) throw new TimerBusyError();
  return lockToken;
}

async function releaseTimerLock(client: TimerClient, userId: string, lockToken: string) {
  const { error } = await client.rpc("release_scheduler_lock", {
    p_user_id: userId,
    p_lock_token: lockToken,
  });
  if (error) throw error;
}

async function withTimerLock<T>(userId: string, operation: (client: TimerClient) => Promise<T>) {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new TimerOperationError("not_configured", "The timer is not configured on this deployment.", 503);
  }
  const lockToken = await claimTimerLock(client, userId);
  try {
    return await operation(client);
  } finally {
    await releaseLockBestEffort(() => releaseTimerLock(client, userId, lockToken));
  }
}

async function loadTask(client: TimerClient, userId: string, taskId: string) {
  const { data, error } = await client.from("tasks").select("*").eq("user_id", userId).eq("id", taskId).maybeSingle();
  if (error) throw error;
  if (!data) throw new TimerOperationError("task_not_found", "That task could not be found.", 404);
  return data as TaskRow;
}

async function loadTargetSpace(client: TimerClient, userId: string, task: TaskRow) {
  const spaces = await loadSpaces(client, userId);
  const space = spaces.find((candidate) => candidate.id === task.space_id);
  if (!space || space.status !== "active") {
    throw new TimerOperationError("space_required", "Choose an active Space before starting the timer.", 400);
  }
  return { space, spaces };
}

async function loadPreferences(client: TimerClient, userId: string, connection: GoogleConnection) {
  const [preferencesResult, userResult] = await Promise.all([
    client.from("task_scheduling_preferences").select("*").eq("user_id", userId).maybeSingle(),
    client.auth.admin.getUserById(userId),
  ]);
  if (preferencesResult.error) throw preferencesResult.error;
  if (userResult.error) throw userResult.error;
  return normalizeSchedulerPreferences(
    preferencesResult.data,
    connection.selected_calendar_timezone ?? "UTC",
    getUserSettings(userResult.data.user ?? null) ?? undefined,
  );
}

async function loadBlocks(client: TimerClient, userId: string, taskId?: string) {
  let query = client.from("task_schedule_blocks").select("*").eq("user_id", userId);
  if (taskId) query = query.eq("task_id", taskId);
  const { data, error } = await query.order("start_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as BlockRow[];
}

function getBusyEvents(
  events: ReadonlyArray<CalendarEventRow>,
  now: string,
  ignored?: { calendarId?: string; providerEventId?: string },
  timezonesByCalendarId: ReadonlyMap<string, string> = new Map(),
) {
  const nowTime = new Date(now).getTime();
  return events.filter((event) => {
    if (event.calendar_id === ignored?.calendarId && event.provider_event_id === ignored?.providerEventId) return false;
    const timeZone = event.time_zone ?? timezonesByCalendarId.get(event.calendar_id) ?? "UTC";
    const interval = getCalendarBusyInterval({
      status: event.status,
      transparency: event.transparency,
      startAt: event.start_at,
      endAt: event.end_at,
      startDate: event.start_date,
      endDate: event.end_date,
      timeZone,
    }, timeZone);
    if (!interval) return false;
    return new Date(interval.start).getTime() <= nowTime && new Date(interval.end).getTime() > nowTime;
  });
}

function getCurrentOrNextBlock(blocks: ReadonlyArray<BlockRow>, calendarId: string, now: number) {
  return blocks
    .filter((block) => block.calendar_id === calendarId)
    .filter((block) => !["replaced", "cancelled", "missed"].includes(block.state))
    .filter((block) => new Date(block.end_at).getTime() > now)
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())[0] ?? null;
}

function getSelectedMissedBlock(blocks: ReadonlyArray<BlockRow>, taskId: string, blockId?: string) {
  if (!blockId) return null;
  return blocks.find((block) => block.id === blockId && block.task_id === taskId && block.state === "missed") ?? null;
}

async function saveRepair(client: TimerClient, input: {
  userId: string;
  sessionId?: string | null;
  blockId?: string | null;
  calendarId: string;
  providerEventId?: string | null;
  operation: "create" | "patch" | "delete" | "reconcile";
  error: unknown;
}) {
  const message = googleErrorMessage(input.error);
  const { error } = await client.from("task_calendar_repairs").insert({
    user_id: input.userId,
    session_id: input.sessionId ?? null,
    block_id: input.blockId ?? null,
    calendar_id: input.calendarId,
    provider_event_id: input.providerEventId ?? null,
    operation: input.operation,
    status: "pending",
    attempts: 0,
    next_attempt_at: nowIso(),
    last_error: message,
    updated_at: nowIso(),
  });
  if (error) throw error;
  return message;
}

async function queueReplan(userId: string) {
  const client = getSupabaseAdminClient();
  if (!client) return;
  await queueSchedulerJob(client, userId, "work_session");
}

async function runReplan(userId: string, request?: Request) {
  try {
    await runSchedulerForUserWithRetry(userId, request);
    return null;
  } catch (error) {
    if (!(error instanceof SchedulerBusyError)) {
      await queueReplan(userId);
    }
    return googleErrorMessage(error);
  }
}

async function upsertBlock(client: TimerClient, userId: string, values: Omit<Database["public"]["Tables"]["task_schedule_blocks"]["Insert"], "user_id">) {
  const { data, error } = await client.from("task_schedule_blocks").upsert({
    ...values,
    user_id: userId,
    updated_at: nowIso(),
  }, { onConflict: "user_id,id" }).select("*").single();
  if (error) throw error;
  return data as BlockRow;
}

async function updateBlock(client: TimerClient, userId: string, blockId: string, values: Database["public"]["Tables"]["task_schedule_blocks"]["Update"]) {
  const { data, error } = await client.from("task_schedule_blocks").update({ ...values, updated_at: nowIso() }).eq("user_id", userId).eq("id", blockId).select("*").single();
  if (error) throw error;
  return data as BlockRow;
}

async function updateSession(client: TimerClient, userId: string, sessionId: string, values: Database["public"]["Tables"]["task_work_sessions"]["Update"]) {
  const { data, error } = await client.from("task_work_sessions").update({ ...values, updated_at: nowIso() }).eq("user_id", userId).eq("id", sessionId).select("*").single();
  if (error) throw error;
  return data as SessionRow;
}

function normalizeOperationKey(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new TimerOperationError("invalid_request_key", "The retry key is invalid. Try the action again.", 400);
  }
  const key = value.trim();
  if (key.length < 8 || key.length > 160) {
    throw new TimerOperationError("invalid_request_key", "The retry key is invalid. Try the action again.", 400);
  }
  return key;
}

async function loadOperationReceipt(client: TimerClient, userId: string, operation: TimerReceiptOperation, operationKey: string | null) {
  if (!operationKey) return null;
  const { data, error } = await client
    .from("task_timer_operation_receipts")
    .select("operation,response")
    .eq("user_id", userId)
    .eq("operation_key", operationKey)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.operation !== operation) {
    throw new TimerOperationError("request_key_reused", "That retry key was already used for another timer action.", 409);
  }
  const response = data.response;
  return response && typeof response === "object" && !Array.isArray(response)
    ? response as Record<string, unknown>
    : null;
}

async function saveOperationReceipt(client: TimerClient, userId: string, operation: TimerReceiptOperation, operationKey: string | null, response: Record<string, unknown>) {
  if (!operationKey) return;
  const { error } = await client.from("task_timer_operation_receipts").insert({
    user_id: userId,
    operation_key: operationKey,
    operation,
    response: response as Json,
  });
  if (error && (error as { code?: string }).code !== "23505") throw error;
}

async function deleteBlock(client: TimerClient, userId: string, blockId: string) {
  const { error } = await client.from("task_schedule_blocks").delete().eq("user_id", userId).eq("id", blockId);
  if (error) throw error;
}

async function clearActiveOwner(client: TimerClient, userId: string, sessionId: string) {
  const { error } = await client.from("task_active_session_owners").delete().eq("user_id", userId).eq("session_id", sessionId);
  if (error) throw error;
}

async function pauseSessionForCalendarChange(client: TimerClient, userId: string, session: SessionRow, warning: string) {
  const workedSeconds = secondsDifference(session.started_at, nowIso());
  await updateSession(client, userId, session.id, {
    state: "paused",
    worked_seconds: workedSeconds,
    warning,
    calendar_sync_state: "history_only",
    repair_needed: false,
  });
  await clearActiveOwner(client, userId, session.id);
}

async function createOrPatchEvent(input: {
  client: TimerClient;
  userId: string;
  connection: GoogleConnection;
  task: TaskRow;
  sessionId: string;
  blockId: string;
  calendarId: string;
  timezone: string;
  start: string;
  end: string;
  existingProviderEventId?: string | null;
  existingEtag?: string | null;
}) {
  const accessToken = await getUsableGoogleAccessToken(input.client, input.connection);
  const providerEventId = input.existingProviderEventId ?? timerEventId(input.userId, input.sessionId);
  const resource = makeManagedEventResource({
    userId: input.userId,
    task: input.task,
    sessionId: input.sessionId,
    blockId: input.blockId,
    providerEventId,
    start: input.start,
    end: input.end,
    timezone: input.timezone,
  });

  if (input.existingProviderEventId) {
    try {
      const latest = await getGoogleEvent({ accessToken, calendarId: input.calendarId, eventId: input.existingProviderEventId });
      if (latest.status === "cancelled") throw new TimerOperationError("calendar_changed", "The task block was deleted in Google Calendar. Review the timer before continuing.", 409);
      const event = await patchGoogleEvent({
        accessToken,
        calendarId: input.calendarId,
        eventId: input.existingProviderEventId,
        etag: latest.etag ?? input.existingEtag,
        resource,
      });
      try {
        await upsertGoogleCalendarEvent(input.client, input.userId, event, { calendarId: input.calendarId, spaceId: input.task.space_id });
      } catch (cacheError) {
        try {
          await patchGoogleEvent({
            accessToken,
            calendarId: input.calendarId,
            eventId: event.id,
            etag: event.etag,
            resource: restoreEventResource(latest),
          });
        } catch (restoreError) {
          await saveRepair(input.client, {
            userId: input.userId,
            blockId: input.blockId,
            calendarId: input.calendarId,
            providerEventId: event.id,
            operation: "reconcile",
            error: restoreError,
          });
        }
        throw cacheError;
      }
      return { event, accessToken, previousEvent: latest, created: false };
    } catch (error) {
      if (!(error instanceof GoogleApiError) || (error.status !== 404 && error.status !== 410)) throw error;
    }
  }

  let event;
  let created = true;
  try {
    event = await insertGoogleEvent({ accessToken, calendarId: input.calendarId, resource });
  } catch (error) {
    if (!(error instanceof GoogleApiError) || error.status !== 409) throw error;
    created = false;
    event = await getGoogleEvent({ accessToken, calendarId: input.calendarId, eventId: providerEventId });
  }
  try {
    await upsertGoogleCalendarEvent(input.client, input.userId, event, { calendarId: input.calendarId, spaceId: input.task.space_id });
  } catch (cacheError) {
    if (created) {
      try {
        await deleteGoogleEventIfPresent({ accessToken, calendarId: input.calendarId, eventId: event.id });
      } catch (cleanupError) {
        await input.client.from("task_schedule_cleanup").insert({
          user_id: input.userId,
          calendar_id: input.calendarId,
          provider_event_id: event.id,
          last_error: googleErrorMessage(cleanupError),
        });
      }
    }
    throw cacheError;
  }
  return { event, accessToken, previousEvent: null, created };
}

function restoreEventResource(event: GoogleEvent) {
  const resource: Record<string, unknown> = {};
  for (const key of ["summary", "description", "location", "start", "end", "visibility", "transparency", "extendedProperties", "attendees"]) {
    const value = event[key as keyof GoogleEvent];
    if (value !== undefined) resource[key] = value;
  }
  return resource;
}

async function compensateEventWrite(input: {
  client: TimerClient;
  userId: string;
  calendarId: string;
  blockId?: string | null;
  eventResult: { event: GoogleEvent; accessToken: string; previousEvent: GoogleEvent | null; created: boolean };
}) {
  const { eventResult } = input;
  try {
    if (eventResult.created) {
      await deleteOwnedEvent({
        client: input.client,
        userId: input.userId,
        calendarId: input.calendarId,
        providerEventId: eventResult.event.id,
        providerEventKey: getGoogleEventKey(eventResult.event),
        accessToken: eventResult.accessToken,
      });
    } else if (eventResult.previousEvent) {
      const restored = await patchGoogleEvent({
        accessToken: eventResult.accessToken,
        calendarId: input.calendarId,
        eventId: eventResult.event.id,
        etag: eventResult.event.etag,
        resource: restoreEventResource(eventResult.previousEvent),
      });
      await upsertGoogleCalendarEvent(input.client, input.userId, restored, { calendarId: input.calendarId });
    }
  } catch (error) {
    if (eventResult.created) {
      await input.client.from("task_schedule_cleanup").insert({
        user_id: input.userId,
        calendar_id: input.calendarId,
        provider_event_id: eventResult.event.id,
        last_error: googleErrorMessage(error),
      });
    } else {
      await saveRepair(input.client, {
        userId: input.userId,
        blockId: input.blockId,
        calendarId: input.calendarId,
        providerEventId: eventResult.event.id,
        operation: "reconcile",
        error,
      });
    }
  }
}

async function deleteOwnedEvent(input: { client: TimerClient; userId: string; calendarId: string; providerEventId: string; providerEventKey?: string | null; accessToken: string }) {
  await deleteGoogleEventIfPresent({ accessToken: input.accessToken, calendarId: input.calendarId, eventId: input.providerEventId });
  await recordGoogleEventDeletion(input.client, input.userId, input.providerEventKey ?? `${input.providerEventId}::`, input.providerEventId, input.calendarId);
  const { error } = await input.client.from("google_calendar_events").delete()
    .eq("user_id", input.userId)
    .eq("calendar_id", input.calendarId)
    .eq("provider_event_id", input.providerEventId);
  if (error) throw error;
}

function normalizeRequestedTimestamp(value: unknown, fallback = Date.now()) {
  if (typeof value !== "string" || !value) return fallback;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) throw new TimerOperationError("invalid_time", "Enter a valid time.", 400);
  if (timestamp < fallback - MIN_TIMER_CLOCK_SKEW_MS) {
    throw new TimerOperationError("stale_time", "That timer action was sent with an old timestamp. Refresh and try again.", 409);
  }
  return Math.min(timestamp, fallback + MAX_STOP_CLOCK_SKEW_MS);
}

async function stopSessionInsideLock(input: {
  client: TimerClient;
  userId: string;
  session: SessionRow;
  stopAt: number;
  action?: string;
  complete?: boolean;
  request?: Request;
}) {
  const stopIso = nowIso(input.stopAt);
  const task = await loadTask(input.client, input.userId, input.session.task_id);
  if (input.stopAt <= new Date(input.session.started_at).getTime()) {
    throw new TimerOperationError("invalid_stop", "Stop time must be after the timer started.", 400);
  }
  const elapsedSeconds = secondsDifference(input.session.started_at, stopIso);
  const estimateReached = task.duration !== null && elapsedSeconds >= task.duration * 60;
  if (estimateReached && !["finish", "keep_long", "split"].includes(input.action ?? "") && !input.complete) {
    throw new TimerOperationError("estimate_reached", "You reached the estimate. Choose whether to finish this task or add more time.", 409, {
      estimateMinutes: task.duration,
      workedSeconds: elapsedSeconds,
    });
  }

  const connection = await loadGoogleConnection(input.client, input.userId);
  const spaces = await loadSpaces(input.client, input.userId);
  const space = spaces.find((candidate) => candidate.id === input.session.space_id) ?? (task.space_id ? spaces.find((candidate) => candidate.id === task.space_id) : null);
  const preferences = connection ? await loadPreferences(input.client, input.userId, connection) : null;
  const maxMinutes = Math.max(5, task.max_block_minutes ?? preferences?.defaultMaxBlockMinutes ?? 90);
  const overrun = elapsedSeconds > maxMinutes * 60;
  if (overrun && !["keep_long", "split"].includes(input.action ?? "")) {
    throw new TimerOperationError("overrun_review", "This session is longer than one calendar block. Choose one long block or split it.", 409, {
      maxBlockMinutes: maxMinutes,
      workedSeconds: elapsedSeconds,
    });
  }

  const saved = await updateSession(input.client, input.userId, input.session.id, {
    state: "stopped",
    stopped_at: stopIso,
    original_stopped_at: input.session.original_stopped_at ?? stopIso,
    worked_seconds: elapsedSeconds,
    calendar_sync_state: input.session.calendar_sync_state === "history_only" ? "history_only" : "pending",
    repair_needed: false,
    warning: null,
  });
  await clearActiveOwner(input.client, input.userId, input.session.id);

  let warning: string | null = null;
  let activeAccessToken: string | null = null;
  const extraChunks: Array<{ id: string; eventKey: string; blockId: string }> = [];
  if (input.session.provider_event_id && input.session.calendar_id && connection) {
    try {
      const accessToken = await getUsableGoogleAccessToken(input.client, connection);
      activeAccessToken = accessToken;
      const latest = await getGoogleEvent({
        accessToken,
        calendarId: input.session.calendar_id,
        eventId: input.session.provider_event_id,
      });
      const latestStart = latest.start?.dateTime ? new Date(latest.start.dateTime).getTime() : Number.NaN;
      const latestEnd = latest.end?.dateTime ? new Date(latest.end.dateTime).getTime() : Number.NaN;
      const savedStart = new Date(input.session.started_at).getTime();
      const savedPlannedEnd = input.session.planned_end_at ? new Date(input.session.planned_end_at).getTime() : Number.NaN;
      if (latest.status === "cancelled" || !Number.isFinite(latestStart) || Math.abs(latestStart - savedStart) > 1000
        || (Number.isFinite(savedPlannedEnd) && (!Number.isFinite(latestEnd) || Math.abs(latestEnd - savedPlannedEnd) > 1000))) {
        warning = "Google Calendar changed this block, so HeavyUser saved the work but did not overwrite that change.";
        if (input.session.block_id) {
          await updateBlock(input.client, input.userId, input.session.block_id, {
            work_session_id: input.session.id,
            end_at: stopIso,
            planned_end_at: stopIso,
            state: "locked",
            last_error: warning,
          });
        }
        await saveRepair(input.client, {
          userId: input.userId,
          sessionId: input.session.id,
          blockId: input.session.block_id,
          calendarId: input.session.calendar_id,
          providerEventId: input.session.provider_event_id,
          operation: "reconcile",
          error: warning,
        });
        await updateSession(input.client, input.userId, input.session.id, {
          calendar_sync_state: "pending",
          repair_needed: true,
          warning,
        });
      } else if (elapsedSeconds < SHORT_SESSION_SECONDS) {
        try {
          await deleteOwnedEvent({
            client: input.client,
            userId: input.userId,
            calendarId: input.session.calendar_id,
            providerEventId: input.session.provider_event_id,
            providerEventKey: input.session.provider_event_key,
            accessToken,
          });
        } catch (error) {
          warning = await saveRepair(input.client, {
            userId: input.userId,
            sessionId: input.session.id,
            blockId: input.session.block_id,
            calendarId: input.session.calendar_id,
            providerEventId: input.session.provider_event_id,
            operation: "delete",
            error,
          });
        }
        if (input.session.block_id) {
          await updateBlock(input.client, input.userId, input.session.block_id, { state: "cancelled", last_error: null });
        }
        await updateSession(input.client, input.userId, input.session.id, {
          calendar_sync_state: "history_only",
          repair_needed: false,
          warning: null,
        });
      } else {
        const activeBlockEnd = input.action === "split" && overrun
          ? new Date(new Date(input.session.started_at).getTime() + maxMinutes * 60_000).toISOString()
          : stopIso;
        const event = await patchGoogleEvent({
          accessToken,
          calendarId: input.session.calendar_id,
          eventId: input.session.provider_event_id,
          etag: latest.etag,
          resource: {
            start: { dateTime: input.session.started_at, timeZone: space?.timeZone ?? connection.selected_calendar_timezone ?? "UTC" },
            end: { dateTime: activeBlockEnd, timeZone: space?.timeZone ?? connection.selected_calendar_timezone ?? "UTC" },
          },
        });
        await upsertGoogleCalendarEvent(input.client, input.userId, event, { calendarId: input.session.calendar_id, spaceId: input.session.space_id });
        if (input.session.block_id) {
          await updateBlock(input.client, input.userId, input.session.block_id, {
            work_session_id: input.session.id,
            end_at: activeBlockEnd,
            planned_end_at: activeBlockEnd,
            etag: event.etag ?? latest.etag ?? null,
            state: "locked",
            last_error: null,
          });
        }
        if (input.action === "split" && overrun) {
          let chunkStart = new Date(activeBlockEnd).getTime();
          let chunkIndex = 1;
          const stopTime = new Date(stopIso).getTime();
          while (chunkStart < stopTime) {
            const chunkEnd = Math.min(chunkStart + maxMinutes * 60_000, stopTime);
            const extraBlockId = timerBlockId(input.userId, input.session.id, `overrun-${chunkIndex}`);
            const extraEventId = timerEventId(input.userId, input.session.id, `overrun-${chunkIndex}`);
            const extraStart = new Date(chunkStart).toISOString();
            const extraEnd = new Date(chunkEnd).toISOString();
            const extraEvent = await insertGoogleEvent({
              accessToken,
              calendarId: input.session.calendar_id,
              resource: makeManagedEventResource({
                userId: input.userId,
                task,
                sessionId: input.session.id,
                blockId: extraBlockId,
                providerEventId: extraEventId,
                start: extraStart,
                end: extraEnd,
                timezone: space?.timeZone ?? connection.selected_calendar_timezone ?? "UTC",
              }),
            });
            extraChunks.push({ id: extraEvent.id, eventKey: getGoogleEventKey(extraEvent), blockId: extraBlockId });
            await upsertGoogleCalendarEvent(input.client, input.userId, extraEvent, { calendarId: input.session.calendar_id, spaceId: input.session.space_id });
            await upsertBlock(input.client, input.userId, {
              id: extraBlockId,
              task_id: task.id,
              space_id: input.session.space_id,
              work_session_id: input.session.id,
              calendar_id: input.session.calendar_id,
              provider_event_id: extraEvent.id,
              provider_event_key: getGoogleEventKey(extraEvent),
              start_at: extraStart,
              end_at: extraEnd,
              planned_start_at: extraStart,
              planned_end_at: extraEnd,
              state: "locked",
              sync_version: 1,
              etag: extraEvent.etag ?? null,
              last_error: "Actual overrun block.",
            });
            chunkStart = chunkEnd;
            chunkIndex += 1;
          }
        }
        await updateSession(input.client, input.userId, input.session.id, {
          calendar_sync_state: "synced",
          repair_needed: false,
          warning: null,
        });
      }
    } catch (error) {
      for (const extraChunk of extraChunks) {
        if (activeAccessToken) {
          try {
            await deleteOwnedEvent({
              client: input.client,
              userId: input.userId,
              calendarId: input.session.calendar_id,
              providerEventId: extraChunk.id,
              providerEventKey: extraChunk.eventKey,
              accessToken: activeAccessToken,
            });
          } catch (cleanupError) {
            await input.client.from("task_schedule_cleanup").insert({
              user_id: input.userId,
              calendar_id: input.session.calendar_id,
              provider_event_id: extraChunk.id,
              last_error: googleErrorMessage(cleanupError),
            });
          }
        }
        try {
          await deleteBlock(input.client, input.userId, extraChunk.blockId);
        } catch (cleanupError) {
          await updateBlock(input.client, input.userId, extraChunk.blockId, {
            state: "cancelled",
            last_error: googleErrorMessage(cleanupError),
          }).catch(() => undefined);
        }
      }
      warning = warning ?? googleErrorMessage(error);
      if (input.session.block_id) {
        // The local block must reflect the exact stop even when Google is
        // temporarily unavailable. The repair queue will bring the provider
        // event to this same range later.
        await updateBlock(input.client, input.userId, input.session.block_id, {
          work_session_id: input.session.id,
          end_at: stopIso,
          planned_end_at: stopIso,
          state: "locked",
          last_error: warning,
        });
      }
      await saveRepair(input.client, {
        userId: input.userId,
        sessionId: input.session.id,
        blockId: input.session.block_id,
        calendarId: input.session.calendar_id,
        providerEventId: input.session.provider_event_id,
        operation: "patch",
        error,
      });
      await updateSession(input.client, input.userId, input.session.id, {
        calendar_sync_state: "pending",
        repair_needed: true,
        warning,
      });
    }
  } else if (input.session.block_id) {
    await updateBlock(input.client, input.userId, input.session.block_id, { work_session_id: input.session.id, state: "locked", end_at: stopIso, planned_end_at: stopIso });
    if (input.session.provider_event_id && input.session.calendar_id) {
      const disconnectWarning = await saveRepair(input.client, {
        userId: input.userId,
        sessionId: input.session.id,
        blockId: input.session.block_id,
        calendarId: input.session.calendar_id,
        providerEventId: input.session.provider_event_id,
        operation: "patch",
        error: "Google Calendar was disconnected after this work was saved.",
      });
      await updateSession(input.client, input.userId, input.session.id, {
        calendar_sync_state: "pending",
        repair_needed: true,
        warning: disconnectWarning,
      });
    } else {
      await updateSession(input.client, input.userId, input.session.id, {
        calendar_sync_state: "history_only",
        repair_needed: false,
        warning: "Google Calendar was disconnected after this work was saved.",
      });
    }
  }

  if (input.complete) {
    const { error } = await input.client.from("tasks").update({ status: "done", auto_schedule: true, updated_at: nowIso() }).eq("user_id", input.userId).eq("id", task.id);
    if (error) throw error;
  }

  return {
    session: saved,
    workedSeconds: elapsedSeconds,
    workedMinutes: Math.floor(elapsedSeconds / 60),
    warning,
    completed: Boolean(input.complete),
  };
}

export async function startTimer(input: {
  userId: string;
  taskId: string;
  request?: Request;
  startedAt?: string;
  choice?: "overlap" | "next_free";
  reopen?: boolean;
  missedBlockId?: string;
}) {
  const result = await withTimerLock(input.userId, async (client) => {
    const startedAt = normalizeRequestedTimestamp(input.startedAt, Date.now());
    const task = await loadTask(client, input.userId, input.taskId);
    const wasDone = task.status === "done";
    if (task.status === "done") {
      if (!input.reopen) {
        throw new TimerOperationError("task_done", "This task is complete. Reopen it to start the timer.", 409);
      }
    }
    if (task.duration === null) {
      throw new TimerOperationError("needs_duration", "Add an estimate before starting the timer.", 400);
    }
    const connection = await loadGoogleConnection(client, input.userId);
    if (!connection?.selected_calendar_id) {
      throw new TimerOperationError("calendar_required", "Connect and choose a writable Google Calendar before starting.", 400);
    }
    const { space, spaces } = await loadTargetSpace(client, input.userId, task);
    const activeSession = await loadActiveSessionRow(client, input.userId);
    if (activeSession) {
      if (activeSession.task_id === task.id) {
        return { active: true, sessionId: activeSession.id, taskId: task.id, warning: null };
      }
      await stopSessionInsideLock({ client, userId: input.userId, session: activeSession, stopAt: Math.max(Date.now(), startedAt), action: "keep_long", request: input.request });
    }

    const blocks = await loadBlocks(client, input.userId, task.id);
    const selectedMissedBlock = getSelectedMissedBlock(blocks, task.id, input.missedBlockId);
    if (input.missedBlockId && !selectedMissedBlock) {
      throw new TimerOperationError("missed_block_not_found", "That missed block was already handled on another device. Refresh the task.", 409);
    }
    const currentBlock = selectedMissedBlock ?? getCurrentOrNextBlock(blocks, space.calendarId, startedAt);
    const currentBlockIsMissed = currentBlock?.state === "missed";
    const activeCalendarIds = spaces.filter((candidate) => candidate.status === "active").map((candidate) => candidate.calendarId);
    const events = await loadCachedEvents(client, input.userId, activeCalendarIds, nowIso(startedAt));
    const timezonesByCalendarId = new Map(spaces.map((candidate) => [candidate.calendarId, candidate.timeZone]));
    const busyEvents = getBusyEvents(
      events,
      nowIso(startedAt),
      currentBlock && !currentBlockIsMissed
        ? { calendarId: currentBlock.calendar_id, providerEventId: currentBlock.provider_event_id ?? undefined }
        : undefined,
      timezonesByCalendarId,
    );
    if (busyEvents.length > 0 && input.choice !== "overlap") {
      if (input.choice === "next_free") {
        return { scheduledOnly: true, taskId: task.id, sessionId: null, warning: "The task was left stopped and scheduled for the next free time." };
      }
      throw new TimerOperationError("busy_now", "Now overlaps another Google Calendar event.", 409, {
        taskId: task.id,
        events: busyEvents.slice(0, 3).map((event) => ({ title: event.summary, start: event.start_at, end: event.end_at })),
      });
    }

    let reopened = false;
    if (wasDone) {
      const { error } = await client.from("tasks").update({ status: "open", auto_schedule: true, updated_at: nowIso() }).eq("user_id", input.userId).eq("id", task.id);
      if (error) throw error;
      task.status = "open";
      reopened = true;
    }

    const sessionId = randomUUID();
    const remainingMinutes = Math.max(1, task.duration);
    const defaultBlockMinutes = Math.max(5, Math.min(remainingMinutes, task.max_block_minutes ?? 90));
    const existingDuration = currentBlock
      ? currentBlockIsMissed
        ? Math.max(1, getTimerBlockDurationMinutes(currentBlock.start_at, currentBlock.end_at))
        : Math.max(1, getTimerBlockDurationMinutes(nowIso(Math.max(startedAt, new Date(currentBlock.start_at).getTime())), currentBlock.end_at))
      : defaultBlockMinutes;
    const endAt = new Date(startedAt + Math.max(1, existingDuration) * 60_000).toISOString();
    const blockId = currentBlock?.id ?? timerBlockId(input.userId, sessionId);
    let eventResult: Awaited<ReturnType<typeof createOrPatchEvent>> | null = null;
    try {
      eventResult = await createOrPatchEvent({
        client,
        userId: input.userId,
        connection,
        task,
        sessionId,
        blockId,
        calendarId: space.calendarId,
        timezone: space.timeZone,
        start: nowIso(startedAt),
        end: endAt,
        existingProviderEventId: currentBlockIsMissed ? null : currentBlock?.provider_event_id,
        existingEtag: currentBlockIsMissed ? null : currentBlock?.etag,
      });
      const savedBlock = await upsertBlock(client, input.userId, {
        id: blockId,
        task_id: task.id,
        space_id: space.id,
        calendar_id: space.calendarId,
        provider_event_id: eventResult.event.id,
        provider_event_key: getGoogleEventKey(eventResult.event),
        start_at: nowIso(startedAt),
        end_at: endAt,
        planned_start_at: nowIso(startedAt),
        planned_end_at: endAt,
        state: "locked",
        sync_version: (currentBlock?.sync_version ?? 0) + 1,
        etag: eventResult.event.etag ?? null,
        last_error: null,
      });
      const sessionInsert = await client.from("task_work_sessions").insert({
        id: sessionId,
        user_id: input.userId,
        task_id: task.id,
        space_id: space.id,
        calendar_id: space.calendarId,
        block_id: savedBlock.id,
        provider_event_id: eventResult.event.id,
        provider_event_key: getGoogleEventKey(eventResult.event),
        source: "timer",
        state: "running",
        started_at: nowIso(startedAt),
        original_started_at: nowIso(startedAt),
        planned_start_at: nowIso(startedAt),
        planned_end_at: endAt,
        worked_seconds: 0,
        estimated_minutes_at_start: task.duration,
        calendar_sync_state: "synced",
        repair_needed: false,
        warning: null,
        updated_at: nowIso(),
      });
      if (sessionInsert.error) {
        if ((sessionInsert.error as { code?: string }).code === "23505") {
          throw new TimerOperationError("timer_active", "A timer is already running for this workspace.", 409);
        }
        throw sessionInsert.error;
      }
      await updateBlock(client, input.userId, savedBlock.id, { work_session_id: sessionId });
      const ownerInsert = await client.from("task_active_session_owners").insert({ user_id: input.userId, session_id: sessionId, task_id: task.id, updated_at: nowIso() });
      if (ownerInsert.error) {
        await updateSession(client, input.userId, sessionId, { state: "cancelled", stopped_at: nowIso(), worked_seconds: 0, calendar_sync_state: "history_only" });
        throw ownerInsert.error;
      }
      return { active: true, sessionId, taskId: task.id, blockId: savedBlock.id, startedAt: nowIso(startedAt), warning: null };
    } catch (error) {
      if (eventResult) {
        await compensateEventWrite({ client, userId: input.userId, calendarId: space.calendarId, blockId, eventResult });
      }
      if (currentBlock) {
        await updateBlock(client, input.userId, currentBlock.id, {
          task_id: currentBlock.task_id,
          space_id: currentBlock.space_id,
          work_session_id: currentBlock.work_session_id,
          calendar_id: currentBlock.calendar_id,
          provider_event_id: currentBlock.provider_event_id,
          provider_event_key: currentBlock.provider_event_key,
          start_at: currentBlock.start_at,
          end_at: currentBlock.end_at,
          planned_start_at: currentBlock.planned_start_at,
          planned_end_at: currentBlock.planned_end_at,
          state: currentBlock.state,
          sync_version: currentBlock.sync_version,
          etag: currentBlock.etag,
          last_error: currentBlock.last_error,
        });
      } else {
        await deleteBlock(client, input.userId, blockId).catch(() => undefined);
      }
      if (reopened) {
        await client.from("tasks").update({ status: "done", auto_schedule: true, updated_at: nowIso() }).eq("user_id", input.userId).eq("id", task.id);
      }
      throw error;
    }
  });

  const schedulerWarning = await runReplan(input.userId, input.request);
  return { ...result, warning: schedulerWarning ?? result.warning, schedulerWarning };
}

export async function stopTimer(input: {
  userId: string;
  request?: Request;
  sessionId?: string;
  stoppedAt?: string;
  action?: "finish" | "keep_long" | "split";
  complete?: boolean;
}) {
  const result = await withTimerLock(input.userId, async (client) => {
    const activeSession = await loadActiveSessionRow(client, input.userId);
    if (!activeSession || (input.sessionId && activeSession.id !== input.sessionId)) {
      if (input.sessionId) {
        const { data: requestedSession, error } = await client
          .from("task_work_sessions")
          .select("*")
          .eq("user_id", input.userId)
          .eq("id", input.sessionId)
          .maybeSingle();
        if (error) throw error;
        if (requestedSession?.state === "stopped") {
          return {
            session: requestedSession,
            workedSeconds: requestedSession.worked_seconds,
            workedMinutes: Math.floor(requestedSession.worked_seconds / 60),
            warning: requestedSession.warning,
            completed: false,
            replayed: true,
          };
        }
      }
      if (activeSession) {
        throw new TimerOperationError("timer_changed", "A different timer is now running. Refresh before stopping it.", 409);
      }
      throw new TimerOperationError("no_active_timer", "There is no active timer.", 409);
    }
    const stopAt = normalizeRequestedTimestamp(input.stoppedAt, Date.now());
    return stopSessionInsideLock({ client, userId: input.userId, session: activeSession, stopAt, action: input.action, complete: input.complete, request: input.request });
  });
  const schedulerWarning = await runReplan(input.userId, input.request);
  return { ...result, schedulerWarning };
}

export async function stopTimerForCalendarDisconnect(userId: string) {
  return withTimerLock(userId, async (client) => {
    const activeSession = await loadActiveSessionRow(client, userId);
    if (!activeSession) return null;
    return stopSessionInsideLock({
      client,
      userId,
      session: activeSession,
      stopAt: Date.now(),
      action: "keep_long",
    });
  });
}

export async function addTime(input: { userId: string; minutes: number; request?: Request; requestKey?: string }) {
  if (!Number.isFinite(input.minutes) || input.minutes < 1 || input.minutes > 1440) {
    throw new TimerOperationError("invalid_minutes", "Choose between 1 minute and 24 hours.", 400);
  }
  const operationKey = normalizeOperationKey(input.requestKey);
  const result = await withTimerLock(input.userId, async (client) => {
    const replay = await loadOperationReceipt(client, input.userId, "add_time", operationKey);
    if (replay) return { ...replay, replayed: true } as AddTimeResult;
    const session = await loadActiveSessionRow(client, input.userId);
    if (!session) throw new TimerOperationError("no_active_timer", "Start a timer before adding time.", 409);
    const task = await loadTask(client, input.userId, session.task_id);
    if (task.duration === null) throw new TimerOperationError("needs_duration", "Add an estimate before adding time.", 400);
    const addedMinutes = Math.round(input.minutes);
    const nextDuration = Math.min(10080, task.duration + addedMinutes);
    const previousDuration = task.duration;
    const connection = session.provider_event_id && session.calendar_id ? await loadGoogleConnection(client, input.userId) : null;
    let latestEvent: Awaited<ReturnType<typeof getGoogleEvent>> | null = null;
    let accessToken: string | null = null;

    if (session.provider_event_id && session.calendar_id && connection) {
      try {
        accessToken = await getUsableGoogleAccessToken(client, connection);
        latestEvent = await getGoogleEvent({ accessToken, calendarId: session.calendar_id, eventId: session.provider_event_id });
        const latestStart = latestEvent.start?.dateTime ? new Date(latestEvent.start.dateTime).getTime() : Number.NaN;
        const latestEnd = latestEvent.end?.dateTime ? new Date(latestEvent.end.dateTime).getTime() : Number.NaN;
        const expectedStart = new Date(session.started_at).getTime();
        const expectedEnd = session.planned_end_at ? new Date(session.planned_end_at).getTime() : Number.NaN;
        if (latestEvent.status === "cancelled" || !Number.isFinite(latestStart) || !Number.isFinite(latestEnd)
          || Math.abs(latestStart - expectedStart) > 1000
          || (Number.isFinite(expectedEnd) && Math.abs(latestEnd - expectedEnd) > 1000)) {
          const warning = "Google Calendar changed the active block, so the timer is paused for review.";
          await pauseSessionForCalendarChange(client, input.userId, session, warning);
          throw new TimerOperationError("calendar_changed", warning, 409);
        }
      } catch (error) {
        if (error instanceof TimerOperationError) throw error;
        if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410)) {
          const warning = "Google Calendar deleted the active block, so the timer is paused for review.";
          await pauseSessionForCalendarChange(client, input.userId, session, warning);
          throw new TimerOperationError("calendar_changed", warning, 409);
        }
        throw error;
      }
    }

    const { error: taskError } = await client.from("tasks").update({ duration: nextDuration, auto_schedule: true, updated_at: nowIso() }).eq("user_id", input.userId).eq("id", task.id);
    if (taskError) throw taskError;
    let warning: string | null = null;
    const currentEnd = latestEvent?.end?.dateTime
      ? new Date(latestEvent.end.dateTime).getTime()
      : session.planned_end_at
        ? new Date(session.planned_end_at).getTime()
        : Date.now();
    const baseEnd = Math.max(Number.isFinite(currentEnd) ? currentEnd : Date.now(), Date.now());
    const nextEnd = new Date(baseEnd + addedMinutes * 60_000).toISOString();
    const previousPlannedEnd = session.planned_end_at;
    try {
      if (session.block_id) {
        await updateBlock(client, input.userId, session.block_id, { end_at: nextEnd, planned_end_at: nextEnd });
      }
      if (session.provider_event_id && session.calendar_id) {
        await updateSession(client, input.userId, session.id, { planned_end_at: nextEnd, calendar_sync_state: "pending", repair_needed: false, warning: null });
      }
    } catch (error) {
      await client.from("tasks").update({ duration: previousDuration, updated_at: nowIso() }).eq("user_id", input.userId).eq("id", task.id);
      if (session.block_id && previousPlannedEnd) {
        await updateBlock(client, input.userId, session.block_id, { end_at: previousPlannedEnd, planned_end_at: previousPlannedEnd }).catch(() => undefined);
      }
      throw error;
    }

    if (session.provider_event_id && session.calendar_id && connection && latestEvent && accessToken) {
      try {
        const event = await patchGoogleEvent({ accessToken, calendarId: session.calendar_id, eventId: session.provider_event_id, etag: latestEvent.etag, resource: { end: { dateTime: nextEnd, timeZone: connection.selected_calendar_timezone ?? "UTC" } } });
        await upsertGoogleCalendarEvent(client, input.userId, event, { calendarId: session.calendar_id, spaceId: session.space_id });
        if (session.block_id) await updateBlock(client, input.userId, session.block_id, { etag: event.etag ?? latestEvent.etag ?? null });
        await updateSession(client, input.userId, session.id, { planned_end_at: nextEnd, calendar_sync_state: "synced", repair_needed: false, warning: null });
      } catch (error) {
        if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410 || error.status === 409 || error.status === 412)) {
          await client.from("tasks").update({ duration: previousDuration, updated_at: nowIso() }).eq("user_id", input.userId).eq("id", task.id);
          if (session.block_id && previousPlannedEnd) {
            await updateBlock(client, input.userId, session.block_id, { end_at: previousPlannedEnd, planned_end_at: previousPlannedEnd }).catch(() => undefined);
          }
          const changedWarning = "Google Calendar changed the active block, so the timer is paused for review.";
          await updateSession(client, input.userId, session.id, { planned_end_at: previousPlannedEnd });
          await pauseSessionForCalendarChange(client, input.userId, session, changedWarning);
          throw new TimerOperationError("calendar_changed", changedWarning, 409);
        }
        warning = await saveRepair(client, { userId: input.userId, sessionId: session.id, blockId: session.block_id, calendarId: session.calendar_id, providerEventId: session.provider_event_id, operation: "patch", error });
        await updateSession(client, input.userId, session.id, { calendar_sync_state: "pending", repair_needed: true, warning });
      }
    } else if (session.provider_event_id && session.calendar_id) {
      warning = await saveRepair(client, {
        userId: input.userId,
        sessionId: session.id,
        blockId: session.block_id,
        calendarId: session.calendar_id,
        providerEventId: session.provider_event_id,
        operation: "patch",
        error: "Google Calendar is disconnected; the added time is waiting for reconnect.",
      });
      await updateSession(client, input.userId, session.id, { calendar_sync_state: "pending", repair_needed: true, warning });
    }
    const coreResult: AddTimeResult = { taskId: task.id, duration: nextDuration, warning };
    try {
      await saveOperationReceipt(client, input.userId, "add_time", operationKey, coreResult);
    } catch {
      coreResult.warning = coreResult.warning ?? "Time was saved, but retry protection is temporarily unavailable. Refresh before repeating this action.";
    }
    return coreResult;
  });
  return { ...result, schedulerWarning: await runReplan(input.userId, input.request) };
}

export async function logWork(input: { userId: string; taskId: string; startedAt: string; stoppedAt: string; request?: Request; requestKey?: string; missedBlockId?: string }) {
  const started = new Date(input.startedAt).getTime();
  const stopped = new Date(input.stoppedAt).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(stopped) || stopped <= started) throw new TimerOperationError("invalid_range", "The end time must be after the start time.", 400);
  if (stopped > Date.now() + MAX_STOP_CLOCK_SKEW_MS) throw new TimerOperationError("invalid_time", "Logged work cannot end in the future.", 400);
  if (stopped - started > MAX_MANUAL_WORK_MS) throw new TimerOperationError("invalid_range", "Log no more than 24 hours at once.", 400);
  const operationKey = normalizeOperationKey(input.requestKey);
  const result = await withTimerLock(input.userId, async (client) => {
    const replay = await loadOperationReceipt(client, input.userId, "log_work", operationKey);
    if (replay) return { ...replay, replayed: true } as { session: SessionRow; warning: string | null; historyOnly: boolean; replayed?: boolean };
    const sessionId = operationKey ? stableUuid(`${input.userId}:log_work:${operationKey}`) : randomUUID();
    if (operationKey) {
      const { data: existingSession, error: existingSessionError } = await client.from("task_work_sessions").select("*").eq("user_id", input.userId).eq("id", sessionId).maybeSingle();
      if (existingSessionError) throw existingSessionError;
      if (existingSession) {
        if (existingSession.task_id !== input.taskId) {
          throw new TimerOperationError("request_key_reused", "That retry key was already used for another work log.", 409);
        }
        return {
          session: existingSession as SessionRow,
          warning: existingSession.warning,
          historyOnly: existingSession.calendar_sync_state === "history_only",
          replayed: true,
        };
      }
    }
    const task = await loadTask(client, input.userId, input.taskId);
    const workedSeconds = Math.round((stopped - started) / 1000);
    const connection = await loadGoogleConnection(client, input.userId);
    const space = task.space_id ? (await loadSpaces(client, input.userId)).find((candidate) => candidate.id === task.space_id) : null;
    const blocks = input.missedBlockId ? await loadBlocks(client, input.userId, task.id) : [];
    const missedBlock = input.missedBlockId
      ? blocks.find((block) => block.id === input.missedBlockId && block.task_id === task.id && block.state === "missed") ?? null
      : null;
    if (input.missedBlockId && !missedBlock) {
      throw new TimerOperationError("missed_block_not_found", "That missed block was already handled on another device. Refresh the task.", 409);
    }
    const shouldCreateCalendarEvent = workedSeconds >= SHORT_SESSION_SECONDS
      && task.duration !== null
      && task.status !== "done"
      && connection?.selected_calendar_id
      && space?.status === "active";
    let eventId: string | null = null;
    let eventKey: string | null = null;
    let blockId: string | null = missedBlock?.id ?? null;
    let calendarSyncState: "synced" | "pending" | "history_only" = "history_only";
    let warning: string | null = null;
    let repairError: unknown = null;
    let eventResult: Awaited<ReturnType<typeof createOrPatchEvent>> | null = null;
    if (shouldCreateCalendarEvent) {
      blockId = blockId ?? timerBlockId(input.userId, sessionId);
      try {
        await upsertBlock(client, input.userId, {
          id: blockId,
          task_id: task.id,
          space_id: space.id,
          calendar_id: space.calendarId,
          provider_event_id: null,
          provider_event_key: null,
          start_at: nowIso(started),
          end_at: nowIso(stopped),
          planned_start_at: nowIso(started),
          planned_end_at: nowIso(stopped),
          state: "locked",
          sync_version: (missedBlock?.sync_version ?? 0) + 1,
          etag: null,
          last_error: null,
        });
        eventResult = await createOrPatchEvent({ client, userId: input.userId, connection, task, sessionId, blockId, calendarId: space.calendarId, timezone: space.timeZone, start: nowIso(started), end: nowIso(stopped) });
        eventId = eventResult.event.id;
        eventKey = getGoogleEventKey(eventResult.event);
        await upsertBlock(client, input.userId, { id: blockId, task_id: task.id, space_id: space.id, calendar_id: space.calendarId, provider_event_id: eventId, provider_event_key: eventKey, start_at: nowIso(started), end_at: nowIso(stopped), planned_start_at: nowIso(started), planned_end_at: nowIso(stopped), state: "locked", sync_version: (missedBlock?.sync_version ?? 0) + 1, etag: eventResult.event.etag ?? null, last_error: null });
        calendarSyncState = "synced";
      } catch (error) {
        if (eventResult) {
          await compensateEventWrite({ client, userId: input.userId, calendarId: space.calendarId, blockId, eventResult });
        }
        eventId = null;
        eventKey = null;
        repairError = error;
        warning = googleErrorMessage(error);
        if (blockId) await updateBlock(client, input.userId, blockId, { last_error: warning });
        calendarSyncState = "pending";
      }
    } else if (missedBlock) {
      await updateBlock(client, input.userId, missedBlock.id, {
        state: "replaced",
        last_error: workedSeconds < SHORT_SESSION_SECONDS ? "Resolved by a short manual work log." : "Resolved by manual work log.",
      });
    }
    try {
      const { data: session, error } = await client.from("task_work_sessions").insert({ id: sessionId, user_id: input.userId, task_id: task.id, space_id: space?.id ?? missedBlock?.space_id ?? task.space_id, calendar_id: space?.calendarId ?? missedBlock?.calendar_id ?? connection?.selected_calendar_id ?? null, block_id: blockId, provider_event_id: eventId, provider_event_key: eventKey, source: "manual", state: "stopped", started_at: nowIso(started), stopped_at: nowIso(stopped), original_started_at: nowIso(started), original_stopped_at: nowIso(stopped), worked_seconds: workedSeconds, estimated_minutes_at_start: task.duration, calendar_sync_state: calendarSyncState, repair_needed: Boolean(warning), warning, updated_at: nowIso() }).select("*").single();
      if (error) throw error;
      if (blockId) {
        await updateBlock(client, input.userId, blockId, { work_session_id: sessionId });
      }
      if (repairError && blockId && (space?.calendarId ?? missedBlock?.calendar_id)) {
        warning = await saveRepair(client, { userId: input.userId, sessionId, blockId, calendarId: space?.calendarId ?? missedBlock?.calendar_id ?? "", providerEventId: eventId, operation: "create", error: repairError });
        await updateSession(client, input.userId, sessionId, { calendar_sync_state: "pending", repair_needed: true, warning });
      }
      const resultValue = { session: session as SessionRow, warning, historyOnly: calendarSyncState === "history_only" };
      try {
        await saveOperationReceipt(client, input.userId, "log_work", operationKey, resultValue as unknown as Record<string, unknown>);
      } catch {
        resultValue.warning = resultValue.warning ?? "Work was saved, but retry protection is temporarily unavailable. Refresh before repeating this action.";
      }
      return resultValue;
    } catch (error) {
      if (eventResult) {
        await compensateEventWrite({ client, userId: input.userId, calendarId: space?.calendarId ?? missedBlock?.calendar_id ?? "", blockId, eventResult });
      }
      if (missedBlock) {
        await updateBlock(client, input.userId, missedBlock.id, {
          state: missedBlock.state,
          last_error: missedBlock.last_error,
          work_session_id: missedBlock.work_session_id,
          space_id: missedBlock.space_id,
          calendar_id: missedBlock.calendar_id,
          provider_event_id: missedBlock.provider_event_id,
          provider_event_key: missedBlock.provider_event_key,
          start_at: missedBlock.start_at,
          end_at: missedBlock.end_at,
          planned_start_at: missedBlock.planned_start_at,
          planned_end_at: missedBlock.planned_end_at,
          sync_version: missedBlock.sync_version,
          etag: missedBlock.etag,
        });
      } else if (blockId) {
        await deleteBlock(client, input.userId, blockId).catch(() => undefined);
      }
      throw error;
    }
  });
  return { ...result, schedulerWarning: await runReplan(input.userId, input.request) };
}

export async function rescheduleMissedBlock(input: { userId: string; blockId: string; request?: Request }) {
  const client = getSupabaseAdminClient();
  if (!client) throw new TimerOperationError("not_configured", "The timer is not configured on this deployment.", 503);
  const { data: block, error } = await client.from("task_schedule_blocks").select("id,state").eq("user_id", input.userId).eq("id", input.blockId).maybeSingle();
  if (error) throw error;
  if (!block) throw new TimerOperationError("missed_block_not_found", "That missed block could not be found.", 404);
  if (block.state !== "missed") return { blockId: input.blockId, resolved: true, alreadyHandled: true };

  try {
    await runSchedulerForUserWithRetry(input.userId, input.request);
  } catch (schedulerError) {
    throw new TimerOperationError("reschedule_failed", googleErrorMessage(schedulerError), 502);
  }

  return withTimerLock(input.userId, async (lockedClient) => {
    const { data: latest, error: latestError } = await lockedClient.from("task_schedule_blocks").select("id,state").eq("user_id", input.userId).eq("id", input.blockId).maybeSingle();
    if (latestError) throw latestError;
    if (!latest) throw new TimerOperationError("missed_block_not_found", "That missed block could not be found.", 404);
    if (latest.state === "missed") {
      const { error: updateError } = await lockedClient.from("task_schedule_blocks").update({ state: "replaced", last_error: "Rescheduled after a missed-block action.", updated_at: nowIso() }).eq("user_id", input.userId).eq("id", input.blockId);
      if (updateError) throw updateError;
    }
    return { blockId: input.blockId, resolved: true, alreadyHandled: latest.state !== "missed" };
  });
}

export async function correctSession(input: { userId: string; sessionId: string; startedAt: string; stoppedAt: string; reason: string; request?: Request }) {
  const started = new Date(input.startedAt).getTime();
  const stopped = new Date(input.stoppedAt).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(stopped) || stopped <= started) throw new TimerOperationError("invalid_range", "The end time must be after the start time.", 400);
  if (stopped > Date.now() + MAX_STOP_CLOCK_SKEW_MS) throw new TimerOperationError("invalid_time", "A correction cannot end in the future.", 400);
  if (!input.reason.trim() || input.reason.trim().length > 500) throw new TimerOperationError("reason_required", "Add a short reason for this correction.", 400);
  if (stopped - started > MAX_MANUAL_WORK_MS) throw new TimerOperationError("invalid_range", "Corrections cannot cover more than 24 hours.", 400);
  const result = await withTimerLock(input.userId, async (client) => {
    const { data: session, error } = await client.from("task_work_sessions").select("*").eq("user_id", input.userId).eq("id", input.sessionId).maybeSingle();
    if (error) throw error;
    if (!session) throw new TimerOperationError("session_not_found", "That work session could not be found.", 404);
    if (session.state === "running") throw new TimerOperationError("active_session", "Stop the active timer before correcting it.", 409);
    const nextStart = nowIso(started);
    const nextStop = nowIso(stopped);
    if (session.started_at === nextStart && session.stopped_at === nextStop) {
      return { session, warning: session.warning, replayed: true };
    }
    const normalizedReason = input.reason.trim();
    const { data: existingRevision, error: revisionReadError } = await client
      .from("task_work_session_revisions")
      .select("id")
      .eq("user_id", input.userId)
      .eq("session_id", session.id)
      .eq("new_started_at", nextStart)
      .eq("new_stopped_at", nextStop)
      .eq("reason", normalizedReason)
      .limit(1)
      .maybeSingle();
    if (revisionReadError) throw revisionReadError;
    if (!existingRevision) {
      const { error: revisionError } = await client.from("task_work_session_revisions").insert({ user_id: input.userId, session_id: session.id, old_started_at: session.started_at, old_stopped_at: session.stopped_at, new_started_at: nextStart, new_stopped_at: nextStop, reason: normalizedReason });
      if (revisionError) throw revisionError;
    }
    const correctedSeconds = Math.round((stopped - started) / 1000);
    let warning: string | null = null;
    if (session.provider_event_id && session.calendar_id) {
      const connection = await loadGoogleConnection(client, input.userId);
      const sessionSpace = session.space_id
        ? (await loadSpaces(client, input.userId)).find((space) => space.id === session.space_id)
        : null;
      const canSyncCalendar = !session.space_id || sessionSpace?.status === "active";
      if (connection && canSyncCalendar) {
        try {
          const accessToken = await getUsableGoogleAccessToken(client, connection);
          const latest = await getGoogleEvent({ accessToken, calendarId: session.calendar_id, eventId: session.provider_event_id });
          if (correctedSeconds < SHORT_SESSION_SECONDS) {
            await deleteOwnedEvent({ client, userId: input.userId, calendarId: session.calendar_id, providerEventId: session.provider_event_id, providerEventKey: session.provider_event_key, accessToken });
            if (session.block_id) await updateBlock(client, input.userId, session.block_id, { state: "cancelled", start_at: nextStart, end_at: nextStop, planned_start_at: nextStart, planned_end_at: nextStop, last_error: null });
          } else {
            const timeZone = sessionSpace?.timeZone ?? connection.selected_calendar_timezone ?? "UTC";
            const event = await patchGoogleEvent({ accessToken, calendarId: session.calendar_id, eventId: session.provider_event_id, etag: latest.etag, resource: { start: { dateTime: nextStart, timeZone }, end: { dateTime: nextStop, timeZone } } });
            await upsertGoogleCalendarEvent(client, input.userId, event, { calendarId: session.calendar_id, spaceId: session.space_id });
            if (session.block_id) await updateBlock(client, input.userId, session.block_id, { state: "locked", start_at: nextStart, end_at: nextStop, planned_start_at: nextStart, planned_end_at: nextStop, etag: event.etag ?? latest.etag ?? null });
          }
        } catch (error) {
          warning = await saveRepair(client, { userId: input.userId, sessionId: session.id, blockId: session.block_id, calendarId: session.calendar_id, providerEventId: session.provider_event_id, operation: correctedSeconds < SHORT_SESSION_SECONDS ? "delete" : "patch", error });
        }
      } else {
        warning = await saveRepair(client, {
          userId: input.userId,
          sessionId: session.id,
          blockId: session.block_id,
          calendarId: session.calendar_id,
          providerEventId: session.provider_event_id,
          operation: correctedSeconds < SHORT_SESSION_SECONDS ? "delete" : "patch",
          error: canSyncCalendar
            ? "Google Calendar is disconnected; the correction is waiting for reconnect."
            : "This Calendar Space is disconnected; the correction is waiting for that Space to be reconnected.",
        });
      }
    }
    const updated = await updateSession(client, input.userId, session.id, {
      state: "stopped",
      started_at: nextStart,
      stopped_at: nextStop,
      worked_seconds: correctedSeconds,
      original_started_at: session.original_started_at,
      original_stopped_at: session.original_stopped_at,
      repair_needed: Boolean(warning),
      calendar_sync_state: warning ? "pending" : (correctedSeconds < SHORT_SESSION_SECONDS ? "history_only" : session.calendar_sync_state),
      warning,
    });
    await clearActiveOwner(client, input.userId, session.id).catch(() => undefined);
    return { session: updated, warning };
  });
  return { ...result, schedulerWarning: await runReplan(input.userId, input.request) };
}

export async function deleteSession(input: { userId: string; sessionId: string; request?: Request }) {
  const result = await withTimerLock(input.userId, async (client) => {
    const { data: session, error } = await client
      .from("task_work_sessions")
      .select("*")
      .eq("user_id", input.userId)
      .eq("id", input.sessionId)
      .maybeSingle();
    if (error) throw error;
    if (!session) throw new TimerOperationError("session_not_found", "That work session could not be found.", 404);
    if (session.state === "running") throw new TimerOperationError("active_session", "Stop the active timer before deleting it.", 409);
    if (session.state === "cancelled") return { session, warning: null };

    let warning: string | null = null;
    if (session.provider_event_id && session.calendar_id) {
      const connection = await loadGoogleConnection(client, input.userId);
      const sessionSpace = session.space_id
        ? (await loadSpaces(client, input.userId)).find((space) => space.id === session.space_id)
        : null;
      const canSyncCalendar = !session.space_id || sessionSpace?.status === "active";
      if (connection && canSyncCalendar) {
        try {
          const accessToken = await getUsableGoogleAccessToken(client, connection);
          await deleteOwnedEvent({
            client,
            userId: input.userId,
            calendarId: session.calendar_id,
            providerEventId: session.provider_event_id,
            providerEventKey: session.provider_event_key,
            accessToken,
          });
        } catch (error) {
          warning = await saveRepair(client, {
            userId: input.userId,
            sessionId: session.id,
            blockId: session.block_id,
            calendarId: session.calendar_id,
            providerEventId: session.provider_event_id,
            operation: "delete",
            error,
          });
        }
      } else {
        warning = await saveRepair(client, {
          userId: input.userId,
          sessionId: session.id,
          blockId: session.block_id,
          calendarId: session.calendar_id,
          providerEventId: session.provider_event_id,
          operation: "delete",
          error: canSyncCalendar
            ? "Google Calendar is disconnected; this work entry will be removed when it is reconnected."
            : "This Calendar Space is disconnected; this work entry will be removed when that Space is reconnected.",
        });
      }
    }

    if (session.block_id) {
      await updateBlock(client, input.userId, session.block_id, {
        state: "cancelled",
        last_error: warning,
      });
    }
    const cancelled = await updateSession(client, input.userId, session.id, {
      state: "cancelled",
      stopped_at: session.stopped_at ?? nowIso(),
      worked_seconds: 0,
      calendar_sync_state: warning ? "pending" : "history_only",
      repair_needed: Boolean(warning),
      warning,
    });
    await clearActiveOwner(client, input.userId, session.id).catch(() => undefined);
    return { session: cancelled, warning };
  });
  return { ...result, schedulerWarning: await runReplan(input.userId, input.request) };
}

export async function loadTimerStatus(userId: string) {
  const client = getSupabaseAdminClient();
  if (!client) return { sessions: [], activeSession: null, sessionsByTask: {}, missedBlocks: [], alerts: [] };
  return loadTimerSnapshot(client, userId);
}

export type { TaskWorkSession };
