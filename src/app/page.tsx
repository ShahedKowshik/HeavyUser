"use client";

import {
  DragEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Archive,
  Bell,
  CalendarRange,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleMinus,
  Clock3,
  Flag,
  Flame,
  ListTodo,
  Pencil,
  Plus,
  TriangleAlert,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useAuth } from "@/components/auth-provider";
import { ProfileMenu } from "@/components/profile-menu";
import { GoogleCalendarPanel } from "@/components/google-calendar-panel";
import { getAppPath, publicBasePath } from "@/lib/supabase/config";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadRemoteTasks, persistRemoteTasks } from "@/lib/supabase/tasks";
import type { CalendarTransparency, CalendarVisibility, Priority, Task, TaskScheduleState } from "@/lib/tasks";
import type { ScheduleBlockSnapshot, TaskScheduleStatus } from "@/lib/scheduler/types";
import type { UserSettings } from "@/lib/supabase/settings";
type TaskBucket = "backlog" | "today" | "upcoming";
type InlineEditField = "title";

const publicAssetPath = publicBasePath;
const calendarDate = "2026-08-01";
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

const priorityOptions = [
  { value: "urgent", label: "🔥 Urgent" },
  { value: "high", label: "🟡 High" },
  { value: "normal", label: "🟢 Normal" },
  { value: "low", label: "▼ Low" },
] satisfies ReadonlyArray<{ value: Priority; label: string }>;

const durationPresets = [
  { minutes: 15, label: "15m" },
  { minutes: 30, label: "30m" },
  { minutes: 45, label: "45m" },
  { minutes: 60, label: "1h" },
  { minutes: 90, label: "1h 30m" },
  { minutes: 120, label: "2h" },
] as const;

const taskBucketOptions = [
  { value: "today", label: "Today", icon: CalendarRange },
  { value: "upcoming", label: "Upcoming", icon: ListTodo },
  { value: "backlog", label: "Backlog", icon: Archive },
] as const;

const priorityOrder: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// Only account-scoped browser backups are valid. The v2 namespace intentionally
// does not read any unscoped cache written by older versions of the app.
const userStorageKeyPrefix = "heavyuser:tasks:v2:";
const MAX_TASK_TITLE_LENGTH = 240;
const MAX_TASK_DURATION_MINUTES = 10080;


function sortTasks(tasks: ReadonlyArray<Task>) {
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

function isPriority(value: unknown): value is Priority {
  return value === "urgent" || value === "high" || value === "normal" || value === "low";
}

function isTask(value: unknown): value is Task {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Task>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    candidate.title.length <= MAX_TASK_TITLE_LENGTH &&
    ((typeof candidate.duration === "number" && Number.isFinite(candidate.duration) && candidate.duration > 0 && candidate.duration <= MAX_TASK_DURATION_MINUTES) || candidate.duration === null) &&
    (typeof candidate.startDate === "string" || candidate.startDate === null) &&
    (typeof candidate.deadline === "string" || candidate.deadline === null) &&
    isPriority(candidate.priority) &&
    (candidate.status === "open" || candidate.status === "focus" || candidate.status === "done")
  );
}

