"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { CalendarTransparency, CalendarVisibility, Task } from "@/lib/tasks";

type TasksClient = SupabaseClient<Database>;

export type RemoteTaskSnapshot = {
  tasks: ReadonlyArray<Task>;
  version: number;
  orderVersion: number;
};

export type PersistedTaskSnapshot = {
  version: number;
  orderVersion: number;
};

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

export async function loadRemoteTaskSnapshot(client: TasksClient, user: Pick<User, "id">): Promise<RemoteTaskSnapshot> {
  const [tasksResult, versionResult] = await Promise.all([
    client
    .from("tasks")
    .select("id,user_id,title,space_id,sub_space_id,duration,start_date,deadline,priority,status,auto_schedule,min_block_minutes,max_block_minutes,calendar_visibility,calendar_transparency,position,created_at,updated_at")
    .eq("user_id", user.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true }),
    client.from("task_list_versions").select("version,order_version").eq("user_id", user.id).maybeSingle(),
  ]);

  if (tasksResult.error) throw tasksResult.error;
  if (versionResult.error) throw versionResult.error;

  return {
    tasks: (tasksResult.data ?? []).map(mapTask),
    version: Number(versionResult.data?.version ?? 0),
    orderVersion: Number(versionResult.data?.order_version ?? 0),
  };
}

export async function loadRemoteTasks(client: TasksClient, user: Pick<User, "id">) {
  return (await loadRemoteTaskSnapshot(client, user)).tasks;
}

export async function persistRemoteTasks(
  client: TasksClient,
  user: Pick<User, "id">,
  tasks: ReadonlyArray<Task>,
  deletedTaskIds: ReadonlyArray<string> = [],
  options: {
    baseVersion?: number;
    baseOrderVersion?: number;
    orderChanged?: boolean;
  } = {},
): Promise<PersistedTaskSnapshot> {
  const rows = tasks.map((task, position) => ({
    id: task.id,
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
  }));

  const { data, error } = await client.rpc("save_task_snapshot", {
    p_user_id: user.id,
    p_tasks: rows,
    p_deleted_task_ids: [...deletedTaskIds],
    p_base_version: options.baseVersion ?? 0,
    p_base_order_version: options.baseOrderVersion ?? 0,
    p_order_changed: options.orderChanged ?? true,
  });
  if (error) throw error;

  const saved = Array.isArray(data) ? data[0] : data;
  return {
    version: Number((saved as { version?: number } | null)?.version ?? 0),
    orderVersion: Number((saved as { order_version?: number } | null)?.order_version ?? 0),
  };
}
