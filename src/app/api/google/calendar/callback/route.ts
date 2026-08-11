import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { exchangeGoogleCode, stopGoogleChannel } from "@/lib/google/client";
import { encryptSecret } from "@/lib/google/crypto";
import { getGoogleConfig, getGoogleRedirectUri } from "@/lib/google/config";
import { getAuthenticatedGoogleContext } from "@/lib/google/server";
import { getAppPath, getAppRedirectOrigin } from "@/lib/supabase/config";
import { stopTimerForCalendarDisconnect } from "@/lib/timer/server";

function redirectWithError(request: Request, reason: string) {
  const origin = getAppRedirectOrigin(request);
  let response: NextResponse;
  if (!origin) {
    response = NextResponse.json({ error: "The application origin is not configured." }, { status: 503 });
  } else {
    response = NextResponse.redirect(new URL(`${getAppPath("/")}?google_calendar=error&reason=${encodeURIComponent(reason)}`, origin));
  }
  const cookieOptions = { path: getAppPath("/"), maxAge: 0 };
  response.cookies.set("heavyuser_google_oauth_state", "", cookieOptions);
  response.cookies.set("heavyuser_google_oauth_verifier", "", cookieOptions);
  return response;
}

function safelyEqual(first: string, second: string) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);
  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectOrigin = getAppRedirectOrigin(request);
  if (!redirectOrigin) {
    return NextResponse.json({ error: "The application origin is not configured." }, { status: 503 });
  }
  const context = await getAuthenticatedGoogleContext();
  const config = getGoogleConfig();
  const stateCookie = request.headers.get("cookie")?.match(/(?:^|; )heavyuser_google_oauth_state=([^;]+)/)?.[1];
  const verifierCookie = request.headers.get("cookie")?.match(/(?:^|; )heavyuser_google_oauth_verifier=([^;]+)/)?.[1];

  if (!context.client || !context.admin || !context.user) {
    return redirectWithError(request, "signed_out");
  }
  const admin = context.admin;

  if (!config || !stateCookie || !verifierCookie || !url.searchParams.get("state") || !safelyEqual(stateCookie, url.searchParams.get("state")!)) {
    return redirectWithError(request, "invalid_state");
  }

  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return redirectWithError(request, oauthError === "access_denied" ? "access_denied" : "oauth_failed");
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return redirectWithError(request, "missing_code");
  }

  try {
    const token = await exchangeGoogleCode({
      code,
      codeVerifier: verifierCookie,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: getGoogleRedirectUri(request),
    });
    // A missing refresh token must never fall back to the token from a prior
    // Google account. That could pair a new access token with old long-lived
    // credentials and reconnect the wrong calendar after expiry.
    if (!token.refresh_token) {
      return redirectWithError(request, "missing_refresh_token");
    }
    const refreshToken = encryptSecret(token.refresh_token, config.tokenEncryptionKey);

    const previousConnection = await context.admin
      .from("google_calendar_connections")
      .select("*")
      .eq("user_id", context.user.id)
      .maybeSingle();
    const previousStates = await context.admin
      .from("google_calendar_sync_states")
      .select("*")
      .eq("user_id", context.user.id);
    if (previousStates.error) throw previousStates.error;
    if (previousConnection.error) throw previousConnection.error;
    if (previousConnection.data) {
      const previousConnectionRow = previousConnection.data;
      const previousAccessToken = await (async () => {
        try {
          const { getUsableGoogleAccessToken } = await import("@/lib/google/server");
          return await getUsableGoogleAccessToken(admin, previousConnectionRow);
        } catch {
          return null;
        }
      })();
      if (previousAccessToken) {
        for (const state of previousStates.data ?? []) {
          if (!state.channel_id || !state.resource_id) continue;
          await stopGoogleChannel({
            accessToken: previousAccessToken,
            channelId: state.channel_id,
            resourceId: state.resource_id,
          }).catch(() => undefined);
        }
      }
      const cleanupResults = await Promise.all([
        context.admin.from("google_calendar_sync_states").delete().eq("user_id", context.user.id),
        context.admin.from("google_calendar_events").delete().eq("user_id", context.user.id),
        context.admin.from("google_calendar_event_deletions").delete().eq("user_id", context.user.id),
      ]);
      const cleanupError = cleanupResults.find((result) => result.error)?.error;
      if (cleanupError) throw cleanupError;
    }

    // A reconnect can replace the account without going through the explicit
    // disconnect button. Stop any live timer while the old token is still the
    // connection used by the timer write, so it cannot later be stopped using
    // the new account's token.
    await stopTimerForCalendarDisconnect(context.user.id);

    const { data: activeSpaces, error: activeSpacesError } = await context.admin
      .from("spaces")
      .select("id")
      .eq("user_id", context.user.id)
      .eq("status", "active");
    if (activeSpacesError) {
      throw activeSpacesError;
    }

    const { error: spacesError } = await context.admin.from("spaces").update({
      status: "disconnected",
      archived_at: null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", context.user.id).eq("status", "active");
    if (spacesError) {
      throw spacesError;
    }

    const { error } = await context.admin.from("google_calendar_connections").upsert({
      user_id: context.user.id,
      google_account_email: null,
      selected_calendar_id: null,
      selected_calendar_name: null,
      selected_calendar_timezone: null,
      access_token_encrypted: encryptSecret(token.access_token, config.tokenEncryptionKey),
      refresh_token_encrypted: refreshToken,
      connection_generation: (previousConnection.data?.connection_generation ?? 0) + 1,
      access_token_expires_at: new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString(),
      granted_scope: token.scope ?? null,
      status: "awaiting_calendar",
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (error) {
      const activeSpaceIds = (activeSpaces ?? []).map((space) => space.id);
      if (activeSpaceIds.length > 0) {
        await context.admin.from("spaces").update({
          status: "active",
          archived_at: null,
          updated_at: new Date().toISOString(),
        }).eq("user_id", context.user.id).in("id", activeSpaceIds);
      }
      throw error;
    }

    const response = NextResponse.redirect(new URL(`${getAppPath("/")}?google_calendar=select`, redirectOrigin));
    const cookieOptions = { path: getAppPath("/"), maxAge: 0 };
    response.cookies.set("heavyuser_google_oauth_state", "", cookieOptions);
    response.cookies.set("heavyuser_google_oauth_verifier", "", cookieOptions);
    return response;
  } catch {
    return redirectWithError(request, "oauth_failed");
  }
}
