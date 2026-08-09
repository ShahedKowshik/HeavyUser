-- Tighten the browser-facing database surface and add the indexes required by
-- the current Space, scheduling, and timer relationships.

-- Supabase's public schema defaults can grant more table capabilities than the
-- app needs. Only signed-in users need direct CRUD access to these three
-- browser-facing tables; RLS continues to enforce row ownership.
revoke all on public.tasks from anon, authenticated;
revoke all on public.spaces from anon, authenticated;
revoke all on public.sub_spaces from anon, authenticated;

grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.spaces to authenticated;
grant select, insert, update, delete on public.sub_spaces to authenticated;

-- Supabase's RLS event-trigger helper does not need Data API callers to execute
-- its backing function. Remove that unnecessary RPC surface when the helper
-- exists in the target environment.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;

-- Cover every application foreign key that is not already backed by a
-- left-prefix index. Besides faster joins, these prevent parent deletes and
-- updates from scanning entire child tables as the account grows.
create index if not exists google_calendar_events_space_idx
  on public.google_calendar_events (user_id, space_id);

create index if not exists task_active_session_owners_task_idx
  on public.task_active_session_owners (user_id, task_id);

create index if not exists task_calendar_repairs_block_idx
  on public.task_calendar_repairs (user_id, block_id);

create index if not exists task_calendar_repairs_session_idx
  on public.task_calendar_repairs (session_id);

create index if not exists task_schedule_blocks_space_idx
  on public.task_schedule_blocks (user_id, space_id);

create index if not exists task_work_session_revisions_session_fk_idx
  on public.task_work_session_revisions (session_id);

create index if not exists task_work_sessions_block_idx
  on public.task_work_sessions (user_id, block_id);

create index if not exists task_work_sessions_space_idx
  on public.task_work_sessions (user_id, space_id);

-- This wider index covers both Space and Sub-space foreign keys because the
-- Space key is its leftmost prefix.
create index if not exists tasks_space_subspace_idx
  on public.tasks (user_id, space_id, sub_space_id);
