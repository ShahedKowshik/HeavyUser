import type { TaskScheduleState } from "@/lib/tasks";
import { getResolvedWorkWindowsForDay } from "@/lib/scheduler/preferences";
import {
  DEFAULT_SCHEDULER_PREFERENCES,
  type BusyInterval,
  type SchedulePlan,
  type ScheduledBlock,
  type SchedulerPreferences,
  type SchedulerTask,
  type TaskPlan,
  type WorkWindow,
} from "@/lib/scheduler/types";

const MINUTE_MS = 60_000;
const SLOT_MS = 15 * MINUTE_MS;
const MAX_SCAN_DAYS = 366;

type LocalParts = {
  date: string;
  day: number;
  minute: number;
};

function localParts(timestamp: number, timezone: string): LocalParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    day: weekday < 0 ? 0 : weekday,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function parseMinutes(value: string, allowEndOfDay = false) {
  if (allowEndOfDay && value === "24:00") {
    return 24 * 60;
  }

  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function getWindowMinutes(window: WorkWindow) {
  const start = parseMinutes(window.start);
  const end = parseMinutes(window.end, true);
  if (start === null || end === null || end <= start) {
    return null;
  }

  return { start, end };
}

function getWorkingWindows(day: number, preferences: SchedulerPreferences): ReadonlyArray<WorkWindow> {
  return getResolvedWorkWindowsForDay(day, preferences);
}

function isDeadlinePassed(deadline: string, now: number, preferences: SchedulerPreferences) {
  const today = localParts(now, preferences.timezone).date;
  if (deadline < today) {
    return true;
  }
  if (deadline > today) {
    return false;
  }

  const parts = localParts(now, preferences.timezone);
  const windows = getWorkingWindows(parts.day, preferences);
  return !windows.some((window) => {
    const parsed = getWindowMinutes(window);
    return parsed !== null && parsed.end > parts.minute;
  });
}

function isWorkingAt(timestamp: number, preferences: SchedulerPreferences) {
  const parts = localParts(timestamp, preferences.timezone);
  const windows = getWorkingWindows(parts.day, preferences);
  return windows.some((window) => {
    const parsed = getWindowMinutes(window);
    return parsed ? parts.minute >= parsed.start && parts.minute < parsed.end : false;
  });
}

function overlaps(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number) {
  return firstStart < secondEnd && firstEnd > secondStart;
}

function isBusy(start: number, end: number, intervals: ReadonlyArray<BusyInterval>) {
  return intervals.some((interval) =>
    overlaps(start, end, new Date(interval.start).getTime(), new Date(interval.end).getTime()),
  );
}

function canUseRange(start: number, end: number, preferences: SchedulerPreferences, intervals: ReadonlyArray<BusyInterval>) {
  if (!isWorkingAt(start, preferences) || !isWorkingAt(end - 1, preferences)) {
    return false;
  }

  for (let timestamp = start; timestamp < end; timestamp += SLOT_MS) {
    if (!isWorkingAt(timestamp, preferences) || isBusy(timestamp, Math.min(timestamp + SLOT_MS, end), intervals)) {
      return false;
    }
  }

  return !isBusy(start, end, intervals);
}

function taskOrder(first: SchedulerTask, second: SchedulerTask) {
  const datedFirst = first.deadline || first.startDate ? 0 : 1;
  const datedSecond = second.deadline || second.startDate ? 0 : 1;
  if (datedFirst !== datedSecond) {
    return datedFirst - datedSecond;
  }

  const priority = { urgent: 0, high: 1, normal: 2, low: 3 } as const;
  const priorityDelta = priority[first.priority] - priority[second.priority];
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const deadlineDelta = (first.deadline ?? "9999-12-31").localeCompare(second.deadline ?? "9999-12-31");
  if (deadlineDelta !== 0) {
    return deadlineDelta;
  }

  return first.position - second.position;
}

function getTaskBlocks(taskId: string, blocks: ReadonlyArray<ScheduledBlock>) {
  return blocks.filter((block) => block.taskId === taskId && block.state !== "replaced" && block.state !== "cancelled" && block.state !== "missed");
}

function getMinutes(start: string, end: string) {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / MINUTE_MS));
}

