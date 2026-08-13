import { describe, expect, it } from "vitest";
import { chunkValues, GOOGLE_DELETION_RECORD_BATCH_SIZE } from "./sync-utils";

describe("Google Calendar deletion batching", () => {
  it("keeps a large calendar deletion cleanup within bounded batches", () => {
    const eventKeys = Array.from({ length: 499 }, (_, index) => `event-${index}::2026-08-${String((index % 28) + 1).padStart(2, "0")}`);
    const batches = chunkValues(eventKeys, GOOGLE_DELETION_RECORD_BATCH_SIZE);

    expect(batches).toHaveLength(Math.ceil(eventKeys.length / GOOGLE_DELETION_RECORD_BATCH_SIZE));
    expect(Math.max(...batches.map((batch) => batch.length))).toBeLessThanOrEqual(GOOGLE_DELETION_RECORD_BATCH_SIZE);
    expect(batches.flat()).toEqual(eventKeys);
  });

  it("rejects an invalid batch size", () => {
    expect(() => chunkValues(["event-1"], 0)).toThrow("Batch size must be a positive integer.");
  });
});
