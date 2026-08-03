export function getSafeSameOriginPath(value: string | null, requestUrl: string, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }

  try {
    const base = new URL(requestUrl);
    const candidate = new URL(value, base);
    if (candidate.origin !== base.origin || candidate.username || candidate.password) {
      return fallback;
    }

    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return fallback;
  }
}
