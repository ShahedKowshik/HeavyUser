import "server-only";

import { randomUUID } from "node:crypto";
import type { GoogleConnection, GoogleDbClient } from "@/lib/google/server";
import {
  GoogleApiError,
  stopGoogleChannel,
  listGoogleEvents,
  INITIAL_SYNC_FUTURE_DAYS,
  INITIAL_SYNC_HISTORY_DAYS,
  watchGoogleEvents,
  type GoogleEvent,
} from "@/lib/google/client";
import {
  getUsableGoogleAccessToken,
  isGoogleAuthError,
  isGoogleCalendarUnavailableError,
  loadGoogleSyncState,
  setGoogleConnectionError,
  setGoogleConnectionWarning,
} from "@/lib/google/server";
import { queueSchedulerJob } from "@/lib/scheduler/queue";
import { hashSecret } from "@/lib/security/http";
import { loadSpaces } from "@/lib/spaces/server";
import { getStaleCalendarEventKeys } from "@/lib/google/event-utils";

const EVENT_KEY_DELETE_BATCH_SIZE = 100;
const MAX_SYNC_EVENTS_WARNING = 5_000;

type EventScope = {
  calendarId: string;
  spaceId?: string | null;
};

function getDateTime(value: { dateTime?: string; date?: string } | undefined) {
  if (!value) {
    return null;
  }

  if (!value.dateTime) {
    return null;
  }
  const timestamp = new Date(value.dateTime).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : value.dateTime;
}

function getDate(value: { dateTime?: string; date?: string } | undefined) {
  if (!value) {
    return null;
  }

  return value.date ?? null;
}

function isMeetingUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "meet.google.com"
      || hostname === "hangouts.google.com"
      || hostname === "zoom.us"
      || hostname.endsWith(".zoom.us")
      || hostname === "zoom.com"
      || hostname.endsWith(".zoom.com")
      || hostname === "teams.microsoft.com"
      || hostname.endsWith(".webex.com");
  } catch {
    return false;
  }
}

function findMeetingUrl(event: GoogleEvent) {
  const conferenceUrl = event.conferenceData?.entryPoints?.find(
    (entryPoint) => entryPoint.entryPointType === "video" && typeof entryPoint.uri === "string" && isMeetingUrl(entryPoint.uri),
  )?.uri;
  if (conferenceUrl) {
    return conferenceUrl;
  }

  for (const text of [event.location, event.description]) {
    const urls = text?.match(/https?:\/\/[^\s<>"']+/g) ?? [];
    const meetingUrl = urls.find((url) => isMeetingUrl(url.replace(/[),.;]+$/, "")));
    if (meetingUrl) {
      return meetingUrl.replace(/[),.;]+$/, "");
    }
  }

  return null;
}

export function getGoogleEventKey(event: GoogleEvent) {
  const originalStart = event.originalStartTime?.dateTime ?? event.originalStartTime?.date ?? "";
  return `${event.id}::${originalStart}`;
}

export function mapGoogleEvent(userId: string, event: GoogleEvent, scope: EventScope = { calendarId: "" }) {
  const startDateTime = getDateTime(event.start);
  const endDateTime = getDateTime(event.end);
  const startDate = getDate(event.start);
  const endDate = getDate(event.end);
  const isAllDay = Boolean(startDate && endDate);
  const hasAttendees = Boolean(event.attendees?.length);

  return {
    event_key: getGoogleEventKey(event),
    user_id: userId,
    calendar_id: scope.calendarId,
    space_id: scope.spaceId ?? null,
    provider_event_id: event.id,
    recurring_event_id: event.recurringEventId ?? null,
    original_start_time: event.originalStartTime?.dateTime ?? null,
    status: event.status ?? "confirmed",
    summary: event.summary ?? "Untitled event",
    description: event.description ?? null,
    location: event.location ?? null,
    meeting_url: findMeetingUrl(event),
    start_at: startDateTime,
    end_at: endDateTime,
    start_date: startDate,
    end_date: endDate,
    is_all_day: isAllDay,
    has_attendees: hasAttendees,
    organizer_email: event.organizer?.email ?? event.creator?.email ?? null,
    etag: event.etag ?? null,
    html_link: event.htmlLink ?? null,
    time_zone: event.start?.timeZone ?? event.end?.timeZone ?? null,
    visibility: event.visibility ?? null,
    transparency: event.transparency ?? null,
    private_properties: event.extendedProperties?.private ?? null,
    google_updated_at: event.updated ?? null,
    updated_at: new Date().toISOString(),
  };
}

