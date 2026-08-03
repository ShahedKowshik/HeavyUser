import { NextResponse } from "next/server";
import { requireAuthenticatedGoogleContext } from "@/lib/google/server";
import { runSchedulerForUser, SchedulerBusyError } from "@/lib/scheduler/service";

export async function POST(request: Request) {
  const context = await requireAuthenticatedGoogleContext();
  if (!context) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  try {
    return NextResponse.json(await runSchedulerForUser(context.user.id, request));
  } catch (error) {
    const status = error instanceof SchedulerBusyError ? 409 : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "The scheduler could not run." }, { status });
  }
}
