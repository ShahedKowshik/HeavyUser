import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { getSupabaseAdminClient, loadGoogleConnection } from "@/lib/google/server";
import { syncGoogleCalendar } from "@/lib/google/sync";
import { matchesSecret } from "@/lib/security/http";
import { loadSpaces } from "@/lib/spaces/server";

vi.mock("@/lib/google/server", () => ({
  getSupabaseAdminClient: vi.fn(),
  loadGoogleConnection: vi.fn(),
}));

vi.mock("@/lib/google/sync", () => ({
  syncGoogleCalendar: vi.fn(),
}));

vi.mock("@/lib/security/http", () => ({
  matchesSecret: vi.fn(),
}));

vi.mock("@/lib/spaces/server", () => ({
  loadSpaces: vi.fn(),
}));

const state = {
  user_id: "user-1",
  calendar_id: "calendar-1",
  channel_token_hash: "token-hash",
};

const admin = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: state, error: null }),
        })),
      })),
    })),
  })),
};

function webhookRequest() {
  return new Request("https://web.heavyuser.app/api/google/calendar/webhook", {
    method: "POST",
    headers: {
      "x-goog-channel-id": "channel-1",
      "x-goog-resource-id": "resource-1",
      "x-goog-channel-token": "channel-token",
    },
  });
}

describe("Google Calendar webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSupabaseAdminClient).mockReturnValue(admin as never);
    vi.mocked(loadGoogleConnection).mockResolvedValue({ selected_calendar_id: "calendar-1" } as never);
    vi.mocked(matchesSecret).mockReturnValue(true);
    vi.mocked(loadSpaces).mockResolvedValue([{ id: "space-1", calendarId: "calendar-1", status: "active" }] as never);
    vi.mocked(syncGoogleCalendar).mockResolvedValue({ eventCount: 1, fullSync: false });
  });

  it("returns a retryable server error when a matched notification cannot sync", async () => {
    vi.mocked(syncGoogleCalendar).mockRejectedValueOnce(new Error("sync failed"));

    const response = await POST(webhookRequest());

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("");
  });

  it("returns 204 after a matched notification syncs successfully", async () => {
    const response = await POST(webhookRequest());

    expect(response.status).toBe(204);
    expect(syncGoogleCalendar).toHaveBeenCalledOnce();
  });
});
