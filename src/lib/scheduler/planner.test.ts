import { describe, expect, it } from "vitest";
import { planSchedule } from "@/lib/scheduler/planner";
import type { SchedulerPreferences, SchedulerTask } from "@/lib/scheduler/types";

const preferences: SchedulerPreferences = {
  enabled: true,
  timezone: "UTC",
  workWindows: {
    "0": [],
    "1": [{ start: "09:00", end: "17:00" }],
    "2": [{ start: "09:00", end: "17:00" }],
    "3": [{ start: "09:00", end: "17:00" }],
    "4": [{ start: "09:00", end: "17:00" }],
    "5": [{ start: "09:00", end: "17:00" }],
    "6": [],
  },
  nightOwlMode: false,
  dayStartTime: "04:00",
  defaultMinBlockMinutes: 30,
  defaultMaxBlockMinutes: 90,
  defaultCalendarVisibility: "default",
  defaultCalendarTransparency: "default",
};

function task(overrides: Partial<SchedulerTask> = {}): SchedulerTask {
  return {
    id: "task-1",
    title: "Task",
    duration: 60,
    startDate: null,
    deadline: null,
    priority: "normal",
    position: 0,
    status: "open",
    autoSchedule: true,
    minBlockMinutes: null,
    maxBlockMinutes: null,
    calendarVisibility: null,
    calendarTransparency: null,
    ...overrides,
  };
}

