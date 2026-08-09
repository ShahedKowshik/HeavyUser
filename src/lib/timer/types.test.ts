import { describe, expect, it } from "vitest";
import { formatElapsedSeconds, getRemainingMinutes, getSessionElapsedSeconds, getSessionWorkedMinutes, getTimerBlockDurationMinutes, parseWorkMinutes } from "@/lib/timer/types";

describe("work session calculations", () => {
  it("keeps exact seconds while the timer is running", () => {
    const startedAt = "2026-08-06T09:00:00.000Z";
    expect(getSessionElapsedSeconds({ startedAt, stoppedAt: null, workedSeconds: 0, state: "running" }, Date.parse("2026-08-06T10:01:07.000Z"))).toBe(3667);
    expect(getSessionWorkedMinutes({ startedAt, stoppedAt: null, workedSeconds: 0, state: "running" }, Date.parse("2026-08-06T10:01:07.000Z"))).toBe(61);
  });

  it("uses saved actual seconds for a stopped short session", () => {
    expect(getSessionElapsedSeconds({ startedAt: "2026-08-06T09:00:00.000Z", stoppedAt: "2026-08-06T09:00:27.000Z", workedSeconds: 27, state: "stopped" })).toBe(27);
    expect(formatElapsedSeconds(27)).toBe("0:27");
  });

  it("separates estimate from actual work", () => {
    expect(getRemainingMinutes(60, 20)).toBe(40);
    expect(getRemainingMinutes(null, 20)).toBeNull();
    expect(getRemainingMinutes(60, 80)).toBe(0);
  });

  it("accepts only usable manual work durations", () => {
    expect(parseWorkMinutes("30")).toBe(30);
    expect(parseWorkMinutes("30.5")).toBe(31);
    expect(parseWorkMinutes("0")).toBeNull();
    expect(parseWorkMinutes("1441")).toBeNull();
    expect(parseWorkMinutes("not a number")).toBeNull();
  });

  it("formats long sessions without losing midnight-safe elapsed time", () => {
    expect(formatElapsedSeconds(24 * 60 * 60 + 5)).toBe("24:00:05");
  });

  it("keeps the original duration when a missed block is restarted", () => {
    expect(getTimerBlockDurationMinutes("2026-08-05T09:00:00.000Z", "2026-08-05T10:30:00.000Z")).toBe(90);
    expect(getTimerBlockDurationMinutes("2026-08-05T10:30:00.000Z", "2026-08-05T09:00:00.000Z")).toBe(0);
  });
});
