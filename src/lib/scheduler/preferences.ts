import type { CalendarTransparency, CalendarVisibility } from "@/lib/tasks";
import {
  DEFAULT_SCHEDULER_PREFERENCES,
  type SchedulerPreferences,
  type WorkWindow,
  type WorkWindows,
} from "@/lib/scheduler/types";

const VALID_VISIBILITY: ReadonlyArray<CalendarVisibility> = ["default", "public", "private"];
const VALID_TRANSPARENCY: ReadonlyArray<CalendarTransparency> = ["default", "opaque", "transparent"];

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
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

  const candidate = value as { start?: unknown; end?: unknown };
  if (!isTime(candidate.start) || !isTime(candidate.end) || candidate.start >= candidate.end) {
    return null;
  }

  return { start: candidate.start, end: candidate.end };
}

export function normalizeWorkWindows(value: unknown): WorkWindows {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    Array.from({ length: 7 }, (_, day) => {
      const valueForDay = source[String(day)];
      return [
        String(day),
        Array.isArray(valueForDay)
          ? valueForDay.map(normalizeWindow).filter((window): window is WorkWindow => window !== null).slice(0, 4)
          : DEFAULT_SCHEDULER_PREFERENCES.workWindows[String(day)] ?? [],
      ];
    }),
  );
}

export function normalizeSchedulerPreferences(value: unknown, timezoneFallback = "UTC"): SchedulerPreferences {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const minValue = candidate.default_min_block_minutes ?? candidate.defaultMinBlockMinutes;
  const maxCandidate = candidate.default_max_block_minutes ?? candidate.defaultMaxBlockMinutes;
  const min = typeof minValue === "number" && Number.isFinite(minValue) && minValue >= 5
    ? Math.round(minValue)
    : DEFAULT_SCHEDULER_PREFERENCES.defaultMinBlockMinutes;
  const maxValue = typeof maxCandidate === "number" && Number.isFinite(maxCandidate)
    ? Math.round(maxCandidate)
    : DEFAULT_SCHEDULER_PREFERENCES.defaultMaxBlockMinutes;
  const max = Math.max(min, maxValue >= 5 ? maxValue : DEFAULT_SCHEDULER_PREFERENCES.defaultMaxBlockMinutes);
  const visibilityValue = candidate.default_calendar_visibility ?? candidate.defaultCalendarVisibility;
  const transparencyValue = candidate.default_calendar_transparency ?? candidate.defaultCalendarTransparency;
  const visibility = VALID_VISIBILITY.includes(visibilityValue as CalendarVisibility)
    ? visibilityValue as CalendarVisibility
    : DEFAULT_SCHEDULER_PREFERENCES.defaultCalendarVisibility;
  const transparency = VALID_TRANSPARENCY.includes(transparencyValue as CalendarTransparency)
    ? transparencyValue as CalendarTransparency
    : DEFAULT_SCHEDULER_PREFERENCES.defaultCalendarTransparency;

  return {
    enabled: candidate.enabled === true,
    timezone: isTimezone(candidate.timezone)
      ? candidate.timezone
      : (isTimezone(timezoneFallback) ? timezoneFallback : DEFAULT_SCHEDULER_PREFERENCES.timezone),
    workWindows: normalizeWorkWindows(candidate.work_windows ?? candidate.workWindows),
    defaultMinBlockMinutes: min,
    defaultMaxBlockMinutes: max,
    defaultCalendarVisibility: visibility,
    defaultCalendarTransparency: transparency,
  };
}

export function preferencesToRow(preferences: SchedulerPreferences, userId: string) {
  return {
    user_id: userId,
    enabled: preferences.enabled,
    timezone: preferences.timezone,
    work_windows: preferences.workWindows,
    default_min_block_minutes: preferences.defaultMinBlockMinutes,
    default_max_block_minutes: preferences.defaultMaxBlockMinutes,
    default_calendar_visibility: preferences.defaultCalendarVisibility,
    default_calendar_transparency: preferences.defaultCalendarTransparency,
    updated_at: new Date().toISOString(),
  };
}
