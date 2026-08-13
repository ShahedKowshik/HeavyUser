import { describe, expect, it } from "vitest";
import {
  getResolvedWorkWindowsForDay,
  getSchedulerBlockLimitError,
  hasWorkingWindow,
  normalizeSchedulerPreferences,
  resolveWorkWindowDay,
} from "@/lib/scheduler/preferences";

describe("scheduler preferences", () => {
  it("preserves an all-day marker and inherits Night Owl settings", () => {
    const preferences = normalizeSchedulerPreferences(
      {
        enabled: true,
        timezone: "UTC",
        work_windows: {
          "1": [{ allDay: true }],
          "2": [],
          "3": [],
          "4": [],
          "5": [],
          "6": [],
          "0": [],
        },
      },
      "UTC",
      { nightOwlMode: true, dayStartTime: "04:00" },
    );

    expect(preferences.workWindows["1"]).toEqual([{ start: "00:00", end: "23:59", allDay: true }]);
    expect(preferences.nightOwlMode).toBe(true);
    expect(preferences.dayStartTime).toBe("04:00");
    expect(hasWorkingWindow(preferences)).toBe(true);
  });

  it("bounds legacy values and rejects oversized settings writes", () => {
    expect(normalizeSchedulerPreferences({ defaultMinBlockMinutes: 20_000, defaultMaxBlockMinutes: 30_000 }).defaultMaxBlockMinutes).toBe(10_080);
    expect(getSchedulerBlockLimitError({ defaultMinBlockMinutes: 30, defaultMaxBlockMinutes: 10_081 })).toContain("10,080");
    expect(getSchedulerBlockLimitError({ defaultMinBlockMinutes: 90, defaultMaxBlockMinutes: 30 })).toContain("minimum");
    expect(getSchedulerBlockLimitError({ defaultMinBlockMinutes: 30, defaultMaxBlockMinutes: 90 })).toBeNull();
  });

  it("moves early manual windows to the next weekday when Night Owl is on", () => {
    const preferences = normalizeSchedulerPreferences(
      {
        timezone: "UTC",
        work_windows: {
          "0": [],
          "1": [
            { start: "00:00", end: "15:00" },
            { start: "07:00", end: "17:00" },
          ],
          "2": [],
          "3": [],
          "4": [],
          "5": [],
          "6": [],
        },
      },
      "UTC",
      { nightOwlMode: true, dayStartTime: "07:00" },
    );

    expect(resolveWorkWindowDay("1", { start: "00:00", end: "15:00" }, preferences)).toEqual({
      effectiveDay: "2",
      shiftedByNightOwl: true,
    });
    expect(resolveWorkWindowDay("1", { start: "07:00", end: "17:00" }, preferences)).toEqual({
      effectiveDay: "1",
      shiftedByNightOwl: false,
    });
    expect(getResolvedWorkWindowsForDay("1", preferences)).toEqual([{
      start: "07:00",
      end: "17:00",
      sourceDay: "1",
      effectiveDay: "1",
      shiftedByNightOwl: false,
    }]);
    expect(getResolvedWorkWindowsForDay("2", preferences)).toEqual([{
      start: "00:00",
      end: "15:00",
      sourceDay: "1",
      effectiveDay: "2",
      shiftedByNightOwl: true,
    }]);

    expect(getResolvedWorkWindowsForDay("2", {
      ...preferences,
      workWindows: {
        ...preferences.workWindows,
        "2": [{ start: "00:00", end: "23:59", allDay: true }],
      },
    })).toEqual([
      {
        start: "00:00",
        end: "15:00",
        sourceDay: "1",
        effectiveDay: "2",
        shiftedByNightOwl: true,
      },
      {
        start: "07:00",
        end: "24:00",
        sourceDay: "2",
        effectiveDay: "2",
        shiftedByNightOwl: false,
      },
    ]);
  });

  it("keeps manual windows literal when Night Owl is off and handles Sunday rollover", () => {
    const preferences = normalizeSchedulerPreferences(
      {
        timezone: "UTC",
        work_windows: {
          "0": [{ start: "00:00", end: "03:00" }],
          "1": [],
          "2": [],
          "3": [],
          "4": [],
          "5": [],
          "6": [],
        },
      },
      "UTC",
      { nightOwlMode: true, dayStartTime: "07:00" },
    );

    expect(resolveWorkWindowDay("0", { start: "00:00", end: "03:00" }, preferences)).toEqual({
      effectiveDay: "1",
      shiftedByNightOwl: true,
    });
    expect(getResolvedWorkWindowsForDay("1", preferences)).toEqual([{
      start: "00:00",
      end: "03:00",
      sourceDay: "0",
      effectiveDay: "1",
      shiftedByNightOwl: true,
    }]);
    expect(getResolvedWorkWindowsForDay("0", { ...preferences, nightOwlMode: false })).toEqual([{
      start: "00:00",
      end: "03:00",
      sourceDay: "0",
      effectiveDay: "0",
      shiftedByNightOwl: false,
    }]);
  });
});
