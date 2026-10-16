/**
 * Supabase Storage's sign endpoint returns a path like
 * "/object/sign/<bucket>/<file>?token=...".
 * That path is relative to /storage/v1/, NOT the host root.
 */
export function resolveSignedAvatarUrl(projectUrl: string, signedUrl: string, bucket = "heavyuser-avatars"): string {
  const origin = new URL(projectUrl).origin;
  const value = signedUrl.trim();
  if (!value) throw new Error("Missing signed avatar URL.");

  const absolute = /^https:\/\//i.test(value)
    ? new URL(value)
    : new URL(
        value.startsWith("/storage/v1/")
          ? value
          : "/storage/v1/" + value.replace(/^\/+/, ""),
        origin,
      );

  const allowedPath = "/storage/v1/object/sign/" + encodeURIComponent(bucket) + "/";
  if (absolute.origin !== origin || !absolute.pathname.startsWith(allowedPath)) {
    throw new Error("Invalid signed avatar URL.");
  }
  if (!absolute.searchParams.get("token")) {
    throw new Error("Signed avatar URL has no access token.");
  }
  return absolute.toString();
}
