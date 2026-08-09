/** A failed cleanup call must not turn an already-successful mutation into an error. */
export async function releaseLockBestEffort(release: () => Promise<unknown>) {
  try {
    await release();
  } catch {
    // Database locks have an expiry as the final recovery path.
  }
}
