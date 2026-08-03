alter table public.tasks
  add column if not exists auto_schedule boolean not null default true,
  add column if not exists min_block_minutes integer,
  add column if not exists max_block_minutes integer,
  add column if not exists calendar_visibility text,
  add column if not exists calendar_transparency text;

alter table public.google_calendar_events
  add column if not exists visibility text,
  add column if not exists transparency text,
  add column if not exists private_properties jsonb;

alter table public.tasks
  drop constraint if exists tasks_min_block_minutes_check,
  drop constraint if exists tasks_max_block_minutes_check,
  drop constraint if exists tasks_block_order_check,
  drop constraint if exists tasks_calendar_visibility_check,
  drop constraint if exists tasks_calendar_transparency_check;

alter table public.tasks
  add constraint tasks_min_block_minutes_check check (min_block_minutes is null or min_block_minutes >= 5),
  add constraint tasks_max_block_minutes_check check (max_block_minutes is null or max_block_minutes >= 5),
  add constraint tasks_block_order_check check (
    min_block_minutes is null or max_block_minutes is null or min_block_minutes <= max_block_minutes
  ),
  add constraint tasks_calendar_visibility_check check (
    calendar_visibility is null or calendar_visibility in ('default', 'public', 'private')
  ),
  add constraint tasks_calendar_transparency_check check (
    calendar_transparency is null or calendar_transparency in ('default', 'opaque', 'transparent')
  );

create table if not exists public.task_scheduling_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  timezone text,
  work_windows jsonb not null default '{"0":[],"1":[{"start":"09:00","end":"17:00"}],"2":[{"start":"09:00","end":"17:00"}],"3":[{"start":"09:00","end":"17:00"}],"4":[{"start":"09:00","end":"17:00"}],"5":[{"start":"09:00","end":"17:00"}],"6":[]}',
  default_min_block_minutes integer not null default 30,
  default_max_block_minutes integer not null default 90,
  default_calendar_visibility text not null default 'default',
  default_calendar_transparency text not null default 'default',
  updated_at timestamptz not null default now(),
  constraint task_scheduling_preferences_min_block_check check (default_min_block_minutes >= 5),
  constraint task_scheduling_preferences_max_block_check check (default_max_block_minutes >= default_min_block_minutes),
  constraint task_scheduling_preferences_visibility_check check (default_calendar_visibility in ('default', 'public', 'private')),
  constraint task_scheduling_preferences_transparency_check check (default_calendar_transparency in ('default', 'opaque', 'transparent'))
);

create table if not exists public.task_schedule_blocks (
  id text not null,
  user_id uuid not null,
  task_id text not null,
  calendar_id text not null,
  provider_event_id text,
  provider_event_key text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  planned_start_at timestamptz not null,
  planned_end_at timestamptz not null,
  state text not null default 'flexible',
  etag text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id),
  constraint task_schedule_blocks_state_check check (state in ('flexible', 'locked', 'replaced', 'cancelled')),
  constraint task_schedule_blocks_range_check check (end_at > start_at),
  constraint task_schedule_blocks_planned_range_check check (planned_end_at > planned_start_at),
  constraint task_schedule_blocks_task_fk foreign key (user_id, task_id)
    references public.tasks(user_id, id) on delete cascade
);

create unique index if not exists task_schedule_blocks_provider_idx
  on public.task_schedule_blocks (user_id, calendar_id, provider_event_id)
  where provider_event_id is not null;

create index if not exists task_schedule_blocks_task_idx
  on public.task_schedule_blocks (user_id, task_id, state, start_at);

create table if not exists public.task_schedule_status (
  user_id uuid not null,
  task_id text not null,
  state text not null,
  scheduled_minutes integer not null default 0,
  missing_minutes integer not null default 0,
  warning text,
  updated_at timestamptz not null default now(),
  primary key (user_id, task_id),
  constraint task_schedule_status_state_check check (
    state in ('scheduled', 'scheduling', 'needs_duration', 'at_risk', 'locked', 'awaiting_completion', 'paused', 'calendar_error')
  ),
  constraint task_schedule_status_minutes_check check (scheduled_minutes >= 0 and missing_minutes >= 0),
  constraint task_schedule_status_task_fk foreign key (user_id, task_id)
    references public.tasks(user_id, id) on delete cascade
);

create table if not exists public.scheduler_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null default 'change',
  requested_at timestamptz not null default now(),
  run_after timestamptz not null default now(),
  attempts integer not null default 0,
  locked_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create or replace function public.queue_task_scheduler()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.scheduler_queue (user_id, reason, requested_at, run_after, attempts, locked_at, last_error, updated_at)
  values (coalesce(new.user_id, old.user_id), TG_OP || '_task', now(), now(), 0, null, null, now())
  on conflict (user_id) do update set
    reason = excluded.reason,
    requested_at = excluded.requested_at,
    run_after = least(public.scheduler_queue.run_after, excluded.run_after),
    attempts = 0,
    locked_at = null,
    last_error = null,
    updated_at = excluded.updated_at;
  return coalesce(new, old);
end;
$$;

drop trigger if exists tasks_queue_scheduler on public.tasks;
create trigger tasks_queue_scheduler
after insert or update of title, duration, start_date, deadline, priority, status, position, auto_schedule, min_block_minutes, max_block_minutes, calendar_visibility, calendar_transparency or delete
on public.tasks
for each row execute function public.queue_task_scheduler();

create or replace function public.queue_preferences_scheduler()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.scheduler_queue (user_id, reason, requested_at, run_after, attempts, locked_at, last_error, updated_at)
  values (new.user_id, 'settings', now(), now(), 0, null, null, now())
  on conflict (user_id) do update set
    reason = excluded.reason,
    requested_at = excluded.requested_at,
    run_after = least(public.scheduler_queue.run_after, excluded.run_after),
    attempts = 0,
    locked_at = null,
    last_error = null,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

drop trigger if exists scheduling_preferences_queue_scheduler on public.task_scheduling_preferences;
create trigger scheduling_preferences_queue_scheduler
after insert or update on public.task_scheduling_preferences
for each row execute function public.queue_preferences_scheduler();

alter table public.task_scheduling_preferences enable row level security;
alter table public.task_schedule_blocks enable row level security;
alter table public.task_schedule_status enable row level security;
alter table public.scheduler_queue enable row level security;

grant select, insert, update on public.task_scheduling_preferences to authenticated;
grant select on public.task_schedule_blocks to authenticated;
grant select on public.task_schedule_status to authenticated;
grant insert, update on public.scheduler_queue to authenticated;

drop policy if exists "Users can manage their scheduling preferences" on public.task_scheduling_preferences;
create policy "Users can manage their scheduling preferences"
on public.task_scheduling_preferences for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view their schedule blocks" on public.task_schedule_blocks;
create policy "Users can view their schedule blocks"
on public.task_schedule_blocks for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their schedule status" on public.task_schedule_status;
create policy "Users can view their schedule status"
on public.task_schedule_status for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.scheduler_queue from authenticated;

grant insert, update on public.scheduler_queue to authenticated;

drop policy if exists "Users can queue their own scheduling jobs" on public.scheduler_queue;
create policy "Users can queue their own scheduling jobs"
on public.scheduler_queue for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can refresh their own scheduling jobs" on public.scheduler_queue;
create policy "Users can refresh their own scheduling jobs"
on public.scheduler_queue for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant execute on function public.queue_task_scheduler() to authenticated;
grant execute on function public.queue_preferences_scheduler() to authenticated;
