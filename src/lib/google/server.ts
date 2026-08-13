import "server-only";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { decryptSecret, encryptSecret } from "@/lib/google/crypto";
import { getGoogleConfig } from "@/lib/google/config";
import {
  GoogleApiError,
  isGoogleAuthError,
  isGoogleCalendarUnavailableError,
  refreshGoogleAccessToken,
} from "@/lib/google/client";

export { isGoogleAuthError, isGoogleCalendarUnavailableError } from "@/lib/google/client";

export type GoogleDbClient = SupabaseClient<Database>;
export type GoogleConnection = Database["public"]["Tables"]["google_calendar_connections"]["Row"];
export type GoogleSyncState = Database["public"]["Tables"]["google_calendar_sync_states"]["Row"];

export async function getAuthenticatedGoogleContext() {
  const client = await getSupabaseServerClient();
  if (!client) {
    return { client: null, admin: null, user: null } as const;
  }

  const { data } = await client.auth.getUser();
  return { client, admin: getSupabaseAdminClient(), user: data.user } as const;
}

export function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function loadGoogleConnection(client: GoogleDbClient, userId: string) {
  const { data, error } = await client
    .from("google_calendar_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function loadGoogleSyncState(client: GoogleDbClient, userId: string, calendarId?: string | null) {
  let query = client
    .from("google_calendar_sync_states")
    .select("*")
    .eq("user_id", userId);
  if (calendarId !== undefined) {
    query = query.eq("calendar_id", calendarId ?? "");
  } else {
    // Older callers asked for one sync state because there used to be only
    // one calendar. Keep that call safe now that a user may have many rows.
    query = query.order("updated_at", { ascending: false }).limit(1);
  }
  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function setGoogleConnectionError(client: GoogleDbClient, userId: string, message: string) {
  const { error } = await client
    .from("google_calendar_connections")
    .update({ status: "error", last_error: message, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) {
    throw error;
  }
}

export async function setGoogleConnectionWarning(client: GoogleDbClient, userId: string, message: string) {
  const { error } = await client
    .from("google_calendar_connections")
    .update({ last_error: message, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw error;
}

export async function getUsableGoogleAccessToken(client: GoogleDbClient, connection: GoogleConnection) {
  const config = getGoogleConfig();
  if (!config) {
    throw new Error("Google Calendar is not configured on this deployment.");
  }

  const expiresAt = connection.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60_000) {
    return decryptSecret(connection.access_token_encrypted, config.tokenEncryptionKey, config.previousTokenEncryptionKeys);
  }

  const refreshToken = decryptSecret(connection.refresh_token_encrypted, config.tokenEncryptionKey, config.previousTokenEncryptionKeys);
  let token: Awaited<ReturnType<typeof refreshGoogleAccessToken>>;
  try {
    token = await refreshGoogleAccessToken({
      refreshToken,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });
  } catch (error) {
    if (isGoogleAuthError(error)) {
      await setGoogleConnectionError(client, connection.user_id, googleErrorMessage(error)).catch(() => undefined);
    }
    throw error;
  }
  const accessTokenExpiresAt = new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString();
  const { error } = await client
    .from("google_calendar_connections")
    .update({
      access_token_encrypted: encryptSecret(token.access_token, config.tokenEncryptionKey),
      access_token_expires_at: accessTokenExpiresAt,
      updated_at: new Date().toISOString(),
      last_error: null,
      status: connection.selected_calendar_id ? "connected" : "awaiting_calendar",
    })
    .eq("user_id", connection.user_id);

  if (error) {
    throw error;
  }

  return token.access_token;
}

export function publicGoogleConnection(connection: GoogleConnection | null) {
  if (!connection) {
    return null;
  }

  return {
    status: connection.status,
    requiresReconnect: connection.status === "error",
    accountEmail: connection.google_account_email,
    calendarId: connection.selected_calendar_id,
    calendarName: connection.selected_calendar_name,
    timeZone: connection.selected_calendar_timezone,
    lastError: connection.last_error,
    updatedAt: connection.updated_at,
  };
}

export function googleErrorMessage(error: unknown) {
  if (isGoogleAuthError(error)) {
    return "Google Calendar authorization expired or was removed. Reconnect Google Calendar to continue.";
  }
  if (isGoogleCalendarUnavailableError(error)) {
    return "That Google Calendar is no longer available. Reconnect Google Calendar to choose another calendar.";
  }

  const message = error instanceof GoogleApiError || error instanceof Error
    ? error.message
    : error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "Google Calendar could not be reached.";

  return message.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").slice(0, 240);
}

export type AuthenticatedGoogleContext = {
  client: GoogleDbClient;
  admin: GoogleDbClient;
  user: User;
};

export async function requireAuthenticatedGoogleContext(): Promise<AuthenticatedGoogleContext | null> {
  const context = await getAuthenticatedGoogleContext();
  if (!context.client || !context.admin || !context.user) {
    return null;
  }

  return { client: context.client, admin: context.admin, user: context.user };
}
