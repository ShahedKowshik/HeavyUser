export type Priority = "urgent" | "high" | "normal" | "low";

export type CalendarVisibility = "default" | "public" | "private";
export type CalendarTransparency = "default" | "opaque" | "transparent";

export type TaskScheduleState =
  | "scheduled"
  | "scheduling"
  | "needs_duration"
  | "at_risk"
  | "locked"
  | "awaiting_completion"
  | "paused"
  | "calendar_error";

export type Task = {
  id: string;
  title: string;
  duration: number | null;
  startDate: string | null;
  deadline: string | null;
  priority: Priority;
  status: "open" | "focus" | "done";
  autoSchedule: boolean;
  minBlockMinutes: number | null;
  maxBlockMinutes: number | null;
  calendarVisibility: CalendarVisibility | null;
  calendarTransparency: CalendarTransparency | null;
};
