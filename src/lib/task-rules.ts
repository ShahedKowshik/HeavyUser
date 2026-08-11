import type { Space } from "@/lib/spaces";
import type { UserSettings } from "@/lib/supabase/settings";
import type { Priority, Task } from "@/lib/tasks";

export type TaskBucket = "all" | "backlog" | "today" | "upcoming";

export type UpcomingGroupId = "tomorrow" | "this-week" | "this-month" | "this-quarter" | "this-year" | "far-away";

export type UpcomingTaskGroup = {
  id: UpcomingGroupId | "all";
  label: string | null;
  helper: string;
  dateLabel: string;
  tasks: ReadonlyArray<Task>;
};

export const CALENDAR_DATE = "2026-08-01";
export const MAX_TASK_TITLE_LENGTH = 240;
export const MAX_TASK_DURATION_MINUTES = 10080;
export const USER_STORAGE_KEY_PREFIX = "heavyuser:tasks:v2:";
export const USER_TASK_BASELINE_STORAGE_KEY_PREFIX = "heavyuser:tasks:baseline:v1:";
const MAX_TASK_ID_LENGTH = 240;

const shortMonthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const priorityOrder: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export function sortTasks(tasks: ReadonlyArray<Task>) {
  return [...tasks].sort((firstTask, secondTask) => {
    const firstDone = firstTask.status === "done" ? 1 : 0;
    const secondDone = secondTask.status === "done" ? 1 : 0;

    if (firstDone !== secondDone) {
      return firstDone - secondDone;
    }

    const priorityDelta = priorityOrder[firstTask.priority] - priorityOrder[secondTask.priority];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const firstDeadline = firstTask.deadline ?? "9999-12-31";
    const secondDeadline = secondTask.deadline ?? "9999-12-31";
    return firstDeadline.localeCompare(secondDeadline);
  });
}

export function isPriority(value: unknown): value is Priority {
  return value === "urgent" || value === "high" || value === "normal" || value === "low";
}

export function parseDuration(value: string) {
  const parsed = Number(value);
  const rounded = Math.round(parsed);
  return Number.isFinite(parsed) && rounded > 0 && rounded <= MAX_TASK_DURATION_MINUTES ? rounded : null;
}

