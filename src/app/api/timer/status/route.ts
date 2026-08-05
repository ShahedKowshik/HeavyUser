import { NextResponse } from "next/server";
import { getAuthenticatedGoogleContext } from "@/lib/google/server";
import { loadTimerStatus } from "@/lib/timer/server";

export async function GET() {
  const context = await getAuthenticatedGoogleContext();
  if (!context.user || !context.admin) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  try {
    return NextResponse.json(await loadTimerStatus(context.user.id));
  } catch {
    return NextResponse.json({ error: "Timer history could not be loaded." }, { status: 500 });
  }
}