function getFixedMinutes(input: {
  fixedBlocks: ReadonlyArray<ScheduledBlock>;
  activeBlockIds: ReadonlySet<string>;
  hasActualWork: boolean;
  workedMinutes: number;
  now: number;
}) {
  const { fixedBlocks, activeBlockIds, hasActualWork, workedMinutes, now } = input;
  if (!hasActualWork) {
    return fixedBlocks.reduce((total, block) => total + getMinutes(block.start, block.end), 0);
  }

  const activeBlocks = fixedBlocks.filter((block) => activeBlockIds.has(block.id));
  const activePlannedMinutes = activeBlocks.reduce((total, block) => total + getMinutes(block.start, block.end), 0);
  const activeElapsedMinutes = activeBlocks.reduce((total, block) => {
    const start = new Date(block.start).getTime();
    const end = Math.min(new Date(block.end).getTime(), now);
    return total + (end > start ? Math.round((end - start) / MINUTE_MS) : 0);
  }, 0);
  const completedWorkedMinutes = Math.max(0, workedMinutes - activeElapsedMinutes);
  const futureLockedMinutes = fixedBlocks
    .filter((block) => !activeBlockIds.has(block.id) && new Date(block.end).getTime() > now)
    .reduce((total, block) => total + getMinutes(block.start, block.end), 0);

  // An active timer block already reserves its full planned duration. Remove
  // the elapsed part from actual work before adding that block back so the
  // planner neither double-counts the timer nor schedules a duplicate tail.
  return completedWorkedMinutes + activePlannedMinutes + futureLockedMinutes;
}

function getEarliestTimestamp(now: number) {
  // Scanning in the target timezone avoids making incorrect fixed-offset
  // assumptions around daylight-saving changes.
  return now;
}

function findRange(input: {
  from: number;
  duration: number;
  startDate: string | null;
  deadline: string | null;
  minimum: number;
  preferences: SchedulerPreferences;
  intervals: ReadonlyArray<BusyInterval>;
  usedDays: ReadonlySet<string>;
  allowUsedDay: boolean;
}) {
  const lastTimestamp = input.from + MAX_SCAN_DAYS * 24 * 60 * MINUTE_MS;
  for (let start = Math.ceil(input.from / SLOT_MS) * SLOT_MS; start <= lastTimestamp; start += SLOT_MS) {
    const startParts = localParts(start, input.preferences.timezone);
    if (input.startDate && startParts.date < input.startDate) {
      continue;
    }
    if (input.deadline && startParts.date > input.deadline) {
      return null;
    }

    if (input.usedDays.has(startParts.date) && !input.allowUsedDay) {
      continue;
    }

    const end = start + input.duration * MINUTE_MS;
    const endParts = localParts(end - 1, input.preferences.timezone);
    if (input.deadline && endParts.date > input.deadline) {
      continue;
    }

    const available = input.duration;
    if ((available >= input.minimum || input.duration < input.minimum) && canUseRange(start, end, input.preferences, input.intervals)) {
      return { start, end, date: startParts.date };
    }
  }

  return null;
}

function getState(
  task: SchedulerTask,
  fixedMinutes: number,
  scheduledMinutes: number,
  missingMinutes: number,
  warning: string | null,
  hasFutureBlock: boolean,
): TaskScheduleState {
  if (task.status === "done") {
    return "paused";
  }
  if (task.duration === null) {
    return "needs_duration";
  }
  if (!task.autoSchedule) {
    return "paused";
  }
  if (missingMinutes > 0) {
    return "at_risk";
  }
  if (warning) {
    return "at_risk";
  }
  if (task.duration !== null && scheduledMinutes >= task.duration && !hasFutureBlock) {
    return "awaiting_completion";
  }
  if (fixedMinutes > 0 && scheduledMinutes === fixedMinutes) {
    return "locked";
  }
  return "scheduled";
}