export function createTaskId(randomUuid: () => string = () => crypto.randomUUID()) {
  return `task-${randomUuid()}`;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isNullableIsoDate(value: unknown): value is string | null {
  return value === null || isIsoDate(value);
}

function isValidBlockMinutes(value: unknown) {
  return value === null || (
    typeof value === "number"
    && Number.isFinite(value)
    && Math.round(value) >= 5
    && Math.round(value) <= MAX_TASK_DURATION_MINUTES
  );
}

function isTask(value: unknown): value is Task {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Task>;
  return (
    typeof candidate.id === "string" && candidate.id.trim().length > 0 && candidate.id.length <= MAX_TASK_ID_LENGTH &&
    typeof candidate.title === "string" && candidate.title.trim().length > 0 &&
    candidate.title.length <= MAX_TASK_TITLE_LENGTH &&
    ((typeof candidate.duration === "number" && Number.isFinite(candidate.duration) && candidate.duration > 0 && candidate.duration <= MAX_TASK_DURATION_MINUTES) || candidate.duration === null) &&
    isNullableIsoDate(candidate.startDate) &&
    isNullableIsoDate(candidate.deadline) &&
    !(candidate.startDate && candidate.deadline && candidate.startDate > candidate.deadline) &&
    (typeof candidate.spaceId === "string" || candidate.spaceId === null) &&
    (typeof candidate.subSpaceId === "string" || candidate.subSpaceId === null) &&
    isValidBlockMinutes(candidate.minBlockMinutes ?? null) &&
    isValidBlockMinutes(candidate.maxBlockMinutes ?? null) &&
    isPriority(candidate.priority) &&
    (candidate.status === "open" || candidate.status === "focus" || candidate.status === "done")
  );
}

export function normalizeStoredTask(value: unknown): Task | null {
  if (isTask(value)) {
    const calendarVisibility = value.calendarVisibility === "default" || value.calendarVisibility === "public" || value.calendarVisibility === "private"
      ? value.calendarVisibility
      : null;
    const calendarTransparency = value.calendarTransparency === "default" || value.calendarTransparency === "opaque" || value.calendarTransparency === "transparent"
      ? value.calendarTransparency
      : null;
    const minBlockMinutes = typeof value.minBlockMinutes === "number" && Number.isFinite(value.minBlockMinutes) && value.minBlockMinutes >= 5 && value.minBlockMinutes <= MAX_TASK_DURATION_MINUTES ? Math.round(value.minBlockMinutes) : null;
    const maxCandidate = typeof value.maxBlockMinutes === "number" && Number.isFinite(value.maxBlockMinutes) && value.maxBlockMinutes >= 5 && value.maxBlockMinutes <= MAX_TASK_DURATION_MINUTES ? Math.round(value.maxBlockMinutes) : null;
    return {
      ...value,
      subSpaceId: value.spaceId ? value.subSpaceId : null,
      autoSchedule: true,
      minBlockMinutes,
      maxBlockMinutes: maxCandidate !== null && minBlockMinutes !== null && maxCandidate < minBlockMinutes ? null : maxCandidate,
      calendarVisibility,
      calendarTransparency,
    };
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    id?: unknown;
    title?: unknown;
    duration?: unknown;
    startDate?: unknown;
    deadline?: unknown;
    priority?: unknown;
    status?: unknown;
    minBlockMinutes?: unknown;
    maxBlockMinutes?: unknown;
    calendarVisibility?: unknown;
    calendarTransparency?: unknown;
    spaceId?: unknown;
    subSpaceId?: unknown;
  };

  if (
    typeof candidate.id !== "string" ||
    !candidate.id.trim() ||
    candidate.id.length > MAX_TASK_ID_LENGTH ||
    typeof candidate.title !== "string" ||
    !candidate.title.trim() ||
    candidate.title.length > MAX_TASK_TITLE_LENGTH ||
    (candidate.status !== "open" && candidate.status !== "focus" && candidate.status !== "done")
  ) {
    return null;
  }

  const duration =
    typeof candidate.duration === "number"
      ? candidate.duration
      : typeof candidate.duration === "string"
        ? parseDuration(candidate.duration)
        : null;
  if (duration !== null && (!Number.isFinite(duration) || duration <= 0 || duration > MAX_TASK_DURATION_MINUTES)) {
    return null;
  }
  const startDate = candidate.startDate === null || candidate.startDate === ""
    ? null
    : isIsoDate(candidate.startDate)
      ? candidate.startDate
      : undefined;
  const deadline = candidate.deadline === null || candidate.deadline === ""
    ? null
    : isIsoDate(candidate.deadline)
      ? candidate.deadline
      : undefined;
  if (startDate === undefined || deadline === undefined || (startDate && deadline && startDate > deadline)) {
    return null;
  }
  const minBlockMinutes = typeof candidate.minBlockMinutes === "number" && Number.isFinite(candidate.minBlockMinutes) && candidate.minBlockMinutes >= 5 && candidate.minBlockMinutes <= MAX_TASK_DURATION_MINUTES
    ? Math.round(candidate.minBlockMinutes)
    : null;
  const maxCandidate = typeof candidate.maxBlockMinutes === "number" && Number.isFinite(candidate.maxBlockMinutes) && candidate.maxBlockMinutes >= 5 && candidate.maxBlockMinutes <= MAX_TASK_DURATION_MINUTES
    ? Math.round(candidate.maxBlockMinutes)
    : null;

  const spaceId = typeof candidate.spaceId === "string" ? candidate.spaceId : null;
  return {
    id: candidate.id,
    title: candidate.title.trim(),
    duration,
    startDate,
    deadline,
    spaceId,
    subSpaceId: spaceId && typeof candidate.subSpaceId === "string" ? candidate.subSpaceId : null,
    priority: isPriority(candidate.priority) ? candidate.priority : "normal",
    status: candidate.status,
    autoSchedule: true,
    minBlockMinutes,
    maxBlockMinutes: maxCandidate !== null && minBlockMinutes !== null && maxCandidate < minBlockMinutes ? null : maxCandidate,
    calendarVisibility: candidate.calendarVisibility === "default" || candidate.calendarVisibility === "public" || candidate.calendarVisibility === "private"
      ? candidate.calendarVisibility
      : null,
    calendarTransparency: candidate.calendarTransparency === "default" || candidate.calendarTransparency === "opaque" || candidate.calendarTransparency === "transparent"
      ? candidate.calendarTransparency
      : null,
  };
}

export function mapTasksToSpaces(tasks: ReadonlyArray<Task>, spaces: ReadonlyArray<Space>) {
  // Tasks and Spaces load independently. An empty list is not proof that a
  // saved Space/Sub-space was deleted, so wait for the authoritative Space
  // response before normalizing those references.
  if (spaces.length === 0) {
    return tasks;
  }

  const activeSpace = spaces.find((space) => space.status === "active");
  return tasks.map((task) => {
    const savedSpace = spaces.find((space) => space.id === task.spaceId);
    const hasSavedSpace = spaces.some((space) => space.id === task.spaceId);
    const targetSpace = savedSpace ?? (!task.spaceId || !hasSavedSpace ? activeSpace : null);
    if (!targetSpace) {
      return task.subSpaceId === null ? task : { ...task, subSpaceId: null };
    }
    const savedSubSpace = targetSpace.subSpaces.find((subSpace) => (
      subSpace.id === task.subSpaceId
      && (subSpace.status === "active" || (task.status === "done" && subSpace.status === "archived"))
    ));
    const nextSubSpaceId = savedSubSpace?.id ?? null;
    return task.spaceId === targetSpace.id && task.subSpaceId === nextSubSpaceId
      ? task
      : { ...task, spaceId: targetSpace.id, subSpaceId: nextSubSpaceId };
  });
}

export function getDurationParts(duration: number | null) {
  if (duration === null) {
    return null;
  }

  const totalMinutes = Math.max(0, Math.round(duration));
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

export function formatDuration(duration: number | null) {
  const parts = getDurationParts(duration);
  if (!parts) {
    return "";
  }

  const hours = parts.hours > 0 ? `${String(parts.hours).padStart(2, "0")}h ` : "";
  return `${hours}${String(parts.minutes).padStart(2, "0")}m`;
}

export function getTaskBucket(task: Task, today = CALENDAR_DATE): TaskBucket {
  if (!task.startDate && !task.deadline) {
    return "backlog";
  }

  if (task.status !== "done" && task.deadline && task.deadline < today) {
    return "today";
  }

  const canStartToday = task.startDate ? task.startDate <= today : !task.deadline;
  const isDueToday = task.deadline === today;

  if (isDueToday || (canStartToday && (!task.deadline || task.deadline >= today))) {
    return "today";
  }

  if ((task.startDate && task.startDate > today) || (task.deadline && task.deadline > today)) {
    return "upcoming";
  }

  return "backlog";
}

export function matchesTaskBucket(task: Task, bucket: TaskBucket, today = CALENDAR_DATE) {
  return bucket === "all" || getTaskBucket(task, today) === bucket;
}

function toIsoDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function getTimeMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function getDatePartsInTimeZone(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

function getDefaultPlanningTimezone() {
  // Planning dates must be deterministic on the server and in every browser.
  // The account setting is the normal path; UTC is the explicit legacy
  // fallback instead of silently adopting whichever device is open.
  return "UTC";
}

export function getLogicalDate(
  timestamp: number,
  settings: Pick<UserSettings, "nightOwlMode" | "dayStartTime"> & Partial<Pick<UserSettings, "planningTimezone">>,
  timeZone = settings.planningTimezone ?? getDefaultPlanningTimezone(),
) {
  const dateParts = getDatePartsInTimeZone(timestamp, timeZone);
  let date = dateParts.date;

  if (settings.nightOwlMode && dateParts.minutes < getTimeMinutes(settings.dayStartTime)) {
    date = addCalendarDays(date, -1);
  }

  return date;
}

export function addCalendarDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return toIsoDate(date);
}

export function getDueDatePresets(today = CALENDAR_DATE) {
  return [
    { label: "Today", value: today },
    { label: "Tomorrow", value: addCalendarDays(today, 1) },
    { label: "Next week", value: addCalendarDays(today, 7) },
  ] as const;
}

function getMonthEnd(value: string) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month, 0));
  return toIsoDate(date);
}

