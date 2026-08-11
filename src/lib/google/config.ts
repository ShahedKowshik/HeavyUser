import { getAppPath, getCanonicalAppOrigin } from "@/lib/supabase/config";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
] as const;

export function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const tokenEncryptionKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;

  if (!clientId || !clientSecret || !tokenEncryptionKey) {
    return null;
  }

  const previousTokenEncryptionKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY_PREVIOUS;
  return {
    clientId,
    clientSecret,
    tokenEncryptionKey,
    previousTokenEncryptionKeys: previousTokenEncryptionKey ? [previousTokenEncryptionKey] : [],
  };
}

export function getGoogleRedirectUri(request: Request) {
  const configuredRedirect = process.env.GOOGLE_REDIRECT_URI;
  if (configuredRedirect) {
    return getSafeConfiguredUrl(configuredRedirect, request);
  }

  const origin = getCanonicalAppOrigin();
  if (!origin) {
    throw new Error("The canonical app origin is not configured.");
  }
  return new URL(getAppPath("/api/google/calendar/callback"), origin).toString();
}

export function getGoogleWebhookUri() {
  const origin = getCanonicalAppOrigin();
  if (!origin) {
    throw new Error("The canonical app origin is not configured.");
  }
  return new URL(getAppPath("/api/google/calendar/webhook"), origin).toString();
}

function getSafeConfiguredUrl(value: string, request: Request) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("The Google redirect URL must use HTTPS.");
  }

  const canonicalOrigin = getCanonicalAppOrigin();
  if (canonicalOrigin && parsed.origin !== canonicalOrigin) {
    throw new Error("The Google redirect URL must use the canonical app origin.");
  }

  if (!canonicalOrigin && process.env.NODE_ENV === "production") {
    throw new Error("The canonical app origin is not configured.");
  }

  if (!canonicalOrigin && parsed.origin !== new URL(request.url).origin) {
    throw new Error("The Google redirect URL is not allowed.");
  }

  return parsed.toString();
}
