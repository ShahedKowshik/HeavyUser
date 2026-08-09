import { describe, expect, it } from "vitest";
import { getRefreshedCalendarMetadata } from "@/lib/spaces";

describe("Space calendar metadata", () => {
  it("follows a Google rename when the Space name was never customized", () => {
    expect(getRefreshedCalendarMetadata(
      { name: "Old calendar", calendarName: "Old calendar", calendarId: "calendar-id" },
      { name: "New calendar", timeZone: "Asia/Dhaka" },
    )).toEqual({ name: "New calendar", calendarName: "New calendar", timeZone: "Asia/Dhaka" });
  });

  it("preserves a custom Space name while refreshing provider metadata", () => {
    expect(getRefreshedCalendarMetadata(
      { name: "Deep work", calendarName: "Old calendar", calendarId: "calendar-id" },
      { name: "New calendar", timeZone: "America/New_York" },
    )).toEqual({ name: "Deep work", calendarName: "New calendar", timeZone: "America/New_York" });
  });
});
