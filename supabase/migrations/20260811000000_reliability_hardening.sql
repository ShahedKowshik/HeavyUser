-- Reliability hardening for timer state, task snapshots, and provider sync.
-- Provider calls still happen outside PostgreSQL transactions; these functions
-- make every local state transition atomic and idempotent.

create table if not exists public.task_list_versions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 0,
  order_version bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint task_list_versions_version_check check (version >= 0 and order_version >= 0)
);

alter table public.task_list_versions enable row level security;
revoke all on public.task_list_versions from anon, authenticated;
grant select, insert, update, delete on public.task_list_versions to service_role;

insert into public.task_list_versions (user_id, version, order_version)
select distinct user_id, 0, 0
from public.tasks
on conflict (user_id) do nothing;

create or replace function public.save_task_snapshot(
  p_user_id uuid,
  p_tasks jsonb,
  p_deleted_task_ids text[] default '{}',
  p_base_version bigint default 0,
  p_base_order_version bigint default 0,
  p_order_changed boolean default true
)
returns table(version bigint, order_version bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_version bigint;
  current_order_version bigint;
  next_version bigint;
  next_order_version bigint;
begin
  if p_tasks is null or jsonb_typeof(p_tasks) <> 'array' then
    raise exception using errcode = '22023', message = 'Task snapshot must be an array.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 44721));

  insert into public.task_list_versions (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select v.version, v.order_version
    into current_version, current_order_version
  from public.task_list_versions v
  where v.user_id = p_user_id
  for update;

  if current_version is distinct from coalesce(p_base_version, 0)
     or (p_order_changed and current_order_version is distinct from coalesce(p_base_order_version, 0)) then
    raise exception using
      errcode = '40001',
      message = 'The task list changed on another device.',
      detail = json_build_object(
        'version', current_version,
        'order_version', current_order_version
      )::text;
  end if;

  if coalesce(array_length(p_deleted_task_ids, 1), 0) > 0 then
    delete from public.tasks
    where user_id = p_user_id
      and id = any(p_deleted_task_ids);
  end if;

  insert into public.tasks (
    id, user_id, title, space_id, sub_space_id, duration, start_date, deadline,
    priority, status, auto_schedule, min_block_minutes, max_block_minutes,
    calendar_visibility, calendar_transparency, position, updated_at
  )
  select
    incoming.id,
    p_user_id,
    incoming.title,
    incoming.space_id,
    incoming.sub_space_id,
    incoming.duration,
    incoming.start_date,
    incoming.deadline,
    incoming.priority,
    incoming.status,
    coalesce(incoming.auto_schedule, true),
    incoming.min_block_minutes,
    incoming.max_block_minutes,
    incoming.calendar_visibility,
    incoming.calendar_transparency,
    incoming.position,
    now()
  from jsonb_to_recordset(p_tasks) as incoming(
    id text,
    title text,
    space_id uuid,
    sub_space_id uuid,
    duration integer,
    start_date date,
    deadline date,
    priority text,
    status text,
    auto_schedule boolean,
    min_block_minutes integer,
    max_block_minutes integer,
    calendar_visibility text,
    calendar_transparency text,
    position integer
  )
  on conflict (user_id, id) do update set
    title = excluded.title,
    space_id = excluded.space_id,
    sub_space_id = excluded.sub_space_id,
    duration = excluded.duration,
    start_date = excluded.start_date,
    deadline = excluded.deadline,
    priority = excluded.priority,
    status = excluded.status,
    auto_schedule = excluded.auto_schedule,
    min_block_minutes = excluded.min_block_minutes,
    max_block_minutes = excluded.max_block_minutes,
    calendar_visibility = excluded.calendar_visibility,
    calendar_transparency = excluded.calendar_transparency,
    position = excluded.position,
    updated_at = now();

  next_version := current_version + 1;
  next_order_version := current_order_version + case when p_order_changed then 1 else 0 end;
  update public.task_list_versions
  set version = next_version,
      order_version = next_order_version,
      updated_at = now()
  where user_id = p_user_id;

  return query select next_version, next_order_version;
end;
$$;

revoke all on function public.save_task_snapshot(uuid, jsonb, text[], bigint, bigint, boolean) from public, anon, authenticated;
grant execute on function public.save_task_snapshot(uuid, jsonb, text[], bigint, bigint, boolean) to service_role;

create or replace function public.start_task_timer(
  p_user_id uuid,
  p_session_id uuid,
  p_task_id text,
  p_space_id uuid,
  p_calendar_id text,
  p_block_id text,
  p_provider_event_id text,
  p_provider_event_key text,
  p_started_at timestamptz,
  p_end_at timestamptz,
  p_estimated_minutes integer,
  p_sync_version integer default 1,
  p_etag text default null
)
returns public.task_work_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_running uuid;
  saved_session public.task_work_sessions;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 44722));

  select id into existing_running
  from public.task_work_sessions
  where user_id = p_user_id and state = 'running'
  for update;

  if existing_running is not null and existing_running <> p_session_id then
    raise exception using errcode = '23505', message = 'A timer is already running for this workspace.';
  end if;

  insert into public.task_schedule_blocks (
    id, user_id, task_id, space_id, calendar_id, provider_event_id,
    provider_event_key, start_at, end_at, planned_start_at, planned_end_at,
    state, sync_version, etag, last_error, work_session_id, updated_at
  ) values (
    p_block_id, p_user_id, p_task_id, p_space_id, p_calendar_id, p_provider_event_id,
    p_provider_event_key, p_started_at, p_end_at, p_started_at, p_end_at,
    'locked', p_sync_version, p_etag, null, p_session_id, now()
  )
  on conflict (user_id, id) do update set
    task_id = excluded.task_id,
    space_id = excluded.space_id,
    calendar_id = excluded.calendar_id,
    provider_event_id = excluded.provider_event_id,
    provider_event_key = excluded.provider_event_key,
    start_at = excluded.start_at,
    end_at = excluded.end_at,
    planned_start_at = excluded.planned_start_at,
    planned_end_at = excluded.planned_end_at,
    state = 'locked',
    sync_version = excluded.sync_version,
    etag = excluded.etag,
    last_error = null,
    work_session_id = excluded.work_session_id,
    updated_at = now();

  insert into public.task_work_sessions (
    id, user_id, task_id, space_id, calendar_id, block_id,
    provider_event_id, provider_event_key, source, state, started_at,
    original_started_at, planned_start_at, planned_end_at, worked_seconds,
    estimated_minutes_at_start, calendar_sync_state, repair_needed, warning, updated_at
  ) values (
    p_session_id, p_user_id, p_task_id, p_space_id, p_calendar_id, p_block_id,
    p_provider_event_id, p_provider_event_key, 'timer', 'running', p_started_at,
    p_started_at, p_started_at, p_end_at, 0, p_estimated_minutes, 'synced', false, null, now()
  )
  on conflict (id) do update set
    task_id = excluded.task_id,
    space_id = excluded.space_id,
    calendar_id = excluded.calendar_id,
    block_id = excluded.block_id,
    provider_event_id = excluded.provider_event_id,
    provider_event_key = excluded.provider_event_key,
    state = 'running',
    started_at = excluded.started_at,
    planned_start_at = excluded.planned_start_at,
    planned_end_at = excluded.planned_end_at,
    calendar_sync_state = 'synced',
    repair_needed = false,
    warning = null,
    updated_at = now()
  returning * into saved_session;

  insert into public.task_active_session_owners (user_id, session_id, task_id, claimed_at, updated_at)
  values (p_user_id, p_session_id, p_task_id, now(), now())
  on conflict (user_id) do update set
    session_id = excluded.session_id,
    task_id = excluded.task_id,
    claimed_at = excluded.claimed_at,
    updated_at = excluded.updated_at;

  return saved_session;
