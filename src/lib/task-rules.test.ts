import { describe, expect, it } from "vitest";
import type { Space } from "@/lib/spaces";
import type { Task } from "@/lib/tasks";
import {
  CALENDAR_DATE,
  MAX_TASK_DURATION_MINUTES,
  MAX_TASK_TITLE_LENGTH,
  addCalendarDays,
  createTaskId,
  ensureSingleFocus,
  formatDuration,
  formatShortDate,
  getDueDatePresets,
  getDurationParts,
  getLogicalDate,
  getTaskBucket,
  getUpcomingGroup,
  groupUpcomingTasks,
  isDeadlineOverdue,
  mapTasksToSpaces,
  matchesTaskBucket,
  mergeRemoteTasks,
  normalizeStoredTask,
  parseDuration,
  parseShortDate,
  readUserTaskBaseline,
  readUserTasks,
  reconcileTaskSave,
  replaceBucketOrder,
  sortTasks,
  writeUserTaskBaseline,
  writeUserTasks,
  clearUserTasks,
  type TaskStorage,
} from "@/lib/task-rules";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Task",
    spaceId: "space-1",
    subSpaceId: null,
    duration: 30,
    startDate: null,
    deadline: null,
    priority: "normal",
    status: "open",
    autoSchedule: true,
    minBlockMinutes: null,
    maxBlockMinutes: null,
    calendarVisibility: null,
    calendarTransparency: null,
    ...overrides,
  };
}

function space(overrides: Partial<Space> = {}): Space {
  return {
    id: "space-1",
    name: "Work",
    calendarId: "calendar-1",
    calendarName: "Work",
    timeZone: "UTC",
    status: "active",
    position: 0,
    archivedAt: null,
    subSpaces: [],
    ...overrides,
  };
}

class MemoryStorage implements TaskStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("task input rules", () => {
  it.each([
    ["", null],
    ["0", null],
    ["0.1", null],
    ["-1", null],
    ["5", 5],
    ["5.4", 5],
    [String(MAX_TASK_DURATION_MINUTES), MAX_TASK_DURATION_MINUTES],
    [String(MAX_TASK_DURATION_MINUTES + 1), null],
    ["not a number", null],
  ])("parses duration %s as %s", (value, expected) => {
    expect(parseDuration(value)).toBe(expected);
  });

  it("formats missing, minute, hour, and long durations consistently", () => {
    expect(getDurationParts(null)).toBeNull();
    expect(getDurationParts(0)).toEqual({ hours: 0, minutes: 0 });
    expect(getDurationParts(90)).toEqual({ hours: 1, minutes: 30 });
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(5)).toBe("05m");
    expect(formatDuration(90)).toBe("01h 30m");
  });

  it("normalizes old task data and rejects unsafe cached data", () => {
    const legacy = normalizeStoredTask({
      id: "legacy",
      title: "Legacy task",
      duration: "45",
      startDate: "",
      deadline: "2026-08-04",
      priority: "unknown",
      status: "open",
      spaceId: "space-1",
      subSpaceId: "sub-1",
      minBlockMinutes: 4,
      maxBlockMinutes: 10,
    });

    expect(legacy).toMatchObject({
      id: "legacy",
      duration: 45,
      startDate: null,
      deadline: "2026-08-04",
      priority: "normal",
      subSpaceId: "sub-1",
      minBlockMinutes: null,
      maxBlockMinutes: 10,
      autoSchedule: true,
      calendarVisibility: null,
      calendarTransparency: null,
    });
    expect(normalizeStoredTask(null)).toBeNull();
    expect(normalizeStoredTask({})).toBeNull();
    expect(normalizeStoredTask({ ...task(), id: " " })).toBeNull();
    expect(normalizeStoredTask({ ...task(), title: " " })).toBeNull();
    expect(normalizeStoredTask({ ...task(), startDate: "2026-02-29" })).toBeNull();
    expect(normalizeStoredTask({ ...task(), startDate: "2026-08-03", deadline: "2026-08-02" })).toBeNull();
    expect(normalizeStoredTask({ id: "too-long", title: "x".repeat(MAX_TASK_TITLE_LENGTH + 1), status: "open" })).toBeNull();
  });

  it("creates collision-resistant task IDs", () => {
    expect(createTaskId(() => "00000000-0000-4000-8000-000000000001")).toBe(
      "task-00000000-0000-4000-8000-000000000001",
    );
  });

  it("normalizes every block boundary and rejects impossible duration values", () => {
    expect(normalizeStoredTask(task({ duration: MAX_TASK_DURATION_MINUTES, minBlockMinutes: 5, maxBlockMinutes: 5 }))).toMatchObject({
      duration: MAX_TASK_DURATION_MINUTES,
      minBlockMinutes: 5,
      maxBlockMinutes: 5,
    });
    expect(normalizeStoredTask(task({ duration: MAX_TASK_DURATION_MINUTES + 1 }))).toBeNull();
    expect(normalizeStoredTask(task({ duration: -1 }))).toBeNull();
    expect(normalizeStoredTask(task({ minBlockMinutes: 4, maxBlockMinutes: 10 }))).toMatchObject({ minBlockMinutes: null, maxBlockMinutes: 10 });
    expect(normalizeStoredTask(task({ minBlockMinutes: 10, maxBlockMinutes: 5 }))).toMatchObject({ minBlockMinutes: 10, maxBlockMinutes: null });
    expect(normalizeStoredTask(task({ spaceId: null, subSpaceId: "orphaned-sub-space" }))).toMatchObject({ spaceId: null, subSpaceId: null });
  });
});

