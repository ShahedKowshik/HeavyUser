export const GOOGLE_DELETION_RECORD_BATCH_SIZE = 50;

export function chunkValues<T>(values: ReadonlyArray<T>, batchSize: number) {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError("Batch size must be a positive integer.");
  }

  const batches: T[][] = [];
  for (let index = 0; index < values.length; index += batchSize) {
    batches.push(values.slice(index, index + batchSize));
  }
  return batches;
}
