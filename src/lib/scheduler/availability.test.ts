import { describe, expect, it } from "vitest";
import { getBusyIntervalsFromCalendarEvents } from "@/lib/scheduler/availability";

describe("calendar availability", () => {
  it("does not make transparent events block scheduling", () => {
    expect(getBusyIntervalsFromCalendarEvents([
      { startAt: "2026-08-03T09:00:00.000Z", endAt: "2026-08-03T10:00:00.000Z", transparency: "transparent" },
      { startAt: "2026-08-03T10:00:00.000Z", endAt: "2026-08-03T11:00:00.000Z", transparency: "opaque" },
    ], "UTC")).toEqual([
      { start: "2026-08-03T10:00:00.000Z", end: "2026-08-03T11:00:00.000Z", source: "calendar" },
    ]);
  });

  it("keeps all-day events busy for the whole local date", () => {
    expect(getBusyIntervalsFromCalendarEvents([
      { startDate: "2026-08-03", endDate: "2026-08-04" },
    ], "UTC")).toEqual([
      { start: "2026-08-03T00:00:00.000Z", end: "2026-08-04T00:00:00.000Z", source: "calendar" },
    ]);
  });

  it("uses the calendar timezone for all-day events", () => {
    expect(getBusyIntervalsFromCalendarEvents([
      { startDate: "2026-08-03", endDate: "2026-08-04", timeZone: "America/New_York" },
    ], "UTC")).toEqual([
      { start: "2026-08-03T04:00:00.000Z", end: "2026-08-04T04:00:00.000Z", source: "calendar" },
    ]);
  });
});
