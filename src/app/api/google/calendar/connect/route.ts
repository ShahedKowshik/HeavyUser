import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { GOOGLE_CALENDAR_SCOPES, getGoogleConfig, getGoogleRedirectUri } from "@/lib/google/config";
import { getAuthenticatedGoogleContext } from "@/lib/google/server";
import { getAppPath, getAppRedirectOrigin, getSafeAppReturnPath } from "@/lib/supabase/config";

function toBase64Url(value: Buffer) {
  return value.toString("base64url");
}

export async function GET(request: Request) {
  const context = await getAuthenticatedGoogleContext();
  const config = getGoogleConfig();
  const origin = getAppRedirectOrigin(request);
  if (!origin) {
    return NextResponse.json({ error: "The application origin is not configured." }, { status: 503 });
  }
  if (!context.client || !context.admin || !context.user) {
    return NextResponse.redirect(new URL(getAppPath("/login"), origin));
  }

  if (!config) {
    return NextResponse.redirect(new URL(`${getAppPath("/")}?google_calendar=error&reason=not_configured`, origin));
  }

  const returnTo = getSafeAppReturnPath(new URL(request.url).searchParams.get("returnTo"));
  const state = toBase64Url(randomBytes(32));
  const codeVerifier = toBase64Url(randomBytes(32));
  const codeChallenge = toBase64Url(createHash("sha256").update(codeVerifier).digest());
  const query = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: getGoogleRedirectUri(request),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${query}`);
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60,
    path: getAppPath("/"),
  };
  response.cookies.set("heavyuser_google_oauth_state", state, cookieOptions);
  response.cookies.set("heavyuser_google_oauth_verifier", codeVerifier, cookieOptions);
  response.cookies.set("heavyuser_google_oauth_return_to", returnTo, cookieOptions);
  return response;
}
