import type { BusyInterval } from "@/lib/scheduler/types";

export type CalendarBusyEvent = {
  status?: string | null;
  transparency?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  timeZone?: string | null;
};

function getLocalParts(timestamp: number, timezone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}

function localMidnight(date: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  let timestamp = Date.UTC(year, month - 1, day);
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const local = getLocalParts(timestamp, timezone);
    timestamp += Date.UTC(year, month - 1, day) - Date.UTC(Number(local.date.slice(0, 4)), Number(local.date.slice(5, 7)) - 1, Number(local.date.slice(8, 10)), local.hour, local.minute);
  }
  return timestamp;
}

export function getCalendarBusyInterval(event: CalendarBusyEvent, timezone: string): BusyInterval | null {
  if (event.status === "cancelled" || event.transparency === "transparent") return null;
  if (event.startAt && event.endAt) return { start: event.startAt, end: event.endAt, source: "calendar" };
  if (event.startDate && event.endDate) {
    const eventTimezone = event.timeZone || timezone;
    return {
      start: new Date(localMidnight(event.startDate, eventTimezone)).toISOString(),
      end: new Date(localMidnight(event.endDate, eventTimezone)).toISOString(),
      source: "calendar",
    };
  }
  return null;
}

export function getBusyIntervalsFromCalendarEvents(events: ReadonlyArray<CalendarBusyEvent>, timezone: string) {
  return events.map((event) => getCalendarBusyInterval(event, timezone)).filter((interval): interval is BusyInterval => interval !== null);
}