export function planSchedule(input: {
  tasks: ReadonlyArray<SchedulerTask>;
  existingBlocks: ReadonlyArray<ScheduledBlock>;
  busyIntervals: ReadonlyArray<BusyInterval>;
  preferences?: SchedulerPreferences;
  now?: number;
  workedMinutesByTask?: ReadonlyMap<string, number>;
  activeBlockIds?: ReadonlySet<string>;
}): SchedulePlan {
  const preferences = input.preferences ?? DEFAULT_SCHEDULER_PREFERENCES;
  const now = input.now ?? Date.now();
  const hasActualWork = input.workedMinutesByTask !== undefined;
  const workedMinutesByTask = input.workedMinutesByTask ?? new Map<string, number>();
  const activeBlockIds = input.activeBlockIds ?? new Set<string>();
  const intervals: BusyInterval[] = [...input.busyIntervals];
  const plans: TaskPlan[] = [];

  // Flexible HeavyUser blocks can be moved. Locked blocks and past history
  // cannot, so reserve them before ranking tasks to keep every task clear of
  // protected time—even when the protected block belongs to a later task in
  // the priority order.
  for (const block of input.existingBlocks) {
    if (block.state === "locked" || activeBlockIds.has(block.id) || (!hasActualWork && new Date(block.start).getTime() < now)) {
      intervals.push({ start: block.start, end: block.end, source: "locked" });
    }
  }

  if (!preferences.enabled) {
    return {
      busyIntervals: intervals,
      tasks: input.tasks.map((task) => {
        const taskBlocks = getTaskBlocks(task.id, input.existingBlocks);
        const fixedBlocks = taskBlocks.filter((block) => block.state === "locked" || activeBlockIds.has(block.id) || (!hasActualWork && new Date(block.start).getTime() < now));
        const workedMinutes = workedMinutesByTask.get(task.id) ?? 0;
        const fixedMinutes = getFixedMinutes({ fixedBlocks, activeBlockIds, hasActualWork, workedMinutes, now });
        return {
          taskId: task.id,
          state: task.duration === null ? "needs_duration" : "paused",
          fixedMinutes,
          scheduledMinutes: fixedMinutes,
          missingMinutes: task.duration === null ? 0 : Math.max(0, task.duration - fixedMinutes),
          warning: null,
          blocks: fixedBlocks.map((block) => ({
            taskId: task.id,
            start: block.start,
            end: block.end,
            id: block.id,
            state: block.state,
          })),
        };
      }),
    };
  }

  const hasWorkingWindow = Object.values(preferences.workWindows).some((windows) => windows.length > 0);
  if (!hasWorkingWindow) {
    return {
      busyIntervals: intervals,
      tasks: input.tasks.map((task) => {
        const taskBlocks = getTaskBlocks(task.id, input.existingBlocks);
        const fixedBlocks = taskBlocks.filter((block) => block.state === "locked" || activeBlockIds.has(block.id) || (!hasActualWork && new Date(block.end).getTime() <= now));
        const workedMinutes = workedMinutesByTask.get(task.id) ?? 0;
        const fixedMinutes = getFixedMinutes({ fixedBlocks, activeBlockIds, hasActualWork, workedMinutes, now });
        const hasFutureFixedBlock = fixedBlocks.some((block) => new Date(block.end).getTime() > now);
        const missingMinutes = task.duration === null ? 0 : Math.max(0, task.duration - fixedMinutes);
        const warning = task.duration !== null && task.autoSchedule && task.status !== "done" && missingMinutes > 0
          ? "No working hours are configured. Add a working window in Settings."
          : null;

        return {
          taskId: task.id,
          state: getState(task, fixedMinutes, fixedMinutes, missingMinutes, warning, hasFutureFixedBlock),
          fixedMinutes,
          scheduledMinutes: fixedMinutes,
          missingMinutes,
          warning,
          blocks: fixedBlocks.map((block) => ({
            taskId: task.id,
            start: block.start,
            end: block.end,
            id: block.id,
            state: block.state,
          })),
        };
      }),
    };
  }

  const orderedTasks = [...input.tasks].sort(taskOrder);
  for (const task of orderedTasks) {
    const taskBlocks = getTaskBlocks(task.id, input.existingBlocks);
    const fixedBlocks = taskBlocks.filter((block) => block.state === "locked" || activeBlockIds.has(block.id) || (!hasActualWork && new Date(block.start).getTime() < now));
    const workedMinutes = workedMinutesByTask.get(task.id) ?? 0;
    const fixedMinutes = getFixedMinutes({ fixedBlocks, activeBlockIds, hasActualWork, workedMinutes, now });
    const hasFutureFixedBlock = fixedBlocks.some((block) => new Date(block.end).getTime() > now);
    const hasLockedConflict = fixedBlocks.some((block) =>
      block.state === "locked" && new Date(block.end).getTime() > now && input.busyIntervals.some((interval) =>
        overlaps(
          new Date(block.start).getTime(),
          new Date(block.end).getTime(),
          new Date(interval.start).getTime(),
          new Date(interval.end).getTime(),
        ),
      ),
    );
    const currentBlocks = fixedBlocks.map((block) => ({
      taskId: task.id,
      start: block.start,
      end: block.end,
      id: block.id,
      state: block.state,
    }));

    if (!task.autoSchedule || task.status === "done" || task.duration === null) {
      plans.push({
        taskId: task.id,
        state: getState(task, fixedMinutes, fixedMinutes, 0, null, hasFutureFixedBlock),
        fixedMinutes,
        scheduledMinutes: fixedMinutes,
        missingMinutes: 0,
        warning: null,
        blocks: currentBlocks,
      });
      continue;
    }

    const remaining = Math.max(0, task.duration - fixedMinutes);
    const minimum = Math.max(5, task.minBlockMinutes ?? preferences.defaultMinBlockMinutes);
    const maximum = Math.max(minimum, task.maxBlockMinutes ?? preferences.defaultMaxBlockMinutes);
    const blocks: Array<{ taskId: string; start: string; end: string; id?: string; state?: "flexible" | "locked" | "replaced" | "cancelled" | "missed" }> = currentBlocks.map((block) => ({
      taskId: task.id,
      start: block.start,
      end: block.end,
      id: block.id,
      state: block.state,
    }));
    let remainingMinutes = remaining;
    let cursor = getEarliestTimestamp(now);
    // A block that has already ended is history, not a reason to push the
    // remaining work into tomorrow. Keep the one-block-per-day preference for
    // future work, but let a task continue later on the same day when that
    // day's earlier block has already passed.
    const usedDays = new Set(
      currentBlocks
        .filter((block) => new Date(block.end).getTime() > now)
        .map((block) => localParts(new Date(block.start).getTime(), preferences.timezone).date),
    );
    const isLate = Boolean(task.deadline && isDeadlinePassed(task.deadline, now, preferences));
    const effectiveDeadline = isLate ? null : task.deadline;
    let warning: string | null = isLate ? `Deadline ${task.deadline} has passed; this task is late.` : null;
    if (hasLockedConflict) {
      warning = warning
        ? `${warning} A locked block conflicts with another calendar event.`
        : "A locked block conflicts with another calendar event.";
    }

    while (remainingMinutes > 0) {
      const maxCandidate = Math.min(remainingMinutes, maximum);
      const allCandidates = [
        maxCandidate,
        ...Array.from(
          { length: Math.max(0, Math.floor((maxCandidate - minimum) / 15)) },
          (_, index) => maxCandidate - (index + 1) * 15,
        ).filter((candidate) => candidate >= minimum),
      ];
      if (remainingMinutes < minimum) {
        allCandidates.unshift(remainingMinutes);
      }
      const candidates = [...new Set(allCandidates)];
      // Prefer a chunk that leaves at least the minimum for the final chunk.
      // If no such split exists (for example, 100 minutes with a 60-minute
      // minimum and 90-minute maximum), fall back to the largest safe chunk.
      const balancedCandidates = candidates.filter((candidate) => {
        const remainder = remainingMinutes - candidate;
        return remainder === 0 || remainder >= minimum || remainingMinutes < minimum;
      });
      const candidateOrder = balancedCandidates.length > 0 ? balancedCandidates : candidates;
      let range: ReturnType<typeof findRange> = null;
      let selectedDuration = maxCandidate;
      const smallestCandidate = candidateOrder[candidateOrder.length - 1] ?? maxCandidate;
      const earliestRange = (allowUsedDay: boolean) => findRange({
        from: cursor,
        duration: smallestCandidate,
        startDate: task.startDate,
        deadline: effectiveDeadline,
        minimum,
        preferences,
        intervals,
        usedDays,
        allowUsedDay,
      });
      const earliest = earliestRange(false) ?? earliestRange(true);
      if (earliest) {
        const candidateFitsAtEarliestStart = (candidate: number) => {
          const end = earliest.start + candidate * MINUTE_MS;
          const endDate = localParts(end - 1, preferences.timezone).date;
          return (!effectiveDeadline || endDate <= effectiveDeadline)
            && canUseRange(earliest.start, end, preferences, intervals);
        };
        // Candidate durations are descending and fit is monotonic at one
        // fixed start. Binary search avoids hundreds of full scans when a
        // user configures a very large maximum block.
        let low = 0;
        let high = candidateOrder.length - 1;
        let firstFittingIndex = high;
        while (low <= high) {
          const middle = Math.floor((low + high) / 2);
          if (candidateFitsAtEarliestStart(candidateOrder[middle])) {
            firstFittingIndex = middle;
            high = middle - 1;
          } else {
            low = middle + 1;
          }
        }
        selectedDuration = candidateOrder[firstFittingIndex] ?? smallestCandidate;
        range = {
          ...earliest,
          end: earliest.start + selectedDuration * MINUTE_MS,
        };
      }

      if (!range) {
        const capacityWarning = effectiveDeadline
          ? `Could not fit ${remainingMinutes} more minutes before ${effectiveDeadline}.`
          : `Could not fit ${remainingMinutes} more minutes in the available work time.`;
        warning = warning ? `${warning} ${capacityWarning}` : capacityWarning;
        break;
      }

      const start = new Date(range.start).toISOString();
      const end = new Date(range.end).toISOString();
      blocks.push({ taskId: task.id, start, end });
      intervals.push({ start, end, source: "calendar" });
      usedDays.add(range.date);
      remainingMinutes -= selectedDuration;
      cursor = range.end;
    }

    const scheduledMinutes = fixedMinutes + blocks.slice(currentBlocks.length).reduce((total, block) => total + getMinutes(block.start, block.end), 0);
    const missingMinutes = Math.max(0, task.duration - scheduledMinutes);
    plans.push({
      taskId: task.id,
      state: getState(task, fixedMinutes, scheduledMinutes, missingMinutes, warning, hasFutureFixedBlock || blocks.some((block) => new Date(block.end).getTime() > now)),
      fixedMinutes,
      scheduledMinutes,
      missingMinutes,
      warning,
      blocks,
    });
  }

  return { tasks: plans, busyIntervals: intervals };
}

export function getTaskOrder(first: SchedulerTask, second: SchedulerTask) {
  return taskOrder(first, second);
}
