import { describe, expect, it } from "vitest";
import { hashSecret, isUuid, matchesSecret, readJsonBody, rejectCrossOriginMutation, rejectOversizedBody } from "@/lib/security/http";
import { getSafeSameOriginPath } from "@/lib/security/redirect";

describe("security helpers", () => {
  it("accepts bounded UUIDs and rejects malformed route identifiers", () => {
    expect(isUuid("9c85d888-b110-4cfe-9d89-37ef2f01d86a")).toBe(true);
    expect(isUuid("session-e2e")).toBe(false);
    expect(isUuid("a".repeat(10_000))).toBe(false);
  });

  it("keeps auth-link destinations on the current origin", () => {
    const requestUrl = "https://web.heavyuser.app/auth/confirm";

    expect(getSafeSameOriginPath("/settings", requestUrl, "/")).toBe("/settings");
    expect(getSafeSameOriginPath("/settings?tab=calendar#google", requestUrl, "/")).toBe("/settings?tab=calendar#google");
    expect(getSafeSameOriginPath("https://attacker.example/steal", requestUrl, "/")).toBe("/");
    expect(getSafeSameOriginPath("/\\\\attacker.example", requestUrl, "/")).toBe("/");
    expect(getSafeSameOriginPath("//attacker.example", requestUrl, "/")).toBe("/");
  });

  it("compares webhook tokens using a stored digest", () => {
    const digest = hashSecret("channel-token");

    expect(matchesSecret("channel-token", digest)).toBe(true);
    expect(matchesSecret("wrong-token", digest)).toBe(false);
  });

  it("rejects cross-site and oversized browser mutations", () => {
    const crossSite = rejectCrossOriginMutation(new Request("https://web.heavyuser.app/api/scheduler/run", {
      method: "POST",
      headers: { Origin: "https://attacker.example" },
    }));
    const oversized = rejectOversizedBody(new Request("https://web.heavyuser.app/api/scheduler/settings", {
      method: "PUT",
      headers: { "content-length": "70000" },
    }));

    expect(crossSite?.status).toBe(403);
    expect(oversized?.status).toBe(413);
  });

  it("requires origin proof for browser mutations", () => {
    const missingOrigin = rejectCrossOriginMutation(new Request("https://web.heavyuser.app/api/timer/start", {
      method: "POST",
    }));

    expect(missingOrigin?.status).toBe(403);
  });

  it("stops an oversized chunked JSON body even without Content-Length", async () => {
    const oversizedChunk = new TextEncoder().encode(`{"value":"${"x".repeat(70_000)}"}`);
    const request = new Request("https://web.heavyuser.app/api/timer/start", {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(oversizedChunk);
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const result = await readJsonBody(request);
    expect(result.errorResponse?.status).toBe(413);
    expect(result.data).toBeNull();
  });

  it("rejects malformed JSON instead of treating it as an empty body", async () => {
    const request = new Request("https://web.heavyuser.app/api/google/calendar/select", {
      method: "POST",
      body: '{"calendarId":',
    });

    const result = await readJsonBody(request);

    expect(result.errorResponse?.status).toBe(400);
    await expect(result.errorResponse?.json()).resolves.toEqual({ error: "Invalid request." });
    expect(result.data).toBeNull();
  });
});
