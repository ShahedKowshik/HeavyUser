import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type SchedulerDbClient = SupabaseClient<Database>;

export async function queueSchedulerJob(client: SchedulerDbClient, userId: string, reason = "change") {
  const now = new Date().toISOString();
  const { error } = await client.from("scheduler_queue").upsert(
    {
      user_id: userId,
      reason,
      requested_at: now,
      run_after: now,
      attempts: 0,
      locked_at: null,
      last_error: null,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw error;
  }
}
