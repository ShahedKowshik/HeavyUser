import { NextResponse } from "next/server";
import { requireAuthenticatedGoogleContext } from "@/lib/google/server";
import { runSchedulerForUserWithRetry, SchedulerBusyError } from "@/lib/scheduler/service";
import { rejectCrossOriginMutation } from "@/lib/security/http";

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
    return NextResponse.json(await runSchedulerForUserWithRetry(context.user.id, request));
  } catch (error) {
    const status = error instanceof SchedulerBusyError ? 409 : 502;
    return NextResponse.json({
      error: error instanceof SchedulerBusyError ? error.message : "The scheduler could not run.",
    }, { status });
  }
}
