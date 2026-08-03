import { describe, expect, it } from "vitest";
import { hashSecret, matchesSecret, rejectCrossOriginMutation, rejectOversizedBody } from "@/lib/security/http";
import { getSafeSameOriginPath } from "@/lib/security/redirect";

describe("security helpers", () => {
  it("keeps auth-link destinations on the current origin", () => {
    const requestUrl = "https://web.heavyuser.app/auth/confirm";

    expect(getSafeSameOriginPath("/settings", requestUrl, "/")).toBe("/settings");
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
});
