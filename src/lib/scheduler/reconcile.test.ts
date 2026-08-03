import { describe, expect, it } from "vitest";
import { getManagedEventProperties, selectManagedEventCleanup } from "@/lib/scheduler/reconcile";

function managedEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventKey: "event-1::",
    providerEventId: "event-1",
    startAt: "2026-08-04T10:00:00.000Z",
    endAt: "2026-08-04T10:30:00.000Z",
    status: "confirmed",
    googleUpdatedAt: null,
    privateProperties: {
      heavyuser: "task-block",
      heavyuserTaskId: "task-1",
      heavyuserBlockId: "block-1",
    },
    ...overrides,
  };
}

describe("managed calendar reconciliation", () => {
  it("recognizes HeavyUser private properties without treating ordinary events as managed", () => {
    expect(getManagedEventProperties({ heavyuser: "task-block", heavyuserTaskId: "task-1", heavyuserBlockId: "block-1" })).toEqual({
      isManaged: true,
      taskId: "task-1",
      blockId: "block-1",
    });
    expect(getManagedEventProperties({})).toEqual({ isManaged: false, taskId: null, blockId: null });
  });

  it("removes orphaned managed events and keeps ordinary events out of cleanup", () => {
    const cleanup = selectManagedEventCleanup([
      managedEvent(),
      {
        ...managedEvent({ eventKey: "ordinary::", providerEventId: "ordinary", privateProperties: null }),
      },
    ], new Set(["task-1"]), [{ id: "block-1", taskId: "task-1", startAt: "2026-08-04T10:00:00.000Z", endAt: "2026-08-04T10:30:00.000Z", state: "flexible" }]);

    expect(cleanup.eventKeys).toEqual(new Set());

    const orphanCleanup = selectManagedEventCleanup([
      managedEvent(),
    ], new Set(["task-2"]), []);
    expect(orphanCleanup.eventKeys).toEqual(new Set(["event-1::"]));
  });

  it("keeps one linked event and removes exact duplicate ranges", () => {
    const cleanup = selectManagedEventCleanup([
      managedEvent({ eventKey: "event-a::", providerEventId: "event-a", privateProperties: { heavyuser: "task-block", heavyuserTaskId: "task-1", heavyuserBlockId: "block-1" } }),
      managedEvent({ eventKey: "event-b::", providerEventId: "event-b", privateProperties: { heavyuser: "task-block", heavyuserTaskId: "task-1", heavyuserBlockId: "block-2" } }),
    ], new Set(["task-1"]), [
      { id: "block-1", taskId: "task-1", startAt: "2026-08-04T10:00:00.000Z", endAt: "2026-08-04T10:30:00.000Z", state: "flexible" },
      { id: "block-2", taskId: "task-1", startAt: "2026-08-04T10:00:00.000Z", endAt: "2026-08-04T10:30:00.000Z", state: "flexible" },
    ]);

    expect(cleanup.eventKeys).toEqual(new Set(["event-b::"]));
    expect(cleanup.blockIds).toEqual(new Set(["block-2"]));
  });

  it("uses the stored provider id when older events have no private metadata", () => {
    const cleanup = selectManagedEventCleanup([
      managedEvent({
        eventKey: "legacy::",
        providerEventId: "legacy",
        privateProperties: null,
      }),
    ], new Set(["task-1"]), [
      {
        id: "block-1",
        taskId: "task-1",
        startAt: "2026-08-04T10:00:00.000Z",
        endAt: "2026-08-04T10:30:00.000Z",
        state: "replaced",
        providerEventId: "legacy",
      },
    ]);

    expect(cleanup.eventKeys).toEqual(new Set(["legacy::"]));
  });
});
