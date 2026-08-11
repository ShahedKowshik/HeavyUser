import { NextResponse } from "next/server";
import { requireAuthenticatedGoogleContext } from "@/lib/google/server";
import { runSchedulerForUserWithRetry, SchedulerBusyError } from "@/lib/scheduler/service";
import { rejectCrossOriginMutation } from "@/lib/security/http";
import { consumeUserOperation } from "@/lib/security/rate-limit";

export const maxDuration = 60;

export async function POST(request: Request) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) {
    return originError;
  }

  const context = await requireAuthenticatedGoogleContext();
  if (!context) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  try {
    if (!await consumeUserOperation(context.admin, context.user.id, "scheduler_run", 6, 60)) {
      return NextResponse.json({ code: "rate_limited", error: "Scheduling is already running often. Try again in a minute." }, { status: 429, headers: { "Retry-After": "60" } });
    }
    return NextResponse.json(await runSchedulerForUserWithRetry(context.user.id, request));
  } catch (error) {
    const status = error instanceof SchedulerBusyError ? 409 : 502;
    return NextResponse.json({
      error: error instanceof SchedulerBusyError ? error.message : "The scheduler could not run.",
    }, { status });
  }
}
