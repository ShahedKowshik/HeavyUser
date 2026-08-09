import { describe, expect, it } from "vitest";
import { getSchedulerBlockLimitError, hasWorkingWindow, normalizeSchedulerPreferences } from "@/lib/scheduler/preferences";

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
});