end;
$$;

revoke all on function public.start_task_timer(uuid, uuid, text, uuid, text, text, text, text, timestamptz, timestamptz, integer, integer, text) from public, anon, authenticated;
grant execute on function public.start_task_timer(uuid, uuid, text, uuid, text, text, text, text, timestamptz, timestamptz, integer, integer, text) to service_role;

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

create or replace function public.get_task_work_total(p_user_id uuid, p_task_id text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select worked_seconds
    from public.task_work_totals
    where user_id = p_user_id and task_id = p_task_id
  ), 0)::bigint;
$$;

revoke all on function public.get_task_work_total(uuid, text) from public, anon, authenticated;
grant execute on function public.get_task_work_total(uuid, text) to service_role;

delete from public.task_active_session_owners owner_row
where not exists (
  select 1 from public.task_work_sessions session_row
  where session_row.id = owner_row.session_id
    and session_row.user_id = owner_row.user_id
    and session_row.state = 'running'
);

create or replace function public.remove_non_running_timer_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.state <> 'running' then
    delete from public.task_active_session_owners
    where user_id = new.user_id and session_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists task_work_sessions_remove_non_running_owner on public.task_work_sessions;
create trigger task_work_sessions_remove_non_running_owner
after update of state on public.task_work_sessions
for each row execute function public.remove_non_running_timer_owner();

