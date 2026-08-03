export type PlannerEventIdentity = {
  id: string;
  providerEventId: string;
  isTaskBlock: boolean;
  taskId: string | null;
  scheduleBlockId: string | null;
  start: string | null;
  end: string | null;
  isPlannerSynthetic?: boolean;
};

function timestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function getPlannerEventKey(event: PlannerEventIdentity) {
  if (event.isTaskBlock && event.taskId) {
    const start = timestamp(event.start);
    const end = timestamp(event.end);
    if (start !== null && end !== null) {
      return `managed:${event.taskId}:${start}:${end}`;
    }
  }

  return event.providerEventId ? `provider:${event.providerEventId}` : `event:${event.id}`;
}

function eventPreference(event: PlannerEventIdentity, preferredScheduleBlockIds: ReadonlySet<string>) {
  let score = event.isPlannerSynthetic ? 0 : 1;
  if (event.scheduleBlockId && preferredScheduleBlockIds.has(event.scheduleBlockId)) {
    score += 4;
  }
  return score;
}

/**
 * Prevent stale provider rows and the local synthetic fallback from rendering
 * the same HeavyUser block more than once. Ordinary Google events keep their
 * provider identity and are not grouped by title or time.
 */
export function dedupePlannerEvents<T extends PlannerEventIdentity>(
  events: ReadonlyArray<T>,
  preferredScheduleBlockIds: ReadonlySet<string> = new Set(),
) {
  const deduped = new Map<string, T>();
  for (const event of events) {
    const key = getPlannerEventKey(event);
    const current = deduped.get(key);
    if (!current || eventPreference(event, preferredScheduleBlockIds) > eventPreference(current, preferredScheduleBlockIds)) {
      deduped.set(key, event);
    }
  }

  return [...deduped.values()];
}
