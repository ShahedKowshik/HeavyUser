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
  Settings2,
  TriangleAlert,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { ProfileDialog } from "@/components/profile-dialog";
import { GoogleCalendarPanel } from "@/components/google-calendar-panel";
import { getAppPath, publicBasePath } from "@/lib/supabase/config";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadRemoteTasks, persistRemoteTasks } from "@/lib/supabase/tasks";
import type { Priority, Task } from "@/lib/tasks";
type TaskBucket = "backlog" | "today" | "upcoming";
type InlineEditField = "title";
type NightOwlSettings = {
  nightOwlMode: boolean;
  dayStartTime: string;
};

const publicAssetPath = publicBasePath;
const calendarDate = "2026-08-01";
const settingsStorageKey = "heavyuser:settings:v2";
const defaultNightOwlSettings: NightOwlSettings = {
  nightOwlMode: false,
  dayStartTime: "04:00",
};
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

type CalendarEvent = {
  id: string;
  title: string;
  taskId?: string;
  time: string;
  start: number;
  end: number;
  status: "neutral" | "active";
};

// Keep inbox tasks separate from the old Today surface while migrating any
// existing local rows so a navigation rename does not discard user data.
const storageKey = "heavyuser:inbox-tasks:v4";
const legacyStorageKeys = ["heavyuser:today-tasks:v3", "heavyuser:today-tasks:v2"] as const;
const userStorageKeyPrefix = "heavyuser:tasks:v1:";
const localBackupKeyPrefix = "heavyuser:local-backup:v1:";
const starterDataVersionStorageKey = "heavyuser:inbox-tasks:starter-version";
const starterDataVersion = "5";

