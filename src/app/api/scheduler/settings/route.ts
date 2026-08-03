import { NextResponse } from "next/server";
import { getAuthenticatedGoogleContext, googleErrorMessage, loadGoogleConnection } from "@/lib/google/server";
import { getUserSettings } from "@/lib/supabase/settings";
import { hasWorkingWindow, normalizeSchedulerPreferences, preferencesToRow } from "@/lib/scheduler/preferences";
import { runSchedulerForUserWithRetry, SchedulerBusyError } from "@/lib/scheduler/service";
import { rejectCrossOriginMutation, rejectOversizedBody } from "@/lib/security/http";

async function getContext() {
  const context = await getAuthenticatedGoogleContext();
  if (!context.client || !context.admin || !context.user) {
    return null;
  }
  return { client: context.client, admin: context.admin, user: context.user };
}

export async function GET() {
  const context = await getContext();
  if (!context) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const connection = await loadGoogleConnection(context.admin, context.user.id);
  const daySettings = getUserSettings(context.user) ?? undefined;
  const { data, error } = await context.admin
    .from("task_scheduling_preferences")
    .select("*")
    .eq("user_id", context.user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Scheduling settings could not be loaded." }, { status: 500 });
  }

  return NextResponse.json({
    settings: normalizeSchedulerPreferences(
      data,
      connection?.selected_calendar_timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      daySettings,
    ),
  });
}

export async function PUT(request: Request) {
  const originError = rejectCrossOriginMutation(request) ?? rejectOversizedBody(request);
  if (originError) {
    return originError;
  }

  const context = await getContext();
  if (!context) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const connection = await loadGoogleConnection(context.admin, context.user.id);
  const daySettings = getUserSettings(context.user) ?? undefined;
  const preferences = normalizeSchedulerPreferences(
    body,
    connection?.selected_calendar_timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    daySettings,
  );
  if (preferences.enabled && !hasWorkingWindow(preferences)) {
    return NextResponse.json({ error: "Add at least one working window or turn off automatic scheduling." }, { status: 400 });
  }
  const { data, error } = await context.admin
    .from("task_scheduling_preferences")
    .upsert(preferencesToRow(preferences, context.user.id) as never, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: "Scheduling settings could not be saved." }, { status: 500 });
  }

  let schedulerError: string | null = null;
  try {
    await runSchedulerForUserWithRetry(context.user.id, request);
  } catch (error) {
    // Keep the working-hours change saved even if Google is temporarily
    // unavailable. The queue and the next workspace refresh will retry it.
    if (!(error instanceof SchedulerBusyError)) {
      schedulerError = googleErrorMessage(error);
    }
  }

  return NextResponse.json({
    settings: normalizeSchedulerPreferences(data, preferences.timezone, preferences),
    schedulerError,
  });
}
