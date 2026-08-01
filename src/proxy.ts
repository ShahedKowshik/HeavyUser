import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAppPath, getSupabaseConfig, publicBasePath } from "@/lib/supabase/config";

function copyCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach(({ name, value }) => target.cookies.set(name, value));
  target.headers.set("Cache-Control", "private, no-store");
  return target;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const routePath = publicBasePath && pathname.startsWith(publicBasePath) ? pathname.slice(publicBasePath.length) || "/" : pathname;
  const isLogin = routePath === "/login";
  const isAuthConfirm = routePath.startsWith("/auth/confirm");
  const config = getSupabaseConfig();
  const response = NextResponse.next({ request });

  if (!config) {
    if (isLogin || isAuthConfirm) {
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
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = getAppPath("/login");
    loginUrl.search = "";
    loginUrl.searchParams.set("next", routePath);
    return copyCookies(response, NextResponse.redirect(loginUrl));
  }

  if (isSignedIn && isLogin) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = getAppPath("/");
    homeUrl.search = "";
    return copyCookies(response, NextResponse.redirect(homeUrl));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