describe("planSchedule", () => {
  it("ranks dated work before undated work, then priority and deadline", () => {
    const result = planSchedule({
      tasks: [
        task({ id: "undated-urgent", priority: "urgent", position: 0 }),
        task({ id: "dated-low", priority: "low", deadline: "2026-08-03", position: 1 }),
      ],
      existingBlocks: [],
      busyIntervals: [],
      preferences,
      now: Date.parse("2026-08-03T08:00:00Z"),
    });

    expect(result.tasks.map((item) => item.taskId)).toEqual(["dated-low", "undated-urgent"]);
    expect(result.tasks[0].blocks[0].start).toBe("2026-08-03T09:00:00.000Z");
  });

  it("splits long work into maximum-sized blocks and spreads it across days", () => {
    const result = planSchedule({
      tasks: [task({ duration: 180, deadline: "2026-08-04" })],
      existingBlocks: [],
      busyIntervals: [],
      preferences,
      now: Date.parse("2026-08-03T08:00:00Z"),
    });

    expect(result.tasks[0].blocks.map((block) => [block.start, block.end])).toEqual([
      ["2026-08-03T09:00:00.000Z", "2026-08-03T10:30:00.000Z"],
      ["2026-08-04T09:00:00.000Z", "2026-08-04T10:30:00.000Z"],
    ]);
  });

  it("moves around ordinary busy calendar events", () => {
    const result = planSchedule({
      tasks: [task({ duration: 60, deadline: "2026-08-03" })],
      existingBlocks: [],
      busyIntervals: [{ start: "2026-08-03T09:00:00.000Z", end: "2026-08-03T10:00:00.000Z", source: "calendar" }],
      preferences,
      now: Date.parse("2026-08-03T08:00:00Z"),
    });

    expect(result.tasks[0].blocks[0].start).toBe("2026-08-03T10:00:00.000Z");
  });

  it.each([5, 15])("keeps a %s-minute task block exact", (duration) => {
    const result = planSchedule({
      tasks: [task({ duration })],
      existingBlocks: [],
      busyIntervals: [],
      preferences,
      now: Date.parse("2026-08-03T08:00:00Z"),
    });

    const block = result.tasks[0].blocks[0];
    expect(new Date(block.end).getTime() - new Date(block.start).getTime()).toBe(duration * 60_000);
  });

  it("moves work to the next available working day when today's window is removed", () => {
    const changedPreferences: SchedulerPreferences = {
      ...preferences,
      workWindows: {
        ...preferences.workWindows,
        "1": [],
      },
    };
    const result = planSchedule({
      tasks: [task({ duration: 60 })],
      existingBlocks: [],
      busyIntervals: [],
      preferences: changedPreferences,
      now: Date.parse("2026-08-03T08:00:00Z"),
    });

    expect(result.tasks[0].blocks[0].start).toBe("2026-08-04T09:00:00.000Z");
    expect(result.tasks[0].missingMinutes).toBe(0);
  });

  it("explains when automatic scheduling has no working hours instead of scanning forever", () => {
    const result = planSchedule({
      tasks: [task({ duration: 60 })],
      existingBlocks: [],
      busyIntervals: [],
      preferences: {
        ...preferences,
        workWindows: { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [] },
      },
      now: Date.parse("2026-08-03T08:00:00Z"),
    });

    expect(result.tasks[0].state).toBe("at_risk");
    expect(result.tasks[0].warning).toBe("No working hours are configured. Add a working window in Settings.");
    expect(result.tasks[0].missingMinutes).toBe(60);
  });

  it("uses the full calendar day when an all-day window is enabled", () => {
    const result = planSchedule({
      tasks: [task({ duration: 60 })],
      existingBlocks: [],
      busyIntervals: [],
      preferences: {
        ...preferences,
        workWindows: {
          ...preferences.workWindows,
          "1": [{ start: "00:00", end: "23:59", allDay: true }],
        },
      },
      now: Date.parse("2026-08-03T08:00:00Z"),
    });

    expect(result.tasks[0].blocks[0].start).toBe("2026-08-03T08:00:00.000Z");
    expect(result.tasks[0].missingMinutes).toBe(0);
  });

  it("uses the Night Owl boundary for an all-day logical day", () => {
    const result = planSchedule({
      tasks: [task({ duration: 60 })],
      existingBlocks: [],
      busyIntervals: [],
      preferences: {
        ...preferences,
        nightOwlMode: true,
        dayStartTime: "04:00",
        workWindows: {
          ...preferences.workWindows,
          "1": [{ start: "00:00", end: "23:59", allDay: true }],
        },
      },
      now: Date.parse("2026-08-03T23:30:00Z"),
    });

    expect(result.tasks[0].blocks[0].start).toBe("2026-08-03T23:30:00.000Z");
    expect(result.tasks[0].blocks[0].end).toBe("2026-08-04T00:30:00.000Z");
  });

  it("does not use weekends and reports missing time when a deadline is impossible", () => {
    const result = planSchedule({
      tasks: [task({ duration: 120, deadline: "2026-08-03" })],
      existingBlocks: [],
      busyIntervals: [{ start: "2026-08-03T09:00:00.000Z", end: "2026-08-03T17:00:00.000Z", source: "calendar" }],
      preferences,
      now: Date.parse("2026-08-03T08:00:00Z"),
    });

    expect(result.tasks[0].blocks).toHaveLength(0);
    expect(result.tasks[0].state).toBe("at_risk");
    expect(result.tasks[0].missingMinutes).toBe(120);
  });

  it("keeps locked blocks fixed while scheduling the remaining duration", () => {
    const result = planSchedule({
      tasks: [task({ duration: 120, deadline: "2026-08-03" })],
      existingBlocks: [{
        id: "locked-1",
        taskId: "task-1",
        calendarId: "primary",
        start: "2026-08-03T13:00:00.000Z",
        end: "2026-08-03T14:00:00.000Z",
        plannedStart: "2026-08-03T13:00:00.000Z",
        plannedEnd: "2026-08-03T14:00:00.000Z",
        state: "locked",
        providerEventId: "google-1",
        etag: "etag-1",
        syncVersion: 1,
      }],
      busyIntervals: [],
      preferences,
      now: Date.parse("2026-08-03T08:00:00Z"),
    });

    expect(result.tasks[0].scheduledMinutes).toBe(120);
    expect(result.tasks[0].blocks.map((block) => block.start)).toEqual([
      "2026-08-03T13:00:00.000Z",
      "2026-08-03T09:00:00.000Z",
    ]);
  });

  it("keeps another task away from a locked block", () => {
    const result = planSchedule({
      tasks: [
        task({ id: "first", duration: 60, priority: "urgent" }),
        task({ id: "protected", duration: 60, priority: "low" }),
      ],
      existingBlocks: [{
        id: "locked-1",
        taskId: "protected",
        calendarId: "primary",
        start: "2026-08-03T09:00:00.000Z",
        end: "2026-08-03T10:00:00.000Z",
        plannedStart: "2026-08-03T09:00:00.000Z",
        plannedEnd: "2026-08-03T10:00:00.000Z",
        state: "locked",
        providerEventId: "google-1",
        etag: "etag-1",
        syncVersion: 1,
      }],
      busyIntervals: [],
      preferences,
      now: Date.parse("2026-08-03T08:00:00Z"),
    });

    expect(result.tasks.find((item) => item.taskId === "first")?.blocks[0].start).toBe("2026-08-03T10:00:00.000Z");
  });

  it("keeps a locked conflict visible instead of moving either event", () => {
    const result = planSchedule({
      tasks: [task({ duration: 60 })],
      existingBlocks: [{
        id: "locked-1",
        taskId: "task-1",
        calendarId: "primary",
        start: "2026-08-03T09:00:00.000Z",
        end: "2026-08-03T10:00:00.000Z",
        plannedStart: "2026-08-03T09:00:00.000Z",
        plannedEnd: "2026-08-03T10:00:00.000Z",
        state: "locked",
        providerEventId: "google-1",
        etag: "etag-1",
        syncVersion: 1,
      }],
      busyIntervals: [{ start: "2026-08-03T09:30:00.000Z", end: "2026-08-03T10:30:00.000Z", source: "calendar" }],
      preferences,
      now: Date.parse("2026-08-03T08:00:00Z"),
    });

    expect(result.tasks[0].blocks[0].start).toBe("2026-08-03T09:00:00.000Z");
    expect(result.tasks[0].state).toBe("at_risk");
    expect(result.tasks[0].warning).toContain("locked block conflicts");
  });

  it("schedules overdue work at the next valid time and marks it at risk", () => {
    const result = planSchedule({
      tasks: [task({ duration: 30, deadline: "2026-08-02" })],
      existingBlocks: [],
      busyIntervals: [],
      preferences,
      now: Date.parse("2026-08-03T08:00:00Z"),
    });

    expect(result.tasks[0].blocks[0].start).toBe("2026-08-03T09:00:00.000Z");
    expect(result.tasks[0].state).toBe("at_risk");
    expect(result.tasks[0].warning).toContain("has passed");
  });

  it("treats the end of today's work windows as the deadline", () => {
    const result = planSchedule({
      tasks: [task({ duration: 30, deadline: "2026-08-03" })],
      existingBlocks: [],
      busyIntervals: [],
      preferences,
      now: Date.parse("2026-08-03T18:00:00Z"),
    });

    expect(result.tasks[0].blocks[0].start).toBe("2026-08-04T09:00:00.000Z");
    expect(result.tasks[0].state).toBe("at_risk");
  });

  it("balances the final chunk when minimum block size allows it", () => {
    const result = planSchedule({
      tasks: [task({ duration: 130, minBlockMinutes: 60, maxBlockMinutes: 90 })],
      existingBlocks: [],
      busyIntervals: [],
      preferences,
      now: Date.parse("2026-08-03T08:00:00Z"),
    });

    expect(result.tasks[0].blocks.map((block) => [block.start, block.end])).toEqual([
      ["2026-08-03T09:00:00.000Z", "2026-08-03T10:00:00.000Z"],
      ["2026-08-04T09:00:00.000Z", "2026-08-04T10:10:00.000Z"],
    ]);
  });

  it("waits for explicit completion after all scheduled blocks pass", () => {
    const result = planSchedule({
      tasks: [task({ duration: 60 })],
      existingBlocks: [{
        id: "past-1",
        taskId: "task-1",
        calendarId: "primary",
        start: "2026-08-03T07:00:00.000Z",
        end: "2026-08-03T08:00:00.000Z",
        plannedStart: "2026-08-03T07:00:00.000Z",
        plannedEnd: "2026-08-03T08:00:00.000Z",
        state: "flexible",
        providerEventId: "google-1",
        etag: "etag-1",
        syncVersion: 1,
      }],
      busyIntervals: [],
      preferences,
      now: Date.parse("2026-08-03T08:30:00Z"),
    });

    expect(result.tasks[0].state).toBe("awaiting_completion");
  });

  it("uses the local timezone across a daylight-saving change", () => {
    const daylightPreferences = { ...preferences, timezone: "America/New_York" };
    const result = planSchedule({
      tasks: [task({ duration: 60 })],
      existingBlocks: [],
      busyIntervals: [],
      preferences: daylightPreferences,
      now: Date.parse("2026-03-09T12:00:00Z"),
    });

    expect(result.tasks[0].blocks[0].start).toBe("2026-03-09T13:00:00.000Z");
  });
});