export async function recordGoogleEventDeletion(
  client: GoogleDbClient,
  userId: string,
  eventKey: string,
  providerEventId: string,
  calendarId = "",
) {
  const { error } = await client.from("google_calendar_event_deletions").upsert({
    user_id: userId,
    calendar_id: calendarId,
    event_key: eventKey,
    provider_event_id: providerEventId,
    deleted_at: new Date().toISOString(),
  }, { onConflict: "user_id,calendar_id,event_key" });
  if (error) {
    throw new Error(`Google Calendar deletion record failed: ${error.message}`);
  }
}

export async function upsertGoogleCalendarEvent(client: GoogleDbClient, userId: string, event: GoogleEvent, scope: EventScope = { calendarId: "" }) {
  const row = mapGoogleEvent(userId, event, scope);
  const { error } = await client
    .from("google_calendar_events")
    .upsert(row, { onConflict: "user_id,calendar_id,event_key" });
  if (error) {
    throw new Error(`Google Calendar event cache update failed: ${error.message}`);
  }

  // A provider event can be recreated with the same event key after a
  // successful delete. Do not let the old tombstone hide the new event.
  const { error: deletionCleanupError } = await client
    .from("google_calendar_event_deletions")
    .delete()
    .eq("user_id", userId)
    .eq("calendar_id", scope.calendarId)
    .eq("event_key", row.event_key);
  if (deletionCleanupError) {
    throw new Error(`Google Calendar deletion record cleanup failed: ${deletionCleanupError.message}`);
  }
  const { error: providerDeletionCleanupError } = await client
    .from("google_calendar_event_deletions")
    .delete()
    .eq("user_id", userId)
    .eq("calendar_id", scope.calendarId)
    .eq("provider_event_id", row.provider_event_id);
  if (providerDeletionCleanupError) {
    throw new Error(`Google Calendar provider deletion record cleanup failed: ${providerDeletionCleanupError.message}`);
  }
  return row;
}

