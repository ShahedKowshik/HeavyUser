-- Keep provider identifiers scoped to the owning workspace. This also lets two
-- different users cache the same Google event id without colliding.
alter table public.google_calendar_sync_states
  add column if not exists channel_token_hash text;

alter table public.google_calendar_events
  drop constraint if exists google_calendar_events_pkey;

alter table public.google_calendar_events
  add constraint google_calendar_events_pkey primary key (user_id, event_key);

alter table public.task_schedule_blocks
  drop constraint if exists task_schedule_blocks_pkey;

alter table public.task_schedule_blocks
  add constraint task_schedule_blocks_pkey primary key (user_id, id);

-- Reject malformed values even when a client bypasses the application API.
alter table public.tasks
  drop constraint if exists tasks_title_length_check,
  drop constraint if exists tasks_duration_range_check,
  drop constraint if exists tasks_position_check,
  drop constraint if exists tasks_min_block_minutes_check,
  drop constraint if exists tasks_max_block_minutes_check,
  drop constraint if exists tasks_block_order_check;

alter table public.tasks
  add constraint tasks_title_length_check check (length(title) between 1 and 240 and length(btrim(title)) >= 1),
  add constraint tasks_duration_range_check check (duration is null or duration between 1 and 10080),
  add constraint tasks_position_check check (position >= 0),
  add constraint tasks_min_block_minutes_check check (min_block_minutes is null or min_block_minutes between 5 and 10080),
  add constraint tasks_max_block_minutes_check check (max_block_minutes is null or max_block_minutes between 5 and 10080),
  add constraint tasks_block_order_check check (
    min_block_minutes is null or max_block_minutes is null or min_block_minutes <= max_block_minutes
  );

alter table public.task_scheduling_preferences
  drop constraint if exists task_scheduling_preferences_min_block_range_check,
  drop constraint if exists task_scheduling_preferences_max_block_range_check;

alter table public.task_scheduling_preferences
  add constraint task_scheduling_preferences_min_block_range_check check (default_min_block_minutes between 5 and 10080),
  add constraint task_scheduling_preferences_max_block_range_check check (default_max_block_minutes between default_min_block_minutes and 10080);

alter table public.scheduler_queue
  drop constraint if exists scheduler_queue_attempts_check;

alter table public.scheduler_queue
  add constraint scheduler_queue_attempts_check check (attempts between 0 and 20);

-- These tables contain encrypted credentials or internal scheduler state. The
-- browser never needs direct PostgREST access; server-only admin calls are the
-- single data path.
revoke all on public.google_calendar_connections from anon, authenticated;
revoke all on public.google_calendar_sync_states from anon, authenticated;
revoke all on public.google_calendar_events from anon, authenticated;
revoke all on public.task_scheduling_preferences from anon, authenticated;
revoke all on public.task_schedule_blocks from anon, authenticated;
revoke all on public.task_schedule_status from anon, authenticated;
revoke all on public.scheduler_queue from anon, authenticated;
revoke all on public.task_schedule_cleanup from anon, authenticated;
revoke all on public.scheduler_user_locks from anon, authenticated;

grant select, insert, update, delete on public.tasks to service_role;
grant select, insert, update, delete on public.google_calendar_connections to service_role;
grant select, insert, update, delete on public.google_calendar_sync_states to service_role;
grant select, insert, update, delete on public.google_calendar_events to service_role;
grant select, insert, update, delete on public.task_scheduling_preferences to service_role;
grant select, insert, update, delete on public.task_schedule_blocks to service_role;
grant select, insert, update, delete on public.task_schedule_status to service_role;
grant select, insert, update, delete on public.scheduler_queue to service_role;
grant select, insert, update, delete on public.task_schedule_cleanup to service_role;
grant select, insert, update, delete on public.scheduler_user_locks to service_role;
grant usage, select on sequence public.task_schedule_cleanup_id_seq to service_role;

drop policy if exists "Users can view their Google calendar connection" on public.google_calendar_connections;
drop policy if exists "Users can manage their Google calendar connection" on public.google_calendar_connections;
drop policy if exists "Users can manage their Google calendar sync state" on public.google_calendar_sync_states;
drop policy if exists "Users can view their Google calendar events" on public.google_calendar_events;
drop policy if exists "Users can manage their Google calendar events" on public.google_calendar_events;
drop policy if exists "Users can manage their scheduling preferences" on public.task_scheduling_preferences;
drop policy if exists "Users can view their schedule blocks" on public.task_schedule_blocks;
drop policy if exists "Users can view their schedule status" on public.task_schedule_status;
drop policy if exists "Users can queue their own scheduling jobs" on public.scheduler_queue;
drop policy if exists "Users can refresh their own scheduling jobs" on public.scheduler_queue;
drop policy if exists "Users can view their scheduling jobs" on public.scheduler_queue;

-- A worker lease has an owner token. An expired worker can be replaced, but it
-- can no longer release a newer worker's lease when it eventually finishes.
alter table public.scheduler_user_locks
  add column if not exists lock_token text;

update public.scheduler_user_locks
set lock_token = md5(user_id::text || clock_timestamp()::text || random()::text)
where lock_token is null;

alter table public.scheduler_user_locks
  alter column lock_token set not null;

drop function if exists public.try_claim_scheduler_lock(uuid);
drop function if exists public.release_scheduler_lock(uuid);
drop function if exists public.try_claim_scheduler_lock(uuid, text);
drop function if exists public.refresh_scheduler_lock(uuid, text);
drop function if exists public.release_scheduler_lock(uuid, text);

create function public.try_claim_scheduler_lock(p_user_id uuid, p_lock_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
  claimed_user uuid;
begin
  if p_lock_token is null or btrim(p_lock_token) = '' then
    return false;
  end if;

  insert into public.scheduler_user_locks (user_id, locked_at, lock_token)
  values (p_user_id, now(), p_lock_token)
  on conflict (user_id) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 1 then
    return true;
  end if;

  update public.scheduler_user_locks
  set locked_at = now(), lock_token = p_lock_token
  where user_id = p_user_id
    and locked_at < now() - interval '15 minutes'
  returning user_id into claimed_user;

  return claimed_user is not null;
end;
$$;

create function public.refresh_scheduler_lock(p_user_id uuid, p_lock_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  update public.scheduler_user_locks
  set locked_at = now()
  where user_id = p_user_id and lock_token = p_lock_token;
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

create function public.release_scheduler_lock(p_user_id uuid, p_lock_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.scheduler_user_locks
  where user_id = p_user_id and lock_token = p_lock_token;
$$;

revoke all on function public.try_claim_scheduler_lock(uuid, text) from public, anon, authenticated;
revoke all on function public.refresh_scheduler_lock(uuid, text) from public, anon, authenticated;
revoke all on function public.release_scheduler_lock(uuid, text) from public, anon, authenticated;
revoke all on function public.queue_task_scheduler() from public, anon, authenticated;
revoke all on function public.queue_preferences_scheduler() from public, anon, authenticated;
revoke all on function public.capture_task_schedule_cleanup() from public, anon, authenticated;
grant execute on function public.try_claim_scheduler_lock(uuid, text) to service_role;
grant execute on function public.refresh_scheduler_lock(uuid, text) to service_role;
grant execute on function public.release_scheduler_lock(uuid, text) to service_role;
