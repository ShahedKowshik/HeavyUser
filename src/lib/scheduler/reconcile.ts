type ReconcileEvent = {
  eventKey: string;
  providerEventId: string;
  calendarId?: string | null;
  startAt: string | null;
  endAt: string | null;
  status: string;
  googleUpdatedAt: string | null;
  privateProperties?: unknown;
};

type ReconcileBlock = {
  id: string;
  taskId: string;
  calendarId?: string | null;
  startAt: string;
  endAt: string;
  state: string;
  providerEventId?: string | null;
};

export type ManagedEventProperties = {
  isManaged: boolean;
  taskId: string | null;
  blockId: string | null;
};

export type ManagedEventCleanup = {
  eventKeys: ReadonlySet<string>;
  blockIds: ReadonlySet<string>;
};

export function getManagedEventCleanupKey(eventKey: string, calendarId?: string | null) {
  return calendarId ? `${calendarId}:${eventKey}` : eventKey;
}

function getTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getManagedEventProperties(value: unknown): ManagedEventProperties {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { isManaged: false, taskId: null, blockId: null };
  }

  const properties = value as Record<string, unknown>;
  const taskId = typeof properties.heavyuserTaskId === "string" ? properties.heavyuserTaskId : null;
  const blockId = typeof properties.heavyuserBlockId === "string" ? properties.heavyuserBlockId : null;
  return {
    isManaged: properties.heavyuser === "task-block" || taskId !== null || blockId !== null,
    taskId,
    blockId,
  };
}

export function getManagedEventRangeKey(taskId: string | null, startAt: string | null, endAt: string | null) {
  if (!taskId) {
    return null;
  }

  const start = getTimestamp(startAt);
  const end = getTimestamp(endAt);
  if (start === null || end === null || end <= start) {
    return null;
  }

  return `${taskId}:${start}:${end}`;
}

function isActiveBlock(block: ReconcileBlock) {
  return block.state !== "replaced" && block.state !== "cancelled";
}

/**
 * Chooses the one valid provider event for each managed task/time range and
 * identifies orphan rows that can safely be removed. Ordinary Google events
 * never enter this decision.
 */
export function selectManagedEventCleanup(
  events: ReadonlyArray<ReconcileEvent>,
  tasks: ReadonlySet<string>,
  blocks: ReadonlyArray<ReconcileBlock>,
  now = Date.now(),
): ManagedEventCleanup {
  const activeBlocks = blocks.filter(isActiveBlock);
  const activeBlockIds = new Set(activeBlocks.map((block) => block.id));
  const activeBlocksById = new Map(activeBlocks.map((block) => [block.id, block]));
  const activeBlockRanges = new Set(activeBlocks.map((block) => getManagedEventRangeKey(block.taskId, block.startAt, block.endAt)).filter((key): key is string => key !== null));
  const blocksByProviderId = new Map(
    blocks
      .filter((block): block is ReconcileBlock & { providerEventId: string } => typeof block.providerEventId === "string" && block.providerEventId.length > 0)
      .map((block) => [`${block.calendarId ?? ""}:${block.providerEventId}`, block]),
  );
  const eventKeys = new Set<string>();
  const blockIds = new Set<string>();
  const candidates: Array<ReconcileEvent & { taskId: string | null; blockId: string | null; rangeKey: string | null; linked: boolean }> = [];

  for (const event of events) {
    if (event.status === "cancelled") {
      continue;
    }

    const properties = getManagedEventProperties(event.privateProperties);
    // Older HeavyUser events may not have private properties in the local
    // cache. A provider id already stored on a schedule block is equally
    // strong ownership evidence and lets cleanup repair those rows too.
    const providerBlock = blocksByProviderId.get(`${event.calendarId ?? ""}:${event.providerEventId}`);
    if (!properties.isManaged && !providerBlock) {
      continue;
    }

    const taskId = providerBlock?.taskId ?? properties.taskId;
    const blockId = providerBlock?.id ?? properties.blockId;
    const rangeKey = getManagedEventRangeKey(taskId, event.startAt, event.endAt);
    const linked = Boolean(
      taskId
      && tasks.has(taskId)
      && ((blockId && activeBlockIds.has(blockId)) || (!blockId && rangeKey && activeBlockRanges.has(rangeKey))),
    );
    candidates.push({ ...event, taskId, blockId, rangeKey, linked });
  }

  const groups = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    if (!candidate.taskId || !candidate.rangeKey) {
      eventKeys.add(getManagedEventCleanupKey(candidate.eventKey, candidate.calendarId));
      if (candidate.blockId && activeBlockIds.has(candidate.blockId)) {
        blockIds.add(candidate.blockId);
      }
      continue;
    }

    const group = groups.get(candidate.rangeKey) ?? [];
    group.push(candidate);
    groups.set(candidate.rangeKey, group);
  }

  for (const group of groups.values()) {
    const linkedGroup = group.filter((candidate) => candidate.linked);
    const keep = linkedGroup.length > 0
      ? [...linkedGroup].sort((first, second) => {
        const firstBlock = first.blockId ? activeBlocksById.get(first.blockId) : undefined;
        const secondBlock = second.blockId ? activeBlocksById.get(second.blockId) : undefined;
        const preservationScore = (block: ReconcileBlock | undefined) => {
          if (!block) return 0;
          if (block.state === "locked") return 3;
          const end = getTimestamp(block.endAt);
          return end !== null && end <= now ? 2 : 1;
        };
        const scoreDelta = preservationScore(secondBlock) - preservationScore(firstBlock);
        return scoreDelta !== 0 ? scoreDelta : first.eventKey.localeCompare(second.eventKey);
      })[0]
      : null;

    for (const candidate of group) {
      if (!keep || candidate !== keep) {
        eventKeys.add(getManagedEventCleanupKey(candidate.eventKey, candidate.calendarId));
        if (candidate.blockId && activeBlockIds.has(candidate.blockId)) {
          blockIds.add(candidate.blockId);
        }
      }
    }
  }

  return { eventKeys, blockIds };
}