function getQuarterEnd(value: string) {
  const [year, month] = value.split("-").map(Number);
  const quarterEndMonth = Math.floor((month - 1) / 3) * 3 + 3;
  const date = new Date(Date.UTC(year, quarterEndMonth, 0));
  return toIsoDate(date);
}

function getYearEnd(value: string) {
  return `${value.slice(0, 4)}-12-31`;
}

function getDaysBetween(start: string, end: string) {
  const startTime = Date.parse(`${start}T00:00:00Z`);
  const endTime = Date.parse(`${end}T00:00:00Z`);
  return Math.max(0, Math.round((endTime - startTime) / 86_400_000));
}

function getUpcomingGroupDefinitions(today = CALENDAR_DATE) {
  const tomorrow = addCalendarDays(today, 1);
  const weekEnd = addCalendarDays(today, 7);
  const monthEnd = getMonthEnd(today);
  const quarterEnd = getQuarterEnd(today);
  const yearEnd = getYearEnd(today);
  const weekStart = addCalendarDays(today, 2);
  const monthStart = addCalendarDays(weekEnd, 1);
  const quarterStart = addCalendarDays(monthEnd, 1);
  const yearStart = addCalendarDays(quarterEnd, 1);
  const farAwayStart = addCalendarDays(yearEnd, 1);

  return [
    { id: "tomorrow", label: "Tomorrow", helper: "1 day away", start: tomorrow, end: tomorrow, dateLabel: formatShortDate(tomorrow) },
    { id: "this-week", label: "This week", helper: `${getDaysBetween(today, weekEnd)} days left`, start: weekStart, end: weekEnd, dateLabel: `${formatShortDate(weekStart)} – ${formatShortDate(weekEnd)}` },
    { id: "this-month", label: "This month", helper: `${getDaysBetween(today, monthEnd)} days left`, start: monthStart, end: monthEnd, dateLabel: `${formatShortDate(monthStart)} – ${formatShortDate(monthEnd)}` },
    { id: "this-quarter", label: "This quarter", helper: `${getDaysBetween(today, quarterEnd)} days left`, start: quarterStart, end: quarterEnd, dateLabel: `${formatShortDate(quarterStart)} – ${formatShortDate(quarterEnd)}` },
    { id: "this-year", label: "This year", helper: `${getDaysBetween(today, yearEnd)} days left`, start: yearStart, end: yearEnd, dateLabel: `${formatShortDate(yearStart)} – ${formatShortDate(yearEnd)}` },
    { id: "far-away", label: "Far away", helper: "Beyond this year", start: farAwayStart, end: "9999-12-31", dateLabel: "Beyond this year" },
  ] as const;
}

