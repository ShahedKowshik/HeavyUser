"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Task } from "@/lib/tasks";

type TasksClient = SupabaseClient<Database>;

function mapTask(row: Database["public"]["Tables"]["tasks"]["Row"]): Task {
  return {
    id: row.id,
    title: row.title,
    duration: row.duration,
    startDate: row.start_date,
    deadline: row.deadline,
    priority: row.priority === "urgent" || row.priority === "high" || row.priority === "low" ? row.priority : "normal",
    status: row.status === "focus" || row.status === "done" ? row.status : "open",
  };
}

export async function loadRemoteTasks(client: TasksClient, user: User) {
  const { data, error } = await client
    .from("tasks")
    .select("id,user_id,title,duration,start_date,deadline,priority,status,position,created_at,updated_at")
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
  user: User,
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
    duration: task.duration,
    start_date: task.startDate,
    deadline: task.deadline,
    priority: task.priority,
    status: task.status,
    position,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await client.from("tasks").upsert(rows, { onConflict: "user_id,id" });
  if (error) {
    throw error;
  }
}
