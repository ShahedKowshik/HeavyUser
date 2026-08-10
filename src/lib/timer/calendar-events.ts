import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type TimerClient = SupabaseClient<Database>;
export type CalendarEventRow = Database["public"]["Tables"]["google_calendar_events"]["Row"];

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const ALL_DAY_DATE_PADDING_DAYS = 1;

function dateOnly(timestamp: string, offsetDays: number) {
  return new Date(new Date(timestamp).getTime() + offsetDays * DAY_IN_MILLISECONDS).toISOString().slice(0, 10);
}

export async function loadCachedEvents(
  client: TimerClient,
  userId: string,
  calendarIds: ReadonlyArray<string>,
  at: string,
) {
  const activeCalendarIds = [...new Set(calendarIds.filter(Boolean))];
  if (activeCalendarIds.length === 0) {
    return [] as CalendarEventRow[];
  }

  const allDayStartDate = dateOnly(at, -ALL_DAY_DATE_PADDING_DAYS);
  const allDayEndDate = dateOnly(at, ALL_DAY_DATE_PADDING_DAYS);
  const { data, error } = await client
    .from("google_calendar_events")
    .select("*")
    .eq("user_id", userId)
    .in("calendar_id", activeCalendarIds)
    .neq("status", "cancelled")
    .or(
      `and(start_at.lte.${at},end_at.gt.${at}),and(start_date.lte.${allDayEndDate},end_date.gt.${allDayStartDate})`,
    );
  if (error) throw error;
  return (data ?? []) as CalendarEventRow[];
}
