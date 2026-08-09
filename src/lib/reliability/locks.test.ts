import { describe, expect, it, vi } from "vitest";
import { releaseLockBestEffort } from "@/lib/reliability/locks";

describe("lock cleanup", () => {
  it("does not report a completed operation as failed when release is unavailable", async () => {
    const release = vi.fn().mockRejectedValue(new Error("network lost"));
    await expect(releaseLockBestEffort(release)).resolves.toBeUndefined();
    expect(release).toHaveBeenCalledOnce();
  });
});
