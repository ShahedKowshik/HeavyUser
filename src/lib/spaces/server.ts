import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getRefreshedCalendarMetadata, type Space, type SubSpace } from "@/lib/spaces";

type SpacesClient = SupabaseClient<Database>;
type SpaceRow = Database["public"]["Tables"]["spaces"]["Row"];
type SubSpaceRow = Database["public"]["Tables"]["sub_spaces"]["Row"];

function mapSubSpace(row: SubSpaceRow): SubSpace {
  return {
    id: row.id,
    spaceId: row.space_id,
    name: row.name,
    status: row.status === "archived" ? "archived" : "active",
    position: row.position,
    archivedAt: row.archived_at,
  };
}

function mapSpace(row: SpaceRow, subSpaces: ReadonlyArray<SubSpace> = []): Space {
  return {
    id: row.id,
    name: row.name,
    calendarId: row.calendar_id,
    calendarName: row.calendar_name,
    timeZone: row.time_zone,
    status: row.status === "archived" ? "archived" : row.status === "disconnected" ? "disconnected" : "active",
    position: row.position,
    archivedAt: row.archived_at,
    subSpaces: subSpaces.filter((subSpace) => subSpace.spaceId === row.id).sort((a, b) => a.position - b.position),
  };
}

export async function loadSpaceRows(client: SpacesClient, userId: string) {
  const [spacesResult, subSpacesResult] = await Promise.all([
    client.from("spaces").select("*").eq("user_id", userId).order("position", { ascending: true }).order("created_at", { ascending: true }),
    client.from("sub_spaces").select("*").eq("user_id", userId).order("position", { ascending: true }).order("created_at", { ascending: true }),
  ]);
  if (spacesResult.error) throw spacesResult.error;
  if (subSpacesResult.error) throw subSpacesResult.error;
  return {
    spaces: (spacesResult.data ?? []) as SpaceRow[],
    subSpaces: (subSpacesResult.data ?? []).map(mapSubSpace),
  };
}

export async function loadSpaces(client: SpacesClient, userId: string): Promise<ReadonlyArray<Space>> {
  const rows = await loadSpaceRows(client, userId);
  return rows.spaces.map((row) => mapSpace(row, rows.subSpaces));
}

export async function loadSpaceById(client: SpacesClient, userId: string, spaceId: string) {
  const { data, error } = await client.from("spaces").select("*").eq("user_id", userId).eq("id", spaceId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: subSpaceRows, error: subSpaceError } = await client.from("sub_spaces").select("*").eq("user_id", userId).eq("space_id", spaceId).order("position", { ascending: true });
  if (subSpaceError) throw subSpaceError;
  return mapSpace(data as SpaceRow, (subSpaceRows ?? []).map(mapSubSpace));
}

async function assignLegacyTasksToFirstSpace(client: SpacesClient, userId: string) {
  const { data: firstSpace, error: firstSpaceError } = await client
    .from("spaces")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (firstSpaceError) throw firstSpaceError;
  if (!firstSpace) return;

  const { error: taskError } = await client.from("tasks")
    .update({ space_id: firstSpace.id, sub_space_id: null })
    .eq("user_id", userId)
    .is("space_id", null);
  if (taskError) throw taskError;
}

export async function ensureSpaceForCalendar(input: {
  client: SpacesClient;
  userId: string;
  calendarId: string;
  calendarName: string;
  timeZone: string;
}) {
  const calendarId = input.calendarId.trim();
  if (!calendarId) throw new Error("A Google Calendar ID is required.");

  const existing = await input.client.from("spaces").select("*").eq("user_id", input.userId).eq("calendar_id", calendarId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    const metadata = getRefreshedCalendarMetadata({
      name: existing.data.name,
      calendarName: existing.data.calendar_name,
      calendarId,
    }, { name: input.calendarName, timeZone: input.timeZone });
    const { error: restoreError } = await input.client.from("spaces").update({
      status: "active",
      archived_at: null,
      name: metadata.name,
      calendar_name: metadata.calendarName,
      time_zone: metadata.timeZone,
      updated_at: new Date().toISOString(),
    }).eq("user_id", input.userId).eq("id", existing.data.id);
    if (restoreError) throw restoreError;
    // A retry after a partial first-save must still adopt legacy tasks. Use
    // the oldest Space instead of a row count so a second calendar can never
    // strand tasks that were waiting for the first save to finish.
    await assignLegacyTasksToFirstSpace(input.client, input.userId);
    return loadSpaceById(input.client, input.userId, existing.data.id);
  }

  const name = input.calendarName.trim().slice(0, 120) || calendarId.slice(0, 120);
  const { data, error } = await input.client.rpc("create_space_for_user", {
    p_user_id: input.userId,
    p_calendar_id: calendarId,
    p_name: name,
    p_calendar_name: name,
    p_time_zone: input.timeZone || "UTC",
  });
  if (error) {
    throw error;
  }
  if (!data) throw new Error("The Space could not be created.");

  // Keep old, calendar-less tasks safe. Only the oldest Space adopts them;
  // later calendar additions must never steal another Space's tasks.
  await assignLegacyTasksToFirstSpace(input.client, input.userId);

  return mapSpace(data as SpaceRow);
}
