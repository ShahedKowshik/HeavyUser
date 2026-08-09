import { expect, type Page, type Route } from "@playwright/test";
import type { Space } from "@/lib/spaces";
import type { ScheduleBlockSnapshot, TaskScheduleStatus } from "@/lib/scheduler/types";
import type { Task, Priority } from "@/lib/tasks";
import type { ActiveTimerSnapshot, MissedBlockSnapshot, TaskWorkSession, TaskWorkSummary, TimerAlert } from "@/lib/timer/types";

export const E2E_USER_ID = "e2e-user-00000000";
export const FROZEN_NOW = "2026-08-01T10:00:00.000Z";
export const TEST_SPACE_ID = "space-work";
export const TEST_SUBSPACE_ID = "sub-project";

type MockResponse = {
  status: number;
  body: unknown;
  contentType?: string;
};

type CalendarConnection = {
  status: string;
  accountEmail: string | null;
  calendarId: string | null;
  calendarName: string | null;
  timeZone: string | null;
  lastError: string | null;
  updatedAt: string;
};

type BrowserMockOptions = {
  tasks?: ReadonlyArray<Task>;
  spaces?: ReadonlyArray<Space>;
  scheduleStatuses?: ReadonlyArray<TaskScheduleStatus>;
  scheduleBlocks?: ReadonlyArray<ScheduleBlockSnapshot>;
  activeSession?: ActiveTimerSnapshot | null;
  sessionsByTask?: Readonly<Record<string, TaskWorkSummary>>;
  missedBlocks?: ReadonlyArray<MissedBlockSnapshot>;
  alerts?: ReadonlyArray<TimerAlert>;
  calendarEvents?: ReadonlyArray<Record<string, unknown>>;
  connection?: Partial<CalendarConnection> | null;
  failTaskSave?: boolean;
};

export type BrowserMockState = {
  tasks: Task[];
  spaces: Space[];
  scheduleStatuses: TaskScheduleStatus[];
  scheduleBlocks: ScheduleBlockSnapshot[];
  activeSession: ActiveTimerSnapshot | null;
  sessionsByTask: Record<string, TaskWorkSummary>;
  missedBlocks: MissedBlockSnapshot[];
  alerts: TimerAlert[];
  calendarEvents: Record<string, unknown>[];
  connection: CalendarConnection | null;
  failTaskSave: boolean;
  failures: Map<string, MockResponse>;
  abortedPaths: Set<string>;
  requests: Array<{ method: string; path: string; body: unknown }>;
  timerStopResponses: MockResponse[];
  timerStartResponse: MockResponse | null;
  timerLogWorkResponse: MockResponse | null;
  timerAddTimeResponse: MockResponse | null;
};

function makeConnection(connection: Partial<CalendarConnection> | null | undefined): CalendarConnection | null {
  if (connection === null) {
    return null;
  }

  return {
    status: "connected",
    accountEmail: "e2e@heavyuser.test",
    calendarId: "calendar-work",
    calendarName: "Work calendar",
    timeZone: "UTC",
    lastError: null,
    updatedAt: FROZEN_NOW,
    ...connection,
  };
}

