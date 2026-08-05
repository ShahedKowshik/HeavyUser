export type WorkSessionSource = "timer" | "manual";
export type WorkSessionState = "running" | "paused" | "stopped" | "cancelled";
export type CalendarSyncState = "synced" | "pending" | "error" | "history_only";

export type TaskWorkSession = {
  id: string;
  userId: string;
  taskId: string;
  spaceId: string | null;
  calendarId: string | null;
  blockId: string | null;
  providerEventId: string | null;
  providerEventKey: string | null;
  source: WorkSessionSource;
  state: WorkSessionState;
  startedAt: string;
  stoppedAt: string | null;
  originalStartedAt: string;
  originalStoppedAt: string | null;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  workedSeconds: number;
  estimatedMinutesAtStart: number | null;
  calendarSyncState: CalendarSyncState;
  repairNeeded: boolean;
  warning: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActiveTimerSnapshot = {
  session: TaskWorkSession;
  elapsedSeconds: number;
  serverNow: string;
};

export type MissedBlockSnapshot = {
  id: string;
  taskId: string;
  spaceId: string | null;
  calendarId: string;
  start: string;
  end: string;
  minutes: number;
  state: "missed";
};

export type TaskWorkSummary = {
  taskId: string;
  estimatedMinutes: number | null;
  workedMinutes: number;
  remainingMinutes: number | null;
  sessions: ReadonlyArray<TaskWorkSession>;
};

export type TimerAlert = {
  taskId: string;
  sessionId: string;
  message: string;
};

export function getSessionElapsedSeconds(session: Pick<TaskWorkSession, "startedAt" | "stoppedAt" | "workedSeconds" | "state">, now = Date.now()) {
  if (session.state === "stopped" || session.state === "cancelled") {
    return Math.max(0, Math.round(session.workedSeconds));
  }

  const started = new Date(session.startedAt).getTime();
  if (!Number.isFinite(started)) {
    return Math.max(0, Math.round(session.workedSeconds));
  }

  return Math.max(0, Math.round((Math.max(now, started) - started) / 1000));
}

export function getSessionWorkedMinutes(session: Pick<TaskWorkSession, "startedAt" | "stoppedAt" | "workedSeconds" | "state">, now = Date.now()) {
  return Math.floor(getSessionElapsedSeconds(session, now) / 60);
}

export function formatElapsedSeconds(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function getRemainingMinutes(estimatedMinutes: number | null, workedMinutes: number) {
  return estimatedMinutes === null ? null : Math.max(0, estimatedMinutes - workedMinutes);
}

export function getTimerBlockDurationMinutes(startAt: string, endAt: string) {
  const duration = (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000;
  return Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : 0;
}