describe("task ordering and views", () => {
  it("sorts by open state, priority, deadline, and preserves equal-item order", () => {
    const sorted = sortTasks([
      task({ id: "normal-late", priority: "normal", deadline: "2026-08-09" }),
      task({ id: "done-urgent", priority: "urgent", status: "done" }),
      task({ id: "urgent", priority: "urgent" }),
      task({ id: "high", priority: "high" }),
      task({ id: "normal-early", priority: "normal", deadline: "2026-08-02" }),
      task({ id: "same-a", priority: "low" }),
      task({ id: "same-b", priority: "low" }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual([
      "urgent",
      "high",
      "normal-early",
      "normal-late",
      "same-a",
      "same-b",
      "done-urgent",
    ]);
  });

  it.each([
    [task({ id: "backlog" }), "backlog"],
    [task({ id: "overdue", deadline: "2026-07-31" }), "today"],
    [task({ id: "done-overdue", deadline: "2026-07-31", status: "done" }), "backlog"],
    [task({ id: "today", deadline: CALENDAR_DATE }), "today"],
    [task({ id: "starts-today", startDate: CALENDAR_DATE, deadline: "2026-08-04" }), "today"],
    [task({ id: "upcoming", startDate: "2026-08-03" }), "upcoming"],
  ] as const)("puts %s in the %s bucket", (value, expected) => {
    expect(getTaskBucket(value, CALENDAR_DATE)).toBe(expected);
  });

  it("matches All and excludes completed tasks only at the UI filter layer", () => {
    const done = task({ status: "done" });
    expect(matchesTaskBucket(done, "all")).toBe(true);
    expect(matchesTaskBucket(done, "backlog")).toBe(true);
    expect(matchesTaskBucket(task({ deadline: "2026-08-03" }), "today")).toBe(false);
  });

  it("handles upcoming groups across month, quarter, year, and far-away boundaries", () => {
    expect(getUpcomingGroup(task({ startDate: "2026-08-02" }), CALENDAR_DATE)).toBe("tomorrow");
    expect(getUpcomingGroup(task({ startDate: "2026-08-03" }), CALENDAR_DATE)).toBe("this-week");
    expect(getUpcomingGroup(task({ startDate: "2026-08-10" }), CALENDAR_DATE)).toBe("this-month");
    expect(getUpcomingGroup(task({ startDate: "2026-09-01" }), CALENDAR_DATE)).toBe("this-quarter");
    expect(getUpcomingGroup(task({ startDate: "2026-12-31" }), CALENDAR_DATE)).toBe("this-year");
    expect(getUpcomingGroup(task({ startDate: "2027-12-31" }), "2027-01-01")).toBe("this-year");
    expect(getUpcomingGroup(task({ startDate: "2028-01-01" }), CALENDAR_DATE)).toBe("far-away");

    const groups = groupUpcomingTasks([
      task({ id: "tomorrow", startDate: "2026-08-02" }),
      task({ id: "later", startDate: "2026-08-10" }),
    ], CALENDAR_DATE);
    expect(groups.map((group) => group.id)).toEqual(["tomorrow", "this-month"]);
    expect(groups[0]?.tasks[0]?.id).toBe("tomorrow");
  });

  it("replaces only the visible bucket while leaving hidden tasks in place", () => {
    const first = task({ id: "first" });
    const hidden = task({ id: "hidden", deadline: "2026-08-05" });
    const last = task({ id: "last" });

    expect(replaceBucketOrder([first, hidden, last], [last, first]).map((item) => item.id)).toEqual([
      "last",
      "hidden",
      "first",
    ]);
  });
});

describe("task dates and focus", () => {
  it("accepts valid short dates and rejects invalid calendar dates", () => {
    expect(parseShortDate("1 Aug 26")).toBe("2026-08-01");
    expect(parseShortDate("01 aug 2026")).toBe("2026-08-01");
    expect(parseShortDate("29 Feb 24")).toBe("2024-02-29");
    expect(parseShortDate("29 Feb 25")).toBeNull();
    expect(parseShortDate("31 Apr 26")).toBeNull();
    expect(parseShortDate("bad date")).toBeNull();
    expect(formatShortDate("2026-08-01")).toBe("01 Aug 26");
    expect(formatShortDate("2026-02-29")).toBe("");
  });

  it("crosses month and year boundaries in date presets", () => {
    expect(addCalendarDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(getDueDatePresets("2026-12-31")).toEqual([
      { label: "Today", value: "2026-12-31" },
      { label: "Tomorrow", value: "2027-01-01" },
      { label: "Next week", value: "2027-01-07" },
    ]);
  });

  it("uses the previous logical day before the Night Owl boundary", () => {
    const settings = { nightOwlMode: true, dayStartTime: "04:00", customTaskOrder: false, planningTimezone: "Asia/Dhaka" };
    expect(getLogicalDate(new Date(2026, 7, 2, 3, 59).getTime(), settings)).toBe("2026-08-01");
    expect(getLogicalDate(new Date(2026, 7, 2, 4, 0).getTime(), settings)).toBe("2026-08-02");
  });

  it("uses the saved timezone across DST and UTC+14 boundaries", () => {
    expect(getLogicalDate(Date.parse("2026-03-08T06:59:00.000Z"), {
      nightOwlMode: false,
      dayStartTime: "04:00",
      planningTimezone: "America/New_York",
    })).toBe("2026-03-08");
    expect(getLogicalDate(Date.parse("2026-03-08T07:00:00.000Z"), {
      nightOwlMode: false,
      dayStartTime: "04:00",
      planningTimezone: "America/New_York",
    })).toBe("2026-03-08");
    expect(getLogicalDate(Date.parse("2025-12-31T10:00:00.000Z"), {
      nightOwlMode: false,
      dayStartTime: "04:00",
      planningTimezone: "Pacific/Kiritimati",
    })).toBe("2026-01-01");
  });

  it("does not mark completed overdue tasks as overdue", () => {
    expect(isDeadlineOverdue("2026-07-31", "open", CALENDAR_DATE)).toBe(true);
    expect(isDeadlineOverdue("2026-07-31", "focus", CALENDAR_DATE)).toBe(true);
    expect(isDeadlineOverdue("2026-07-31", "done", CALENDAR_DATE)).toBe(false);
    expect(isDeadlineOverdue(null, "open", CALENDAR_DATE)).toBe(false);
  });

  it("keeps the first valid focus and never focuses a completed task", () => {
    expect(ensureSingleFocus([
      task({ id: "first", status: "open" }),
      task({ id: "second", status: "focus" }),
      task({ id: "third", status: "focus" }),
    ]).map((item) => item.status)).toEqual(["open", "focus", "open"]);
    expect(ensureSingleFocus([
      task({ id: "done", status: "done" }),
      task({ id: "open", status: "open" }),
    ]).map((item) => item.status)).toEqual(["done", "focus"]);
    expect(ensureSingleFocus([task({ status: "done" })]).map((item) => item.status)).toEqual(["done"]);
  });
});

describe("task Space mapping and persistence", () => {
  it("does not erase a saved Space while Spaces are still loading", () => {
    const saved = task({ spaceId: "space-saved", subSpaceId: "sub-saved" });
    expect(mapTasksToSpaces([saved], [])).toEqual([saved]);
  });

  it("moves unassigned tasks to the active Space and clears invalid sub-spaces", () => {
    const active = space({
      subSpaces: [{ id: "sub-active", spaceId: "space-1", name: "Active", status: "active", position: 0, archivedAt: null }],
    });
    const archived = space({ id: "space-2", status: "archived", archivedAt: "2026-01-01" });

    const [unassigned, invalid, doneArchived, openArchived] = mapTasksToSpaces([
      task({ id: "unassigned", spaceId: null, subSpaceId: null }),
      task({ id: "invalid", subSpaceId: "missing" }),
      task({ id: "done-archived", spaceId: "space-2", subSpaceId: "old", status: "done" }),
      task({ id: "open-archived", spaceId: "space-2", subSpaceId: "old", status: "open" }),
    ], [active, archived]);

    expect(unassigned).toMatchObject({ spaceId: "space-1", subSpaceId: null });
    expect(invalid).toMatchObject({ spaceId: "space-1", subSpaceId: null });
    expect(doneArchived).toMatchObject({ spaceId: "space-2", subSpaceId: null });
    expect(openArchived).toMatchObject({ spaceId: "space-2", subSpaceId: null });
  });

  it("keeps a valid archived sub-space only when the task is already done", () => {
    const archived = space({
      id: "space-2",
      status: "archived",
      archivedAt: "2026-01-01",
      subSpaces: [{ id: "old", spaceId: "space-2", name: "Old", status: "archived", position: 0, archivedAt: "2026-01-01" }],
    });
    expect(mapTasksToSpaces([task({ status: "done", spaceId: "space-2", subSpaceId: "old" })], [archived])[0]?.subSpaceId).toBe("old");
    expect(mapTasksToSpaces([task({ status: "open", spaceId: "space-2", subSpaceId: "old" })], [archived])[0]?.subSpaceId).toBeNull();
  });

  it("keeps a disconnected Space but removes a disconnected or invalid sub-space reference", () => {
    const disconnected = space({
      id: "space-disconnected",
      status: "disconnected",
      subSpaces: [{ id: "sub-disconnected", spaceId: "space-disconnected", name: "Disconnected project", status: "disconnected", position: 0, archivedAt: null }],
    });
    const [mapped] = mapTasksToSpaces([task({ spaceId: disconnected.id, subSpaceId: "sub-disconnected" })], [disconnected]);
    expect(mapped).toMatchObject({ spaceId: disconnected.id, subSpaceId: null });
  });

  it("keeps cache data account-scoped and recovers from corruption", () => {
    const storage = new MemoryStorage();
    const saved = task({ id: "saved", status: "focus" });
    writeUserTasks(storage, "user-a", [saved]);
    writeUserTaskBaseline(storage, "user-a", [saved]);

    expect(readUserTasks(storage, "user-a").map((item) => item.id)).toEqual(["saved"]);
    expect(readUserTaskBaseline(storage, "user-a")).toEqual([saved]);
    expect(readUserTasks(storage, "user-b")).toEqual([]);
    expect(readUserTaskBaseline(storage, "user-b")).toBeNull();
    storage.setItem("heavyuser:tasks:v2:user-a", "not json");
    expect(readUserTasks(storage, "user-a")).toEqual([]);
    storage.setItem("heavyuser:tasks:v2:user-a", JSON.stringify([saved, { invalid: true }]));
    expect(readUserTasks(storage, "user-a").map((item) => item.id)).toEqual(["saved"]);
    storage.setItem("heavyuser:tasks:v2:user-a", JSON.stringify([saved]));
    clearUserTasks(storage, "user-a");
    expect(readUserTasks(storage, "user-a")).toEqual([]);
    expect(readUserTaskBaseline(storage, "user-a")).toBeNull();
  });
});

describe("task synchronization", () => {
  it("uses remote tasks when there are no local changes and normalizes focus", () => {
    const remote = [task({ id: "remote-1", status: "open" }), task({ id: "remote-2", status: "focus" })];
    const result = mergeRemoteTasks([], [], remote);
    expect(result.deletedTaskIds).toEqual([]);
    expect(result.tasks.map((item) => item.id)).toEqual(["remote-1", "remote-2"]);
    expect(result.tasks.map((item) => item.status)).toEqual(["open", "focus"]);
  });

  it("preserves local edits, reports local deletes, and appends remote additions", () => {
    const original = task({ id: "same", title: "Original" });
    const localEdit = task({ id: "same", title: "Edited locally" });
    const deleted = task({ id: "deleted" });
    const added = task({ id: "remote-new", title: "Remote new" });

    const result = mergeRemoteTasks(
      [original, deleted],
      [localEdit],
      [task({ id: "same", title: "Changed remotely" }), added],
    );

    expect(result.tasks.map((item) => item.id)).toEqual(["same", "remote-new"]);
    expect(result.tasks[0]?.title).toBe("Edited locally");
    expect(result.deletedTaskIds).toEqual(["deleted"]);
  });

  it("accepts a remote change when the local snapshot did not change", () => {
    const cached = task({ id: "same", title: "Cached title", duration: 30 });
    const remote = task({ id: "same", title: "Remote title", duration: 60, status: "focus" });
    const result = mergeRemoteTasks([cached], [cached], [remote]);
    expect(result.tasks).toEqual([remote]);
    expect(result.deletedTaskIds).toEqual([]);
  });

  it("uses the persisted cloud baseline when local changes survive a reload", () => {
    const baseline = task({ id: "same", title: "Before the failed save" });
    const localEdit = task({ id: "same", title: "Edited while offline", status: "focus" });
    const result = mergeRemoteTasks([baseline], [localEdit], [baseline]);

    expect(result.tasks).toEqual([localEdit]);
    expect(result.deletedTaskIds).toEqual([]);
  });

  it("does not resurrect a task deleted by another tab", () => {
    const baseline = task({ id: "same", title: "Original" });
    const result = reconcileTaskSave(
      [baseline],
      [task({ id: "same", title: "Stale local edit" })],
      [],
    );

    expect(result.tasks).toEqual([]);
    expect(result.conflicts).toEqual([{ taskId: "same", kind: "remote_deleted" }]);
  });

  it("keeps unrelated cloud additions during a local save", () => {
    const baseline = task({ id: "same", title: "Original" });
    const local = task({ id: "same", title: "Local edit" });
    const remoteAddition = task({ id: "remote-new", title: "Other tab" });
    const result = reconcileTaskSave([baseline], [local], [baseline, remoteAddition]);

    expect(result.tasks.map((item) => item.id)).toEqual(["same", "remote-new"]);
    expect(result.tasks[0]?.title).toBe("Local edit");
    expect(result.conflicts).toEqual([]);
  });

  it("keeps the cloud copy when two tabs change the same task", () => {
    const baseline = task({ id: "same", title: "Original" });
    const local = task({ id: "same", title: "Local edit" });
    const remote = task({ id: "same", title: "Remote edit" });
    const result = reconcileTaskSave([baseline], [local], [remote]);

    expect(result.tasks[0]?.title).toBe("Remote edit");
    expect(result.conflicts).toEqual([{ taskId: "same", kind: "both_changed" }]);
  });

  it("lets an explicit local delete win without erasing unrelated remote work", () => {
    const deleted = task({ id: "deleted" });
    const remoteAddition = task({ id: "remote-new" });
    const result = reconcileTaskSave([deleted], [], [deleted, remoteAddition], [deleted.id]);

    expect(result.tasks.map((item) => item.id)).toEqual(["remote-new"]);
    expect(result.deletedTaskIds).toEqual(["deleted"]);
  });
});
