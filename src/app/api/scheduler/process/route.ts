import { NextResponse } from "next/server";
import { processSchedulerQueue } from "@/lib/scheduler/service";
import { hashSecret, matchesSecret } from "@/lib/security/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expectedHash = process.env.CRON_SECRET_HASH ?? (secret ? hashSecret(secret) : null);
  return Boolean(presented && expectedHash) && matchesSecret(presented, expectedHash!);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  try {
    return NextResponse.json({ results: await processSchedulerQueue(10, request) });
  } catch {
    return NextResponse.json({ error: "The scheduler queue could not be processed." }, { status: 502 });
  }
}
