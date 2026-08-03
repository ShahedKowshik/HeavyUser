export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return null;
  }

  return { url, publishableKey };
}

export const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function getAppPath(pathname: string) {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${publicBasePath}${normalizedPath === "/" ? "/" : normalizedPath}`;
}

export function getAppUrl(pathname: string) {
  if (typeof window === "undefined") {
    return getAppPath(pathname);
  }

  return `${window.location.origin}${getAppPath(pathname)}`;
}

export function getCanonicalAppOrigin() {
  const configuredOrigin = process.env.HEAVYUSER_APP_ORIGIN;
  const configuredRedirect = process.env.GOOGLE_REDIRECT_URI;
  if (!configuredOrigin && !configuredRedirect) {
    return null;
  }

  try {
    const parsed = new URL(configuredOrigin ?? configuredRedirect ?? "");
    if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function getAppRedirectOrigin(request: Request) {
  const canonicalOrigin = getCanonicalAppOrigin();
  if (canonicalOrigin) {
    return canonicalOrigin;
  }

  return process.env.NODE_ENV === "production" ? null : new URL(request.url).origin;
}