async function applyEvents(client: GoogleDbClient, userId: string, events: GoogleEvent[], scope: EventScope) {
  const { data: deletionRows, error: deletionLoadError } = await client
    .from("google_calendar_event_deletions")
    .select("event_key,provider_event_id,deleted_at")
    .eq("user_id", userId)
    .eq("calendar_id", scope.calendarId);
  if (deletionLoadError) {
    throw new Error(`Google Calendar deletion records could not be loaded: ${deletionLoadError.message}`);
  }

  const deletedByEventKey = new Map((deletionRows ?? []).map((row) => [row.event_key, row]));
  const deletedByProviderEventId = new Map((deletionRows ?? []).map((row) => [row.provider_event_id, row]));
  const isRecreatedAfterDeletion = (event: GoogleEvent) => {
    const tombstone = deletedByEventKey.get(getGoogleEventKey(event)) ?? deletedByProviderEventId.get(event.id);
    if (!tombstone) return true;
    const eventUpdatedAt = event.updated ? new Date(event.updated).getTime() : Number.NaN;
    const deletedAt = new Date(tombstone.deleted_at).getTime();
    return Number.isFinite(eventUpdatedAt) && Number.isFinite(deletedAt) && eventUpdatedAt > deletedAt;
  };
  const activeEvents = events.filter((event) => (
    event.status !== "cancelled"
    && isRecreatedAfterDeletion(event)
  ));
  const cancelledEvents = events.filter((event) => event.status === "cancelled");
  const cancelledKeys = [...new Set(cancelledEvents.map(getGoogleEventKey))];
  const cancelledProviderEventIds = [...new Set(cancelledEvents.map((event) => event.id))];

  if (cancelledKeys.length > 0) {
    for (let index = 0; index < cancelledKeys.length; index += EVENT_KEY_DELETE_BATCH_SIZE) {
      const batch = cancelledKeys.slice(index, index + EVENT_KEY_DELETE_BATCH_SIZE);
      const { error } = await client.from("google_calendar_events").delete().in("event_key", batch).eq("user_id", userId).eq("calendar_id", scope.calendarId);
      if (error) {
        throw new Error(`Google Calendar event cleanup failed: ${error.message}`);
      }
    }

    const { error: deletionCleanupError } = await client
      .from("google_calendar_event_deletions")
      .delete()
      .eq("user_id", userId)
      .eq("calendar_id", scope.calendarId)
      .in("event_key", cancelledKeys);
    if (deletionCleanupError) {
      throw new Error(`Google Calendar deletion record cleanup failed: ${deletionCleanupError.message}`);
    }

    if (cancelledProviderEventIds.length > 0) {
      const { error: providerDeletionCleanupError } = await client
        .from("google_calendar_event_deletions")
        .delete()
        .eq("user_id", userId)
        .eq("calendar_id", scope.calendarId)
        .in("provider_event_id", cancelledProviderEventIds);
      if (providerDeletionCleanupError) {
        throw new Error(`Google Calendar provider deletion record cleanup failed: ${providerDeletionCleanupError.message}`);
      }
    }
  }

  if (activeEvents.length === 0) {
    return new Set<string>();
  }

  const { error } = await client.from("google_calendar_events").upsert(
    activeEvents.map((event) => mapGoogleEvent(userId, event, scope)),
    { onConflict: "user_id,calendar_id,event_key" },
  );
  if (error) {
    throw new Error(`Google Calendar event sync failed: ${error.message}`);
  }

  const activeEventKeys = activeEvents.map(getGoogleEventKey);
  const activeProviderEventIds = [...new Set(activeEvents.map((event) => event.id))];
  if (activeEventKeys.length > 0) {
    const { error: eventTombstoneCleanupError } = await client
      .from("google_calendar_event_deletions")
      .delete()
      .eq("user_id", userId)
      .eq("calendar_id", scope.calendarId)
      .in("event_key", activeEventKeys);
    if (eventTombstoneCleanupError) {
      throw new Error(`Google Calendar deletion record cleanup failed: ${eventTombstoneCleanupError.message}`);
    }
  }
  if (activeProviderEventIds.length > 0) {
    const { error: providerTombstoneCleanupError } = await client
      .from("google_calendar_event_deletions")
      .delete()
      .eq("user_id", userId)
      .eq("calendar_id", scope.calendarId)
      .in("provider_event_id", activeProviderEventIds);
    if (providerTombstoneCleanupError) {
      throw new Error(`Google Calendar provider deletion record cleanup failed: ${providerTombstoneCleanupError.message}`);
    }
  }
  return new Set(activeEventKeys);
}

