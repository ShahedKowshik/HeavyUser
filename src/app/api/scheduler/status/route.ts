import { NextResponse } from "next/server";
import { getAuthenticatedGoogleContext } from "@/lib/google/server";
import { loadTaskScheduleStatus } from "@/lib/scheduler/service";

export async function GET() {
  const context = await getAuthenticatedGoogleContext();
  if (!context.user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  try {
    return NextResponse.json({ statuses: await loadTaskScheduleStatus(context.user.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Scheduling status could not be loaded." }, { status: 500 });
  }
}
