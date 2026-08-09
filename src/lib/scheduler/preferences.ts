import type { CalendarTransparency, CalendarVisibility } from "@/lib/tasks";
import {
  DEFAULT_SCHEDULER_PREFERENCES,
  MAX_SCHEDULER_BLOCK_MINUTES,
  type SchedulerPreferences,
  type WorkWindow,
  type WorkWindows,
} from "@/lib/scheduler/types";

const VALID_VISIBILITY: ReadonlyArray<CalendarVisibility> = ["default", "public", "private"];
const VALID_TRANSPARENCY: ReadonlyArray<CalendarTransparency> = ["default", "opaque", "transparent"];

export function getSchedulerBlockLimitError(value: unknown) {
  const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const minValue = candidate.default_min_block_minutes ?? candidate.defaultMinBlockMinutes;
  const maxValue = candidate.default_max_block_minutes ?? candidate.defaultMaxBlockMinutes;
  for (const blockValue of [minValue, maxValue]) {
    if (blockValue !== undefined && (
      typeof blockValue !== "number"
      || !Number.isFinite(blockValue)
      || blockValue < 5
      || blockValue > MAX_SCHEDULER_BLOCK_MINUTES
    )) {
      return `Block limits must be between 5 and ${MAX_SCHEDULER_BLOCK_MINUTES.toLocaleString()} minutes.`;
    }
  }
  if (typeof minValue === "number" && typeof maxValue === "number" && minValue > maxValue) {
    return "The minimum block must be shorter than the maximum block.";
  }
  return null;
}

function isTime(value: unknown, allowEndOfDay = false): value is string {
  return typeof value === "string" && (allowEndOfDay && value === "24:00" || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value));
}

function isTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function normalizeWindow(value: unknown): WorkWindow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as { start?: unknown; end?: unknown; allDay?: unknown };
  if (candidate.allDay === true) {
    return { start: "00:00", end: "23:59", allDay: true };
  }
  if (!isTime(candidate.start) || !isTime(candidate.end, true) || candidate.start >= candidate.end) {
    return null;
  }

  return { start: candidate.start, end: candidate.end };
}

function normalizeDayWindows(value: unknown, fallback: ReadonlyArray<WorkWindow>) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value.map(normalizeWindow).filter((window): window is WorkWindow => window !== null);
  const allDayWindow = normalized.find((window) => window.allDay);
  const manualWindows = normalized.filter((window) => !window.allDay).slice(0, 4);
  return allDayWindow ? [allDayWindow, ...manualWindows] : manualWindows;
}

export function normalizeWorkWindows(value: unknown): WorkWindows {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    Array.from({ length: 7 }, (_, day) => {
      const valueForDay = source[String(day)];
      return [
        String(day),
        normalizeDayWindows(valueForDay, DEFAULT_SCHEDULER_PREFERENCES.workWindows[String(day)] ?? []),
      ];
    }),
  );
}

export function normalizeSchedulerPreferences(
  value: unknown,
  timezoneFallback = "UTC",
  daySettings?: Partial<Pick<SchedulerPreferences, "nightOwlMode" | "dayStartTime">>,
): SchedulerPreferences {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const minValue = candidate.default_min_block_minutes ?? candidate.defaultMinBlockMinutes;
  const maxCandidate = candidate.default_max_block_minutes ?? candidate.defaultMaxBlockMinutes;
  const min = typeof minValue === "number" && Number.isFinite(minValue) && minValue >= 5
    ? Math.min(MAX_SCHEDULER_BLOCK_MINUTES, Math.round(minValue))
    : DEFAULT_SCHEDULER_PREFERENCES.defaultMinBlockMinutes;
  const maxValue = typeof maxCandidate === "number" && Number.isFinite(maxCandidate)
    ? Math.round(maxCandidate)
    : DEFAULT_SCHEDULER_PREFERENCES.defaultMaxBlockMinutes;
  const max = Math.min(
    MAX_SCHEDULER_BLOCK_MINUTES,
    Math.max(min, maxValue >= 5 ? maxValue : DEFAULT_SCHEDULER_PREFERENCES.defaultMaxBlockMinutes),
  );
  const dayStartValue = candidate.day_start_time ?? candidate.dayStartTime;
  const hasNightOwlValue = candidate.night_owl_mode !== undefined || candidate.nightOwlMode !== undefined;
  const nightOwlMode = hasNightOwlValue
    ? candidate.night_owl_mode === true || candidate.nightOwlMode === true
    : daySettings?.nightOwlMode ?? DEFAULT_SCHEDULER_PREFERENCES.nightOwlMode;
  const visibilityValue = candidate.default_calendar_visibility ?? candidate.defaultCalendarVisibility;
  const transparencyValue = candidate.default_calendar_transparency ?? candidate.defaultCalendarTransparency;
  const visibility = VALID_VISIBILITY.includes(visibilityValue as CalendarVisibility)
    ? visibilityValue as CalendarVisibility
    : DEFAULT_SCHEDULER_PREFERENCES.defaultCalendarVisibility;
  const transparency = VALID_TRANSPARENCY.includes(transparencyValue as CalendarTransparency)
    ? transparencyValue as CalendarTransparency
    : DEFAULT_SCHEDULER_PREFERENCES.defaultCalendarTransparency;

  return {
    // Scheduling is a product rule now. Keep reading the legacy column so old
    // rows and old tabs remain compatible, but never allow it to turn off.
    enabled: true,
    timezone: isTimezone(candidate.timezone)
      ? candidate.timezone
      : (isTimezone(timezoneFallback) ? timezoneFallback : DEFAULT_SCHEDULER_PREFERENCES.timezone),
    workWindows: normalizeWorkWindows(candidate.work_windows ?? candidate.workWindows),
    nightOwlMode,
    dayStartTime: isTime(dayStartValue)
      ? dayStartValue
      : (isTime(daySettings?.dayStartTime) ? daySettings.dayStartTime : DEFAULT_SCHEDULER_PREFERENCES.dayStartTime),
    defaultMinBlockMinutes: min,
    defaultMaxBlockMinutes: max,
    defaultCalendarVisibility: visibility,
    defaultCalendarTransparency: transparency,
  };
}

export function hasWorkingWindow(preferences: SchedulerPreferences) {
  return Object.values(preferences.workWindows).some((windows) => windows.length > 0);
}

export function preferencesToRow(preferences: SchedulerPreferences, userId: string) {
  return {
    user_id: userId,
    enabled: true,
    timezone: preferences.timezone,
    work_windows: preferences.workWindows,
    default_min_block_minutes: preferences.defaultMinBlockMinutes,
    default_max_block_minutes: preferences.defaultMaxBlockMinutes,
    default_calendar_visibility: preferences.defaultCalendarVisibility,
    default_calendar_transparency: preferences.defaultCalendarTransparency,
    updated_at: new Date().toISOString(),
  };
}
