-- PostgREST needs SELECT permission to complete an authenticated upsert with
-- an ON CONFLICT target. Without it, calendar sync succeeds but the final
-- scheduler-queue write fails and makes the calendar appear offline.
grant select on public.scheduler_queue to authenticated;

drop policy if exists "Users can view their scheduling jobs" on public.scheduler_queue;
create policy "Users can view their scheduling jobs"
on public.scheduler_queue for select to authenticated
using ((select auth.uid()) = user_id);
