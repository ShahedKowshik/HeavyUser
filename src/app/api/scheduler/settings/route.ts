import { NextResponse } from "next/server";
import { getAuthenticatedGoogleContext, loadGoogleConnection } from "@/lib/google/server";
import { normalizeSchedulerPreferences, preferencesToRow } from "@/lib/scheduler/preferences";

async function getContext() {
  const context = await getAuthenticatedGoogleContext();
  if (!context.client || !context.user) {
    return null;
  }
  return { client: context.client, user: context.user };
}

export async function GET() {
  const context = await getContext();
  if (!context) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const connection = await loadGoogleConnection(context.client, context.user.id);
  const { data, error } = await context.client
    .from("task_scheduling_preferences")
    .select("*")
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Scheduling settings could not be loaded." }, { status: 500 });
  }

  return NextResponse.json({
    settings: normalizeSchedulerPreferences(data, connection?.selected_calendar_timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone),
  });
}

export async function PUT(request: Request) {
  const context = await getContext();
  if (!context) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const connection = await loadGoogleConnection(context.client, context.user.id);
  const preferences = normalizeSchedulerPreferences(body, connection?.selected_calendar_timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const { data, error } = await context.client
    .from("task_scheduling_preferences")
    .upsert(preferencesToRow(preferences, context.user.id) as never, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: "Scheduling settings could not be saved." }, { status: 500 });
  }

  return NextResponse.json({ settings: normalizeSchedulerPreferences(data, preferences.timezone) });
}
