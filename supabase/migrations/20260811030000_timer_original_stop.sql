-- Preserve the first stop timestamp when the atomic timer transition is used.
-- This keeps the original work range available for later corrections.

create or replace function public.set_task_timer_state(
  p_user_id uuid,
  p_session_id uuid,
  p_state text,
  p_stopped_at timestamptz default null,
  p_worked_seconds bigint default null,
  p_warning text default null,
  p_calendar_sync_state text default null,
  p_repair_needed boolean default null,
  p_block_state text default null,
  p_block_start_at timestamptz default null,
  p_block_end_at timestamptz default null,
  p_block_last_error text default null
)
returns public.task_work_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_session public.task_work_sessions;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 44722));

  update public.task_work_sessions
  set state = p_state,
      stopped_at = coalesce(p_stopped_at, stopped_at),
      original_stopped_at = case
        when p_state = 'stopped' then coalesce(original_stopped_at, p_stopped_at)
        else original_stopped_at
      end,
      worked_seconds = coalesce(p_worked_seconds, worked_seconds),
      warning = p_warning,
      calendar_sync_state = coalesce(p_calendar_sync_state, calendar_sync_state),
      repair_needed = coalesce(p_repair_needed, repair_needed),
      updated_at = now()
  where user_id = p_user_id and id = p_session_id
  returning * into saved_session;

  if saved_session.id is null then
    raise exception using errcode = 'P0002', message = 'The timer session could not be found.';
  end if;

  if saved_session.block_id is not null and (
    p_block_state is not null or p_block_start_at is not null or p_block_end_at is not null or p_block_last_error is not null
  ) then
    update public.task_schedule_blocks
    set state = coalesce(p_block_state, state),
        start_at = coalesce(p_block_start_at, start_at),
        end_at = coalesce(p_block_end_at, end_at),
        planned_start_at = coalesce(p_block_start_at, planned_start_at),
        planned_end_at = coalesce(p_block_end_at, planned_end_at),
        last_error = p_block_last_error,
        updated_at = now()
    where user_id = p_user_id and id = saved_session.block_id;
  end if;

  if p_state <> 'running' then
    delete from public.task_active_session_owners
    where user_id = p_user_id and session_id = p_session_id;
  end if;

  return saved_session;
end;
$$;

revoke all on function public.set_task_timer_state(uuid, uuid, text, timestamptz, bigint, text, text, boolean, text, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.set_task_timer_state(uuid, uuid, text, timestamptz, bigint, text, text, boolean, text, timestamptz, timestamptz, text) to service_role;
