import { describe, expect, it } from "vitest";
import { clearPendingTimerOperation, getPendingTimerOperation } from "@/lib/timer/idempotency";

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe("timer retry keys", () => {
  it("reuses a lost-response key and exact work range after refresh", () => {
    const storage = new MemoryStorage();
    const first = getPendingTimerOperation(storage, "user-1", "log-work", "task-1:30", () => ({
      requestKey: "request-key-1",
      startedAt: "2026-08-10T10:00:00.000Z",
      stoppedAt: "2026-08-10T10:30:00.000Z",
    }));
    const retried = getPendingTimerOperation(storage, "user-1", "log-work", "task-1:30", () => ({
      requestKey: "request-key-2",
    }));

    expect(retried).toEqual(first);
  });

  it("creates a fresh key only after a confirmed operation is cleared", () => {
    const storage = new MemoryStorage();
    const first = getPendingTimerOperation(storage, "user-1", "add-time", "session-1:30", () => ({ requestKey: "request-key-1" }));
    clearPendingTimerOperation(storage, first.storageKey);
    const next = getPendingTimerOperation(storage, "user-1", "add-time", "session-1:30", () => ({ requestKey: "request-key-2" }));

    expect(next.requestKey).toBe("request-key-2");
  });
});
