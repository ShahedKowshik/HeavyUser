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

const EVENT_KEY_DELETE_BATCH_SIZE = 100;

function getDateTime(value: { dateTime?: string; date?: string } | undefined) {
  if (!value) {
    return null;
  }

  return value.dateTime ?? null;
}

function getDate(value: { dateTime?: string; date?: string } | undefined) {
  if (!value) {
    return null;
  }

  return value.date ?? null;
}

export function getGoogleEventKey(event: GoogleEvent) {
  const originalStart = event.originalStartTime?.dateTime ?? event.originalStartTime?.date ?? "";
  return `${event.id}::${originalStart}`;
}

function mapGoogleEvent(userId: string, event: GoogleEvent) {
  const startDateTime = getDateTime(event.start);
  const endDateTime = getDateTime(event.end);
  const startDate = getDate(event.start);
  const endDate = getDate(event.end);
  const isAllDay = Boolean(startDate && endDate);
  const hasAttendees = Boolean(event.attendees?.length);

  return {
    event_key: getGoogleEventKey(event),
    user_id: userId,
    provider_event_id: event.id,
    recurring_event_id: event.recurringEventId ?? null,
    original_start_time: event.originalStartTime?.dateTime ?? null,
    status: event.status ?? "confirmed",
    summary: event.summary ?? "Untitled event",
    description: event.description ?? null,
    location: event.location ?? null,
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
    google_updated_at: event.updated ?? null,
    updated_at: new Date().toISOString(),
  };
}

async function applyEvents(client: GoogleDbClient, userId: string, events: GoogleEvent[]) {
  const activeEvents = events.filter((event) => event.status !== "cancelled");
  const cancelledKeys = [...new Set(events.filter((event) => event.status === "cancelled").map(getGoogleEventKey))];

  if (cancelledKeys.length > 0) {
    for (let index = 0; index < cancelledKeys.length; index += EVENT_KEY_DELETE_BATCH_SIZE) {
      const batch = cancelledKeys.slice(index, index + EVENT_KEY_DELETE_BATCH_SIZE);
      const { error } = await client.from("google_calendar_events").delete().in("event_key", batch).eq("user_id", userId);
      if (error) {
        throw new Error(`Google Calendar event cleanup failed: ${error.message}`);
      }
    }
  }

  if (activeEvents.length === 0) {
    return;
  }

  const { error } = await client.from("google_calendar_events").upsert(
    activeEvents.map((event) => mapGoogleEvent(userId, event)),
    { onConflict: "event_key" },
  );
  if (error) {
    throw new Error(`Google Calendar event sync failed: ${error.message}`);
  }
}

async function performEventSync(client: GoogleDbClient, connection: GoogleConnection, syncToken: string | null) {
  const accessToken = await getUsableGoogleAccessToken(client, connection);
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  do {
    const result = await listGoogleEvents({
      accessToken,
      calendarId: connection.selected_calendar_id!,
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

async function ensureWatch(client: GoogleDbClient, connection: GoogleConnection, request: Request | undefined, accessToken: string) {
  if (!request) {
    return;
  }

  const state = await loadGoogleSyncState(client, connection.user_id);
  const expiration = state?.channel_expiration ? new Date(state.channel_expiration).getTime() : 0;
  if (state?.channel_id && expiration > Date.now() + 24 * 60 * 60 * 1000) {
    return;
  }

  const { getGoogleWebhookUri } = await import("@/lib/google/config");
  const channel = await watchGoogleEvents({
    accessToken,
    calendarId: connection.selected_calendar_id!,
    channelId: randomUUID(),
    channelToken: randomUUID(),
    address: getGoogleWebhookUri(request),
  });

  await client.from("google_calendar_sync_states").upsert({
    user_id: connection.user_id,
    sync_token: state?.sync_token ?? null,
    channel_id: channel.id,
    resource_id: channel.resourceId,
    channel_expiration: channel.expiration ? new Date(Number(channel.expiration)).toISOString() : null,
    last_synced_at: state?.last_synced_at ?? null,
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
}

export async function syncGoogleCalendar(client: GoogleDbClient, connection: GoogleConnection, request?: Request) {
  if (!connection.selected_calendar_id) {
    throw new Error("Choose a Google Calendar before syncing.");
  }

  const state = await loadGoogleSyncState(client, connection.user_id);
  let fullSync = !state?.sync_token;
  let result: { events: GoogleEvent[]; nextSyncToken: string; accessToken: string };

  try {
    if (fullSync) {
      await client.from("google_calendar_events").delete().eq("user_id", connection.user_id);
    }

    try {
      result = await performEventSync(client, connection, state?.sync_token ?? null);
    } catch (error) {
      if (!(error instanceof GoogleApiError) || error.status !== 410 || fullSync) {
        throw error;
      }

      fullSync = true;
      await client.from("google_calendar_events").delete().eq("user_id", connection.user_id);
      result = await performEventSync(client, connection, null);
    }

    await applyEvents(client, connection.user_id, result.events);
    await client.from("google_calendar_sync_states").upsert({
      user_id: connection.user_id,
      sync_token: result.nextSyncToken,
      channel_id: state?.channel_id ?? null,
      resource_id: state?.resource_id ?? null,
      channel_expiration: state?.channel_expiration ?? null,
      last_synced_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    try {
      await ensureWatch(client, connection, request, result.accessToken);
    } catch (watchError) {
      // Localhost and private preview URLs cannot receive Google webhooks. The
      // app-load incremental sync remains available as a safe fallback.
      await client.from("google_calendar_sync_states").update({
        last_error: watchError instanceof Error ? watchError.message : "Webhook setup failed.",
        updated_at: new Date().toISOString(),
      }).eq("user_id", connection.user_id);
    }

    return { eventCount: result.events.filter((event) => event.status !== "cancelled").length, fullSync };
  } catch (error) {
    await setGoogleConnectionError(client, connection.user_id, error instanceof Error ? error.message : "Calendar sync failed.");
    throw error;
  }
}
