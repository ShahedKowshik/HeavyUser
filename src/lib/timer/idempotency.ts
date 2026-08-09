export type TimerOperationName = "add-time" | "log-work" | "stop";

type TimerOperationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type PendingTimerOperation = {
  storageKey: string;
  requestKey: string;
  startedAt?: string;
  stoppedAt?: string;
};

function isPendingTimerOperation(value: unknown): value is Omit<PendingTimerOperation, "storageKey"> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { requestKey?: unknown; startedAt?: unknown; stoppedAt?: unknown };
  return typeof candidate.requestKey === "string"
    && candidate.requestKey.length >= 8
    && candidate.requestKey.length <= 160
    && (candidate.startedAt === undefined || typeof candidate.startedAt === "string")
    && (candidate.stoppedAt === undefined || typeof candidate.stoppedAt === "string");
}

export function getPendingTimerOperation(
  storage: TimerOperationStorage,
  userId: string,
  operation: TimerOperationName,
  fingerprint: string,
  create: () => Omit<PendingTimerOperation, "storageKey">,
) {
  const storageKey = `heavyuser:timer-operation:v1:${userId}:${operation}:${encodeURIComponent(fingerprint)}`;
  try {
    const saved = storage.getItem(storageKey);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (isPendingTimerOperation(parsed)) return { ...parsed, storageKey };
      storage.removeItem(storageKey);
    }
  } catch {
    // Private browsing can disable sessionStorage. The server-side receipt
    // still protects retries made during the current request.
  }

  const pending = create();
  try {
    storage.setItem(storageKey, JSON.stringify(pending));
  } catch {
    // The caller can still send the operation with its in-memory request key.
  }
  return { ...pending, storageKey };
}

export function clearPendingTimerOperation(storage: TimerOperationStorage, storageKey: string) {
  try {
    storage.removeItem(storageKey);
  } catch {
    // A confirmed server response is enough even when storage cleanup fails.
  }
}