export function getUpcomingGroup(task: Task, today = CALENDAR_DATE): UpcomingGroupId {
  const taskDate = task.startDate ?? task.deadline ?? "9999-12-31";
  const definitions = getUpcomingGroupDefinitions(today);

  if (taskDate === definitions[0].end) {
    return definitions[0].id;
  }

  return definitions.find((definition) => taskDate <= definition.end)?.id ?? "far-away";
}

export function groupUpcomingTasks(tasks: ReadonlyArray<Task>, today = CALENDAR_DATE) {
  const definitions = getUpcomingGroupDefinitions(today);
  return definitions
    .map((definition): UpcomingTaskGroup => ({
      id: definition.id,
      label: definition.label,
      helper: definition.helper,
      dateLabel: definition.dateLabel,
      tasks: tasks.filter((task) => getUpcomingGroup(task, today) === definition.id),
    }))
    .filter((group) => group.tasks.length > 0);
}

export function replaceBucketOrder(tasks: ReadonlyArray<Task>, orderedBucket: ReadonlyArray<Task>) {
  const bucketIds = new Set(orderedBucket.map((task) => task.id));
  let bucketIndex = 0;

  return tasks.map((task) => {
    if (!bucketIds.has(task.id)) {
      return task;
    }

    const replacement = orderedBucket[bucketIndex];
    bucketIndex += 1;
    return replacement ?? task;
  });
}

