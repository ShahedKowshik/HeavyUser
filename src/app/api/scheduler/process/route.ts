import { NextResponse } from "next/server";
import { processSchedulerQueue } from "@/lib/scheduler/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  try {
    return NextResponse.json({ results: await processSchedulerQueue(10, request) });
  } catch {
    return NextResponse.json({ error: "The scheduler queue could not be processed." }, { status: 502 });
  }
}
