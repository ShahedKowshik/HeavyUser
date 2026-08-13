import { describe, expect, it } from "vitest";
import { getSafeAppReturnPath } from "./config";

describe("safe app return paths", () => {
  it("keeps internal paths and rejects external redirects", () => {
    expect(getSafeAppReturnPath("/settings#spaces")).toBe("/settings#spaces");
    expect(getSafeAppReturnPath("https://example.com/account")).toBe("/");
    expect(getSafeAppReturnPath("//example.com/account")).toBe("/");
    expect(getSafeAppReturnPath(null)).toBe("/");
  });
});
