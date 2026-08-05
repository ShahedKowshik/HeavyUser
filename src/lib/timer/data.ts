import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  getRemainingMinutes,
  getSessionElapsedSeconds,
  type ActiveTimerSnapshot,
  type MissedBlockSnapshot,
  type TaskWorkSession,
  type TaskWorkSummary,
  type TimerAlert,
} from "@/lib/timer/types";

type TimerClient = SupabaseClient<Database>;
type SessionRow = Database["public"]["Tables"]["task_work_sessions"]["Row"];

function mapSession(row: SessionRow): TaskWorkSession {
  return {
    id: row.id,
    userId: row.user_id,
    taskId: row.task_id,
    spaceId: row.space_id,
    calendarId: row.calendar_id,
    blockId: row.block_id,
    providerEventId: row.provider_event_id,
    providerEventKey: row.provider_event_key,
    source: row.source === "manual" ? "manual" : "timer",
    state: row.state === "paused" || row.state === "stopped" || row.state === "cancelled" ? row.state : "running",
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    originalStartedAt: row.original_started_at,
    originalStoppedAt: row.original_stopped_at,
    plannedStartAt: row.planned_start_at,
    plannedEndAt: row.planned_end_at,
    workedSeconds: row.worked_seconds,
    estimatedMinutesAtStart: row.estimated_minutes_at_start,
    calendarSyncState: row.calendar_sync_state === "pending" || row.calendar_sync_state === "error" || row.calendar_sync_state === "history_only"
      ? row.calendar_sync_state
      : "synced",
    repairNeeded: row.repair_needed,
    warning: row.warning,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getRowWorkedSeconds(row: Pick<SessionRow, "started_at" | "stopped_at" | "worked_seconds" | "state">, now = Date.now()) {
  if (row.state === "stopped" || row.state === "cancelled") {
    return Math.max(0, Math.round(row.worked_seconds));
  }
  if (row.state === "paused") {
    return Math.max(0, Math.round(row.worked_seconds));
  }
  const started = new Date(row.started_at).getTime();
  return Number.isFinite(started) ? Math.max(0, Math.round((Math.max(now, started) - started) / 1000)) : 0;
}

export async function loadWorkSessionRows(client: TimerClient, userId: string, limit?: number) {
  const pageSize = 500;
  const rows: SessionRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await client
      .from("task_work_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;

    const page = (data ?? []) as SessionRow[];
    rows.push(...page);
    if (page.length < pageSize || (limit !== undefined && rows.length >= limit)) break;
    offset += pageSize;
  }

  return limit === undefined ? rows : rows.slice(0, Math.max(0, limit));
}

export async function loadActiveSessionRow(client: TimerClient, userId: string) {
  const { data, error } = await client
    .from("task_work_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("state", "running")
    .maybeSingle();
  if (error) throw error;
  return data as SessionRow | null;
}

export async function loadTimerSnapshot(client: TimerClient, userId: string, now = Date.now()) {
  const [sessionRows, blockResult, tasksResult] = await Promise.all([
    loadWorkSessionRows(client, userId),
    client
      .from("task_schedule_blocks")
      .select("id,task_id,space_id,calendar_id,start_at,end_at,state")
      .eq("user_id", userId)
      .eq("state", "missed")
      .order("start_at", { ascending: false }),
    client
      .from("tasks")
      .select("id,duration")
      .eq("user_id", userId),
  ]);
  if (blockResult.error) throw blockResult.error;
  if (tasksResult.error) throw tasksResult.error;

  const sessions = sessionRows.map(mapSession);
  const taskDurations = new Map((tasksResult.data ?? []).map((task) => [task.id, task.duration]));
  const active = sessions.find((session) => session.state === "running") ?? null;
  const activeSession: ActiveTimerSnapshot | null = active
    ? {
        session: active,
        elapsedSeconds: getSessionElapsedSeconds(active, now),
        serverNow: new Date(now).toISOString(),
      }
    : null;
  const sessionsByTask: Record<string, TaskWorkSummary> = {};
  const workedSecondsByTask = new Map<string, number>();
  const sessionRowsById = new Map(sessionRows.map((row) => [row.id, row]));
  for (const session of sessions) {
    const currentEstimate = taskDurations.get(session.taskId) ?? session.estimatedMinutesAtStart;
    const summary = sessionsByTask[session.taskId] ?? {
      taskId: session.taskId,
      estimatedMinutes: currentEstimate,
      workedMinutes: 0,
      remainingMinutes: currentEstimate,
      sessions: [],
    };
    const row = sessionRowsById.get(session.id);
    const workedSeconds = row ? getRowWorkedSeconds(row, now) : session.workedSeconds;
    workedSecondsByTask.set(session.taskId, (workedSecondsByTask.get(session.taskId) ?? 0) + workedSeconds);
    summary.estimatedMinutes = summary.estimatedMinutes ?? currentEstimate;
    summary.sessions = [...summary.sessions, session];
    sessionsByTask[session.taskId] = summary;
  }

  for (const [taskId, summary] of Object.entries(sessionsByTask)) {
    summary.workedMinutes = Math.floor((workedSecondsByTask.get(taskId) ?? 0) / 60);
    summary.remainingMinutes = getRemainingMinutes(summary.estimatedMinutes, summary.workedMinutes);
  }

  const missedBlocks: MissedBlockSnapshot[] = (blockResult.data ?? []).map((block) => ({
    id: block.id,
    taskId: block.task_id,
    spaceId: block.space_id,
    calendarId: block.calendar_id,
    start: block.start_at,
    end: block.end_at,
    minutes: Math.max(0, Math.round((new Date(block.end_at).getTime() - new Date(block.start_at).getTime()) / 60_000)),
    state: "missed",
  }));

  const alerts: TimerAlert[] = sessions
    .filter((session) => session.state === "paused" && Boolean(session.warning))
    .slice(0, 5)
    .map((session) => ({ taskId: session.taskId, sessionId: session.id, message: session.warning ?? "The timer was paused for review." }));

  return { sessions, activeSession, sessionsByTask, missedBlocks, alerts };
}

export { mapSession };