function normalizeStoredTask(value: unknown): Task | null {
  if (isTask(value)) {
    const calendarVisibility = value.calendarVisibility === "default" || value.calendarVisibility === "public" || value.calendarVisibility === "private"
      ? value.calendarVisibility
      : null;
    const calendarTransparency = value.calendarTransparency === "default" || value.calendarTransparency === "opaque" || value.calendarTransparency === "transparent"
      ? value.calendarTransparency
      : null;
    const minBlockMinutes = typeof value.minBlockMinutes === "number" && Number.isFinite(value.minBlockMinutes) && value.minBlockMinutes >= 5 ? Math.round(value.minBlockMinutes) : null;
    const maxCandidate = typeof value.maxBlockMinutes === "number" && Number.isFinite(value.maxBlockMinutes) && value.maxBlockMinutes >= 5 ? Math.round(value.maxBlockMinutes) : null;
    return {
      ...value,
      autoSchedule: value.autoSchedule !== false,
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
    autoSchedule?: unknown;
    minBlockMinutes?: unknown;
    maxBlockMinutes?: unknown;
    calendarVisibility?: unknown;
    calendarTransparency?: unknown;
  };

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.title !== "string" ||
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
  const minBlockMinutes = typeof candidate.minBlockMinutes === "number" && Number.isFinite(candidate.minBlockMinutes) && candidate.minBlockMinutes >= 5
    ? Math.round(candidate.minBlockMinutes)
    : null;
  const maxCandidate = typeof candidate.maxBlockMinutes === "number" && Number.isFinite(candidate.maxBlockMinutes) && candidate.maxBlockMinutes >= 5
    ? Math.round(candidate.maxBlockMinutes)
    : null;

  return {
    id: candidate.id,
    title: candidate.title,
    duration,
    startDate: typeof candidate.startDate === "string" && candidate.startDate ? candidate.startDate : null,
    deadline: typeof candidate.deadline === "string" && candidate.deadline ? candidate.deadline : null,
    priority: isPriority(candidate.priority) ? candidate.priority : "normal",
    status: candidate.status,
    autoSchedule: candidate.autoSchedule !== false,
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

function getDurationParts(duration: number | null) {
  if (duration === null) {
    return null;
  }

  const totalMinutes = Math.max(0, Math.round(duration));
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

function formatDuration(duration: number | null) {
  const parts = getDurationParts(duration);
  if (!parts) {
    return "";
  }

  const hours = parts.hours > 0 ? `${String(parts.hours).padStart(2, "0")}h ` : "";
  return `${hours}${String(parts.minutes).padStart(2, "0")}m`;
}

const priorityLabels: Record<Priority, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

function formatTaskDueDate(deadline: string | null) {
  return formatShortDate(deadline);
}

const scheduleStateLabels: Record<TaskScheduleState, string> = {
  scheduled: "Scheduled",
  scheduling: "Scheduling",
  needs_duration: "Needs duration",
  at_risk: "At risk",
  locked: "Locked",
  awaiting_completion: "Awaiting completion",
  paused: "Paused",
  calendar_error: "Calendar error",
};

function getScheduleLabel(task: Task, status: TaskScheduleStatus | undefined) {
  if (task.status === "done") {
    return null;
  }
  if (task.duration === null) {
    return "Needs duration";
  }
  if (!task.autoSchedule) {
    return "Paused";
  }
  return status ? scheduleStateLabels[status.state] : "Scheduling";
}

function formatScheduleBlock(block: ScheduleBlockSnapshot) {
  const start = new Date(block.start);
  const end = new Date(block.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const date = start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const startTime = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const endTime = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return { date, time: `${startTime}–${endTime}` };
}

function PriorityIcon({ priority }: { priority: Priority }) {
  const Icon = {
    urgent: Flame,
    high: TriangleAlert,
    normal: CircleCheck,
    low: CircleMinus,
  }[priority];

    const iconSize = priority === "urgent" ? 17 : 15;
    return <Icon aria-hidden="true" size={iconSize} strokeWidth={2.2} />;
}

function getTaskBucket(task: Task, today = calendarDate): TaskBucket {
  if (!task.startDate && !task.deadline) {
    return "backlog";
  }

  // Keep overdue work in Today so it remains visible without a separate view.
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

type UpcomingGroupId = "tomorrow" | "this-week" | "this-month" | "this-quarter" | "this-year" | "far-away";

type UpcomingTaskGroup = {
  id: UpcomingGroupId | "all";
  label: string | null;
  helper: string;
  dateLabel: string;
  tasks: ReadonlyArray<Task>;
};

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getTimeMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function getLogicalDate(timestamp: number, settings: UserSettings) {
  const date = new Date(timestamp);
  const currentMinutes = date.getHours() * 60 + date.getMinutes();

  if (settings.nightOwlMode && currentMinutes < getTimeMinutes(settings.dayStartTime)) {
    date.setDate(date.getDate() - 1);
  }

  return toIsoDate(date);
}

function addCalendarDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

function getDueDatePresets(today = calendarDate) {
  return [
    { label: "Today", value: today },
    { label: "Tomorrow", value: addCalendarDays(today, 1) },
    { label: "Next week", value: addCalendarDays(today, 7) },
  ] as const;
}

function getMonthEnd(value: string) {
  const date = new Date(`${value}T12:00:00`);
  date.setMonth(date.getMonth() + 1, 0);
  return toIsoDate(date);
}

function getQuarterEnd(value: string) {
  const date = new Date(`${value}T12:00:00`);
  const quarterEndMonth = Math.floor(date.getMonth() / 3) * 3 + 2;
  date.setMonth(quarterEndMonth + 1, 0);
  return toIsoDate(date);
}

function getYearEnd(value: string) {
  return `${value.slice(0, 4)}-12-31`;
}

function getDaysBetween(start: string, end: string) {
  const startTime = new Date(`${start}T12:00:00`).getTime();
  const endTime = new Date(`${end}T12:00:00`).getTime();
  return Math.max(0, Math.round((endTime - startTime) / 86_400_000));
}

function getUpcomingGroupDefinitions(today = calendarDate) {
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
    {
      id: "tomorrow",
      label: "Tomorrow",
      helper: "1 day away",
      start: tomorrow,
      end: tomorrow,
      dateLabel: formatShortDate(tomorrow),
    },
    {
      id: "this-week",
      label: "This week",
      helper: `${getDaysBetween(today, weekEnd)} days left`,
      start: weekStart,
      end: weekEnd,
      dateLabel: `${formatShortDate(weekStart)} – ${formatShortDate(weekEnd)}`,
    },
    {
      id: "this-month",
      label: "This month",
      helper: `${getDaysBetween(today, monthEnd)} days left`,
      start: monthStart,
      end: monthEnd,
      dateLabel: `${formatShortDate(monthStart)} – ${formatShortDate(monthEnd)}`,
    },
    {
      id: "this-quarter",
      label: "This quarter",
      helper: `${getDaysBetween(today, quarterEnd)} days left`,
      start: quarterStart,
      end: quarterEnd,
      dateLabel: `${formatShortDate(quarterStart)} – ${formatShortDate(quarterEnd)}`,
    },
    {
      id: "this-year",
      label: "This year",
      helper: `${getDaysBetween(today, yearEnd)} days left`,
      start: yearStart,
      end: yearEnd,
      dateLabel: `${formatShortDate(yearStart)} – ${formatShortDate(yearEnd)}`,
    },
    {
      id: "far-away",
      label: "Far away",
      helper: "Beyond this year",
      start: farAwayStart,
      end: "9999-12-31",
      dateLabel: "Beyond this year",
    },
  ] as const;
}

function getUpcomingGroup(task: Task, today = calendarDate): UpcomingGroupId {
  const taskDate = task.startDate ?? task.deadline ?? "9999-12-31";
  const definitions = getUpcomingGroupDefinitions(today);

  if (taskDate === definitions[0].end) {
    return definitions[0].id;
  }

  return definitions.find((definition) => taskDate <= definition.end)?.id ?? "far-away";
}

function groupUpcomingTasks(tasks: ReadonlyArray<Task>, today = calendarDate) {
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

function replaceBucketOrder(tasks: ReadonlyArray<Task>, orderedBucket: ReadonlyArray<Task>) {
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

function formatShortDate(value: string | null) {
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
  const date = new Date(year, month - 1, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return "";
  }

  return `${String(day).padStart(2, "0")} ${shortMonthNames[month - 1]} ${String(year).slice(-2)}`;
}

function formatHeaderDateTime(timestamp: number | null, logicalDate = calendarDate) {
  if (timestamp === null) {
    return null;
  }

  const actualDate = new Date(timestamp);
  const contextDate = new Date(`${logicalDate}T12:00:00`);
  return {
    weekday: contextDate.toLocaleDateString(undefined, { weekday: "long" }),
    date: formatShortDate(logicalDate),
    time: actualDate.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true }),
  };
}

function parseShortDate(value: string) {
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

type DateFieldProps = {
  ariaLabel: string;
  className: string;
  value: string;
  onChange: (value: string) => void;
};

function DateField({ ariaLabel, className, value, onChange }: DateFieldProps) {
  const [draft, setDraft] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const nativePickerRef = useRef<HTMLInputElement | null>(null);

  function commitDraft(nextValue: string) {
    if (!nextValue.trim()) {
      setDraft("");
      onChange("");
      return;
    }

    const parsedValue = parseShortDate(nextValue);
    if (parsedValue) {
      setDraft(formatShortDate(parsedValue));
      onChange(parsedValue);
      return;
    }

    setDraft(formatShortDate(value));
  }

  function openNativePicker() {
    const picker = nativePickerRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!picker) {
      return;
    }

    if (typeof picker.showPicker === "function") {
      picker.showPicker();
      return;
    }

    picker.click();
  }

  return (
    <span className="hu-date-field">
      <input
        aria-label={ariaLabel}
        className={className}
        inputMode="text"
        onFocus={() => {
          setDraft(formatShortDate(value));
          setIsEditing(true);
        }}
        onBlur={(event) => {
          commitDraft(event.target.value);
          setIsEditing(false);
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          if (!event.target.value.trim()) {
            onChange("");
          } else {
            const parsedValue = parseShortDate(event.target.value);
            if (parsedValue) {
              onChange(parsedValue);
            }
          }
        }}
        placeholder="DD MMM YY"
        type="text"
        value={isEditing ? draft : formatShortDate(value)}
      />
      <button
        aria-label={`Choose ${ariaLabel.toLowerCase()}`}
        className="hu-date-picker-button"
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={openNativePicker}
      >
        <CalendarDays aria-hidden="true" size={13} />
      </button>
      <input
        aria-hidden="true"
        className="hu-date-picker-native"
        ref={nativePickerRef}
        tabIndex={-1}
        type="date"
        value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setDraft(formatShortDate(event.target.value));
            setIsEditing(false);
          }}
      />
    </span>
  );
}

function isDeadlineOverdue(deadline: string | null, status: Task["status"], today = calendarDate) {
  return Boolean(deadline && status !== "done" && deadline < today);
}

function parseDuration(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_TASK_DURATION_MINUTES ? Math.round(parsed) : null;
}

function ensureSingleFocus(tasks: ReadonlyArray<Task>) {
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

function areTasksEquivalent(firstTask: Task, secondTask: Task) {
  return firstTask.id === secondTask.id
    && firstTask.title === secondTask.title
    && firstTask.duration === secondTask.duration
    && firstTask.startDate === secondTask.startDate
    && firstTask.deadline === secondTask.deadline
    && firstTask.priority === secondTask.priority
    && firstTask.status === secondTask.status
    && firstTask.autoSchedule === secondTask.autoSchedule
    && firstTask.minBlockMinutes === secondTask.minBlockMinutes
    && firstTask.maxBlockMinutes === secondTask.maxBlockMinutes
    && firstTask.calendarVisibility === secondTask.calendarVisibility
    && firstTask.calendarTransparency === secondTask.calendarTransparency;
}

function mergeRemoteTasks(
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
    return { tasks: ensureSingleFocus(remoteTasks), deletedTaskIds: [] };
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

function getUserStorageKey(userId: string) {
  return `${userStorageKeyPrefix}${userId}`;
}

function writeUserTasks(userId: string, tasks: ReadonlyArray<Task>) {
  try {
    window.localStorage.setItem(getUserStorageKey(userId), JSON.stringify(tasks));
  } catch {
    // Cloud sync remains the source of truth if browser storage is unavailable.
  }
}

function readUserTasks(userId: string) {
  try {
    const savedTasks = window.localStorage.getItem(getUserStorageKey(userId));
    if (!savedTasks) {
      return [];
    }

    const parsedTasks: unknown = JSON.parse(savedTasks);
    if (!Array.isArray(parsedTasks)) {
      return [];
    }

    const normalizedTasks = parsedTasks.map(normalizeStoredTask);
    if (!normalizedTasks.every((task): task is Task => task !== null)) {
      return [];
    }

    return ensureSingleFocus(normalizedTasks);
  } catch {
    return [];
  }
}

function clearUserTasks(userId: string) {
  try {
    window.localStorage.removeItem(getUserStorageKey(userId));
  } catch {
    // The cloud remains the source of truth if browser storage is unavailable.
  }
}


export default function Home() {
  const [tasks, setTasks] = useState<ReadonlyArray<Task>>([]);
  const tasksRef = useRef<ReadonlyArray<Task>>([]);
  tasksRef.current = tasks;
  const [supabaseClient] = useState(() => getSupabaseBrowserClient());
  const { status: authStatus, user: authUser, settings } = useAuth();
  const [remoteSyncReady, setRemoteSyncReady] = useState(false);
  const [pendingRemoteDeletes, setPendingRemoteDeletes] = useState<ReadonlyArray<string>>([]);
  const [isCustomOrder, setIsCustomOrder] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const [activeBucket, setActiveBucket] = useState<TaskBucket>("today");
  const [collapsedUpcomingGroupIds, setCollapsedUpcomingGroupIds] = useState<ReadonlyArray<UpcomingGroupId>>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDuration, setNewTaskDuration] = useState("");
  const [newTaskStartDate, setNewTaskStartDate] = useState("");
  const [newTaskDeadline, setNewTaskDeadline] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>("normal");
  const [taskComposerError, setTaskComposerError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDuration, setEditingDuration] = useState("");
  const [editingStartDate, setEditingStartDate] = useState("");
  const [editingDeadline, setEditingDeadline] = useState("");
  const [editingPriority, setEditingPriority] = useState<Priority>("normal");
  const [editingError, setEditingError] = useState("");
  const [editingAutoSchedule, setEditingAutoSchedule] = useState(true);
  const [editingMinBlockMinutes, setEditingMinBlockMinutes] = useState("");
  const [editingMaxBlockMinutes, setEditingMaxBlockMinutes] = useState("");
  const [editingCalendarVisibility, setEditingCalendarVisibility] = useState<CalendarVisibility | null>(null);
  const [editingCalendarTransparency, setEditingCalendarTransparency] = useState<CalendarTransparency | null>(null);
  const [scheduleStatuses, setScheduleStatuses] = useState<Record<string, TaskScheduleStatus>>({});
  const [scheduleBlocks, setScheduleBlocks] = useState<Record<string, ReadonlyArray<ScheduleBlockSnapshot>>>({});
  const [schedulerError, setSchedulerError] = useState("");
  const [inlineEdit, setInlineEdit] = useState<{
    taskId: string;
    field: InlineEditField;
  } | null>(null);
  const [priorityMenuTaskId, setPriorityMenuTaskId] = useState<string | null>(null);
  const [durationMenuTaskId, setDurationMenuTaskId] = useState<string | null>(null);
  const [dueDateMenuTaskId, setDueDateMenuTaskId] = useState<string | null>(null);
  const [durationHours, setDurationHours] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [dueDateDraft, setDueDateDraft] = useState("");
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const topbarRef = useRef<HTMLElement | null>(null);
  const newTaskInputRef = useRef<HTMLInputElement | null>(null);
  const priorityMenuRef = useRef<HTMLDivElement | null>(null);
  const durationMenuRef = useRef<HTMLDivElement | null>(null);
  const dueDateMenuRef = useRef<HTMLDivElement | null>(null);
  const schedulerRunTimerRef = useRef<number | null>(null);
  const schedulerRunInFlightRef = useRef(false);
  const schedulerRunQueuedRef = useRef(false);

  useEffect(() => () => {
    if (schedulerRunTimerRef.current !== null) {
      window.clearTimeout(schedulerRunTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const updateDateTime = () => setCurrentDateTime(Date.now());
    updateDateTime();
    const intervalId = window.setInterval(updateDateTime, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    function handleQuickAddShortcut(event: globalThis.KeyboardEvent) {
      if (event.key.toLowerCase() !== "q" || event.metaKey || event.ctrlKey || event.altKey || editingId) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      if (isAdding) {
        newTaskInputRef.current?.focus();
      } else {
        setIsAdding(true);
      }
    }

    document.addEventListener("keydown", handleQuickAddShortcut);
    return () => document.removeEventListener("keydown", handleQuickAddShortcut);
  }, [editingId, isAdding]);

  useEffect(() => {
    if (!isAdding) {
      return;
    }

    function handleTaskComposerKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setNewTaskTitle("");
      setNewTaskDuration("");
      setNewTaskStartDate("");
      setNewTaskDeadline("");
      setNewTaskPriority("normal");
      setIsAdding(false);
    }

    document.addEventListener("keydown", handleTaskComposerKeyDown);
    return () => document.removeEventListener("keydown", handleTaskComposerKeyDown);
  }, [isAdding]);

  useEffect(() => {
    if (isAdding) {
      newTaskInputRef.current?.focus();
    }
  }, [isAdding]);

  useEffect(() => {
    let isCancelled = false;

    const restoreTasks = async () => {
      if (!authUser || authStatus !== "signed_in") {
        return;
      }

      const localTasks = readUserTasks(authUser.id);
      setTasks([]);
      tasksRef.current = [];
      setRemoteSyncReady(false);
      setIsHydrated(false);
      setPendingRemoteDeletes([]);
      setIsCustomOrder(false);
      setEditingId(null);
      setScheduleStatuses({});
      setScheduleBlocks({});
      setSchedulerError("");

      if (isCancelled) {
        return;
      }

      // Show the account's local snapshot immediately. The remote response
      // remains authoritative below, while remoteSyncReady keeps this cached
      // snapshot from being written back before that response arrives.
      setTasks(localTasks);
      tasksRef.current = localTasks;
      setIsHydrated(true);

      if (!supabaseClient) {
        return;
      }

      try {
        const remoteTasks = await loadRemoteTasks(supabaseClient, authUser);
        if (isCancelled) {
          return;
        }

        const merged = mergeRemoteTasks(localTasks, tasksRef.current, remoteTasks);
        tasksRef.current = merged.tasks;
        setTasks(merged.tasks);
        if (merged.tasks.length === 0 && remoteTasks.length === 0) {
          clearUserTasks(authUser.id);
        } else {
          writeUserTasks(authUser.id, merged.tasks);
        }

        if (merged.deletedTaskIds.length > 0) {
          setPendingRemoteDeletes((currentIds) => [...new Set([...currentIds, ...merged.deletedTaskIds])]);
        }
        setRemoteSyncReady(true);
        void loadScheduleSnapshot();
      } catch {
        // Keep the local snapshot visible if Supabase is temporarily slow or
        // unavailable. A later account refresh can try the remote load again.
      }
    };

    void restoreTasks();
    return () => {
      isCancelled = true;
    };
  }, [authStatus, authUser, supabaseClient]);

  useEffect(() => {
    if (isHydrated && authUser) {
      writeUserTasks(authUser.id, tasks);
    }
  }, [authUser, isHydrated, tasks]);

  useEffect(() => {
    if (!supabaseClient || !authUser || !remoteSyncReady || !isHydrated) {
      return;
    }

    const deletedTaskIds = pendingRemoteDeletes;
    let isCancelled = false;

    const timeoutId = window.setTimeout(() => {
      void persistRemoteTasks(supabaseClient, authUser, tasks, deletedTaskIds)
      .then(() => {
        if (isCancelled) {
          return;
        }

        setPendingRemoteDeletes((currentIds) => {
          const nextIds = currentIds.filter((taskId) => !deletedTaskIds.includes(taskId));
          // Keep the same array reference when there is nothing to clear. The
          // persistence effect depends on this value, so returning a fresh
          // empty array would start another save after every successful save.
          return nextIds.length === currentIds.length ? currentIds : nextIds;
        });
        requestSchedulerRun();
      })
      .catch(() => undefined);
    }, 250);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
    // The scheduler helper is intentionally stable for this persistence lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, isHydrated, pendingRemoteDeletes, remoteSyncReady, supabaseClient, tasks]);

  useEffect(() => {
    if (!isNotificationsOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && topbarRef.current?.contains(event.target)) {
        return;
      }

      setIsNotificationsOpen(false);
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      setIsNotificationsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNotificationsOpen]);

  useEffect(() => {
    if (!priorityMenuTaskId && !durationMenuTaskId && !dueDateMenuTaskId) {
      return;
    }

    function handleTaskPopoverPointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        (priorityMenuRef.current?.contains(event.target) ||
          durationMenuRef.current?.contains(event.target) ||
          dueDateMenuRef.current?.contains(event.target))
      ) {
        return;
      }

      setPriorityMenuTaskId(null);
      setDurationMenuTaskId(null);
      setDueDateMenuTaskId(null);
    }

    function handleTaskPopoverKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setPriorityMenuTaskId(null);
        setDurationMenuTaskId(null);
        setDueDateMenuTaskId(null);
      }
    }

    document.addEventListener("pointerdown", handleTaskPopoverPointerDown);
    document.addEventListener("keydown", handleTaskPopoverKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handleTaskPopoverPointerDown);
      document.removeEventListener("keydown", handleTaskPopoverKeyDown);
    };
  }, [priorityMenuTaskId, durationMenuTaskId, dueDateMenuTaskId]);

  useEffect(() => {
    if (!editingId) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEditDialogKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      handleCancelEditing();
    }

    document.addEventListener("keydown", handleEditDialogKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEditDialogKeyDown);
    };
  }, [editingId]);

  function getAppToday() {
    return currentDateTime === null ? calendarDate : getLogicalDate(currentDateTime, settings);
  }

  async function loadScheduleSnapshot() {
    try {
      const response = await fetch(getAppPath("/api/scheduler/status"), { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setSchedulerError(body?.error ?? "Scheduling status could not be loaded.");
        return;
      }

      const body = (await response.json().catch(() => null)) as {
        statuses?: ReadonlyArray<TaskScheduleStatus>;
        blocks?: ReadonlyArray<ScheduleBlockSnapshot>;
      } | null;
      const nextStatuses: Record<string, TaskScheduleStatus> = {};
      for (const status of body?.statuses ?? []) {
        nextStatuses[status.taskId] = status;
      }
      const nextBlocks: Record<string, Array<ScheduleBlockSnapshot>> = {};
      for (const block of body?.blocks ?? []) {
        (nextBlocks[block.taskId] ??= []).push(block);
      }
      setScheduleStatuses(nextStatuses);
      setScheduleBlocks(nextBlocks);
    } catch {
      setSchedulerError("Scheduling status could not be loaded. We will try again.");
    }
  }

  useEffect(() => {
    // The event listener intentionally calls the schedule loader without
    // making the page rebind it on every render.
    const refreshScheduleSnapshot = () => {
      void loadScheduleSnapshot();
    };
    window.addEventListener("heavyuser:schedule-refresh", refreshScheduleSnapshot);
    return () => window.removeEventListener("heavyuser:schedule-refresh", refreshScheduleSnapshot);
  }, []);

  function requestSchedulerRun(delayMs = 400) {
    if (schedulerRunInFlightRef.current) {
      schedulerRunQueuedRef.current = true;
      return;
    }

    if (schedulerRunTimerRef.current !== null) {
      window.clearTimeout(schedulerRunTimerRef.current);
    }

    schedulerRunTimerRef.current = window.setTimeout(() => {
      schedulerRunTimerRef.current = null;
      if (schedulerRunInFlightRef.current) {
        schedulerRunQueuedRef.current = true;
        return;
      }

      schedulerRunInFlightRef.current = true;
      void (async () => {
        let retryDelay: number | null = null;
        try {
          const response = await fetch(getAppPath("/api/scheduler/run"), { method: "POST" });
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          if (!response.ok) {
            setSchedulerError(body?.error ?? "Scheduling could not finish. We will try again.");
            if (response.status === 409) {
              schedulerRunQueuedRef.current = true;
              retryDelay = 1_000;
            }
          } else {
            setSchedulerError("");
          }
        } catch {
          setSchedulerError("Scheduling could not finish. We will try again.");
        } finally {
          await loadScheduleSnapshot();
          window.dispatchEvent(new Event("heavyuser:calendar-refresh"));
          schedulerRunInFlightRef.current = false;
          if (schedulerRunQueuedRef.current) {
            schedulerRunQueuedRef.current = false;
            requestSchedulerRun(retryDelay ?? 0);
          }
        }
      })();
    }, delayMs);
  }

  function handleAddTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTaskTitle.trim();

    if (!title) {
      return;
    }
    if (title.length > MAX_TASK_TITLE_LENGTH) {
      setTaskComposerError(`Keep the task title under ${MAX_TASK_TITLE_LENGTH} characters.`);
      return;
    }

    if (newTaskStartDate && newTaskDeadline && newTaskStartDate > newTaskDeadline) {
      setTaskComposerError("The start date must be on or before the due date.");
      return;
    }
    setTaskComposerError("");

    const newTask: Task = {
      id: `task-${Date.now()}`,
      title,
      duration: parseDuration(newTaskDuration),
      startDate: newTaskStartDate || null,
      deadline: newTaskDeadline || null,
      priority: newTaskPriority,
      status: "open",
      autoSchedule: true,
      minBlockMinutes: null,
      maxBlockMinutes: null,
      calendarVisibility: null,
      calendarTransparency: null,
    };

    setTasks((currentTasks) => {
      const nextTask = currentTasks.some((task) => task.status === "focus")
        ? newTask
        : { ...newTask, status: "focus" as const };
      return [nextTask, ...currentTasks];
    });
    setNewTaskTitle("");
    setNewTaskDuration("");
    setNewTaskStartDate("");
    setNewTaskDeadline("");
    setNewTaskPriority("normal");
    setTaskComposerError("");
    newTaskInputRef.current?.focus();
  }

  function resetNewTaskDraft() {
    setNewTaskTitle("");
    setNewTaskDuration("");
    setNewTaskStartDate("");
    setNewTaskDeadline("");
    setNewTaskPriority("normal");
    setTaskComposerError("");
  }

  function handleCloseTaskComposer() {
    resetNewTaskDraft();
    setIsAdding(false);
  }

  function handleToggleTask(taskId: string) {
    setTasks((currentTasks) => {
      const toggledTask = currentTasks.find((task) => task.id === taskId);
      if (!toggledTask) {
        return currentTasks;
      }

      const nextFocusId =
        toggledTask.status === "focus"
          ? currentTasks.find((task) => task.id !== taskId && task.status !== "done")?.id ?? null
          : currentTasks.find((task) => task.status === "focus")?.id ?? null;

      const updatedTasks: ReadonlyArray<Task> = currentTasks.map((task): Task => {
        if (task.id === taskId) {
          return { ...task, status: task.status === "done" ? "open" : "done" };
        }

        if (task.status === "focus") {
          return { ...task, status: task.id === nextFocusId ? "focus" : "open" };
        }

        return task.id === nextFocusId ? { ...task, status: "focus" } : task;
      });

      if (toggledTask.status !== "done") {
        const completedTask = updatedTasks.find((task) => task.id === taskId);
        const remainingTasks = updatedTasks.filter((task) => task.id !== taskId);
        return completedTask ? [...remainingTasks, completedTask] : updatedTasks;
      }

      return updatedTasks;
    });
  }

  function seedEditingValues(task: Task) {
    setEditingTitle(task.title);
    setEditingDuration(task.duration === null ? "" : String(task.duration));
    setEditingStartDate(task.startDate ?? "");
    setEditingDeadline(task.deadline ?? "");
    setEditingPriority(task.priority);
    setEditingError("");
    setEditingAutoSchedule(task.autoSchedule);
    setEditingMinBlockMinutes(task.minBlockMinutes === null ? "" : String(task.minBlockMinutes));
    setEditingMaxBlockMinutes(task.maxBlockMinutes === null ? "" : String(task.maxBlockMinutes));
    setEditingCalendarVisibility(task.calendarVisibility);
    setEditingCalendarTransparency(task.calendarTransparency);
  }

  function handleStartEditing(task: Task) {
    setIsAdding(false);
    setEditingId(task.id);
    setInlineEdit(null);
    setPriorityMenuTaskId(null);
    setDurationMenuTaskId(null);
    setDueDateMenuTaskId(null);
    seedEditingValues(task);
  }

  function handleStartInlineEditing(task: Task, field: InlineEditField) {
    setIsAdding(false);
    setEditingId(null);
    setInlineEdit({ taskId: task.id, field });
    setPriorityMenuTaskId(null);
    setDurationMenuTaskId(null);
    setDueDateMenuTaskId(null);
    seedEditingValues(task);
  }

  function handleStartPriorityEditing(task: Task) {
    setIsAdding(false);
    setEditingId(null);
    setInlineEdit(null);
    setDurationMenuTaskId(null);
    setDueDateMenuTaskId(null);
    setPriorityMenuTaskId((currentTaskId) => (currentTaskId === task.id ? null : task.id));
  }

  function handleStartDurationEditing(task: Task) {
    setIsAdding(false);
    const parts = getDurationParts(task.duration);
    setEditingId(null);
    setInlineEdit(null);
    setPriorityMenuTaskId(null);
    setDueDateMenuTaskId(null);
    setDurationHours(parts && parts.hours > 0 ? String(parts.hours) : "");
    setDurationMinutes(parts ? String(parts.minutes) : "");
    setDurationMenuTaskId((currentTaskId) => (currentTaskId === task.id ? null : task.id));
  }

  function handleStartDueDateEditing(task: Task) {
    setIsAdding(false);
    setEditingId(null);
    setInlineEdit(null);
    setPriorityMenuTaskId(null);
    setDurationMenuTaskId(null);
    setDueDateDraft(task.deadline ?? "");
    setDueDateMenuTaskId((currentTaskId) => (currentTaskId === task.id ? null : task.id));
  }

  function handleCommitInlineEdit(taskId: string, field: InlineEditField, rawValue: string) {
    if (inlineEdit?.taskId !== taskId || inlineEdit.field !== field) {
      return;
    }

    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      setInlineEdit(null);
      return;
    }

    if (field === "title") {
      const title = rawValue.trim();
      if (title) {
        setTasks((currentTasks) =>
          currentTasks.map((currentTask) => (currentTask.id === taskId ? { ...currentTask, title } : currentTask)),
        );
      }
    }

    setInlineEdit(null);
  }

  function handleInlineEditKeyDown(event: ReactKeyboardEvent<HTMLInputElement>, taskId: string) {
    if (event.key === "Escape") {
      event.preventDefault();
      setInlineEdit(null);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      handleCommitInlineEdit(taskId, "title", event.currentTarget.value);
    }
  }

  function handlePriorityChange(taskId: string, priority: Priority) {
    setTasks((currentTasks) =>
      currentTasks.map((task) => (task.id === taskId ? { ...task, priority } : task)),
    );
    setPriorityMenuTaskId(null);
  }

  function handleDurationChange(taskId: string, duration: number | null) {
    setTasks((currentTasks) =>
      currentTasks.map((task) => (task.id === taskId ? { ...task, duration } : task)),
    );
    setDurationMenuTaskId(null);
  }

  function handleCustomDurationSave(taskId: string) {
    const hours = Math.max(0, Math.floor(Number(durationHours) || 0));
    const minutes = Math.min(59, Math.max(0, Math.floor(Number(durationMinutes) || 0)));
    const totalMinutes = hours * 60 + minutes;
    handleDurationChange(taskId, totalMinutes > 0 ? totalMinutes : null);
  }

  function handleDueDateChange(taskId: string, deadline: string | null) {
    setTasks((currentTasks) =>
      currentTasks.map((task) => (task.id === taskId ? { ...task, deadline } : task)),
    );
    setDueDateMenuTaskId(null);
  }

  function handleCancelEditing() {
    setEditingId(null);
    setInlineEdit(null);
    setPriorityMenuTaskId(null);
    setDurationMenuTaskId(null);
    setDueDateMenuTaskId(null);
    setEditingTitle("");
    setEditingDuration("");
    setEditingStartDate("");
    setEditingDeadline("");
    setEditingPriority("normal");
    setEditingError("");
    setEditingAutoSchedule(true);
    setEditingMinBlockMinutes("");
    setEditingMaxBlockMinutes("");
    setEditingCalendarVisibility(null);
    setEditingCalendarTransparency(null);
  }

  function handleSaveEdit(event: FormEvent<HTMLFormElement>, taskId: string) {
    event.preventDefault();
    const title = editingTitle.trim();

    if (!title) {
      setEditingError("Enter a task title.");
      return;
    }
    if (title.length > MAX_TASK_TITLE_LENGTH) {
      setEditingError(`Keep the task title under ${MAX_TASK_TITLE_LENGTH} characters.`);
      return;
    }

    if (editingStartDate && editingDeadline && editingStartDate > editingDeadline) {
      setEditingError("The start date must be on or before the due date.");
      return;
    }

    const minBlockMinutes = parseDuration(editingMinBlockMinutes);
    const maxBlockMinutes = parseDuration(editingMaxBlockMinutes);
    if ((minBlockMinutes !== null && minBlockMinutes < 5) || (maxBlockMinutes !== null && maxBlockMinutes < 5)) {
      setEditingError("Block overrides must be at least 5 minutes.");
      return;
    }
    if (minBlockMinutes !== null && maxBlockMinutes !== null && minBlockMinutes > maxBlockMinutes) {
      setEditingError("The minimum block must be shorter than the maximum block.");
      return;
    }

    setEditingError("");

    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              title,
              duration: parseDuration(editingDuration),
              startDate: editingStartDate || null,
              deadline: editingDeadline || null,
              priority: editingPriority,
              autoSchedule: editingAutoSchedule,
              minBlockMinutes,
              maxBlockMinutes,
              calendarVisibility: editingCalendarVisibility,
              calendarTransparency: editingCalendarTransparency,
            }
          : task,
      ),
    );
    handleCancelEditing();
  }

  function handleDeleteTask(taskId: string) {
    if (supabaseClient && authUser) {
      setPendingRemoteDeletes((currentIds) =>
        currentIds.includes(taskId) ? currentIds : [...currentIds, taskId],
      );
    }

    setTasks((currentTasks) => {
      const deletedTask = currentTasks.find((task) => task.id === taskId);
      const remainingTasks = currentTasks.filter((task) => task.id !== taskId);

      if (deletedTask?.status !== "focus") {
        return remainingTasks;
      }

      const nextFocusId = remainingTasks.find((task) => task.status !== "done")?.id ?? null;
      return remainingTasks.map((task) =>
        task.id === nextFocusId ? { ...task, status: "focus" } : task,
      );
    });
    if (editingId === taskId) {
      handleCancelEditing();
    }
  }

  function handleSelectTask(taskId: string) {
    setTasks((currentTasks) => {
      const selectedTask = currentTasks.find((task) => task.id === taskId);
      if (!selectedTask || selectedTask.status === "done") {
        return currentTasks;
      }

      return currentTasks.map((task) => {
        if (task.id === taskId) {
          return { ...task, status: "focus" };
        }

        return task.status === "focus" ? { ...task, status: "open" } : task;
      });
    });
  }

  function reorderTask(taskId: string, targetId: string) {
    if (taskId === targetId) {
      return;
    }

    setTasks((currentTasks) => {
      const bucketTasks = currentTasks.filter(
        (task) =>
          getTaskBucket(task, getAppToday()) === activeBucket &&
          (showCompletedTasks || task.status !== "done"),
      );
      const visibleTasks = isCustomOrder ? [...bucketTasks] : sortTasks(bucketTasks);
      const currentIndex = visibleTasks.findIndex((task) => task.id === taskId);
      const targetIndex = visibleTasks.findIndex((task) => task.id === targetId);

      if (currentIndex < 0 || targetIndex < 0) {
        return currentTasks;
      }

      const reorderedTasks = [...visibleTasks];
      const [movedTask] = reorderedTasks.splice(currentIndex, 1);
      const nextTargetIndex = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
      reorderedTasks.splice(nextTargetIndex, 0, movedTask);
      return replaceBucketOrder(currentTasks, reorderedTasks);
    });
    setIsCustomOrder(true);
  }

  function handleTaskDragStart(event: DragEvent<HTMLElement>, taskId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", taskId);
    setDraggingId(taskId);
    setDragOverId(null);
  }

  function handleTaskDragOver(event: DragEvent<HTMLElement>, taskId: string) {
    event.preventDefault();
    if (draggingId !== taskId) {
      event.dataTransfer.dropEffect = "move";
      setDragOverId(taskId);
    }
  }

  function handleTaskDrop(event: DragEvent<HTMLElement>, targetId: string) {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain") || draggingId;

    if (sourceId) {
      reorderTask(sourceId, targetId);
    }

    setDraggingId(null);
    setDragOverId(null);
  }

  function handleTaskDragEnd() {
    setDraggingId(null);
    setDragOverId(null);
  }

  function handleTaskRowKeyDown(event: ReactKeyboardEvent<HTMLElement>, taskId: string) {
    if (event.key === "Enter" || event.key === " ") {
      if (event.target !== event.currentTarget) {
        return;
      }

      event.preventDefault();
      handleSelectTask(taskId);
      return;
    }

    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }

    if (event.target !== event.currentTarget) {
      return;
    }

    event.preventDefault();
    setTasks((currentTasks) => {
      const bucketTasks = currentTasks.filter(
        (task) =>
          getTaskBucket(task, getAppToday()) === activeBucket &&
          (showCompletedTasks || task.status !== "done"),
      );
      const visibleTasks = isCustomOrder ? [...bucketTasks] : sortTasks(bucketTasks);
      const currentIndex = visibleTasks.findIndex((task) => task.id === taskId);
      const nextIndex = currentIndex + (event.key === "ArrowUp" ? -1 : 1);

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= visibleTasks.length) {
        return currentTasks;
      }

      const reorderedTasks = [...visibleTasks];
      [reorderedTasks[currentIndex], reorderedTasks[nextIndex]] = [
        reorderedTasks[nextIndex],
        reorderedTasks[currentIndex],
      ];
      return replaceBucketOrder(currentTasks, reorderedTasks);
    });
    setIsCustomOrder(true);
  }

  const logicalToday = getAppToday();
  const taskCounts = taskBucketOptions.reduce<Record<TaskBucket, number>>(
    (counts, option) => {
      counts[option.value] = tasks.filter(
        (task) =>
          getTaskBucket(task, logicalToday) === option.value &&
          task.status !== "done",
      ).length;
      return counts;
    },
    { backlog: 0, today: 0, upcoming: 0 },
  );
  const activeBucketTasks = tasks.filter(
    (task) =>
      getTaskBucket(task, logicalToday) === activeBucket &&
      (showCompletedTasks || task.status !== "done"),
  );
  const visibleTasks = isCustomOrder ? activeBucketTasks : sortTasks(activeBucketTasks);
  const visibleTaskGroups: ReadonlyArray<UpcomingTaskGroup> =
    activeBucket === "upcoming"
      ? groupUpcomingTasks(visibleTasks, logicalToday)
      : [{ id: "all", label: null, helper: "", dateLabel: "", tasks: visibleTasks }];
  const dueDatePresets = getDueDatePresets(logicalToday);
  const editingTask = editingId ? tasks.find((task) => task.id === editingId) ?? null : null;
  const editingScheduleStatus = editingTask ? scheduleStatuses[editingTask.id] : undefined;
  const editingScheduleBlocks = editingTask ? scheduleBlocks[editingTask.id] ?? [] : [];
  const editingScheduleLabel = editingTask ? getScheduleLabel(editingTask, editingScheduleStatus) : null;
  const headerDateTime = formatHeaderDateTime(currentDateTime, logicalToday);
  if (authStatus === "loading" || (authStatus === "signed_in" && !isHydrated)) {
    return (
      <main className="hu-auth-loading" aria-busy="true">
        <span className="hu-auth-loading-mark" aria-hidden="true" />
        Loading your workspace…
      </main>
    );
  }

  if (authStatus !== "signed_in" || !authUser) {
    return null;
  }

  return (
    <main className="hu-shell">
      <div className="hu-main">
        <header ref={topbarRef} className="hu-topbar" aria-label="Global navigation">
          <button
            aria-label="Open tasks"
            className="hu-brand-button"
            type="button"
            onClick={() => {
              setIsNotificationsOpen(false);
            }}
          >
            <Image
              alt="HeavyUser"
              className="hu-brand-logo"
              height={20}
              priority
              src={`${publicAssetPath}/heavyuser-logo.png`}
              width={155}
            />
          </button>

          <div className="hu-topbar-actions">
            <div className="hu-topbar-context" aria-label="Current date and time">
              <span className="hu-topbar-weekday">{headerDateTime?.weekday ?? "Today"}</span>
              <time
                className="hu-topbar-date"
                dateTime={currentDateTime === null ? undefined : new Date(currentDateTime).toISOString()}
              >
                {headerDateTime ? `${headerDateTime.date} · ${headerDateTime.time}` : "—"}
              </time>
            </div>

            <div className="hu-popover-anchor">
              <button
                aria-expanded={isNotificationsOpen}
                aria-label="Notifications"
                className="hu-topbar-button"
                type="button"
                onClick={() => {
                  setIsNotificationsOpen((current) => !current);
                }}
                title="Notifications"
              >
                <Bell aria-hidden="true" size={17} />
                <span className="hu-notification-dot" aria-hidden="true" />
              </button>
              {isNotificationsOpen ? (
                <div className="hu-popover hu-notifications-popover" role="status">
                  <strong>Notifications</strong>
                  <span>You&apos;re all caught up.</span>
                </div>
              ) : null}
            </div>

            <ProfileMenu
              onSignedOut={() => {
                setRemoteSyncReady(false);
                setIsHydrated(false);
                setPendingRemoteDeletes([]);
                setScheduleStatuses({});
                setScheduleBlocks({});
                setSchedulerError("");
                setTasks([]);
              }}
            />
          </div>
        </header>

        <div className="hu-content">
          <div className="hu-workspace">
            <section className="hu-region hu-task-region" aria-labelledby="tasks-title">
              <div className="hu-pane-toolbar">
                <h1 className="sr-only" id="tasks-title">
                  Tasks
                </h1>
                <div className="hu-pane-toolbar-content">
                  <div className="hu-task-tabs" role="tablist" aria-label="Task views">
                    {taskBucketOptions.map((option) => (
                      <button
                        aria-controls="task-list-panel"
                        aria-selected={activeBucket === option.value}
                        className={`hu-task-tab ${activeBucket === option.value ? "is-active" : ""}`}
                        id={`task-tab-${option.value}`}
                        key={option.value}
                        role="tab"
                        type="button"
                        onClick={() => {
                          setActiveBucket(option.value);
                          setIsCustomOrder(false);
                        }}
                      >
                        <option.icon aria-hidden="true" size={13} />
                        <span>{option.label}</span>
                        <span className="hu-task-tab-count">{taskCounts[option.value]}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="hu-pane-toolbar-actions">
                  <label className="hu-task-completed-filter">
                    <input
                      aria-label="Show completed tasks"
                      checked={showCompletedTasks}
                      className="hu-task-filter-checkbox"
                      type="checkbox"
                      onChange={(event) => setShowCompletedTasks(event.target.checked)}
                    />
                    <span>Completed</span>
                  </label>
                  <button
                    className="hu-add-button"
                    type="button"
                    onClick={() => {
                      if (isAdding) {
                        handleCloseTaskComposer();
                        return;
                      }

                      handleCancelEditing();
                      setIsAdding(true);
                    }}
                  >
                    <Plus aria-hidden="true" size={15} />
                    {isAdding ? "Close" : "Add task"}
                  </button>
                </div>
              </div>

              {isAdding ? (
                <form aria-label="Add task" className="hu-task-composer" onSubmit={handleAddTask}>
                  <div className="hu-composer-main-field">
                    <label className="hu-field-label" htmlFor="new-task-title">
                      Task
                    </label>
                    <input
                      autoFocus
                      aria-keyshortcuts="Q"
                      className="hu-task-input"
                      id="new-task-title"
                      maxLength={MAX_TASK_TITLE_LENGTH}
                      minLength={1}
                      onChange={(event) => setNewTaskTitle(event.target.value)}
                      placeholder="What needs doing?"
                      ref={newTaskInputRef}
                      required
                      title="Press Q to focus this field"
                      value={newTaskTitle}
                    />
                  </div>

                  <div className="hu-task-options" id="new-task-options">
                    <label className="hu-field">
                      <span className="hu-field-label">Duration</span>
                      <span className="hu-duration-input-wrap">
                        <input
                          aria-label="Task duration in minutes"
                          className="hu-task-input hu-duration-input"
                          inputMode="numeric"
                          min="5"
                          max={MAX_TASK_DURATION_MINUTES}
                          onChange={(event) => setNewTaskDuration(event.target.value)}
                          placeholder="30"
                          step="5"
                          type="number"
                          value={newTaskDuration}
                        />
                        <span aria-hidden="true">min</span>
                      </span>
                    </label>
                    <label className="hu-field">
                      <span className="hu-field-label">Start date</span>
                      <DateField
                        ariaLabel="Task start date"
                        className="hu-task-input"
                        value={newTaskStartDate}
                        onChange={setNewTaskStartDate}
                      />
                    </label>
                    <label className="hu-field">
                      <span className="hu-field-label">Due date</span>
                      <DateField
                        ariaLabel="Task due date"
                        className="hu-task-input"
                        value={newTaskDeadline}
                        onChange={setNewTaskDeadline}
                      />
                    </label>
                    <label className="hu-field">
                      <span className="hu-field-label">Priority</span>
                      <select
                        aria-label="Task priority"
                        className={`hu-task-input hu-priority-select is-${newTaskPriority}`}
                        onChange={(event) => setNewTaskPriority(event.target.value as Priority)}
                        value={newTaskPriority}
                      >
                        {priorityOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="hu-form-actions">
                    {taskComposerError ? <p className="hu-form-error" role="alert">{taskComposerError}</p> : null}
                    <button className="hu-form-button is-primary" type="submit">
                      Add task
                    </button>
                  </div>
                </form>
              ) : null}

              <div
                aria-labelledby={`task-tab-${activeBucket}`}
                className="hu-task-list"
                id="task-list-panel"
                role="tabpanel"
              >
                {visibleTasks.length === 0 ? (
                  <div className="hu-empty-state">
                    <p>No tasks here yet.</p>
                    <button className="hu-empty-action" type="button" onClick={() => setIsAdding(true)}>
                      <Plus aria-hidden="true" size={14} />
                      Add task
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="hu-task-table-head" role="row" aria-label="Task table columns">
                      <span aria-hidden="true" />
                      <span
                        aria-label="Priority"
                        className="hu-table-head-icon-only"
                        role="columnheader"
                        title="Priority"
                      >
                        <Flag aria-hidden="true" size={13} />
                      </span>
                      <span role="columnheader">
                        <ListTodo aria-hidden="true" size={13} />
                        <span className="hu-table-head-label">Task</span>
                      </span>
                      <span aria-hidden="true" />
                      <span
                        aria-label="Duration"
                        className="hu-table-head-icon-only"
                        role="columnheader"
                        title="Duration"
                      >
                        <Clock3 aria-hidden="true" size={13} />
                      </span>
                      <span
                        aria-label="Due date"
                        className="hu-table-head-icon-only"
                        role="columnheader"
                        title="Due date"
                      >
                        <CalendarDays aria-hidden="true" size={13} />
                      </span>
                    </div>
                    {visibleTaskGroups.map((group) => {
                      const isCollapsed =
                        group.id !== "all" && collapsedUpcomingGroupIds.includes(group.id);

                      return (
                        <div className={`hu-task-group ${group.id !== "all" ? "is-upcoming-group" : ""}`} key={group.id}>
                          {group.label ? (
                            <div className="hu-task-group-heading">
                              <Button
                                aria-expanded={!isCollapsed}
                                className="hu-task-group-toggle"
                                size="sm"
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  if (group.id === "all") {
                                    return;
                                  }

                                  const groupId: UpcomingGroupId = group.id;
                                  setCollapsedUpcomingGroupIds((current) =>
                                    current.includes(groupId)
                                      ? current.filter((id) => id !== groupId)
                                      : [...current, groupId],
                                  );
                                }}
                              >
                                <ChevronDown
                                  aria-hidden="true"
                                  className={isCollapsed ? "is-collapsed" : ""}
                                  size={15}
                                />
                                <span>{group.label}</span>
                                <span className="hu-task-group-date">{group.dateLabel}</span>
                              </Button>
                              <span className="hu-task-group-helper">{group.helper}</span>
                              <span className="hu-task-group-count">{group.tasks.length}</span>
                            </div>
                          ) : null}
                          {!isCollapsed && group.tasks.map((task) => {
                            const isDone = task.status === "done";
                            const isFocus = task.status === "focus";
                            const isOverdue = isDeadlineOverdue(task.deadline, task.status, logicalToday);
                            const durationParts = getDurationParts(task.duration);
                            const hasDuration = durationParts !== null;
                            const dueDateLabel = formatTaskDueDate(task.deadline);
                            const activeInlineField = inlineEdit?.taskId === task.id ? inlineEdit.field : null;
                            const isPriorityMenuOpen = priorityMenuTaskId === task.id;
                            const isDurationMenuOpen = durationMenuTaskId === task.id;
                            const isDueDateMenuOpen = dueDateMenuTaskId === task.id;
                            const hasTaskPopover = isPriorityMenuOpen || isDurationMenuOpen || isDueDateMenuOpen;

                            return (
                              <article
                                aria-label={`${task.title}${isOverdue ? ", overdue" : ""}`}
                                className={`hu-task-row ${isFocus ? "is-focus" : ""} ${
                                  isDone ? "is-done-row" : ""
                                } ${draggingId === task.id ? "is-dragging" : ""} ${
                                  dragOverId === task.id ? "is-drag-over" : ""
                                } ${hasTaskPopover ? "is-task-popover-open" : ""}`}
                                draggable={!editingTask && !activeInlineField && !hasTaskPopover}
                                aria-current={isFocus ? "true" : undefined}
                                key={task.id}
                                tabIndex={editingTask || activeInlineField || hasTaskPopover ? -1 : 0}
                                onClick={(event) => {
                                  if (
                                    event.target instanceof Element &&
                                    event.target.closest("button, input, select, textarea")
                                  ) {
                                    return;
                                  }

                                  handleSelectTask(task.id);
                                }}
                                onKeyDown={(event) => handleTaskRowKeyDown(event, task.id)}
                                onDragEnd={handleTaskDragEnd}
                                onDragOver={(event) => handleTaskDragOver(event, task.id)}
                                onDragStart={(event) => handleTaskDragStart(event, task.id)}
                                onDrop={(event) => handleTaskDrop(event, task.id)}
                              >
                                <button
                                  aria-label={`${isDone ? "Mark" : "Complete"} ${task.title}`}
                                  className={`hu-check ${isDone ? "is-done" : ""}`}
                                  type="button"
                                  onClick={() => handleToggleTask(task.id)}
                                >
                                  {isDone ? <Check aria-hidden="true" /> : null}
                                </button>

                                <div className="hu-task-priority-cell" ref={isPriorityMenuOpen ? priorityMenuRef : undefined}>
                                  <button
                                    aria-expanded={isPriorityMenuOpen}
                                    aria-haspopup="menu"
                                    aria-label={`Priority: ${priorityLabels[task.priority]}. Change priority`}
                                    className={`hu-inline-edit-trigger hu-task-priority-trigger is-${task.priority}`}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleStartPriorityEditing(task);
                                    }}
                                    title="Change priority"
                                  >
                                    <PriorityIcon priority={task.priority} />
                                  </button>
                                  {isPriorityMenuOpen ? (
                                    <div
                                      aria-label={`Change priority for ${task.title}`}
                                      className="hu-priority-menu"
                                      role="menu"
                                    >
                                      {priorityOptions.map((option) => {
                                        const optionPriority = option.value;
                                        const isSelected = task.priority === optionPriority;

                                        return (
                                          <button
                                            aria-checked={isSelected}
                                            className={`hu-priority-option ${isSelected ? "is-selected" : ""}`}
                                            key={optionPriority}
                                            role="menuitemradio"
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              handlePriorityChange(task.id, optionPriority);
                                            }}
                                          >
                                            <span className={`hu-priority-option-icon is-${optionPriority}`}>
                                              <PriorityIcon priority={optionPriority} />
                                            </span>
                                            <span>{priorityLabels[optionPriority]}</span>
                                            {isSelected ? <Check aria-hidden="true" size={13} /> : null}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </div>

                                <div className="hu-task-title-cell">
                                  {activeInlineField === "title" ? (
                                    <input
                                      aria-label={`Edit title for ${task.title}`}
                                      autoFocus
                                      className="hu-inline-edit-input hu-inline-title-input"
                                      minLength={1}
                                      value={editingTitle}
                                      onBlur={(event) =>
                                        handleCommitInlineEdit(task.id, "title", event.currentTarget.value)
                                      }
                                      onChange={(event) => setEditingTitle(event.target.value)}
                                      onKeyDown={(event) => handleInlineEditKeyDown(event, task.id)}
                                    />
                                  ) : (
                                    <button
                                      aria-label={`Edit title for ${task.title}${isOverdue ? " (overdue)" : ""}`}
                                      className="hu-inline-edit-trigger hu-task-title-trigger"
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleStartInlineEditing(task, "title");
                                      }}
                                      title="Edit title"
                                    >
                                      <span className="hu-task-title">{task.title}</span>
                                      {isOverdue ? (
                                        <CircleAlert
                                          aria-hidden="true"
                                          className="hu-overdue-indicator"
                                          size={13}
                                          strokeWidth={2.5}
                                        />
                                      ) : null}
                                    </button>
                                  )}
                                </div>

                                <div className="hu-task-controls">
                                  <button
                                    aria-label={`Edit ${task.title}`}
                                    className="hu-icon-button"
                                    type="button"
                                    onClick={() => handleStartEditing(task)}
                                    title="Edit task"
                                  >
                                    <Pencil aria-hidden="true" />
                                  </button>
                                  <button
                                    aria-label={`Delete ${task.title}`}
                                    className="hu-icon-button is-danger"
                                    type="button"
                                    onClick={() => handleDeleteTask(task.id)}
                                    title="Delete task"
                                  >
                                    <Trash2 aria-hidden="true" />
                                  </button>
                                </div>

                                <div
                                  aria-label={hasDuration ? `Duration: ${formatDuration(task.duration)}` : "Duration not set"}
                                  className="hu-task-time"
                                  ref={isDurationMenuOpen ? durationMenuRef : undefined}
                                  title={hasDuration ? `Duration: ${formatDuration(task.duration)}` : "Edit duration"}
                                >
                                  <button
                                    aria-expanded={isDurationMenuOpen}
                                    aria-haspopup="dialog"
                                    aria-label={hasDuration ? `Edit duration: ${formatDuration(task.duration)}` : "Add duration"}
                                    className="hu-inline-edit-trigger hu-task-time-trigger"
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleStartDurationEditing(task);
                                    }}
                                    title="Edit duration"
                                  >
                                    {durationParts ? (
                                      <span className="hu-duration-value">
                                        <span className="hu-duration-hours">
                                          {durationParts.hours > 0
                                            ? `${String(durationParts.hours).padStart(2, "0")}h`
                                            : null}
                                        </span>
                                        <span className="hu-duration-minutes">
                                          {String(durationParts.minutes).padStart(2, "0")}m
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="hu-inline-empty-value">—</span>
                                    )}
                                  </button>
                                  {isDurationMenuOpen ? (
                                    <div
                                      aria-label={`Set duration for ${task.title}`}
                                      className="hu-duration-menu"
                                      role="dialog"
                                    >
                                      <span className="hu-popover-kicker">Quick duration</span>
                                      <div className="hu-duration-presets">
                                        {durationPresets.map((preset) => (
                                          <button
                                            aria-pressed={task.duration === preset.minutes}
                                            className="hu-duration-preset"
                                            key={preset.minutes}
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              handleDurationChange(task.id, preset.minutes);
                                            }}
                                          >
                                            {preset.label}
                                          </button>
                                        ))}
                                      </div>
                                      <div className="hu-popover-divider" role="presentation" />
                                      <span className="hu-popover-kicker">Custom</span>
                                      <div className="hu-duration-custom">
                                        <label className="hu-duration-custom-field">
                                          <span>Hours</span>
                                          <input
                                            aria-label="Hours"
                                            inputMode="numeric"
                                            max={Math.floor(MAX_TASK_DURATION_MINUTES / 60)}
                                            min="0"
                                            type="number"
                                            value={durationHours}
                                            onChange={(event) => setDurationHours(event.target.value)}
                                            onKeyDown={(event) => {
                                              if (event.key === "Enter") {
                                                event.preventDefault();
                                                handleCustomDurationSave(task.id);
                                              }
                                            }}
                                          />
                                        </label>
                                        <label className="hu-duration-custom-field">
                                          <span>Minutes</span>
                                          <input
                                            aria-label="Minutes"
                                            inputMode="numeric"
                                            max="59"
                                            min="0"
                                            type="number"
                                            value={durationMinutes}
                                            onChange={(event) => setDurationMinutes(event.target.value)}
                                            onKeyDown={(event) => {
                                              if (event.key === "Enter") {
                                                event.preventDefault();
                                                handleCustomDurationSave(task.id);
                                              }
                                            }}
                                          />
                                        </label>
                                        <button
                                          className="hu-popover-apply"
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            handleCustomDurationSave(task.id);
                                          }}
                                        >
                                          Apply
                                        </button>
                                      </div>
                                      <button
                                        className="hu-popover-clear"
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          handleDurationChange(task.id, null);
                                        }}
                                      >
                                        Clear duration
                                      </button>
                                    </div>
                                  ) : null}
                                </div>

                                <div
                                  aria-label={dueDateLabel ? `Due date: ${dueDateLabel}` : "Due date not set"}
                                  className={`hu-task-due-date ${
                                    isDeadlineOverdue(task.deadline, task.status, logicalToday) ? "is-overdue" : ""
                                  }`}
                                  ref={isDueDateMenuOpen ? dueDateMenuRef : undefined}
                                  title={dueDateLabel || "Edit due date"}
                                >
                                  <button
                                    aria-expanded={isDueDateMenuOpen}
                                    aria-haspopup="dialog"
                                    aria-label={dueDateLabel ? `Edit due date: ${dueDateLabel}` : "Add due date"}
                                    className="hu-inline-edit-trigger hu-task-due-date-trigger"
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleStartDueDateEditing(task);
                                    }}
                                    title="Edit due date"
                                  >
                                    {dueDateLabel || <span className="hu-inline-empty-value">—</span>}
                                  </button>
                                  {isDueDateMenuOpen ? (
                                    <div
                                      aria-label={`Set due date for ${task.title}`}
                                      className="hu-due-date-menu"
                                      role="dialog"
                                    >
                                      <span className="hu-popover-kicker">Quick date</span>
                                      <div className="hu-due-date-presets">
                                        {dueDatePresets.map((preset) => (
                                          <button
                                            aria-pressed={task.deadline === preset.value}
                                            className="hu-due-date-preset"
                                            key={preset.value}
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              handleDueDateChange(task.id, preset.value);
                                            }}
                                          >
                                            <span>{preset.label}</span>
                                            <small>{formatShortDate(preset.value)}</small>
                                          </button>
                                        ))}
                                      </div>
                                      <div className="hu-popover-divider" role="presentation" />
                                      <span className="hu-popover-kicker">Custom date</span>
                                      <DateField
                                        ariaLabel={`Custom due date for ${task.title}`}
                                        className="hu-edit-input hu-popover-date-input"
                                        value={dueDateDraft}
                                        onChange={setDueDateDraft}
                                      />
                                      <button
                                        className="hu-popover-apply"
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          handleDueDateChange(task.id, dueDateDraft || null);
                                        }}
                                      >
                                        Apply date
                                      </button>
                                      <button
                                        className="hu-popover-clear"
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          handleDueDateChange(task.id, null);
                                        }}
                                      >
                                        Clear due date
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </section>

            <GoogleCalendarPanel
              date={logicalToday}
              settings={settings}
              tasks={tasks}
              scheduleBlocks={scheduleBlocks}
              schedulerError={schedulerError}
              onTaskDurationChange={handleDurationChange}
            />
          </div>
        </div>

        {editingTask ? (
          <div
            className="hu-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                handleCancelEditing();
              }
            }}
          >
            <form
              aria-label="Edit task"
              className="hu-task-dialog"
              role="dialog"
              aria-modal="true"
              onSubmit={(event) => handleSaveEdit(event, editingTask.id)}
            >
              <button
                aria-label="Close edit task dialog"
                className="hu-task-dialog-close hu-icon-button"
                type="button"
                onClick={handleCancelEditing}
              >
                <X aria-hidden="true" />
              </button>

              <div className="hu-task-dialog-body">
                <label className="hu-edit-field hu-dialog-title-field">
                  <span className="hu-field-label">Task</span>
                  <input
                    autoFocus
                    className="hu-edit-input"
                    maxLength={MAX_TASK_TITLE_LENGTH}
                    minLength={1}
                    onChange={(event) => setEditingTitle(event.target.value)}
                    placeholder="Task title"
                    required
                    value={editingTitle}
                  />
                </label>
                <div className="hu-dialog-field-grid">
                  <label className="hu-edit-field">
                    <span className="hu-field-label">Duration</span>
                    <span className="hu-duration-input-wrap">
                      <input
                        aria-label="Task duration in minutes"
                        className="hu-edit-input hu-duration-input"
                        inputMode="numeric"
                        min="5"
                        max={MAX_TASK_DURATION_MINUTES}
                        onChange={(event) => setEditingDuration(event.target.value)}
                        placeholder="30"
                        step="5"
                        type="number"
                        value={editingDuration}
                      />
                      <span aria-hidden="true">min</span>
                    </span>
                  </label>
                  <label className="hu-edit-field">
                    <span className="hu-field-label">Priority</span>
                    <select
                      aria-label="Task priority"
                      className={`hu-edit-input hu-priority-select is-${editingPriority}`}
                      onChange={(event) => setEditingPriority(event.target.value as Priority)}
                      value={editingPriority}
                    >
                      {priorityOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="hu-edit-field">
                    <span className="hu-field-label">Start date</span>
                    <DateField
                      ariaLabel="Task start date"
                      className="hu-edit-input"
                      value={editingStartDate}
                      onChange={setEditingStartDate}
                    />
                  </label>
                  <label className="hu-edit-field">
                    <span className="hu-field-label">Due date</span>
                    <DateField
                      ariaLabel="Task due date"
                      className="hu-edit-input"
                      value={editingDeadline}
                      onChange={setEditingDeadline}
                    />
                  </label>
                </div>
                <div className="hu-dialog-scheduling">
                  <div className="hu-dialog-scheduling-heading">
                    <div>
                      <span className="hu-field-label">Calendar scheduling</span>
                      <p>HeavyUser places flexible work blocks around your Google Calendar.</p>
                    </div>
                    <label className="hu-settings-toggle-row hu-task-scheduling-toggle">
                      <span className="hu-settings-toggle-copy">
                        <strong>Schedule automatically</strong>
                      </span>
                      <input
                        aria-label="Schedule this task automatically"
                        checked={editingAutoSchedule}
                        className="hu-settings-switch"
                        type="checkbox"
                        onChange={(event) => setEditingAutoSchedule(event.target.checked)}
                      />
                    </label>
                  </div>
                  <div className="hu-dialog-field-grid is-scheduling">
                    <label className="hu-edit-field">
                      <span className="hu-field-label">Minimum block</span>
                      <span className="hu-duration-input-wrap">
                        <input
                          aria-label="Minimum calendar block in minutes"
                          className="hu-edit-input hu-duration-input"
                          inputMode="numeric"
                          min="5"
                          placeholder="Default"
                          step="5"
                          type="number"
                          value={editingMinBlockMinutes}
                          onChange={(event) => setEditingMinBlockMinutes(event.target.value)}
                        />
                        <span aria-hidden="true">min</span>
                      </span>
                    </label>
                    <label className="hu-edit-field">
                      <span className="hu-field-label">Maximum block</span>
                      <span className="hu-duration-input-wrap">
                        <input
                          aria-label="Maximum calendar block in minutes"
                          className="hu-edit-input hu-duration-input"
                          inputMode="numeric"
                          min="5"
                          placeholder="Default"
                          step="5"
                          type="number"
                          value={editingMaxBlockMinutes}
                          onChange={(event) => setEditingMaxBlockMinutes(event.target.value)}
                        />
                        <span aria-hidden="true">min</span>
                      </span>
                    </label>
                    <label className="hu-edit-field">
                      <span className="hu-field-label">Visibility</span>
                      <select
                        aria-label="Task calendar visibility"
                        className="hu-edit-input"
                        value={editingCalendarVisibility ?? "inherit"}
                        onChange={(event) => setEditingCalendarVisibility(event.target.value === "inherit" ? null : event.target.value as CalendarVisibility)}
                      >
                        <option value="inherit">Calendar default</option>
                        <option value="private">Private</option>
                        <option value="public">Public</option>
                      </select>
                    </label>
                    <label className="hu-edit-field">
                      <span className="hu-field-label">Availability</span>
                      <select
                        aria-label="Task calendar availability"
                        className="hu-edit-input"
                        value={editingCalendarTransparency ?? "inherit"}
                        onChange={(event) => setEditingCalendarTransparency(event.target.value === "inherit" ? null : event.target.value as CalendarTransparency)}
                      >
                        <option value="inherit">Calendar default</option>
                        <option value="opaque">Busy</option>
                        <option value="transparent">Free</option>
                      </select>
                    </label>
                  </div>
                  <div className="hu-task-schedule-panel" aria-live="polite">
                    <div className="hu-task-schedule-heading">
                      <div>
                        <span className="hu-field-label">Actual schedule</span>
                        <p>These are the calendar blocks HeavyUser has placed for this task.</p>
                      </div>
                      {editingScheduleLabel ? (
                        <span className={`hu-task-schedule-status is-${editingScheduleStatus?.state ?? (editingTask.duration === null ? "needs_duration" : "scheduling")}`}>
                          {editingScheduleLabel}
                        </span>
                      ) : null}
                    </div>
                    {editingScheduleBlocks.length > 0 ? (
                      <div className="hu-task-schedule-list">
                        {editingScheduleBlocks.slice(0, 6).map((block) => {
                          const formattedBlock = formatScheduleBlock(block);
                          if (!formattedBlock) {
                            return null;
                          }
                          const isPast = currentDateTime !== null && new Date(block.end).getTime() <= currentDateTime;
                          return (
                            <div className={`hu-task-schedule-item ${isPast ? "is-past" : ""}`} key={block.id}>
                              <CalendarDays aria-hidden="true" size={13} />
                              <span className="hu-task-schedule-item-date">{formattedBlock.date}</span>
                              <time dateTime={block.start}>{formattedBlock.time}</time>
                              <span className="hu-task-schedule-item-state">{isPast ? "Past" : block.state === "locked" ? "Locked" : "Planned"}</span>
                            </div>
                          );
                        })}
                        {editingScheduleBlocks.length > 6 ? (
                          <span className="hu-task-schedule-more">+ {editingScheduleBlocks.length - 6} more block{editingScheduleBlocks.length - 6 === 1 ? "" : "s"}</span>
                        ) : null}
                      </div>
                    ) : (
                      <p className="hu-task-schedule-empty">
                        {editingTask.duration === null
                          ? "Add a duration to let HeavyUser find the next available time."
                          : editingTask.autoSchedule
                            ? "No calendar block yet. Save changes and HeavyUser will find the next available working time."
                            : "Automatic scheduling is paused for this task."}
                      </p>
                    )}
                    {editingScheduleStatus?.warning ? <p className="hu-task-schedule-warning"><CircleAlert aria-hidden="true" size={13} />{editingScheduleStatus.warning}</p> : null}
                  </div>
                </div>
              </div>

              {editingError ? <p className="hu-form-error" role="alert">{editingError}</p> : null}

              <div className="hu-task-dialog-actions">
                <button className="hu-form-button is-primary" type="submit">
                  Save changes
                </button>
                <button className="hu-form-button" type="button" onClick={handleCancelEditing}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : null}

      </div>
    </main>
  );
}
