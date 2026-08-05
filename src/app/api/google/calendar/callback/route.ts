import { NextResponse } from "next/server";
import { exchangeGoogleCode } from "@/lib/google/client";
import { encryptSecret } from "@/lib/google/crypto";
import { getGoogleConfig, getGoogleRedirectUri } from "@/lib/google/config";
import { getAuthenticatedGoogleContext } from "@/lib/google/server";
import { getAppPath, getAppRedirectOrigin } from "@/lib/supabase/config";

function redirectWithError(request: Request, reason: string) {
  const origin = getAppRedirectOrigin(request);
  if (!origin) {
    return NextResponse.json({ error: "The application origin is not configured." }, { status: 503 });
  }
  return NextResponse.redirect(new URL(`${getAppPath("/")}?google_calendar=error&reason=${encodeURIComponent(reason)}`, origin));
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

  if (!config || !stateCookie || !verifierCookie || stateCookie !== url.searchParams.get("state")) {
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
    const existing = await context.admin
      .from("google_calendar_connections")
      .select("refresh_token_encrypted")
      .eq("user_id", context.user.id)
      .maybeSingle();

    if (existing.error) {
      throw existing.error;
    }

    const refreshToken = token.refresh_token
      ? encryptSecret(token.refresh_token, config.tokenEncryptionKey)
      : existing.data?.refresh_token_encrypted;

    if (!refreshToken) {
      return redirectWithError(request, "missing_refresh_token");
    }

    const { error } = await context.admin.from("google_calendar_connections").upsert({
      user_id: context.user.id,
      google_account_email: null,
      selected_calendar_id: null,
      selected_calendar_name: null,
      selected_calendar_timezone: null,
      access_token_encrypted: encryptSecret(token.access_token, config.tokenEncryptionKey),
      refresh_token_encrypted: refreshToken,
      access_token_expires_at: new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString(),
      granted_scope: token.scope ?? null,
      status: "awaiting_calendar",
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (error) {
      throw error;
    }

    const response = NextResponse.redirect(new URL(`${getAppPath("/")}?google_calendar=select`, redirectOrigin));
    response.cookies.delete("heavyuser_google_oauth_state");
    response.cookies.delete("heavyuser_google_oauth_verifier");
    return response;
  } catch {
    return redirectWithError(request, "oauth_failed");
  }
}
