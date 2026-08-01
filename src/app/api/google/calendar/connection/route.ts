import { NextResponse } from "next/server";
import { stopGoogleChannel } from "@/lib/google/client";
import { googleErrorMessage, getUsableGoogleAccessToken, loadGoogleConnection, loadGoogleSyncState, publicGoogleConnection, requireAuthenticatedGoogleContext } from "@/lib/google/server";

export async function GET() {
  const context = await requireAuthenticatedGoogleContext();
  if (!context) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const connection = await loadGoogleConnection(context.client, context.user.id);
  return NextResponse.json({ connection: publicGoogleConnection(connection) });
}

export async function DELETE() {
  const context = await requireAuthenticatedGoogleContext();
  if (!context) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const connection = await loadGoogleConnection(context.client, context.user.id);
  const state = await loadGoogleSyncState(context.client, context.user.id);

  if (connection && state?.channel_id && state.resource_id) {
    try {
      const accessToken = await getUsableGoogleAccessToken(context.client, connection);
      await stopGoogleChannel({ accessToken, channelId: state.channel_id, resourceId: state.resource_id });
    } catch {
      // The channel may already have expired; deleting local state is sufficient.
    }
  }

  const results = await Promise.all([
    context.client.from("google_calendar_events").delete().eq("user_id", context.user.id),
    context.client.from("google_calendar_sync_states").delete().eq("user_id", context.user.id),
    context.client.from("google_calendar_connections").delete().eq("user_id", context.user.id),
  ]);
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    return NextResponse.json({ error: googleErrorMessage(failed.error) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
