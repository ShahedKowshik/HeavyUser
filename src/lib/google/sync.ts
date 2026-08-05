import "server-only";

import { randomUUID } from "node:crypto";
import type { GoogleConnection, GoogleDbClient } from "@/lib/google/server";
import {
  GoogleApiError,
  listGoogleEvents,
  watchGoogleEvents,
  type GoogleEvent,
} from "@/lib/google/client";
import {
  getUsableGoogleAccessToken,
  loadGoogleSyncState,
  setGoogleConnectionError,
} from "@/lib/google/server";
import { queueSchedulerJob } from "@/lib/scheduler/queue";
import { hashSecret } from "@/lib/security/http";
import { loadSpaces } from "@/lib/spaces/server";

const EVENT_KEY_DELETE_BATCH_SIZE = 100;

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
    return;
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

  return { events, nextSyncToken, accessToken };
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
    last_synced_at: state?.last_synced_at ?? null,
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,calendar_id" });
  if (error) {
    throw error;
  }
}

export async function syncGoogleCalendar(
  client: GoogleDbClient,
  connection: GoogleConnection,
  request?: Request,
  options: { skipSchedulerQueue?: boolean; calendarId?: string; spaceId?: string | null } = {},
) {
  const calendarId = options.calendarId ?? connection.selected_calendar_id;
  if (!calendarId) {
    throw new Error("Choose a Google Calendar before syncing.");
  }

  const scope: EventScope = { calendarId, spaceId: options.spaceId ?? null };
  const state = await loadGoogleSyncState(client, connection.user_id, calendarId);
  let fullSync = !state?.sync_token;
  let result: { events: GoogleEvent[]; nextSyncToken: string; accessToken: string };

  try {
    if (fullSync) {
      const { error } = await client.from("google_calendar_events").delete().eq("user_id", connection.user_id).eq("calendar_id", calendarId);
      if (error) throw error;
      const { error: tombstoneError } = await client.from("google_calendar_event_deletions").delete().eq("user_id", connection.user_id).eq("calendar_id", calendarId);
      if (tombstoneError) throw tombstoneError;
    }

    try {
      result = await performEventSync(client, connection, scope, state?.sync_token ?? null);
    } catch (error) {
      if (!(error instanceof GoogleApiError) || error.status !== 410 || fullSync) {
        throw error;
      }

      fullSync = true;
      const { error: cleanupError } = await client.from("google_calendar_events").delete().eq("user_id", connection.user_id).eq("calendar_id", calendarId);
      if (cleanupError) throw cleanupError;
      const { error: tombstoneError } = await client.from("google_calendar_event_deletions").delete().eq("user_id", connection.user_id).eq("calendar_id", calendarId);
      if (tombstoneError) throw tombstoneError;
      result = await performEventSync(client, connection, scope, null);
    }

    await applyEvents(client, connection.user_id, result.events, scope);
    const { error: syncStateError } = await client.from("google_calendar_sync_states").upsert({
      user_id: connection.user_id,
      calendar_id: calendarId,
      sync_token: result.nextSyncToken,
      channel_id: state?.channel_id ?? null,
      resource_id: state?.resource_id ?? null,
      channel_token_hash: state?.channel_token_hash ?? null,
      channel_expiration: state?.channel_expiration ?? null,
      last_synced_at: new Date().toISOString(),
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
    const { error: connectionError } = await client
      .from("google_calendar_connections")
      .update({ status: "connected", last_error: null, updated_at: new Date().toISOString() })
      .eq("user_id", connection.user_id);
    if (connectionError) {
      throw connectionError;
    }

    // Incremental Google syncs commonly return no events. Those reads are not
    // scheduling changes, so do not wake the scheduler on every polling tick.
    // A full sync or a non-empty change page still needs a replan because an
    // event may have been created, moved, edited, or deleted in Google.
    if (!options.skipSchedulerQueue && (fullSync || result.events.length > 0)) {
      await queueSchedulerJob(client, connection.user_id, "google_sync");
    }

    return { eventCount: result.events.filter((event) => event.status !== "cancelled").length, fullSync };
  } catch (error) {
    await setGoogleConnectionError(client, connection.user_id, error instanceof Error ? error.message : "Calendar sync failed.");
    throw error;
  }
}

export async function syncAllGoogleCalendars(
  client: GoogleDbClient,
  connection: GoogleConnection,
  request?: Request,
  options: { skipSchedulerQueue?: boolean } = {},
) {
  const spaces = await loadSpaces(client, connection.user_id);
  if (spaces.length === 0) {
    if (!connection.selected_calendar_id) return { calendars: 0, eventCount: 0, fullSync: false, errors: [] as ReadonlyArray<string> };
    const result = await syncGoogleCalendar(client, connection, request, options);
    return { calendars: 1, eventCount: result.eventCount, fullSync: result.fullSync, errors: [] as ReadonlyArray<string> };
  }

  let eventCount = 0;
  let fullSync = false;
  const errors: string[] = [];
  for (const space of spaces) {
    try {
      const result = await syncGoogleCalendar(client, connection, request, {
        ...options,
        calendarId: space.calendarId,
        spaceId: space.id,
      });
      eventCount += result.eventCount;
      fullSync = fullSync || result.fullSync;
    } catch (error) {
      // One removed or temporarily unavailable Google calendar must not stop
      // the other Spaces from refreshing. The scheduler checks this list and
      // refuses to make new plans until every busy-time source is current.
      errors.push(`${space.name}: ${error instanceof Error ? error.message : "Calendar sync failed."}`);
    }
  }
  return { calendars: spaces.length, eventCount, fullSync, errors };
}
