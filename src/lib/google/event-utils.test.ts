import { describe, expect, it } from "vitest";
import { dedupePlannerEvents, getPlannerEventKey, type PlannerEventIdentity } from "@/lib/google/event-utils";

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