async function removeEventsMissingFromFullSnapshot(
  client: GoogleDbClient,
  userId: string,
  scope: EventScope,
  retainedEventKeys: ReadonlySet<string>,
  windowStart: string,
  windowEnd: string,
) {
  const { data, error } = await client
    .from("google_calendar_events")
    .select("event_key,start_at,start_date,is_all_day")
    .eq("user_id", userId)
    .eq("calendar_id", scope.calendarId);
  if (error) {
    throw new Error(`Google Calendar cache could not be checked: ${error.message}`);
  }

  const startTime = new Date(windowStart).getTime();
  const endTime = new Date(windowEnd).getTime();
  const startDate = windowStart.slice(0, 10);
  const endDate = windowEnd.slice(0, 10);
  const boundedKeys = (data ?? [])
    .filter((row) => {
      if (row.is_all_day) {
        return Boolean(row.start_date && row.start_date >= startDate && row.start_date < endDate);
      }
      const timestamp = row.start_at ? new Date(row.start_at).getTime() : Number.NaN;
      return Number.isFinite(timestamp) && timestamp >= startTime && timestamp < endTime;
    })
    .map((row) => row.event_key);
  const staleKeys = getStaleCalendarEventKeys(
    boundedKeys,
    retainedEventKeys,
  );
  for (let index = 0; index < staleKeys.length; index += EVENT_KEY_DELETE_BATCH_SIZE) {
    const batch = staleKeys.slice(index, index + EVENT_KEY_DELETE_BATCH_SIZE);
    const { error: deleteError } = await client
      .from("google_calendar_events")
      .delete()
      .eq("user_id", userId)
      .eq("calendar_id", scope.calendarId)
      .in("event_key", batch);
    if (deleteError) {
      throw new Error(`Google Calendar stale event cleanup failed: ${deleteError.message}`);
    }
  }
}

