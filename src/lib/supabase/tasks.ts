"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { CalendarTransparency, CalendarVisibility, Task } from "@/lib/tasks";

type TasksClient = SupabaseClient<Database>;

/**
 * Browser task saves are whole-list snapshots. Serializing them prevents an
 * older, slower request from finishing after a newer request and restoring
 * stale data. A rejected save does not poison the queue.
 */
export function createTaskWriteQueue() {
  let tail: Promise<void> = Promise.resolve();

  return {
    enqueue<T>(operation: () => Promise<T>) {
      const result = tail.then(operation, operation);
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}

function mapTask(row: Database["public"]["Tables"]["tasks"]["Row"]): Task {
  return {
    id: row.id,
    title: row.title,
    spaceId: row.space_id,
    subSpaceId: row.sub_space_id,
    duration: row.duration,
    startDate: row.start_date,
    deadline: row.deadline,
    priority: row.priority === "urgent" || row.priority === "high" || row.priority === "low" ? row.priority : "normal",
    status: row.status === "focus" || row.status === "done" ? row.status : "open",
    autoSchedule: true,
    minBlockMinutes: row.min_block_minutes,
    maxBlockMinutes: row.max_block_minutes,
    calendarVisibility: isCalendarVisibility(row.calendar_visibility) ? row.calendar_visibility : null,
    calendarTransparency: isCalendarTransparency(row.calendar_transparency) ? row.calendar_transparency : null,
  };
}

function isCalendarVisibility(value: string | null): value is CalendarVisibility {
  return value === "default" || value === "public" || value === "private";
}

function isCalendarTransparency(value: string | null): value is CalendarTransparency {
  return value === "default" || value === "opaque" || value === "transparent";
}

export async function loadRemoteTasks(client: TasksClient, user: Pick<User, "id">) {
  const { data, error } = await client
    .from("tasks")
    .select("id,user_id,title,space_id,sub_space_id,duration,start_date,deadline,priority,status,auto_schedule,min_block_minutes,max_block_minutes,calendar_visibility,calendar_transparency,position,created_at,updated_at")
    .eq("user_id", user.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapTask);
}

export async function persistRemoteTasks(
  client: TasksClient,
  user: Pick<User, "id">,
  tasks: ReadonlyArray<Task>,
  deletedTaskIds: ReadonlyArray<string> = [],
) {
  if (deletedTaskIds.length > 0) {
    const { error } = await client
      .from("tasks")
      .delete()
      .eq("user_id", user.id)
      .in("id", deletedTaskIds);

    if (error) {
      throw error;
    }
  }

  if (tasks.length === 0) {
    return;
  }

  const rows = tasks.map((task, position) => ({
    id: task.id,
    user_id: user.id,
    title: task.title,
    space_id: task.spaceId,
    sub_space_id: task.subSpaceId,
    duration: task.duration,
    start_date: task.startDate,
    deadline: task.deadline,
    priority: task.priority,
    status: task.status,
    auto_schedule: true,
    min_block_minutes: task.minBlockMinutes,
    max_block_minutes: task.maxBlockMinutes,
    calendar_visibility: task.calendarVisibility,
    calendar_transparency: task.calendarTransparency,
    position,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await client.from("tasks").upsert(rows, { onConflict: "user_id,id" });
  if (error) {
    throw error;
  }
}
