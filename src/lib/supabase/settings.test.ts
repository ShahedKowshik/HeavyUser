import { describe, expect, it } from "vitest";
import { DEFAULT_USER_SETTINGS, normalizeUserSettings } from "@/lib/supabase/settings";

describe("user settings", () => {
  it("keeps old accounts on the default automatic task order", () => {
    expect(normalizeUserSettings({ nightOwlMode: true, dayStartTime: "03:30" })).toEqual({
      nightOwlMode: true,
      dayStartTime: "03:30",
      customTaskOrder: false,
      planningTimezone: "UTC",
    });
  });

  it("persists an explicit custom task order preference", () => {
    expect(normalizeUserSettings({ ...DEFAULT_USER_SETTINGS, customTaskOrder: true }).customTaskOrder).toBe(true);
  });
});