const initialTasks = [
  {
    id: "task-01",
    title: "Finish the onboarding flow copy",
    duration: 45,
    startDate: "2026-08-01",
    deadline: "2026-08-01",
    priority: "high",
    status: "focus",
  },
  {
    id: "task-02",
    title: "Review activation metrics from last week",
    duration: 30,
    startDate: "2026-08-02",
    deadline: "2026-08-03",
    priority: "high",
    status: "open",
  },
  {
    id: "task-03",
    title: "Prepare the design review agenda",
    duration: 25,
    startDate: null,
    deadline: null,
    priority: "normal",
    status: "open",
  },
  {
    id: "task-04",
    title: "Send the revised launch timeline",
    duration: 15,
    startDate: "2026-08-01",
    deadline: "2026-08-02",
    priority: "urgent",
    status: "open",
  },
  {
    id: "task-05",
    title: "Capture notes from the customer call",
    duration: 20,
    startDate: null,
    deadline: null,
    priority: "low",
    status: "done",
  },
  {
    id: "task-06",
    title: "Clear the three highest-priority replies",
    duration: 20,
    startDate: "2026-07-31",
    deadline: "2026-08-01",
    priority: "normal",
    status: "done",
  },
  {
    id: "task-07",
    title: "Draft the product brief outline",
    duration: 45,
    startDate: "2026-08-03",
    deadline: "2026-08-04",
    priority: "high",
    status: "open",
  },
  {
    id: "task-08",
    title: "QA the new onboarding checklist",
    duration: 30,
    startDate: "2026-08-05",
    deadline: "2026-08-05",
    priority: "normal",
    status: "open",
  },
  {
    id: "task-09",
    title: "Plan tomorrow's stakeholder update",
    duration: 20,
    startDate: "2026-08-02",
    deadline: "2026-08-02",
    priority: "normal",
    status: "open",
  },
  {
    id: "task-10",
    title: "Clean up customer research notes",
    duration: 30,
    startDate: null,
    deadline: null,
    priority: "low",
    status: "done",
  },
  {
    id: "task-11",
    title: "Turn interview notes into themes",
    duration: 40,
    startDate: null,
    deadline: null,
    priority: "normal",
    status: "open",
  },
  {
    id: "task-12",
    title: "Reconcile the Q3 campaign handoff",
    duration: 35,
    startDate: null,
    deadline: null,
    priority: "high",
    status: "open",
  },
  {
    id: "task-13",
    title: "Write the customer story opening",
    duration: 50,
    startDate: null,
    deadline: null,
    priority: "normal",
    status: "open",
  },
  {
    id: "task-14",
    title: "Review open support escalations",
    duration: 25,
    startDate: null,
    deadline: null,
    priority: "urgent",
    status: "open",
  },
  {
    id: "task-15",
    title: "Archive old experiment docs",
    duration: 30,
    startDate: null,
    deadline: null,
    priority: "low",
    status: "done",
  },
  {
    id: "task-16",
    title: "Map onboarding edge cases",
    duration: 45,
    startDate: null,
    deadline: null,
    priority: "high",
    status: "open",
  },
  {
    id: "task-17",
    title: "Clean up analytics event names",
    duration: 35,
    startDate: null,
    deadline: null,
    priority: "normal",
    status: "open",
  },
  {
    id: "task-18",
    title: "Create a release checklist",
    duration: 30,
    startDate: null,
    deadline: null,
    priority: "normal",
    status: "open",
  },
  {
    id: "task-19",
    title: "Send the partner follow-up",
    duration: 20,
    startDate: "2026-07-28",
    deadline: "2026-07-28",
    priority: "high",
    status: "open",
  },
  {
    id: "task-20",
    title: "Update the pricing FAQ",
    duration: 30,
    startDate: "2026-07-29",
    deadline: "2026-07-29",
    priority: "normal",
    status: "open",
  },
  {
    id: "task-21",
    title: "Resolve billing copy review",
    duration: 25,
    startDate: "2026-07-30",
    deadline: "2026-07-30",
    priority: "urgent",
    status: "open",
  },
  {
    id: "task-22",
    title: "Confirm research incentives",
    duration: 15,
    startDate: "2026-07-31",
    deadline: "2026-07-31",
    priority: "normal",
    status: "open",
  },
  {
    id: "task-23",
    title: "Close the old launch retro",
    duration: 40,
    startDate: "2026-07-27",
    deadline: "2026-07-27",
    priority: "low",
    status: "done",
  },
  {
    id: "task-24",
    title: "Review the weekly product scorecard",
    duration: 35,
    startDate: "2026-08-01",
    deadline: "2026-08-01",
    priority: "high",
    status: "open",
  },
  {
    id: "task-25",
    title: "Prepare talking points for standup",
    duration: 20,
    startDate: "2026-08-01",
    deadline: "2026-08-01",
    priority: "normal",
    status: "open",
  },
  {
    id: "task-26",
    title: "File the vendor receipts",
    duration: 25,
    startDate: "2026-08-01",
    deadline: "2026-08-01",
    priority: "normal",
    status: "open",
  },
  {
    id: "task-27",
    title: "Draft the experiment readout",
    duration: 45,
    startDate: "2026-08-01",
    deadline: "2026-08-01",
    priority: "high",
    status: "open",
  },
  {
    id: "task-28",
    title: "Triage new customer feedback",
    duration: 30,
    startDate: "2026-08-01",
    deadline: null,
    priority: "urgent",
    status: "open",
  },
  {
    id: "task-29",
    title: "Refine the account handoff checklist",
    duration: 35,
    startDate: "2026-07-31",
    deadline: "2026-08-02",
    priority: "normal",
    status: "open",
  },
  {
    id: "task-30",
    title: "Respond to the legal review",
    duration: 20,
    startDate: "2026-08-01",
    deadline: "2026-08-01",
    priority: "urgent",
    status: "open",
  },
  {
    id: "task-31",
    title: "Outline the Q3 planning memo",
    duration: 45,
    startDate: "2026-08-06",
    deadline: "2026-08-08",
    priority: "high",
    status: "open",
  },
  {
    id: "task-32",
    title: "Schedule the customer advisory call",
    duration: 20,
    startDate: "2026-08-04",
    deadline: "2026-08-05",
    priority: "normal",
    status: "open",
  },
  {
    id: "task-33",
    title: "Draft the activation experiment brief",
    duration: 50,
    startDate: "2026-08-07",
    deadline: "2026-08-10",
    priority: "high",
    status: "open",
  },
  {
    id: "task-34",
    title: "Prepare next sprint capacity notes",
    duration: 30,
    startDate: "2026-08-10",
    deadline: "2026-08-11",
    priority: "normal",
    status: "open",
  },
  {
    id: "task-35",
    title: "Compile the monthly insight digest",
    duration: 60,
    startDate: "2026-08-12",
    deadline: "2026-08-14",
    priority: "normal",
    status: "open",
  },
  {
    id: "task-36",
    title: "Build the rollout risk register",
    duration: 40,
    startDate: "2026-08-03",
    deadline: "2026-08-06",
    priority: "urgent",
    status: "open",
  },
  {
    id: "task-37",
    title: "Plan the next design critique",
    duration: 25,
    startDate: "2026-08-09",
    deadline: "2026-08-10",
    priority: "normal",
    status: "open",
  },
  {
    id: "task-38",
    title: "Review the accessibility audit",
    duration: 45,
    startDate: "2026-08-05",
    deadline: "2026-08-07",
    priority: "high",
    status: "open",
  },
  {
    id: "task-39",
    title: "Collect launch partner logos",
    duration: 30,
    startDate: "2026-08-11",
    deadline: "2026-08-13",
    priority: "low",
    status: "open",
  },
  {
    id: "task-40",
    title: "Write the customer success handoff",
    duration: 35,
    startDate: "2026-08-13",
    deadline: "2026-08-15",
    priority: "normal",
    status: "open",
  },
  {
    id: "task-41",
    title: "Prepare annual planning themes",
    duration: 50,
    startDate: "2026-09-15",
    deadline: "2026-09-20",
    priority: "high",
    status: "open",
  },
  {
    id: "task-42",
    title: "Plan the holiday release calendar",
    duration: 45,
    startDate: "2026-11-10",
    deadline: "2026-11-14",
    priority: "normal",
    status: "open",
  },
  {
    id: "task-43",
    title: "Outline next year's research agenda",
    duration: 60,
    startDate: "2027-01-12",
    deadline: "2027-01-15",
    priority: "low",
    status: "open",
  },
] satisfies ReadonlyArray<Task>;

