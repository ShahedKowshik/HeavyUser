import { describe, expect, it, vi } from "vitest";
import { loadCachedEvents } from "./calendar-events";

function queryMock(data: unknown[] = []) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    neq: vi.fn(() => query),
    or: vi.fn().mockResolvedValue({ data, error: null }),
  };
  return query;
}

describe("timer calendar event loading", () => {
  it("loads only non-cancelled events overlapping the requested instant", async () => {
    const query = queryMock([{ event_key: "busy" }]);
    const client = { from: vi.fn(() => query) };
    const at = "2026-08-10T23:30:00.000Z";

    await expect(loadCachedEvents(client as never, "user-1", ["calendar-a", "calendar-a", "calendar-b"], at)).resolves.toEqual([{ event_key: "busy" }]);

    expect(query.in).toHaveBeenCalledWith("calendar_id", ["calendar-a", "calendar-b"]);
    expect(query.neq).toHaveBeenCalledWith("status", "cancelled");
    expect(query.or).toHaveBeenCalledWith(
      "and(start_at.lte.2026-08-10T23:30:00.000Z,end_at.gt.2026-08-10T23:30:00.000Z),and(start_date.lte.2026-08-11,end_date.gt.2026-08-09)",
    );
  });

  it("does not query Supabase when there are no active calendars", async () => {
    const client = { from: vi.fn() };

    await expect(loadCachedEvents(client as never, "user-1", [], "2026-08-10T23:30:00.000Z")).resolves.toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });
});
