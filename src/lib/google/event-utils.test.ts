import { describe, expect, it } from "vitest";
import { dedupePlannerEvents, getPlannerEventKey, getStaleCalendarEventKeys, hasEventEditConflict, isCalendarEventInProgress, isValidCalendarDate, isValidTimedEventRange, type PlannerEventIdentity } from "@/lib/google/event-utils";

function event(overrides: Partial<PlannerEventIdentity> = {}): PlannerEventIdentity {
  return {
    id: "event-1",
    providerEventId: "provider-1",
    isTaskBlock: false,
    taskId: null,
    scheduleBlockId: null,
    start: "2026-08-04T10:00:00.000Z",
    end: "2026-08-04T10:30:00.000Z",
    ...overrides,
  };
}

describe("planner event identity", () => {
  it("groups managed blocks by task and exact time range", () => {
    expect(getPlannerEventKey(event({
      isTaskBlock: true,
      taskId: "task-1",
      providerEventId: "provider-a",
    }))).toBe("managed:task-1:1785837600000:1785839400000");
  });

  it("keeps ordinary Google events distinct even when their titles and times match", () => {
    const first = event({ id: "event-1", providerEventId: "provider-1" });
    const second = event({ id: "event-2", providerEventId: "provider-2" });
    expect(dedupePlannerEvents([first, second])).toHaveLength(2);
  });

  it("does not merge matching provider ids from different calendars", () => {
    const first = event({ id: "event-a", providerEventId: "same-id", calendarId: "space-a" });
    const second = event({ id: "event-b", providerEventId: "same-id", calendarId: "space-b" });
    expect(dedupePlannerEvents([first, second])).toHaveLength(2);
  });

  it("prefers a provider-backed event over a synthetic fallback", () => {
    const providerEvent = event({
      id: "provider-event",
      providerEventId: "provider-event",
      isTaskBlock: true,
      taskId: "task-1",
      scheduleBlockId: "block-1",
    });
    const syntheticEvent = event({
      id: "synthetic-event",
      providerEventId: "synthetic-event",
      isTaskBlock: true,
      taskId: "task-1",
      scheduleBlockId: "block-1",
      isPlannerSynthetic: true,
    });

    expect(dedupePlannerEvents([syntheticEvent, providerEvent], new Set(["block-1"]))).toEqual([providerEvent]);
  });
});

describe("calendar edit conflicts", () => {
  it("requires the editor to send the exact cached ETag", () => {
    expect(hasEventEditConflict({ requestedEtag: undefined, localEtag: "v2" })).toBe(true);
    expect(hasEventEditConflict({ requestedEtag: "v1", localEtag: "v2" })).toBe(true);
    expect(hasEventEditConflict({ requestedEtag: "v2", localEtag: "v2" })).toBe(false);
  });

  it("catches a Google change after the local cache was read", () => {
    expect(hasEventEditConflict({ requestedEtag: "v2", localEtag: "v2", providerEtag: "v3" })).toBe(true);
    expect(hasEventEditConflict({ requestedEtag: "v2", localEtag: "v2", providerEtag: "v2" })).toBe(false);
  });
});

describe("full calendar snapshot cleanup", () => {
  it("removes only cached rows missing from a successfully fetched provider snapshot", () => {
    expect(getStaleCalendarEventKeys(
      ["kept", "deleted", "also-kept"],
      new Set(["kept", "also-kept"]),
    )).toEqual(["deleted"]);
  });
});

describe("calendar request bounds", () => {
  it("accepts real calendar dates and rejects impossible dates", () => {
    expect(isValidCalendarDate("2028-02-29")).toBe(true);
    expect(isValidCalendarDate("2026-02-29")).toBe(false);
    expect(isValidCalendarDate("2026-13-01")).toBe(false);
  });

  it("accepts timed events up to 24 hours and rejects longer or reversed ranges", () => {
    expect(isValidTimedEventRange("2026-08-01T10:00:00Z", "2026-08-02T10:00:00Z")).toBe(true);
    expect(isValidTimedEventRange("2026-08-01T10:00:00Z", "2026-08-02T10:01:00Z")).toBe(false);
    expect(isValidTimedEventRange("2026-08-01T10:00:00Z", "2026-08-01T10:04:00Z")).toBe(false);
    expect(isValidTimedEventRange("2026-08-01T10:00:00Z", "2026-08-01T09:00:00Z")).toBe(false);
  });
});

describe("calendar event timing", () => {
  const now = Date.parse("2026-08-01T10:00:00.000Z");

  it("only treats a timed event as active while now is inside its range", () => {
    expect(isCalendarEventInProgress({ start: "2026-08-01T09:00:00.000Z", end: "2026-08-01T09:30:00.000Z" }, now)).toBe(false);
    expect(isCalendarEventInProgress({ start: "2026-08-01T09:30:00.000Z", end: "2026-08-01T10:30:00.000Z" }, now)).toBe(true);
    expect(isCalendarEventInProgress({ start: "2026-08-01T10:00:00.000Z", end: "2026-08-01T11:00:00.000Z" }, now)).toBe(true);
    expect(isCalendarEventInProgress({ start: "2026-08-01T09:00:00.000Z", end: "2026-08-01T10:00:00.000Z" }, now)).toBe(false);
    expect(isCalendarEventInProgress({ start: "2026-08-01T10:30:00.000Z", end: "2026-08-01T11:00:00.000Z" }, now)).toBe(false);
  });

  it("does not activate all-day or invalid events", () => {
    expect(isCalendarEventInProgress({ start: "2026-08-01T09:00:00.000Z", end: "2026-08-01T11:00:00.000Z", allDay: true }, now)).toBe(false);
    expect(isCalendarEventInProgress({ start: null, end: null }, now)).toBe(false);
    expect(isCalendarEventInProgress({ start: "not-a-date", end: "2026-08-01T11:00:00.000Z" }, now)).toBe(false);
  });
});
