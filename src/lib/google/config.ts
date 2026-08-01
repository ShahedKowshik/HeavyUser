import { getAppPath } from "@/lib/supabase/config";

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

  return { clientId, clientSecret, tokenEncryptionKey };
}

export function getGoogleRedirectUri(request: Request) {
  return process.env.GOOGLE_REDIRECT_URI ?? new URL(getAppPath("/api/google/calendar/callback"), request.url).toString();
}

export function getGoogleWebhookUri(request: Request) {
  return new URL(getAppPath("/api/google/calendar/webhook"), request.url).toString();
}
