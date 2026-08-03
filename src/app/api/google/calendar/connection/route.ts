import { NextResponse } from "next/server";
import { stopGoogleChannel } from "@/lib/google/client";
import { googleErrorMessage, getUsableGoogleAccessToken, loadGoogleConnection, loadGoogleSyncState, publicGoogleConnection, requireAuthenticatedGoogleContext } from "@/lib/google/server";
import { pauseSchedulerForUser, removeManagedBlocksForConnection } from "@/lib/scheduler/service";
import { rejectCrossOriginMutation } from "@/lib/security/http";

export async function GET() {
  const context = await requireAuthenticatedGoogleContext();
  if (!context) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const connection = await loadGoogleConnection(context.admin, context.user.id);
  return NextResponse.json({ connection: publicGoogleConnection(connection) });
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
  const state = await loadGoogleSyncState(context.admin, context.user.id);
  let cleanupWarning: string | null = null;

  if (connection?.selected_calendar_id) {
    try {
      const cleanup = await removeManagedBlocksForConnection(connection);
      if (cleanup.errors.length > 0) {
        cleanupWarning = "Some future HeavyUser blocks could not be removed from Google Calendar and may need cleanup after reconnecting.";
      }
    } catch (cleanupError) {
      cleanupWarning = googleErrorMessage(cleanupError);
    }
  }

  if (connection && state?.channel_id && state.resource_id) {
    try {
      const accessToken = await getUsableGoogleAccessToken(context.admin, connection);
      await stopGoogleChannel({ accessToken, channelId: state.channel_id, resourceId: state.resource_id });
    } catch {
      // The channel may already have expired; deleting local state is sufficient.
    }
  }

  const results = await Promise.all([
    context.admin.from("google_calendar_events").delete().eq("user_id", context.user.id),
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
