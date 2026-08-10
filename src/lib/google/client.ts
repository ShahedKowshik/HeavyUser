const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_TOKEN_API = "https://oauth2.googleapis.com/token";
const GOOGLE_REQUEST_TIMEOUT_MS = 15_000;
const INITIAL_SYNC_HISTORY_DAYS = 90;
const INITIAL_SYNC_FUTURE_DAYS = 365;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export type GoogleApiErrorShape = {
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{ reason?: string }>;
  };
};

export class GoogleApiError extends Error {
  status: number;
  reason: string | null;

  constructor(status: number, message: string, reason: string | null = null) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
    this.reason = reason;
  }
}

export type GoogleCalendarListEntry = {
  id: string;
  summary?: string;
  description?: string;
  timeZone?: string;
  primary?: boolean;
  accessRole?: string;
  backgroundColor?: string;
};

export type GoogleEventDateTime = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

export type GoogleEventAttendee = {
  email?: string;
  responseStatus?: string;
  self?: boolean;
};

export type GoogleConferenceData = {
  entryPoints?: Array<{
    entryPointType?: string;
    uri?: string;
    label?: string;
  }>;
};

export type GoogleEvent = {
  id: string;
  status?: string;
  htmlLink?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleEventDateTime;
  end?: GoogleEventDateTime;
  etag?: string;
  updated?: string;
  recurringEventId?: string;
  originalStartTime?: GoogleEventDateTime;
  attendees?: GoogleEventAttendee[];
  organizer?: { email?: string; self?: boolean };
  creator?: { email?: string; self?: boolean };
  conferenceData?: GoogleConferenceData;
  visibility?: "default" | "public" | "private" | "confidential";
  transparency?: "opaque" | "transparent";
  extendedProperties?: {
    private?: Record<string, string>;
    shared?: Record<string, string>;
  };
};

type GoogleEventListResponse = {
  items?: GoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
};

type GoogleCalendarListResponse = {
  items?: GoogleCalendarListEntry[];
  nextPageToken?: string;
};

export type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

async function parseResponse<T>(response: Response) {
  let body: T | GoogleApiErrorShape | null = null;
  try {
    body = (await response.json()) as T | GoogleApiErrorShape;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const errorBody = body as GoogleApiErrorShape | null;
    throw new GoogleApiError(
      response.status,
      errorBody?.error?.message ?? `Google Calendar request failed with status ${response.status}.`,
      errorBody?.error?.errors?.[0]?.reason ?? null,
    );
  }

  return body as T;
}

async function fetchGoogle(input: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error("Google Calendar request timed out.")), GOOGLE_REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort(init.signal?.reason);
  init.signal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }
}

async function googleRequest<T>(path: string, accessToken: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return parseResponse<T>(await fetchGoogle(`${GOOGLE_CALENDAR_API}${path}`, { ...init, headers, cache: "no-store" }));
}

export async function exchangeGoogleCode(input: {
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
    code_verifier: input.codeVerifier,
  });
  return parseResponse<GoogleTokenResponse>(
    await fetchGoogle(GOOGLE_TOKEN_API, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    }),
  );
}

export async function refreshGoogleAccessToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}) {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
    grant_type: "refresh_token",
  });
  return parseResponse<GoogleTokenResponse>(
    await fetchGoogle(GOOGLE_TOKEN_API, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    }),
  );
}

export async function listGoogleCalendars(accessToken: string) {
  const calendars: GoogleCalendarListEntry[] = [];
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams({ minAccessRole: "writer", showHidden: "false", maxResults: "250" });
    if (pageToken) {
      query.set("pageToken", pageToken);
    }
    const result = await googleRequest<GoogleCalendarListResponse>(`/users/me/calendarList?${query}`, accessToken);
    calendars.push(...(result.items ?? []));
    pageToken = result.nextPageToken;
  } while (pageToken);

  return calendars;
}

export async function listGoogleEvents(input: {
  accessToken: string;
  calendarId: string;
  syncToken?: string | null;
  pageToken?: string;
}) {
  const query = new URLSearchParams({ singleEvents: "true", showDeleted: "true", maxResults: "2500", conferenceDataVersion: "1" });
  if (input.syncToken) {
    query.set("syncToken", input.syncToken);
  } else {
    // Keep the initial snapshot useful without importing years of history.
    const now = Date.now();
    query.set("timeMin", new Date(now - INITIAL_SYNC_HISTORY_DAYS * DAY_IN_MILLISECONDS).toISOString());
    query.set("timeMax", new Date(now + INITIAL_SYNC_FUTURE_DAYS * DAY_IN_MILLISECONDS).toISOString());
  }
  if (input.pageToken) {
    query.set("pageToken", input.pageToken);
  }

  return googleRequest<GoogleEventListResponse>(
    `/calendars/${encodeURIComponent(input.calendarId)}/events?${query}`,
    input.accessToken,
  );
}

export async function getGoogleEvent(input: { accessToken: string; calendarId: string; eventId: string }) {
  return googleRequest<GoogleEvent>(
    `/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
    input.accessToken,
  );
}

export async function insertGoogleEvent(input: {
  accessToken: string;
  calendarId: string;
  resource: Record<string, unknown>;
}) {
  return googleRequest<GoogleEvent>(
    `/calendars/${encodeURIComponent(input.calendarId)}/events?sendUpdates=none`,
    input.accessToken,
    { method: "POST", body: JSON.stringify(input.resource) },
  );
}

export async function patchGoogleEvent(input: {
  accessToken: string;
  calendarId: string;
  eventId: string;
  etag?: string | null;
  sendUpdates?: "all" | "none";
  resource: Record<string, unknown>;
}) {
  const headers = new Headers();
  if (input.etag) {
    headers.set("If-Match", input.etag);
  }

  return googleRequest<GoogleEvent>(
    `/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}?sendUpdates=${input.sendUpdates ?? "none"}`,
    input.accessToken,
    { method: "PATCH", headers, body: JSON.stringify(input.resource) },
  );
}

export async function deleteGoogleEvent(input: { accessToken: string; calendarId: string; eventId: string }) {
  await googleRequest<unknown>(
    `/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}?sendUpdates=none`,
    input.accessToken,
    { method: "DELETE" },
  );
}

/** Google deletion is idempotent for HeavyUser's local state. */
export async function deleteGoogleEventIfPresent(input: { accessToken: string; calendarId: string; eventId: string }) {
  try {
    await deleteGoogleEvent(input);
    return true;
  } catch (error) {
    if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410)) {
      return false;
    }
    throw error;
  }
}

export async function watchGoogleEvents(input: {
  accessToken: string;
  calendarId: string;
  channelId: string;
  channelToken: string;
  address: string;
}) {
  return googleRequest<{ id: string; resourceId: string; expiration?: string }>(
    `/calendars/${encodeURIComponent(input.calendarId)}/events/watch`,
    input.accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        id: input.channelId,
        type: "web_hook",
        address: input.address,
        token: input.channelToken,
      }),
    },
  );
}

export async function stopGoogleChannel(input: { accessToken: string; channelId: string; resourceId: string }) {
  await googleRequest<unknown>("/channels/stop", input.accessToken, {
    method: "POST",
    body: JSON.stringify({ id: input.channelId, resourceId: input.resourceId }),
  });
}
