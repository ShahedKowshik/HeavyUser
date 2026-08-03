import { NextResponse } from "next/server";
import { getAuthenticatedGoogleContext } from "@/lib/google/server";
import { loadTaskScheduleSnapshot } from "@/lib/scheduler/service";

export async function GET() {
  const context = await getAuthenticatedGoogleContext();
  if (!context.user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  try {
    return NextResponse.json(await loadTaskScheduleSnapshot(context.user.id));
  } catch {
    return NextResponse.json({ error: "Scheduling status could not be loaded." }, { status: 500 });
  }
}
