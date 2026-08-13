export type PlannerEventIdentity = {
  id: string;
  providerEventId: string;
  calendarId?: string | null;
  isTaskBlock: boolean;
  taskId: string | null;
  scheduleBlockId: string | null;
  start: string | null;
  end: string | null;
  isPlannerSynthetic?: boolean;
};

export function isValidCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function isValidTimedEventRange(start: unknown, end: unknown, maximumMinutes = 24 * 60, minimumMinutes = 5) {
  if (typeof start !== "string" || typeof end !== "string") return false;
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  return Number.isFinite(startTime)
    && Number.isFinite(endTime)
    && endTime - startTime >= minimumMinutes * 60_000
    && endTime - startTime <= maximumMinutes * 60_000;
}

export function hasEventEditConflict({
  requestedEtag,
  localEtag,
  providerEtag,
}: {
  requestedEtag: string | null | undefined;
  localEtag: string | null;
  providerEtag?: string | null;
}) {
  if (localEtag && requestedEtag !== localEtag) {
    return true;
  }

  return providerEtag !== undefined
    && Boolean(localEtag && providerEtag && localEtag !== providerEtag);
}

export function getStaleCalendarEventKeys(
  cachedEventKeys: ReadonlyArray<string>,
  retainedProviderEventKeys: ReadonlySet<string>,
) {
  return cachedEventKeys.filter((eventKey) => !retainedProviderEventKeys.has(eventKey));
}

function timestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function isCalendarEventInProgress(
  event: { start: string | null; end: string | null; allDay?: boolean },
  now = Date.now(),
) {
  if (event.allDay || !event.start || !event.end) {
    return false;
  }

  const start = timestamp(event.start);
  const end = timestamp(event.end);
  return start !== null && end !== null && start <= now && now < end;
}

export function getPlannerEventKey(event: PlannerEventIdentity) {
  if (event.isTaskBlock && event.taskId) {
    const start = timestamp(event.start);
    const end = timestamp(event.end);
    if (start !== null && end !== null) {
      return `managed:${event.taskId}:${start}:${end}`;
    }
  }

  return event.providerEventId ? `provider:${event.calendarId ?? ""}:${event.providerEventId}` : `event:${event.id}`;
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
