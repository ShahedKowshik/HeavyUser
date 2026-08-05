import { NextResponse } from "next/server";
import { stopGoogleChannel } from "@/lib/google/client";
import { googleErrorMessage, getUsableGoogleAccessToken, loadGoogleConnection, publicGoogleConnection, requireAuthenticatedGoogleContext } from "@/lib/google/server";
import { pauseSchedulerForUser, removeManagedBlocksForConnection } from "@/lib/scheduler/service";
import { rejectCrossOriginMutation } from "@/lib/security/http";
import { loadSpaces } from "@/lib/spaces/server";
import { stopTimerForCalendarDisconnect } from "@/lib/timer/server";

export async function GET() {
  const context = await requireAuthenticatedGoogleContext();
  if (!context) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const connection = await loadGoogleConnection(context.admin, context.user.id);
  return NextResponse.json({ connection: publicGoogleConnection(connection), spaces: await loadSpaces(context.admin, context.user.id) });
}

export async function DELETE(request: Request) {
  const context = await requireAuthenticatedGoogleContext();
  if (!context) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const originError = rejectCrossOriginMutation(request);
  if (originError) {
    return originError;
  }

  const connection = await loadGoogleConnection(context.admin, context.user.id);
  const { data: states, error: statesError } = await context.admin.from("google_calendar_sync_states").select("*").eq("user_id", context.user.id);
  if (statesError) return NextResponse.json({ error: googleErrorMessage(statesError) }, { status: 500 });
  let cleanupWarning: string | null = null;

  if (connection) {
    try {
      await stopTimerForCalendarDisconnect(context.user.id);
    } catch (timerError) {
      return NextResponse.json({
        error: "The active timer could not be saved safely, so Calendar was not disconnected.",
        detail: googleErrorMessage(timerError),
      }, { status: 409 });
    }
    try {
      const cleanup = await removeManagedBlocksForConnection(connection);
      if (cleanup.errors.length > 0) {
        cleanupWarning = "Some future HeavyUser blocks could not be removed from Google Calendar and may need cleanup after reconnecting.";
      }
    } catch (cleanupError) {
      cleanupWarning = googleErrorMessage(cleanupError);
    }
  }

  if (connection) {
    const accessToken = await getUsableGoogleAccessToken(context.admin, connection).catch(() => null);
    if (accessToken) {
      for (const state of states ?? []) {
        if (!state.channel_id || !state.resource_id) continue;
        try {
          await stopGoogleChannel({ accessToken, channelId: state.channel_id, resourceId: state.resource_id });
        } catch {
          // A channel may already have expired; deleting local state is sufficient.
        }
      }
    }
  }

  const results = await Promise.all([
    context.admin.from("google_calendar_events").delete().eq("user_id", context.user.id),
    context.admin.from("google_calendar_event_deletions").delete().eq("user_id", context.user.id),
    context.admin.from("google_calendar_sync_states").delete().eq("user_id", context.user.id),
    context.admin.from("google_calendar_connections").delete().eq("user_id", context.user.id),
  ]);
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    return NextResponse.json({ error: googleErrorMessage(failed.error) }, { status: 500 });
  }

  await pauseSchedulerForUser(context.user.id, cleanupWarning ?? "Google Calendar is disconnected. Connect a calendar to resume scheduling.");

  return NextResponse.json({ ok: true, cleanupWarning });
}
