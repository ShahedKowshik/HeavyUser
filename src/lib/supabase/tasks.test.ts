import { describe, expect, it } from "vitest";
import { createTaskWriteQueue } from "@/lib/supabase/tasks";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("task write queue", () => {
  it("never starts a newer task save before the older save settles", async () => {
    const queue = createTaskWriteQueue();
    const first = deferred<string>();
    const calls: string[] = [];

    const firstResult = queue.enqueue(async () => {
      calls.push("first-start");
      const value = await first.promise;
      calls.push("first-end");
      return value;
    });
    const secondResult = queue.enqueue(async () => {
      calls.push("second-start");
      return "second";
    });

    await Promise.resolve();
    expect(calls).toEqual(["first-start"]);
    first.resolve("first");
    await expect(firstResult).resolves.toBe("first");
    await expect(secondResult).resolves.toBe("second");
    expect(calls).toEqual(["first-start", "first-end", "second-start"]);
  });

  it("continues after a failed save", async () => {
    const queue = createTaskWriteQueue();
    const firstResult = queue.enqueue(async () => {
      throw new Error("offline");
    });
    const secondResult = queue.enqueue(async () => "saved");

    await expect(firstResult).rejects.toThrow("offline");
    await expect(secondResult).resolves.toBe("saved");
  });
});
