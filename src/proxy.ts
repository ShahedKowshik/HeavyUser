import { createServerClient } from "@supabase/ssr";
import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSafeSameOriginPath } from "@/lib/security/redirect";
import { getAppPath, getSupabaseConfig, publicBasePath } from "@/lib/supabase/config";

function copyCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  ["Cache-Control", "Content-Security-Policy", "Strict-Transport-Security", "X-Request-Id"].forEach((header) => {
    const value = source.headers.get(header);
    if (value) {
      target.headers.set(header, value);
    }
  });
  target.headers.set("Cache-Control", "private, no-store");
  return target;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const routePath = publicBasePath && pathname.startsWith(publicBasePath) ? pathname.slice(publicBasePath.length) || "/" : pathname;
  const isLogin = routePath === "/login";
  const isAuthConfirm = routePath === "/auth/confirm";
  const isApiRoute = routePath.startsWith("/api/");
  const isWebhook = routePath === "/api/google/calendar/webhook";
  const isSchedulerProcess = routePath === "/api/scheduler/process";
  const config = getSupabaseConfig();
  const nonce = randomBytes(16).toString("base64");
  const isDevelopment = process.env.NODE_ENV !== "production";
  const isE2EAuthEnabled = isDevelopment && process.env.NEXT_PUBLIC_HEAVYUSER_E2E === "1";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next's development Fast Refresh runtime uses eval to compile its update
  // wrapper. Keep this exception local to development; production stays strict.
  const scriptSources = [
    "'self'",
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
  ].join(" ");
  // Codex's local browser annotation layer mounts a temporary inline stylesheet
  // while annotation mode is active. Keep this compatibility allowance local
  // to development; production remains strict.
  const styleSources = [
    "'self'",
    ...(isDevelopment ? ["'unsafe-inline'"] : []),
  ].join(" ");
  const csp = [
    "default-src 'self'",
    `script-src ${scriptSources}`,
    `style-src ${styleSources}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://*.supabase.in https://www.googleapis.com https://oauth2.googleapis.com",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "object-src 'none'",
  ].join("; ");
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  const suppliedRequestId = request.headers.get("x-request-id");
  const requestId = suppliedRequestId && /^[A-Za-z0-9._-]{1,64}$/.test(suppliedRequestId)
    ? suppliedRequestId
    : randomUUID();
  response.headers.set("X-Request-Id", requestId);
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }

  if (isAuthConfirm || isWebhook || isSchedulerProcess) {
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  if (isE2EAuthEnabled) {
    return response;
  }

  if (!config) {
    if (isLogin || isAuthConfirm || isApiRoute) {
      return response;
    }

    return NextResponse.redirect(new URL(getAppPath("/login"), request.url));
  }

  response.headers.set("Cache-Control", "private, no-store");

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const isSignedIn = Boolean(data.user);

  if (!isSignedIn && !isLogin && !isAuthConfirm) {
    // API handlers return their own JSON 401/403 response. Redirecting them to
    // HTML makes browser clients fail while trying to parse the response.
    if (isApiRoute) {
      return response;
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = getAppPath("/login");
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return copyCookies(response, NextResponse.redirect(loginUrl));
  }

  if (isSignedIn && isLogin) {
    const destination = getSafeSameOriginPath(
      request.nextUrl.searchParams.get("next"),
      request.url,
      getAppPath("/"),
    );
    return copyCookies(response, NextResponse.redirect(new URL(destination, request.url)));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