async function performEventSync(client: GoogleDbClient, connection: GoogleConnection, scope: EventScope, syncToken: string | null) {
  const accessToken = await getUsableGoogleAccessToken(client, connection);
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  do {
    const result = await listGoogleEvents({
      accessToken,
      calendarId: scope.calendarId,
      syncToken,
      pageToken,
    });
    events.push(...(result.items ?? []));
    pageToken = result.nextPageToken;
    nextSyncToken = result.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  if (!nextSyncToken) {
    throw new Error("Google Calendar did not return a sync token.");
  }

  const now = Date.now();
  return {
    events,
    nextSyncToken,
    accessToken,
    truncated: events.length >= MAX_SYNC_EVENTS_WARNING,
    windowStart: new Date(now - INITIAL_SYNC_HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    windowEnd: new Date(now + INITIAL_SYNC_FUTURE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };
}

async function ensureWatch(client: GoogleDbClient, connection: GoogleConnection, scope: EventScope, request: Request | undefined, accessToken: string) {
  if (!request) {
    return;
  }

  const state = await loadGoogleSyncState(client, connection.user_id, scope.calendarId);
  const expiration = state?.channel_expiration ? new Date(state.channel_expiration).getTime() : 0;
  if (state?.channel_id && state.channel_token_hash && expiration > Date.now() + 24 * 60 * 60 * 1000) {
    return;
  }

  const { getGoogleWebhookUri } = await import("@/lib/google/config");
  const channelToken = randomUUID();
  const channel = await watchGoogleEvents({
    accessToken,
    calendarId: scope.calendarId,
    channelId: randomUUID(),
    channelToken,
    address: getGoogleWebhookUri(),
  });

  const { error } = await client.from("google_calendar_sync_states").upsert({
    user_id: connection.user_id,
    calendar_id: scope.calendarId,
    sync_token: state?.sync_token ?? null,
    channel_id: channel.id,
    resource_id: channel.resourceId,
    channel_token_hash: hashSecret(channelToken),
    channel_expiration: channel.expiration ? new Date(Number(channel.expiration)).toISOString() : null,
    watch_generation: (state?.watch_generation ?? 0) + 1,
    last_synced_at: state?.last_synced_at ?? null,
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,calendar_id" });
  if (error) {
    throw error;
  }

  if (state?.channel_id && state.resource_id && state.channel_id !== channel.id) {
    try {
      await stopGoogleChannel({
        accessToken,
        channelId: state.channel_id,
        resourceId: state.resource_id,
      });
    } catch {
      // The old channel may already have expired. The new saved channel is
      // authoritative and will be replaced on its next renewal.
    }
  }
}

export async function syncGoogleCalendar(
  client: GoogleDbClient,
  connection: GoogleConnection,
  request?: Request,
  options: { skipSchedulerQueue?: boolean; calendarId?: string; spaceId?: string | null; updateConnectionStatus?: boolean } = {},
) {
  const calendarId = options.calendarId ?? connection.selected_calendar_id;
  if (!calendarId) {
    throw new Error("Choose a Google Calendar before syncing.");
  }

  const scope: EventScope = { calendarId, spaceId: options.spaceId ?? null };
  const state = await loadGoogleSyncState(client, connection.user_id, calendarId);
  let fullSync = !state?.sync_token;
  let result: { events: GoogleEvent[]; nextSyncToken: string; accessToken: string; truncated: boolean; windowStart: string; windowEnd: string };

  try {
    try {
      result = await performEventSync(client, connection, scope, state?.sync_token ?? null);
    } catch (error) {
      if (!(error instanceof GoogleApiError) || error.status !== 410 || fullSync) {
        throw error;
      }

      fullSync = true;
      result = await performEventSync(client, connection, scope, null);
    }

    const retainedEventKeys = await applyEvents(client, connection.user_id, result.events, scope);
    if (fullSync) {
      // Fetch and apply the complete bounded provider snapshot before removing
      // stale cache rows. A Google/network failure can no longer blank the planner.
      await removeEventsMissingFromFullSnapshot(
        client,
        connection.user_id,
        scope,
        retainedEventKeys,
        result.windowStart,
        result.windowEnd,
      );
    }
    const { error: syncStateError } = await client.from("google_calendar_sync_states").upsert({
      user_id: connection.user_id,
      calendar_id: calendarId,
      sync_token: result.nextSyncToken,
      channel_id: state?.channel_id ?? null,
      resource_id: state?.resource_id ?? null,
      channel_token_hash: state?.channel_token_hash ?? null,
      channel_expiration: state?.channel_expiration ?? null,
      last_synced_at: new Date().toISOString(),
      sync_window_start: fullSync ? result.windowStart : (state?.sync_window_start ?? result.windowStart),
      sync_window_end: fullSync ? result.windowEnd : (state?.sync_window_end ?? result.windowEnd),
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,calendar_id" });
    if (syncStateError) {
      throw syncStateError;
    }

    try {
      await ensureWatch(client, connection, scope, request, result.accessToken);
    } catch (watchError) {
      // Localhost and private preview URLs cannot receive Google webhooks. The
      // app-load incremental sync remains available as a safe fallback.
      const { error: watchStateError } = await client.from("google_calendar_sync_states").update({
        last_error: watchError instanceof Error ? watchError.message : "Webhook setup failed.",
        updated_at: new Date().toISOString(),
      }).eq("user_id", connection.user_id).eq("calendar_id", calendarId);
      if (watchStateError) {
        throw watchStateError;
      }
    }

    // A prior transient failure should not leave the connection marked as
    // errored after the calendar has successfully synced again.
    if (options.updateConnectionStatus !== false) {
      const { error: connectionError } = await client
        .from("google_calendar_connections")
        .update({ status: "connected", last_error: null, updated_at: new Date().toISOString() })
        .eq("user_id", connection.user_id);
      if (connectionError) {
        throw connectionError;
      }
    }

    // Incremental Google syncs commonly return no events. Those reads are not
    // scheduling changes, so do not wake the scheduler on every polling tick.
    // A full sync or a non-empty change page still needs a replan because an
    // event may have been created, moved, edited, or deleted in Google.
    if (!options.skipSchedulerQueue && (fullSync || result.events.length > 0)) {
      await queueSchedulerJob(client, connection.user_id, "google_sync");
    }

    return { eventCount: result.events.filter((event) => event.status !== "cancelled").length, fullSync, truncated: result.truncated };
  } catch (error) {
    if (options.updateConnectionStatus !== false) {
      if (isGoogleAuthError(error) || isGoogleCalendarUnavailableError(error)) {
        await setGoogleConnectionError(client, connection.user_id, error instanceof Error ? error.message : "Calendar sync failed.");
      } else {
        await setGoogleConnectionWarning(client, connection.user_id, error instanceof Error ? error.message : "Calendar sync failed.");
      }
    }
    throw error;
  }
}

export async function syncAllGoogleCalendars(
  client: GoogleDbClient,
  connection: GoogleConnection,
  request?: Request,
  options: { skipSchedulerQueue?: boolean } = {},
) {
  const allSpaces = await loadSpaces(client, connection.user_id);
  const spaces = allSpaces.filter((space) => space.status === "active");
  if (spaces.length === 0) {
    if (allSpaces.length > 0) {
      return { calendars: 0, attempted: 0, succeeded: 0, failed: 0, disconnected: 0, eventCount: 0, fullSync: false, truncated: false, errors: [] as ReadonlyArray<string> };
    }
    if (!connection.selected_calendar_id) return { calendars: 0, attempted: 0, succeeded: 0, failed: 0, disconnected: 0, eventCount: 0, fullSync: false, truncated: false, errors: [] as ReadonlyArray<string> };
    const result = await syncGoogleCalendar(client, connection, request, options);
    return { calendars: 1, attempted: 1, succeeded: 1, failed: 0, disconnected: 0, eventCount: result.eventCount, fullSync: result.fullSync, truncated: result.truncated, errors: [] as ReadonlyArray<string> };
  }

  let eventCount = 0;
  let fullSync = false;
  let attempted = 0;
  let succeeded = 0;
  let failed = 0;
  let disconnected = 0;
  let authenticationFailure = false;
  let truncated = false;
  const errors: string[] = [];
  // Two workers keep multi-Space refreshes quick without creating an
  // unbounded burst of Google requests. Leave time for the final status write.
  const deadlineAt = Date.now() + 45_000;
  let cursor = 0;
  let deadlineNoticeAdded = false;

  async function syncWorker() {
    while (true) {
      const space = spaces[cursor];
      cursor += 1;
      if (!space) return;
      if (Date.now() >= deadlineAt) {
        if (!deadlineNoticeAdded) {
          deadlineNoticeAdded = true;
          errors.push("Calendar sync stopped before the request deadline; the remaining Spaces will retry.");
        }
        return;
      }

      attempted += 1;
      try {
        const result = await syncGoogleCalendar(client, connection, request, {
          ...options,
          calendarId: space.calendarId,
          spaceId: space.id,
          updateConnectionStatus: false,
        });
        succeeded += 1;
        eventCount += result.eventCount;
        fullSync = fullSync || result.fullSync;
        truncated = truncated || result.truncated;
      } catch (error) {
        failed += 1;
        // A removed calendar belongs to the old Google account. Keep its Space
        // for history, but make it non-schedulable so it cannot block another
        // active Space after reconnecting.
        if (isGoogleAuthError(error) || isGoogleCalendarUnavailableError(error)) {
          authenticationFailure = true;
          const { error: disconnectError } = await client.from("spaces").update({
            status: "disconnected",
            archived_at: null,
            updated_at: new Date().toISOString(),
          }).eq("user_id", connection.user_id).eq("id", space.id).eq("status", "active");
          if (disconnectError) {
            errors.push(`${space.name}: ${disconnectError.message}`);
          } else {
            disconnected += 1;
          }
        }
        errors.push(`${space.name}: ${error instanceof Error ? error.message : "Calendar sync failed."}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(2, spaces.length) }, () => syncWorker()));

  if (authenticationFailure && succeeded === 0) {
    await setGoogleConnectionError(client, connection.user_id, errors.join(" ").slice(0, 240));
  } else {
    const { error: connectionUpdateError } = await client.from("google_calendar_connections").update({
      status: "connected",
      last_error: errors.length > 0 ? errors.join(" ").slice(0, 240) : null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", connection.user_id);
    if (connectionUpdateError) {
      throw connectionUpdateError;
    }
  }
  return {
    calendars: spaces.length,
    attempted,
    succeeded,
    failed,
    disconnected,
    eventCount,
    fullSync,
    truncated: truncated || errors.some((error) => error.toLowerCase().includes("limit") || error.toLowerCase().includes("deadline")),
    errors,
  };
}
