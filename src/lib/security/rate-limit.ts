import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type RateLimitClient = SupabaseClient<Database>;

export async function consumeUserOperation(
  client: RateLimitClient,
  userId: string,
  operation: string,
  limit: number,
  windowSeconds = 60,
) {
  const { data, error } = await client.rpc("consume_user_operation", {
    p_user_id: userId,
    p_operation: operation,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw error;
  return data === true;
}
