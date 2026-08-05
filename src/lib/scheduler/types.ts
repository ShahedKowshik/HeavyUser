import type {
  CalendarTransparency,
  CalendarVisibility,
  Priority,
  TaskScheduleState,
} from "@/lib/tasks";
import type { ActiveTimerSnapshot, MissedBlockSnapshot, TaskWorkSummary, TimerAlert } from "@/lib/timer/types";

export type WorkWindow = {
  start: string;
  end: string;
  allDay?: boolean;
};

export type WorkWindows = Record<string, ReadonlyArray<WorkWindow>>;

export type SchedulerPreferences = {
  enabled: boolean;
  timezone: string;
  workWindows: WorkWindows;
  nightOwlMode: boolean;
  dayStartTime: string;
  defaultMinBlockMinutes: number;
  defaultMaxBlockMinutes: number;
  defaultCalendarVisibility: CalendarVisibility;
  defaultCalendarTransparency: CalendarTransparency;
};

export type SchedulerTask = {
  id: string;
  title: string;
  spaceId?: string | null;
  subSpaceId?: string | null;
  duration: number | null;
  startDate: string | null;
  deadline: string | null;
  priority: Priority;
  position: number;
  status: "open" | "focus" | "done";
  autoSchedule: boolean;
  minBlockMinutes: number | null;
  maxBlockMinutes: number | null;
  calendarVisibility: CalendarVisibility | null;
  calendarTransparency: CalendarTransparency | null;
};

export type ScheduledBlock = {
  id: string;
  taskId: string;
  calendarId: string;
  spaceId?: string | null;
  start: string;
  end: string;
  plannedStart: string;
  plannedEnd: string;
  state: "flexible" | "locked" | "replaced" | "cancelled" | "missed";
  providerEventId: string | null;
  etag: string | null;
  syncVersion: number;
};

export type BusyInterval = {
  start: string;
  end: string;
  source: "calendar" | "locked";
};

export type PlannedBlock = {
  taskId: string;
  start: string;
  end: string;
  id?: string;
  state?: "flexible" | "locked" | "replaced" | "cancelled" | "missed";
};

export type TaskPlan = {
  taskId: string;
  state: TaskScheduleState;
  fixedMinutes: number;
  scheduledMinutes: number;
  missingMinutes: number;
  warning: string | null;
  blocks: ReadonlyArray<PlannedBlock>;
};

export type TaskScheduleStatus = {
  taskId: string;
  state: TaskScheduleState;
  scheduledMinutes: number;
  missingMinutes: number;
  workedMinutes: number;
  remainingMinutes: number;
  missedMinutes: number;
  activeSessionId: string | null;
  warning: string | null;
  updatedAt: string;
};

export type ScheduleBlockSnapshot = {
  id: string;
  taskId: string;
  calendarId: string;
  spaceId?: string | null;
  providerEventId: string | null;
  start: string;
  end: string;
  plannedStart: string;
  plannedEnd: string;
  state: "flexible" | "locked" | "replaced" | "cancelled" | "missed";
};

export type TaskScheduleSnapshot = {
  statuses: ReadonlyArray<TaskScheduleStatus>;
  blocks: ReadonlyArray<ScheduleBlockSnapshot>;
  activeSession?: ActiveTimerSnapshot | null;
  sessionsByTask?: Readonly<Record<string, TaskWorkSummary>>;
  missedBlocks?: ReadonlyArray<MissedBlockSnapshot>;
  alerts?: ReadonlyArray<TimerAlert>;
};

export type SchedulePlan = {
  tasks: ReadonlyArray<TaskPlan>;
  busyIntervals: ReadonlyArray<BusyInterval>;
};

export const DEFAULT_WORK_WINDOWS: WorkWindows = {
  "0": [],
  "1": [{ start: "09:00", end: "17:00" }],
  "2": [{ start: "09:00", end: "17:00" }],
  "3": [{ start: "09:00", end: "17:00" }],
  "4": [{ start: "09:00", end: "17:00" }],
  "5": [{ start: "09:00", end: "17:00" }],
  "6": [],
};

export const DEFAULT_SCHEDULER_PREFERENCES: SchedulerPreferences = {
  enabled: true,
  timezone: "UTC",
  workWindows: DEFAULT_WORK_WINDOWS,
  nightOwlMode: false,
  dayStartTime: "04:00",
  defaultMinBlockMinutes: 30,
  defaultMaxBlockMinutes: 90,
  defaultCalendarVisibility: "default",
  defaultCalendarTransparency: "default",
};
