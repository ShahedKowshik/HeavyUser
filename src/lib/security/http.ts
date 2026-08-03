import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getCanonicalAppOrigin } from "@/lib/supabase/config";

const SAFE_FETCH_SITES = new Set(["same-origin", "same-site", "none"]);

export const MAX_MUTATION_BODY_BYTES = 64 * 1024;

export function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function matchesSecret(value: string, expectedHash: string) {
  const actual = Buffer.from(hashSecret(value), "utf8");
  const expected = Buffer.from(expectedHash, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function rejectCrossOriginMutation(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !SAFE_FETCH_SITES.has(fetchSite)) {
    return NextResponse.json({ error: "This request is not allowed." }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  const canonicalOrigin = getCanonicalAppOrigin();
  if (!canonicalOrigin && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "The application origin is not configured." }, { status: 503 });
  }
  const expectedOrigin = canonicalOrigin ?? new URL(request.url).origin;
  if (origin && origin !== expectedOrigin) {
    return NextResponse.json({ error: "This request is not allowed." }, { status: 403 });
  }

  return null;
}

export function rejectOversizedBody(request: Request, maximum = MAX_MUTATION_BODY_BYTES) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number.isFinite(Number(contentLength)) && Number(contentLength) > maximum) {
    return NextResponse.json({ error: "The request is too large." }, { status: 413 });
  }

  return null;
}