export function formatShortDate(value: string | null) {
  if (!value) {
    return "";
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return "";
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }

  return `${String(day).padStart(2, "0")} ${shortMonthNames[month - 1]} ${String(year).slice(-2)}`;
}

export function formatHeaderDateTime(
  timestamp: number | null,
  logicalDate = CALENDAR_DATE,
  timeZone = getDefaultPlanningTimezone(),
) {
  if (timestamp === null) {
    return null;
  }

  const actualDate = new Date(timestamp);
  const contextDate = new Date(`${logicalDate}T12:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat(undefined, { timeZone, weekday: "long" }).format(contextDate),
    date: formatShortDate(logicalDate),
    time: new Intl.DateTimeFormat(undefined, { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).format(actualDate),
  };
}

export function parseShortDate(value: string) {
  const match = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2}|\d{4})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = shortMonthNames.findIndex((name) => name.toLowerCase() === match[2].toLowerCase());
  const rawYear = Number(match[3]);
  const year = match[3].length === 2 ? 2000 + rawYear : rawYear;
  const date = new Date(year, month, day);

  if (
    month < 0 ||
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isDeadlineOverdue(deadline: string | null, status: Task["status"], today = CALENDAR_DATE) {
  return Boolean(deadline && status !== "done" && deadline < today);
}

export function ensureSingleFocus(tasks: ReadonlyArray<Task>) {
  const existingFocusIndex = tasks.findIndex((task) => task.status === "focus");
  const nextFocusIndex =
    existingFocusIndex >= 0 ? existingFocusIndex : tasks.findIndex((task) => task.status !== "done");

  return tasks.map((task, index): Task => {
    if (task.status === "focus" && index !== nextFocusIndex) {
      return { ...task, status: "open" };
    }

    if (index === nextFocusIndex && task.status !== "done") {
      return { ...task, status: "focus" };
    }

    return task;
  });
}

export function areTasksEquivalent(firstTask: Task, secondTask: Task) {
  return firstTask.id === secondTask.id
    && firstTask.title === secondTask.title
    && firstTask.duration === secondTask.duration
    && firstTask.startDate === secondTask.startDate
    && firstTask.deadline === secondTask.deadline
    && firstTask.spaceId === secondTask.spaceId
    && firstTask.subSpaceId === secondTask.subSpaceId
    && firstTask.priority === secondTask.priority
    && firstTask.status === secondTask.status
    && firstTask.autoSchedule === secondTask.autoSchedule
    && firstTask.minBlockMinutes === secondTask.minBlockMinutes
    && firstTask.maxBlockMinutes === secondTask.maxBlockMinutes
    && firstTask.calendarVisibility === secondTask.calendarVisibility
    && firstTask.calendarTransparency === secondTask.calendarTransparency;
}

export function areTaskListsEquivalent(first: ReadonlyArray<Task>, second: ReadonlyArray<Task>) {
  return first.length === second.length
    && first.every((task, index) => Boolean(second[index] && areTasksEquivalent(task, second[index])));
}

export function areTaskOrdersEquivalent(first: ReadonlyArray<Task>, second: ReadonlyArray<Task>) {
  return first.length === second.length
    && first.every((task, index) => second[index]?.id === task.id);
}

export type TaskSaveConflict = {
  taskId: string;
  kind: "remote_deleted" | "both_changed" | "id_collision";
};

/**
 * Three-way reconciliation for a save that may race another tab/device.
 * Remote deletions are never resurrected, unrelated remote additions survive,
 * and a same-task conflict keeps the latest cloud value instead of silently
 * overwriting it with a stale tab.
 */
export function reconcileTaskSave(
  baselineTasks: ReadonlyArray<Task>,
  localTasks: ReadonlyArray<Task>,
  remoteTasks: ReadonlyArray<Task>,
  locallyDeletedTaskIds: ReadonlyArray<string> = [],
  options: { preferRemoteOrder?: boolean } = {},
) {
  const baselineById = new Map(baselineTasks.map((task) => [task.id, task]));
  const localById = new Map(localTasks.map((task) => [task.id, task]));
  const remoteById = new Map(remoteTasks.map((task) => [task.id, task]));
  const deletedIds = new Set(locallyDeletedTaskIds);
  const resolvedById = new Map<string, Task>();
  const conflicts: TaskSaveConflict[] = [];
  const allIds = new Set([...baselineById.keys(), ...localById.keys(), ...remoteById.keys(), ...deletedIds]);

  for (const taskId of allIds) {
    const baseline = baselineById.get(taskId);
    const local = localById.get(taskId);
    const remote = remoteById.get(taskId);
    const locallyDeleted = deletedIds.has(taskId) || Boolean(baseline && !local);

    if (locallyDeleted) {
      deletedIds.add(taskId);
      continue;
    }

    if (!baseline && local) {
      if (remote && !areTasksEquivalent(local, remote)) {
        resolvedById.set(taskId, remote);
        conflicts.push({ taskId, kind: "id_collision" });
      } else {
        resolvedById.set(taskId, local);
      }
      continue;
    }

    if (baseline && local) {
      if (!remote) {
        conflicts.push({ taskId, kind: "remote_deleted" });
        continue;
      }

      const localChanged = !areTasksEquivalent(local, baseline);
      const remoteChanged = !areTasksEquivalent(remote, baseline);
      if (localChanged && remoteChanged && !areTasksEquivalent(local, remote)) {
        resolvedById.set(taskId, remote);
        conflicts.push({ taskId, kind: "both_changed" });
      } else {
        resolvedById.set(taskId, localChanged ? local : remote);
      }
      continue;
    }

    if (remote) {
      resolvedById.set(taskId, remote);
    }
  }

  const orderedIds = options.preferRemoteOrder
    ? [
      ...remoteTasks.map((task) => task.id),
      ...localTasks.map((task) => task.id).filter((taskId) => !remoteById.has(taskId)),
    ]
    : [
      ...localTasks.map((task) => task.id),
      ...remoteTasks.map((task) => task.id).filter((taskId) => !localById.has(taskId)),
    ];
  const resolvedTasks = ensureSingleFocus(
    orderedIds
      .map((taskId) => resolvedById.get(taskId))
      .filter((task): task is Task => Boolean(task)),
  );

  return {
    tasks: resolvedTasks,
    deletedTaskIds: [...deletedIds],
    conflicts,
  };
}

export function mergeRemoteTasks(
  localTasks: ReadonlyArray<Task>,
  currentTasks: ReadonlyArray<Task>,
  remoteTasks: ReadonlyArray<Task>,
) {
  const localById = new Map(localTasks.map((task) => [task.id, task]));
  const remoteById = new Map(remoteTasks.map((task) => [task.id, task]));
  const locallyDeletedIds = new Set(
    localTasks
      .filter((task) => !currentTasks.some((currentTask) => currentTask.id === task.id))
      .map((task) => task.id),
  );
  const locallyChangedIds = new Set(
    currentTasks
      .filter((task) => {
        const localTask = localById.get(task.id);
        return !localTask || !areTasksEquivalent(task, localTask);
      })
      .map((task) => task.id),
  );

  if (locallyDeletedIds.size === 0 && locallyChangedIds.size === 0) {
    return { tasks: ensureSingleFocus(remoteTasks), deletedTaskIds: [] as ReadonlyArray<string> };
  }

  const mergedTasks: Task[] = [];
  const seenIds = new Set<string>();
  for (const currentTask of currentTasks) {
    if (locallyDeletedIds.has(currentTask.id)) {
      continue;
    }

    const nextTask = locallyChangedIds.has(currentTask.id)
      ? currentTask
      : remoteById.get(currentTask.id);
    if (nextTask) {
      mergedTasks.push(nextTask);
      seenIds.add(nextTask.id);
    }
  }

  for (const remoteTask of remoteTasks) {
    if (!seenIds.has(remoteTask.id) && !locallyDeletedIds.has(remoteTask.id)) {
      mergedTasks.push(remoteTask);
    }
  }

  return {
    tasks: ensureSingleFocus(mergedTasks),
    deletedTaskIds: [...locallyDeletedIds],
  };
}

export type TaskStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function getUserStorageKey(userId: string) {
  return `${USER_STORAGE_KEY_PREFIX}${userId}`;
}

export function getUserTaskBaselineStorageKey(userId: string) {
  return `${USER_TASK_BASELINE_STORAGE_KEY_PREFIX}${userId}`;
}

export function writeUserTasks(storage: TaskStorage, userId: string, tasks: ReadonlyArray<Task>) {
  try {
    storage.setItem(getUserStorageKey(userId), JSON.stringify(tasks));
  } catch {
    // Cloud sync remains the source of truth if browser storage is unavailable.
  }
}

export function writeUserTaskBaseline(storage: TaskStorage, userId: string, tasks: ReadonlyArray<Task>) {
  try {
    storage.setItem(getUserTaskBaselineStorageKey(userId), JSON.stringify(tasks));
  } catch {
    // The cloud remains the source of truth if browser storage is unavailable.
  }
}

export function readUserTasks(storage: TaskStorage, userId: string) {
  try {
    const savedTasks = storage.getItem(getUserStorageKey(userId));
    if (!savedTasks) {
      return [];
    }

    const parsedTasks: unknown = JSON.parse(savedTasks);
    if (!Array.isArray(parsedTasks)) {
      return [];
    }

    const normalizedTasks = parsedTasks.map(normalizeStoredTask).filter((task): task is Task => task !== null);
    return ensureSingleFocus(normalizedTasks);
  } catch {
    return [];
  }
}

/**
 * Returns null when no successful cloud baseline has been recorded yet. An
 * empty array is a valid baseline for an empty cloud account.
 */
export function readUserTaskBaseline(storage: TaskStorage, userId: string): ReadonlyArray<Task> | null {
  try {
    const savedTasks = storage.getItem(getUserTaskBaselineStorageKey(userId));
    if (savedTasks === null) {
      return null;
    }

    const parsedTasks: unknown = JSON.parse(savedTasks);
    if (!Array.isArray(parsedTasks)) {
      return null;
    }

    const normalizedTasks = parsedTasks.map(normalizeStoredTask).filter((task): task is Task => task !== null);
    return ensureSingleFocus(normalizedTasks);
  } catch {
    return null;
  }
}

export function clearUserTasks(storage: TaskStorage, userId: string) {
  try {
    storage.removeItem(getUserStorageKey(userId));
    storage.removeItem(getUserTaskBaselineStorageKey(userId));
  } catch {
    // The cloud remains the source of truth if browser storage is unavailable.
  }
}