revoke all on function public.remove_non_running_timer_owner() from public, anon, authenticated;
grant execute on function public.remove_non_running_timer_owner() to service_role;

create or replace function public.reject_overlapping_manual_work()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source = 'manual' and new.state in ('paused', 'stopped') and new.stopped_at is not null
     and exists (
       select 1
       from public.task_work_sessions existing
       where existing.user_id = new.user_id
         and existing.id <> new.id
         and existing.state in ('paused', 'stopped')
         and existing.stopped_at is not null
         and tstzrange(existing.started_at, existing.stopped_at, '[)')
             && tstzrange(new.started_at, new.stopped_at, '[)')
     ) then
    raise exception using
      errcode = '23P01',
      message = 'This work range overlaps an existing work session.';
  end if;
  return new;
end;
$$;

drop trigger if exists task_work_sessions_reject_overlap on public.task_work_sessions;
create trigger task_work_sessions_reject_overlap
before insert or update of started_at, stopped_at, state, source on public.task_work_sessions
for each row execute function public.reject_overlapping_manual_work();

revoke all on function public.reject_overlapping_manual_work() from public, anon, authenticated;
grant execute on function public.reject_overlapping_manual_work() to service_role;

-- Keep totals correct without rescanning a user's entire history on every edit.
create or replace function public.sync_task_work_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE'
     or (TG_OP = 'UPDATE' and (
       old.user_id is distinct from new.user_id
       or old.task_id is distinct from new.task_id
       or old.state is distinct from new.state
       or old.worked_seconds is distinct from new.worked_seconds
     )) then
    if old.state in ('paused', 'stopped') then
      insert into public.task_work_totals (user_id, task_id, worked_seconds, updated_at)
      values (old.user_id, old.task_id, 0, now())
      on conflict (user_id, task_id) do nothing;
      update public.task_work_totals
      set worked_seconds = greatest(0, worked_seconds - old.worked_seconds), updated_at = now()
      where user_id = old.user_id and task_id = old.task_id;
    end if;
  end if;

  if TG_OP <> 'DELETE' and new.state in ('paused', 'stopped') then
    insert into public.task_work_totals (user_id, task_id, worked_seconds, updated_at)
    values (new.user_id, new.task_id, greatest(0, new.worked_seconds), now())
    on conflict (user_id, task_id) do update set
      worked_seconds = case
        when TG_OP = 'UPDATE'
          and old.state in ('paused', 'stopped')
          and old.user_id = new.user_id
          and old.task_id = new.task_id
          then greatest(0, public.task_work_totals.worked_seconds + new.worked_seconds - old.worked_seconds)
        else public.task_work_totals.worked_seconds + greatest(0, new.worked_seconds)
      end,
      updated_at = now();
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.get_recent_task_work_sessions(p_user_id uuid, p_limit integer default 8)
returns setof public.task_work_sessions
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from public.task_work_sessions s
  where s.user_id = p_user_id
  order by s.started_at desc, s.id desc
  limit greatest(1, least(coalesce(p_limit, 8) * 20, 500));
$$;

revoke all on function public.get_recent_task_work_sessions(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_recent_task_work_sessions(uuid, integer) to service_role;

create or replace function public.purge_timer_operation_receipts(p_retention interval default interval '90 days')
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  removed bigint;
begin
  delete from public.task_timer_operation_receipts
  where created_at < now() - greatest(p_retention, interval '1 day');
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_timer_operation_receipts(interval) from public, anon, authenticated;
grant execute on function public.purge_timer_operation_receipts(interval) to service_role;

alter table public.google_calendar_sync_states
  add column if not exists sync_window_start timestamptz,
  add column if not exists sync_window_end timestamptz,
  add column if not exists watch_generation bigint not null default 0;

alter table public.google_calendar_connections
  add column if not exists connection_generation bigint not null default 1;

-- Spaces are read through server APIs; direct browser writes bypass validation
-- and queue/reconciliation rules.
revoke insert, update, delete on public.spaces from authenticated;
revoke insert, update, delete on public.sub_spaces from authenticated;
grant select on public.spaces to authenticated;
grant select on public.sub_spaces to authenticated;