const demoExpansionTasks = initialTasks.slice(10);

const calendarEvents = [
  {
    id: "event-01",
    title: "Plan the day",
    time: "9:00 – 9:20 AM",
    start: 9,
    end: 9 + 20 / 60,
    status: "neutral",
  },
  {
    id: "event-02",
    title: "Review activation metrics from last week",
    taskId: "task-02",
    time: "9:50 – 10:20 AM",
    start: 9 + 50 / 60,
    end: 10 + 20 / 60,
    status: "neutral",
  },
  {
    id: "event-03",
    title: "Finish the onboarding flow copy",
    taskId: "task-01",
    time: "10:30 – 11:15 AM",
    start: 10.5,
    end: 11.25,
    status: "active",
  },
  {
    id: "event-04",
    title: "Prepare the design review agenda",
    taskId: "task-03",
    time: "11:30 – 11:55 AM",
    start: 11.5,
    end: 11.5 + 25 / 60,
    status: "neutral",
  },
  {
    id: "event-05",
    title: "Design review",
    time: "12:30 – 1:30 PM",
    start: 12.5,
    end: 13.5,
    status: "neutral",
  },
  {
    id: "event-06",
    title: "Lunch",
    time: "1:30 – 2:15 PM",
    start: 13.5,
    end: 14.25,
    status: "neutral",
  },
  {
    id: "event-07",
    title: "Send the revised launch timeline",
    taskId: "task-04",
    time: "2:30 – 2:45 PM",
    start: 14.5,
    end: 14.75,
    status: "neutral",
  },
  {
    id: "event-08",
    title: "Draft the product brief outline",
    taskId: "task-07",
    time: "3:30 – 4:15 PM",
    start: 15.5,
    end: 16.25,
    status: "neutral",
  },
  {
    id: "event-09",
    title: "QA the new onboarding checklist",
    taskId: "task-08",
    time: "4:30 – 5:00 PM",
    start: 16.5,
    end: 17,
    status: "neutral",
  },
  {
    id: "event-10",
    title: "Plan tomorrow's stakeholder update",
    taskId: "task-09",
    time: "5:30 – 5:50 PM",
    start: 17.5,
    end: 17.5 + 20 / 60,
    status: "neutral",
  },
] satisfies ReadonlyArray<CalendarEvent>;