export function makeSpace(overrides: Partial<Space> = {}): Space {
  return {
    id: TEST_SPACE_ID,
    name: "Work",
    calendarId: "calendar-work",
    calendarName: "Work calendar",
    timeZone: "UTC",
    status: "active",
    position: 0,
    archivedAt: null,
    subSpaces: [
      {
        id: TEST_SUBSPACE_ID,
        spaceId: TEST_SPACE_ID,
        name: "Product",
        status: "active",
        position: 0,
        archivedAt: null,
      },
      {
        id: "sub-archived",
        spaceId: TEST_SPACE_ID,
        name: "Archived sub-space",
        status: "archived",
        position: 1,
        archivedAt: "2026-07-01T00:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-focus",
    title: "Focus task",
    spaceId: TEST_SPACE_ID,
    subSpaceId: TEST_SUBSPACE_ID,
    duration: 30,
    startDate: "2026-08-01",
    deadline: "2026-08-01",
    priority: "normal",
    status: "focus",
    autoSchedule: true,
    minBlockMinutes: null,
    maxBlockMinutes: null,
    calendarVisibility: null,
    calendarTransparency: null,
    ...overrides,
  };
}

export function makeSession(overrides: Partial<TaskWorkSession> = {}): TaskWorkSession {
  return {
    id: "session-e2e",
    userId: E2E_USER_ID,
    taskId: "task-focus",
    spaceId: TEST_SPACE_ID,
    calendarId: "calendar-work",
    blockId: null,
    providerEventId: null,
    providerEventKey: null,
    source: "timer",
    state: "stopped",
    startedAt: "2026-08-01T09:00:00.000Z",
    stoppedAt: "2026-08-01T09:30:00.000Z",
    originalStartedAt: "2026-08-01T09:00:00.000Z",
    originalStoppedAt: "2026-08-01T09:30:00.000Z",
    plannedStartAt: "2026-08-01T09:00:00.000Z",
    plannedEndAt: "2026-08-01T09:30:00.000Z",
    workedSeconds: 1_800,
    estimatedMinutesAtStart: 30,
    calendarSyncState: "synced",
    repairNeeded: false,
    warning: null,
    createdAt: "2026-08-01T09:30:00.000Z",
    updatedAt: "2026-08-01T09:30:00.000Z",
    ...overrides,
  };
}

export function makeStatus(taskId: string, state: TaskScheduleStatus["state"] = "scheduled"): TaskScheduleStatus {
  return {
    taskId,
    state,
    scheduledMinutes: 30,
    missingMinutes: 0,
    workedMinutes: 0,
    remainingMinutes: 30,
    missedMinutes: 0,
    activeSessionId: null,
    warning: null,
    updatedAt: FROZEN_NOW,
  };
}

export function makeBlock(taskId: string, overrides: Partial<ScheduleBlockSnapshot> = {}): ScheduleBlockSnapshot {
  return {
    id: "block-e2e",
    taskId,
    calendarId: "calendar-work",
    spaceId: TEST_SPACE_ID,
    providerEventId: null,
    start: "2026-08-01T09:00:00.000Z",
    end: "2026-08-01T09:30:00.000Z",
    plannedStart: "2026-08-01T09:00:00.000Z",
    plannedEnd: "2026-08-01T09:30:00.000Z",
    state: "flexible",
    ...overrides,
  };
}

export function makeManualSummary(taskId: string, session = makeSession({ taskId, source: "manual" })): TaskWorkSummary {
  return {
    taskId,
    estimatedMinutes: 30,
    workedMinutes: Math.floor(session.workedSeconds / 60),
    remainingMinutes: 0,
    sessions: [session],
  };
}

function taskToRow(task: Task, position: number) {
  return {
    id: task.id,
    user_id: E2E_USER_ID,
    title: task.title,
    space_id: task.spaceId,
    sub_space_id: task.subSpaceId,
    duration: task.duration,
    start_date: task.startDate,
    deadline: task.deadline,
    priority: task.priority,
    status: task.status,
    auto_schedule: task.autoSchedule,
    min_block_minutes: task.minBlockMinutes,
    max_block_minutes: task.maxBlockMinutes,
    calendar_visibility: task.calendarVisibility,
    calendar_transparency: task.calendarTransparency,
    position,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: FROZEN_NOW,
  };
}

function rowToTask(row: Record<string, unknown>): Task | null {
  if (typeof row.id !== "string" || typeof row.title !== "string") {
    return null;
  }

  const priority: Priority = row.priority === "urgent" || row.priority === "high" || row.priority === "low" ? row.priority : "normal";
  const status = row.status === "focus" || row.status === "done" ? row.status : "open";
  return makeTask({
    id: row.id,
    title: row.title,
    spaceId: typeof row.space_id === "string" ? row.space_id : null,
    subSpaceId: typeof row.sub_space_id === "string" ? row.sub_space_id : null,
    duration: typeof row.duration === "number" ? row.duration : null,
    startDate: typeof row.start_date === "string" ? row.start_date : null,
    deadline: typeof row.deadline === "string" ? row.deadline : null,
    priority,
    status,
    autoSchedule: row.auto_schedule !== false,
    minBlockMinutes: typeof row.min_block_minutes === "number" ? row.min_block_minutes : null,
    maxBlockMinutes: typeof row.max_block_minutes === "number" ? row.max_block_minutes : null,
    calendarVisibility: row.calendar_visibility === "default" || row.calendar_visibility === "public" || row.calendar_visibility === "private" ? row.calendar_visibility : null,
    calendarTransparency: row.calendar_transparency === "default" || row.calendar_transparency === "opaque" || row.calendar_transparency === "transparent" ? row.calendar_transparency : null,
  });
}

function responseBody(response: MockResponse) {
  return typeof response.body === "string" ? response.body : JSON.stringify(response.body);
}

async function fulfill(route: Route, response: MockResponse) {
  await route.fulfill({
    status: response.status,
    contentType: response.contentType ?? "application/json",
    body: responseBody(response),
  });
}

function defaultCalendarEvent(): Record<string, unknown> {
  return {
    id: "event-e2e",
    providerEventId: "event-e2e",
    calendarId: "calendar-work",
    spaceId: TEST_SPACE_ID,
    spaceName: "Work",
    subSpaceName: null,
    title: "Calendar commitment",
    description: null,
    location: null,
    meetingUrl: null,
    start: "2026-08-01T13:00:00.000Z",
    end: "2026-08-01T14:00:00.000Z",
    startDate: null,
    endDate: null,
    allDay: false,
    hasAttendees: false,
    etag: "etag-e2e",
    htmlLink: null,
    timeZone: "UTC",
    recurringEventId: null,
    isTaskBlock: false,
    taskId: null,
    scheduleBlockId: null,
    isPlannerSynthetic: false,
    isActiveTimerBlock: false,
  };
}

export async function installBrowserMocks(page: Page, options: BrowserMockOptions = {}): Promise<BrowserMockState> {
  const mock: BrowserMockState = {
    tasks: [...(options.tasks ?? [makeTask()])],
    spaces: [...(options.spaces ?? [makeSpace()])],
    scheduleStatuses: [...(options.scheduleStatuses ?? [])],
    scheduleBlocks: [...(options.scheduleBlocks ?? [])],
    activeSession: options.activeSession ?? null,
    sessionsByTask: { ...(options.sessionsByTask ?? {}) },
    missedBlocks: [...(options.missedBlocks ?? [])],
    alerts: [...(options.alerts ?? [])],
    calendarEvents: [...(options.calendarEvents ?? [defaultCalendarEvent()])],
    connection: makeConnection(options.connection),
    failTaskSave: options.failTaskSave ?? false,
    failures: new Map(),
    abortedPaths: new Set(),
    requests: [],
    timerStopResponses: [],
    timerStartResponse: null,
    timerLogWorkResponse: null,
    timerAddTimeResponse: null,
  };

  await page.clock.install({ time: FROZEN_NOW });
  await page.addInitScript(({ tasks, userId }) => {
    window.localStorage.setItem(`heavyuser:tasks:v2:${userId}`, JSON.stringify(tasks));
    window.localStorage.removeItem(`heavyuser:last-space:${userId}`);
  }, { tasks: mock.tasks, userId: E2E_USER_ID });

  await page.route("**/rest/v1/tasks**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postDataJSON() as unknown;
    mock.requests.push({ method: request.method(), path: url.pathname, body });

    if (request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mock.tasks.map(taskToRow)) });
      return;
    }

    if (request.method() === "DELETE") {
      if (mock.failTaskSave) {
        await fulfill(route, { status: 500, body: { code: "e2e_save_failed", message: "The task save failed." } });
        return;
      }
      const ids = url.searchParams.get("id")?.match(/^in\.\((.*)\)$/)?.[1]?.split(",") ?? [];
      mock.tasks = mock.tasks.filter((task) => !ids.includes(task.id));
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    if (request.method() === "POST" || request.method() === "PATCH") {
      if (mock.failTaskSave) {
        await fulfill(route, { status: 500, body: { code: "e2e_save_failed", message: "The task save failed." } });
        return;
      }
      const rows = Array.isArray(body) ? body : [body];
      const nextTasks = [...mock.tasks];
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const nextTask = rowToTask(row as Record<string, unknown>);
        if (!nextTask) continue;
        const index = nextTasks.findIndex((task) => task.id === nextTask.id);
        if (index >= 0) nextTasks[index] = nextTask;
        else nextTasks.push(nextTask);
      }
      mock.tasks = nextTasks;
      await fulfill(route, { status: 201, body: [] });
      return;
    }

    await route.continue();
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const body = request.postDataJSON() as unknown;
    mock.requests.push({ method: request.method(), path, body });

    if (mock.abortedPaths.has(path)) {
      await route.abort("failed");
      return;
    }

    const exactFailure = mock.failures.get(path);
    if (exactFailure) {
      await fulfill(route, exactFailure);
      return;
    }

    if (path === "/api/spaces") {
      await fulfill(route, { status: 200, body: { spaces: mock.spaces } });
      return;
    }
    if (path === "/api/scheduler/status") {
      await fulfill(route, { status: 200, body: { statuses: mock.scheduleStatuses, blocks: mock.scheduleBlocks } });
      return;
    }
    if (path === "/api/scheduler/run") {
      await fulfill(route, { status: 200, body: { ok: true } });
      return;
    }
    if (path === "/api/timer/status") {
      await fulfill(route, {
        status: 200,
        body: {
          activeSession: mock.activeSession,
          sessionsByTask: mock.sessionsByTask,
          missedBlocks: mock.missedBlocks,
          alerts: mock.alerts,
        },
      });
      return;
    }
    if (path === "/api/timer/start") {
      if (mock.timerStartResponse) {
        const response = mock.timerStartResponse;
        mock.timerStartResponse = null;
        await fulfill(route, response);
        return;
      }
      const taskId = typeof body === "object" && body && "taskId" in body && typeof body.taskId === "string" ? body.taskId : "task-focus";
      const session = makeSession({ id: "session-active", taskId, state: "running", stoppedAt: null, originalStoppedAt: null, workedSeconds: 0 });
      mock.activeSession = { session, elapsedSeconds: 0, serverNow: FROZEN_NOW };
      await fulfill(route, { status: 200, body: { warning: "Timer started." } });
      return;
    }
    if (path === "/api/timer/stop") {
      const nextResponse = mock.timerStopResponses.shift();
      if (nextResponse) {
        if (nextResponse.status < 400) {
          mock.activeSession = null;
        }
        await fulfill(route, nextResponse);
        return;
      }
      mock.activeSession = null;
      await fulfill(route, { status: 200, body: { warning: "Work saved." } });
      return;
    }
    if (path === "/api/timer/log-work") {
      if (mock.timerLogWorkResponse) {
        await fulfill(route, mock.timerLogWorkResponse);
        return;
      }
      const taskId = typeof body === "object" && body && "taskId" in body && typeof body.taskId === "string" ? body.taskId : "task-focus";
      mock.sessionsByTask[taskId] = makeManualSummary(taskId);
      await fulfill(route, { status: 200, body: { warning: "Work logged." } });
      return;
    }
    if (path === "/api/timer/add-time") {
      if (mock.timerAddTimeResponse) {
        await fulfill(route, mock.timerAddTimeResponse);
        return;
      }
      await fulfill(route, { status: 200, body: { warning: "More time added." } });
      return;
    }
    if (path.startsWith("/api/timer/sessions/")) {
      await fulfill(route, { status: 200, body: { warning: request.method() === "DELETE" ? "Work entry removed." : "Session corrected and recorded." } });
      return;
    }
    if (path.startsWith("/api/timer/missed/")) {
      mock.missedBlocks = [];
      await fulfill(route, { status: 200, body: { ok: true } });
      return;
    }
    if (path === "/api/google/calendar/calendars") {
      await fulfill(route, {
        status: 200,
        body: {
          calendars: [{ id: "calendar-work", name: "Work calendar", description: null, timeZone: "UTC", primary: true, backgroundColor: "#4ade80" }],
        },
      });
      return;
    }
    if (path === "/api/google/calendar/connection") {
      await fulfill(route, { status: 200, body: { connection: mock.connection } });
      return;
    }
    if (path === "/api/google/calendar/sync") {
      await fulfill(route, { status: 200, body: { connection: mock.connection, sync: { errors: [] } } });
      return;
    }
    if (path === "/api/google/calendar/events") {
      if (request.method() === "GET") {
        await fulfill(route, { status: 200, body: { connection: mock.connection, events: mock.calendarEvents } });
      } else {
        await fulfill(route, { status: 200, body: { event: mock.calendarEvents[0] ?? defaultCalendarEvent() } });
      }
      return;
    }
    if (path === "/api/google/calendar/select") {
      mock.connection = makeConnection({ calendarId: "calendar-work", calendarName: "Work calendar" });
      await fulfill(route, { status: 200, body: { spaces: mock.spaces } });
      return;
    }

    await route.continue();
  });

  return mock;
}

export async function openTaskWorkspace(page: Page) {
  await page.goto("/");
  await expect(page.locator("main.hu-shell")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeAttached();
}

export function getTaskRow(page: Page, title: string) {
  return page.getByRole("article", { name: new RegExp(`^${escapeRegExp(title)}(?:, overdue)?$`) });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
