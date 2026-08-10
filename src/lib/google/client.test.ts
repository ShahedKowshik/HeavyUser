import { afterEach, describe, expect, it, vi } from "vitest";
import { listGoogleEvents } from "./client";

function googleEventsResponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("Google Calendar event listing", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("bounds every initial-sync page to recent history and upcoming events", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T12:00:00.000Z"));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(googleEventsResponse({ items: [], nextPageToken: "page-2" }))
      .mockResolvedValueOnce(googleEventsResponse({ items: [], nextSyncToken: "sync-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await listGoogleEvents({ accessToken: "access-token", calendarId: "calendar-1" });
    await listGoogleEvents({ accessToken: "access-token", calendarId: "calendar-1", pageToken: "page-2" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [requestUrl] of fetchMock.mock.calls) {
      const query = new URL(String(requestUrl)).searchParams;
      expect(query.get("timeMin")).toBe("2026-05-12T12:00:00.000Z");
      expect(query.get("timeMax")).toBe("2027-08-10T12:00:00.000Z");
      expect(query.get("syncToken")).toBeNull();
    }
    expect(new URL(String(fetchMock.mock.calls[1]?.[0])).searchParams.get("pageToken")).toBe("page-2");
  });

  it("uses the sync token without sending initial-sync time bounds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T12:00:00.000Z"));
    const fetchMock = vi.fn().mockResolvedValue(googleEventsResponse({ items: [], nextSyncToken: "sync-2" }));
    vi.stubGlobal("fetch", fetchMock);

    await listGoogleEvents({ accessToken: "access-token", calendarId: "calendar-1", syncToken: "sync-1" });

    const query = new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams;
    expect(query.get("syncToken")).toBe("sync-1");
    expect(query.get("timeMin")).toBeNull();
    expect(query.get("timeMax")).toBeNull();
  });
});