function sortTasks(tasks: ReadonlyArray<Task>) {
  return [...tasks].sort((firstTask, secondTask) => {
    const firstDone = firstTask.status === "done" ? 1 : 0;
    const secondDone = secondTask.status === "done" ? 1 : 0;

    if (firstDone !== secondDone) {
      return firstDone - secondDone;
    }

    const firstDeadline = firstTask.deadline ?? "9999-12-31";
    const secondDeadline = secondTask.deadline ?? "9999-12-31";

    if (firstDeadline !== secondDeadline) {
      return firstDeadline.localeCompare(secondDeadline);
    }

    return priorityOrder[firstTask.priority] - priorityOrder[secondTask.priority];
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
    (typeof candidate.duration === "number" || candidate.duration === null) &&
    (typeof candidate.startDate === "string" || candidate.startDate === null) &&
    (typeof candidate.deadline === "string" || candidate.deadline === null) &&
    isPriority(candidate.priority) &&
    (candidate.status === "open" || candidate.status === "focus" || candidate.status === "done")
  );
}

function normalizeStoredTask(value: unknown): Task | null {
  if (isTask(value)) {
    return value;
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
  };

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.title !== "string" ||
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

  return {
    id: candidate.id,
    title: candidate.title,
    duration,
    startDate: typeof candidate.startDate === "string" && candidate.startDate ? candidate.startDate : null,
    deadline: typeof candidate.deadline === "string" && candidate.deadline ? candidate.deadline : null,
    priority: isPriority(candidate.priority) ? candidate.priority : "normal",
    status: candidate.status,
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

function isTimeValue(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeNightOwlSettings(value: unknown): NightOwlSettings {
  if (!value || typeof value !== "object") {
    return defaultNightOwlSettings;
  }

  const candidate = value as Partial<NightOwlSettings>;
  return {
    nightOwlMode: candidate.nightOwlMode === true,
    dayStartTime: isTimeValue(candidate.dayStartTime)
      ? candidate.dayStartTime
      : defaultNightOwlSettings.dayStartTime,
  };
}

function readLocalSettings(): NightOwlSettings {
  try {
    const savedSettings = window.localStorage.getItem(settingsStorageKey);
    return savedSettings ? normalizeNightOwlSettings(JSON.parse(savedSettings)) : defaultNightOwlSettings;
  } catch {
    return defaultNightOwlSettings;
  }
}

function getTimeMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function getLogicalDate(timestamp: number, settings: NightOwlSettings) {
  const date = new Date(timestamp);
  const currentMinutes = date.getHours() * 60 + date.getMinutes();

  if (settings.nightOwlMode && currentMinutes < getTimeMinutes(settings.dayStartTime)) {
    date.setDate(date.getDate() - 1);
  }

  return toIsoDate(date);
}

function formatTimeValue(value: string) {
  if (!isTimeValue(value)) {
    return value;
  }

  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date(2000, 0, 1, hours, minutes);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

function writeUserLocalBackup(userId: string, tasks: ReadonlyArray<Task>) {
  try {
    window.localStorage.setItem(`${localBackupKeyPrefix}${userId}`, JSON.stringify(tasks));
  } catch {
    // Keep the original pending cache if browser storage is unavailable.
  }
}

function readTaskCache(keys: ReadonlyArray<string>, seedDemoData: boolean) {
  try {
    const savedTasks = keys
      .map((key) => window.localStorage.getItem(key))
      .find((value) => value !== null);

    if (!savedTasks) {
      if (seedDemoData) {
        window.localStorage.setItem(starterDataVersionStorageKey, starterDataVersion);
      }
      return { tasks: initialTasks, hasStoredTasks: false };
    }

    const parsedTasks: unknown = JSON.parse(savedTasks);
    if (!Array.isArray(parsedTasks)) {
      return { tasks: initialTasks, hasStoredTasks: true };
    }

    const normalizedTasks = parsedTasks.map(normalizeStoredTask);
    if (!normalizedTasks.every((task): task is Task => task !== null)) {
      return { tasks: initialTasks, hasStoredTasks: true };
    }

    const restoredTasks = ensureSingleFocus(normalizedTasks);
    if (!seedDemoData) {
      return { tasks: restoredTasks, hasStoredTasks: true };
    }

    const hasAppliedStarterUpdate = window.localStorage.getItem(starterDataVersionStorageKey) === starterDataVersion;
    const missingDemoTasks = demoExpansionTasks.filter(
      (starterTask) => !restoredTasks.some((task) => task.id === starterTask.id),
    );
    const shouldSeedDemoData = !hasAppliedStarterUpdate && missingDemoTasks.length > 0;
    const nextTasks = shouldSeedDemoData ? ensureSingleFocus([...restoredTasks, ...missingDemoTasks]) : restoredTasks;

    if (shouldSeedDemoData) {
      window.localStorage.setItem(starterDataVersionStorageKey, starterDataVersion);
    }

    return { tasks: nextTasks, hasStoredTasks: true };
  } catch {
    return { tasks: initialTasks, hasStoredTasks: false };
  }
}

function readPendingLocalTasks() {
  return readTaskCache([storageKey, ...legacyStorageKeys], true);
}

function clearPendingLocalTasks() {
  try {
    [storageKey, ...legacyStorageKeys].forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // The imported tasks are still safe in the cloud if storage cleanup fails.
  }
}


export default function Home() {
  const [tasks, setTasks] = useState<ReadonlyArray<Task>>(initialTasks);
  const [supabaseClient] = useState(() => getSupabaseBrowserClient());
  const { status: authStatus, user: authUser, avatarUrl, signOut } = useAuth();
  const [remoteSyncReady, setRemoteSyncReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"connecting" | "saving" | "synced" | "error">("connecting");
  const [pendingRemoteDeletes, setPendingRemoteDeletes] = useState<ReadonlyArray<string>>([]);
  const [taskMigrationMessage, setTaskMigrationMessage] = useState("");
  const [authActionMessage, setAuthActionMessage] = useState("");
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDuration, setEditingDuration] = useState("");
  const [editingStartDate, setEditingStartDate] = useState("");
  const [editingDeadline, setEditingDeadline] = useState("");
  const [editingPriority, setEditingPriority] = useState<Priority>("normal");
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
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<NightOwlSettings>(defaultNightOwlSettings);
  const [settingsDraft, setSettingsDraft] = useState<NightOwlSettings>(defaultNightOwlSettings);
  const [currentDateTime, setCurrentDateTime] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const router = useRouter();
  const topbarRef = useRef<HTMLElement | null>(null);
  const profileButtonRef = useRef<HTMLButtonElement | null>(null);
  const settingsToggleRef = useRef<HTMLInputElement | null>(null);
  const newTaskInputRef = useRef<HTMLInputElement | null>(null);
  const priorityMenuRef = useRef<HTMLDivElement | null>(null);
  const durationMenuRef = useRef<HTMLDivElement | null>(null);
  const dueDateMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const updateDateTime = () => setCurrentDateTime(Date.now());
    updateDateTime();
    const intervalId = window.setInterval(updateDateTime, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    settingsToggleRef.current?.focus();

    function handleSettingsKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setSettingsDraft(settings);
      setIsSettingsOpen(false);
      window.requestAnimationFrame(() => profileButtonRef.current?.focus());
    }

    document.addEventListener("keydown", handleSettingsKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleSettingsKeyDown);
    };
  }, [isSettingsOpen, settings]);

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
      setSettings(readLocalSettings());
      if (!authUser || authStatus !== "signed_in") {
        return;
      }

      const localCache = readPendingLocalTasks();
      const localTasks = localCache.tasks;

      if (isCancelled) {
        return;
      }

      if (!supabaseClient) {
        setIsHydrated(true);
        return;
      }

      setSyncStatus("connecting");

      try {
        const remoteTasks = await loadRemoteTasks(supabaseClient, authUser);
        if (isCancelled) {
          return;
        }

        if (remoteTasks.length > 0) {
          const nextTasks = ensureSingleFocus(remoteTasks);
          setTasks(nextTasks);
          writeUserTasks(authUser.id, nextTasks);
          if (localCache.hasStoredTasks) {
            writeUserLocalBackup(authUser.id, localTasks);
            clearPendingLocalTasks();
            setTaskMigrationMessage("Cloud tasks are loaded. Local tasks on this device were kept as a backup and were not merged.");
          }
        } else {
          setTasks(localTasks);
          await persistRemoteTasks(supabaseClient, authUser, localTasks);
          writeUserTasks(authUser.id, localTasks);
          if (localCache.hasStoredTasks) {
            clearPendingLocalTasks();
          }
        }

        setRemoteSyncReady(true);
        setSyncStatus("synced");
      } catch {
        if (!isCancelled) {
          setTasks(localTasks);
          setSyncStatus("error");
        }
      } finally {
        if (!isCancelled) {
          setIsHydrated(true);
        }
      }
    };

    const frameId = window.requestAnimationFrame(() => {
      void restoreTasks();
    });
    return () => {
      isCancelled = true;
      window.cancelAnimationFrame(frameId);
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
      setSyncStatus("saving");
      void persistRemoteTasks(supabaseClient, authUser, tasks, deletedTaskIds)
      .then(() => {
        if (isCancelled) {
          return;
        }

        setPendingRemoteDeletes((currentIds) =>
          currentIds.filter((taskId) => !deletedTaskIds.includes(taskId)),
        );
        setSyncStatus("synced");
      })
      .catch(() => {
        if (!isCancelled) {
          setSyncStatus("error");
        }
      });
    }, 250);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [authUser, isHydrated, pendingRemoteDeletes, remoteSyncReady, supabaseClient, tasks]);

  useEffect(() => {
    if (!isNotificationsOpen && !isProfileOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && topbarRef.current?.contains(event.target)) {
        return;
      }

      setIsNotificationsOpen(false);
      setIsProfileOpen(false);
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      setIsNotificationsOpen(false);
      setIsProfileOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNotificationsOpen, isProfileOpen]);

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

  function handleAddTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTaskTitle.trim();

    if (!title) {
      return;
    }

    const newTask: Task = {
      id: `task-${Date.now()}`,
      title,
      duration: parseDuration(newTaskDuration),
      startDate: newTaskStartDate || null,
      deadline: newTaskDeadline || null,
      priority: newTaskPriority,
      status: "open",
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
    newTaskInputRef.current?.focus();
  }

  async function handleSignOut() {
    const result = await signOut();
    if (!result.ok) {
      setAuthActionMessage(result.message);
      return;
    }

    setRemoteSyncReady(false);
    setIsHydrated(false);
    setPendingRemoteDeletes([]);
    setTasks([]);
    setAuthActionMessage("");
    setIsProfileOpen(false);
    router.replace(getAppPath("/login"));
  }

  function handleOpenProfile() {
    setIsNotificationsOpen(false);
    setIsProfileOpen(false);
    setIsProfileEditorOpen(true);
  }

  function handleOpenSettings() {
    setSettingsDraft(settings);
    setIsNotificationsOpen(false);
    setIsProfileOpen(false);
    setIsSettingsOpen(true);
  }

  function restoreProfileFocus() {
    window.requestAnimationFrame(() => profileButtonRef.current?.focus());
  }

  function handleCancelSettings() {
    setSettingsDraft(settings);
    setIsSettingsOpen(false);
    restoreProfileFocus();
  }

  function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSettings = normalizeNightOwlSettings(settingsDraft);

    setSettings(nextSettings);
    setSettingsDraft(nextSettings);
    try {
      window.localStorage.setItem(settingsStorageKey, JSON.stringify(nextSettings));
    } catch {
      // The setting remains active for this session if browser storage is unavailable.
    }
    setIsSettingsOpen(false);
    restoreProfileFocus();
  }

  function resetNewTaskDraft() {
    setNewTaskTitle("");
    setNewTaskDuration("");
    setNewTaskStartDate("");
    setNewTaskDeadline("");
    setNewTaskPriority("normal");
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
  }

  function handleSaveEdit(event: FormEvent<HTMLFormElement>, taskId: string) {
    event.preventDefault();
    const title = editingTitle.trim();

    if (!title) {
      return;
    }

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
  const taskTitlesById = new Map(tasks.map((task) => [task.id, task.title]));
  const editingTask = editingId ? tasks.find((task) => task.id === editingId) ?? null : null;
  const headerDateTime = formatHeaderDateTime(currentDateTime, logicalToday);
  const profileName =
    typeof authUser?.user_metadata?.full_name === "string"
      ? authUser.user_metadata.full_name
      : authUser?.email?.split("@")[0] ?? "HeavyUser";
  const profileInitials = profileName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const profileWorkspace =
    syncStatus === "synced"
      ? "Cloud synced"
      : syncStatus === "saving"
        ? "Saving…"
        : syncStatus === "error"
          ? "Sync needs attention"
          : "Connecting…";

  if (authStatus === "loading") {
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
              setIsProfileOpen(false);
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
                  setIsProfileOpen(false);
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

            <div className="hu-popover-anchor">
              <button
                aria-expanded={isProfileOpen}
                aria-haspopup="menu"
                className="hu-profile-button"
                ref={profileButtonRef}
                type="button"
                onClick={() => {
                  setIsProfileOpen((current) => !current);
                  setIsNotificationsOpen(false);
                }}
              >
                <span className="hu-avatar">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="" />
                  ) : (
                    <span aria-hidden="true">{profileInitials}</span>
                  )}
                </span>
                <span className="hu-profile-copy">
                  <span className="hu-profile-name">{profileName}</span>
                  <span className="hu-profile-workspace">{profileWorkspace}</span>
                </span>
                <ChevronDown aria-hidden="true" size={14} />
              </button>
              {isProfileOpen ? (
                <div className="hu-popover hu-profile-popover" role="menu" aria-label="Profile menu">
                  <div className="hu-popover-profile" role="presentation">
                    <span className="hu-profile-portrait">
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt="" />
                      ) : (
                        <span aria-hidden="true">{profileInitials}</span>
                      )}
                    </span>
                    <div className="hu-popover-profile-copy">
                      <strong>{profileName}</strong>
                      <span>{authUser?.email ?? profileWorkspace}</span>
                    </div>
                  </div>
                  <div className="hu-popover-divider" role="presentation" />
                  <button className="hu-menu-item" role="menuitem" type="button" onClick={handleOpenProfile}>
                    <Pencil aria-hidden="true" size={14} />
                    <span>Edit profile</span>
                  </button>
                  <button className="hu-menu-item" role="menuitem" type="button" onClick={handleOpenSettings}>
                    <Settings2 aria-hidden="true" size={14} />
                    <span>Settings</span>
                  </button>
                  <div className="hu-popover-divider" role="presentation" />
                  <button className="hu-auth-action" type="button" onClick={() => void handleSignOut()}>
                    Sign out
                  </button>
                  {authActionMessage ? <span className="hu-auth-message" role="alert">{authActionMessage}</span> : null}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className="hu-content">
          {taskMigrationMessage ? (
            <div className="hu-sync-notice" role="status">
              <span>{taskMigrationMessage}</span>
              <button type="button" onClick={() => setTaskMigrationMessage("")}>Dismiss</button>
            </div>
          ) : null}
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
              mockEvents={calendarEvents}
              taskTitlesById={taskTitlesById}
              currentTime={10 + 45 / 60}
              timelineStart={9}
              timelineHours={9}
            />
          </div>
        </div>

        {isSettingsOpen ? (
          <div
            className="hu-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                handleCancelSettings();
              }
            }}
          >
            <form
              aria-labelledby="settings-title"
              className="hu-settings-dialog"
              role="dialog"
              aria-modal="true"
              onSubmit={handleSaveSettings}
            >
              <button
                aria-label="Close settings"
                className="hu-task-dialog-close hu-icon-button"
                type="button"
                onClick={handleCancelSettings}
              >
                <X aria-hidden="true" />
              </button>

              <div className="hu-settings-dialog-body">
                <div className="hu-settings-intro">
                  <span className="hu-settings-mark" aria-hidden="true">
                    <Settings2 size={17} />
                  </span>
                  <div>
                    <span className="hu-field-label">Settings</span>
                    <h2 id="settings-title">Daily rhythm</h2>
                    <p>Make HeavyUser follow the way your day actually runs.</p>
                  </div>
                </div>

                <label className="hu-settings-toggle-row">
                  <span className="hu-settings-toggle-copy">
                    <strong>Night owl mode</strong>
                    <small>Keep the previous day open past midnight.</small>
                  </span>
                  <input
                    aria-describedby="settings-day-start-help"
                    checked={settingsDraft.nightOwlMode}
                    className="hu-settings-switch"
                    ref={settingsToggleRef}
                    type="checkbox"
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        nightOwlMode: event.target.checked,
                      }))
                    }
                  />
                </label>

                <label className="hu-settings-time-field">
                  <span className="hu-field-label">New day starts at</span>
                  <input
                    aria-describedby="settings-day-start-help"
                    className="hu-edit-input"
                    disabled={!settingsDraft.nightOwlMode}
                    onChange={(event) =>
                      setSettingsDraft((current) => ({
                        ...current,
                        dayStartTime: event.target.value,
                      }))
                    }
                    type="time"
                    value={settingsDraft.dayStartTime}
                  />
                  <small id="settings-day-start-help">
                    {settingsDraft.nightOwlMode
                      ? `Your task day continues until ${formatTimeValue(settingsDraft.dayStartTime)}.`
                      : "Turn on Night owl mode to change this time."}
                  </small>
                </label>
              </div>

              <div className="hu-task-dialog-actions">
                <button className="hu-form-button is-primary" type="submit">
                  Save changes
                </button>
                <button className="hu-form-button" type="button" onClick={handleCancelSettings}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : null}

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
              </div>

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

        <ProfileDialog key={`${authUser.id}-${isProfileEditorOpen ? "open" : "closed"}`} open={isProfileEditorOpen} onClose={() => setIsProfileEditorOpen(false)} />
      </div>
    </main>
  );
}
