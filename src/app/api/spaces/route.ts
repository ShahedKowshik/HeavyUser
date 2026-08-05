import { NextResponse } from "next/server";
import { listGoogleCalendars } from "@/lib/google/client";
import {
  getUsableGoogleAccessToken,
  googleErrorMessage,
  loadGoogleConnection,
  requireAuthenticatedGoogleContext,
} from "@/lib/google/server";
import { ensureSpaceForCalendar, loadSpaces } from "@/lib/spaces/server";
import { queueSchedulerJob } from "@/lib/scheduler/queue";
import { syncAllGoogleCalendars } from "@/lib/google/sync";
import { rejectCrossOriginMutation, rejectOversizedBody } from "@/lib/security/http";
import type { Database } from "@/lib/supabase/database.types";

export async function GET() {
  const context = await requireAuthenticatedGoogleContext();
  if (!context) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  try {
    return NextResponse.json({ spaces: await loadSpaces(context.admin, context.user.id) });
  } catch (error) {
    if ((error as { code?: string }).code === "23514") {
      return NextResponse.json({ error: "Complete or move open tasks before archiving this Space." }, { status: 409 });
    }
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const originError = rejectCrossOriginMutation(request) ?? rejectOversizedBody(request);
  if (originError) return originError;
  const context = await requireAuthenticatedGoogleContext();
  if (!context) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { calendarId?: unknown } | null;
  const calendarId = typeof body?.calendarId === "string" ? body.calendarId.trim() : "";
  if (!calendarId || calendarId.length > 512) return NextResponse.json({ error: "Choose a Google Calendar." }, { status: 400 });

  try {
    const connection = await loadGoogleConnection(context.admin, context.user.id);
    if (!connection) return NextResponse.json({ error: "Connect Google Calendar first." }, { status: 400 });
    const accessToken = await getUsableGoogleAccessToken(context.admin, connection);
    const calendars = await listGoogleCalendars(accessToken);
    const selected = calendars.find((calendar) => calendar.id === calendarId);
    if (!selected) return NextResponse.json({ error: "That calendar is unavailable or not writable." }, { status: 403 });
    const space = await ensureSpaceForCalendar({
      client: context.admin,
      userId: context.user.id,
      calendarId,
      calendarName: selected.summary ?? calendarId,
      timeZone: selected.timeZone ?? "UTC",
    });
    const { error: connectionError } = await context.admin.from("google_calendar_connections").update({
      selected_calendar_id: selected.id,
      selected_calendar_name: selected.summary ?? selected.id,
      selected_calendar_timezone: selected.timeZone ?? "UTC",
      status: "connected",
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", context.user.id);
    if (connectionError) throw connectionError;
    let syncPending = false;
    try {
      const sync = await syncAllGoogleCalendars(context.admin, connection, request, { skipSchedulerQueue: true });
      syncPending = sync.errors.length > 0;
    } catch {
      syncPending = true;
    }
    await queueSchedulerJob(context.admin, context.user.id, "space_added");
    return NextResponse.json({ space, spaces: await loadSpaces(context.admin, context.user.id), syncPending });
  } catch (error) {
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  const originError = rejectCrossOriginMutation(request) ?? rejectOversizedBody(request);
  if (originError) return originError;
  const context = await requireAuthenticatedGoogleContext();
  if (!context) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { spaceId?: unknown; name?: unknown; status?: unknown } | null;
  const spaceId = typeof body?.spaceId === "string" ? body.spaceId : "";
  if (!spaceId || spaceId.length > 100) return NextResponse.json({ error: "The Space could not be identified." }, { status: 400 });

  try {
    const { data: space, error: spaceError } = await context.admin.from("spaces").select("*").eq("user_id", context.user.id).eq("id", spaceId).maybeSingle();
    if (spaceError) throw spaceError;
    if (!space) return NextResponse.json({ error: "That Space no longer exists." }, { status: 404 });

    const update: Database["public"]["Tables"]["spaces"]["Update"] = { updated_at: new Date().toISOString() };
    if (typeof body?.name === "string") {
      const name = body.name.trim();
      if (!name || name.length > 120) return NextResponse.json({ error: "Space names must be 1–120 characters." }, { status: 400 });
      update.name = name;
    }
    if (body?.status === "archived" || body?.status === "active") {
      if (body.status === "archived") {
        const { count, error: taskError } = await context.admin.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", context.user.id).eq("space_id", spaceId).neq("status", "done");
        if (taskError) throw taskError;
        if ((count ?? 0) > 0) return NextResponse.json({ error: `Complete or move the ${count} open task${count === 1 ? "" : "s"} first.`, openTaskCount: count }, { status: 409 });
        update.archived_at = new Date().toISOString();
      } else {
        update.archived_at = null;
      }
      update.status = body.status;
    }
    const { error } = await context.admin.from("spaces").update(update).eq("user_id", context.user.id).eq("id", spaceId);
    if (error) throw error;
    await queueSchedulerJob(context.admin, context.user.id, "space_changed");
    return NextResponse.json({ spaces: await loadSpaces(context.admin, context.user.id) });
  } catch (error) {
    if ((error as { code?: string }).code === "23514") {
      return NextResponse.json({ error: "Complete or move open tasks before archiving this Space." }, { status: 409 });
    }
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 500 });
  }
}
