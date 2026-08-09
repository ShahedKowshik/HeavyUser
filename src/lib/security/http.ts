import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getCanonicalAppOrigin } from "@/lib/supabase/config";

const SAFE_FETCH_SITES = new Set(["same-origin", "same-site", "none"]);

export const MAX_MUTATION_BODY_BYTES = 64 * 1024;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

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

export async function readJsonBody<T>(request: Request, maximum = MAX_MUTATION_BODY_BYTES): Promise<{
  data: T | null;
  errorResponse: NextResponse | null;
}> {
  const headerError = rejectOversizedBody(request, maximum);
  if (headerError) return { data: null, errorResponse: headerError };
  if (!request.body) return { data: null, errorResponse: null };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maximum) {
      await reader.cancel().catch(() => undefined);
      return {
        data: null,
        errorResponse: NextResponse.json({ error: "The request is too large." }, { status: 413 }),
      };
    }
    chunks.push(value);
  }

  if (received === 0) return { data: null, errorResponse: null };
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { data: JSON.parse(new TextDecoder().decode(bytes)) as T, errorResponse: null };
  } catch {
    return { data: null, errorResponse: null };
  }
}
