import { NextResponse } from "next/server";
import { googleErrorMessage, requireAuthenticatedGoogleContext } from "@/lib/google/server";
import { loadSpaces } from "@/lib/spaces/server";
import { queueSchedulerJob } from "@/lib/scheduler/queue";
import { readJsonBody, rejectCrossOriginMutation } from "@/lib/security/http";
import type { Database } from "@/lib/supabase/database.types";

export async function POST(request: Request) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const parsedBody = await readJsonBody<{ spaceId?: unknown; name?: unknown }>(request);
  if (parsedBody.errorResponse) return parsedBody.errorResponse;
  const context = await requireAuthenticatedGoogleContext();
  if (!context) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const body = parsedBody.data;
  const spaceId = typeof body?.spaceId === "string" ? body.spaceId : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!spaceId || !name || name.length > 120) return NextResponse.json({ error: "Enter a Sub-space name." }, { status: 400 });
  try {
    const { data: space, error: spaceError } = await context.admin.from("spaces").select("id,status").eq("user_id", context.user.id).eq("id", spaceId).maybeSingle();
    if (spaceError) throw spaceError;
    if (!space || space.status !== "active") return NextResponse.json({ error: "Restore that Space before adding a Sub-space." }, { status: 409 });
    const { count, error: countError } = await context.admin.from("sub_spaces").select("id", { count: "exact", head: true }).eq("user_id", context.user.id).eq("space_id", spaceId);
    if (countError) throw countError;
    const { error } = await context.admin.from("sub_spaces").insert({ user_id: context.user.id, space_id: spaceId, name, position: count ?? 0, status: "active", archived_at: null });
    if (error) {
      if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "That Sub-space already exists in this Space." }, { status: 409 });
      throw error;
    }
    await queueSchedulerJob(context.admin, context.user.id, "sub_space_added");
    return NextResponse.json({ spaces: await loadSpaces(context.admin, context.user.id) });
  } catch (error) {
    if ((error as { code?: string }).code === "23514") {
      return NextResponse.json({ error: "Complete or move open tasks before archiving this Sub-space." }, { status: 409 });
    }
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const parsedBody = await readJsonBody<{ subSpaceId?: unknown; name?: unknown; status?: unknown }>(request);
  if (parsedBody.errorResponse) return parsedBody.errorResponse;
  const context = await requireAuthenticatedGoogleContext();
  if (!context) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const body = parsedBody.data;
  const subSpaceId = typeof body?.subSpaceId === "string" ? body.subSpaceId : "";
  if (!subSpaceId) return NextResponse.json({ error: "The Sub-space could not be identified." }, { status: 400 });
  try {
    const { data: subSpace, error: loadError } = await context.admin.from("sub_spaces").select("*").eq("user_id", context.user.id).eq("id", subSpaceId).maybeSingle();
    if (loadError) throw loadError;
    if (!subSpace) return NextResponse.json({ error: "That Sub-space no longer exists." }, { status: 404 });
    const update: Database["public"]["Tables"]["sub_spaces"]["Update"] = { updated_at: new Date().toISOString() };
    if (typeof body?.name === "string") {
      const name = body.name.trim();
      if (!name || name.length > 120) return NextResponse.json({ error: "Sub-space names must be 1–120 characters." }, { status: 400 });
      update.name = name;
    }
    if (body?.status === "active" || body?.status === "archived") {
      if (body.status === "archived") {
        const { count, error: taskError } = await context.admin.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", context.user.id).eq("sub_space_id", subSpaceId).neq("status", "done");
        if (taskError) throw taskError;
        if ((count ?? 0) > 0) return NextResponse.json({ error: `Complete or move the ${count} open task${count === 1 ? "" : "s"} first.` }, { status: 409 });
        update.archived_at = new Date().toISOString();
      } else update.archived_at = null;
      update.status = body.status;
    }
    const { error } = await context.admin.from("sub_spaces").update(update).eq("user_id", context.user.id).eq("id", subSpaceId);
    if (error) throw error;
    await queueSchedulerJob(context.admin, context.user.id, "sub_space_changed");
    return NextResponse.json({ spaces: await loadSpaces(context.admin, context.user.id) });
  } catch (error) {
    if ((error as { code?: string }).code === "23514") {
      return NextResponse.json({ error: "Complete or move open tasks before archiving this Sub-space." }, { status: 409 });
    }
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 500 });
  }
}
