-- Live work is a separate source of truth from planned calendar time.
-- The browser never writes these rows directly; timer routes use service_role
-- after authenticating the current user.

alter table public.tasks
  alter column auto_schedule set default true;

update public.tasks
set auto_schedule = true
where auto_schedule is distinct from true;

update public.task_scheduling_preferences
set enabled = true
where enabled is distinct from true;

alter table public.task_schedule_blocks
  drop constraint if exists task_schedule_blocks_state_check;

alter table public.task_schedule_blocks
  add constraint task_schedule_blocks_state_check check (
    state in ('flexible', 'locked', 'replaced', 'cancelled', 'missed')
  );

alter table public.task_schedule_status
  add column if not exists worked_minutes integer not null default 0,
  add column if not exists remaining_minutes integer not null default 0,
  add column if not exists active_session_id uuid,
  add column if not exists missed_minutes integer not null default 0;

alter table public.task_schedule_status
  drop constraint if exists task_schedule_status_minutes_check;

alter table public.task_schedule_status
  add constraint task_schedule_status_minutes_check check (
    scheduled_minutes >= 0
    and missing_minutes >= 0
    and worked_minutes >= 0
    and remaining_minutes >= 0
    and missed_minutes >= 0
  );

create table if not exists public.task_work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  task_id text not null,
  space_id uuid,
  calendar_id text,
  block_id text,
  provider_event_id text,
  provider_event_key text,
  source text not null default 'timer',
  state text not null default 'running',
  started_at timestamptz not null,
  stopped_at timestamptz,
  original_started_at timestamptz not null,
  original_stopped_at timestamptz,
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  worked_seconds bigint not null default 0,
  estimated_minutes_at_start integer,
  calendar_sync_state text not null default 'synced',
  repair_needed boolean not null default false,
  warning text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_work_sessions_source_check check (source in ('timer', 'manual')),
  constraint task_work_sessions_state_check check (state in ('running', 'paused', 'stopped', 'cancelled')),
  constraint task_work_sessions_sync_check check (calendar_sync_state in ('synced', 'pending', 'error', 'history_only')),
  constraint task_work_sessions_range_check check (stopped_at is null or stopped_at > started_at),
  constraint task_work_sessions_original_range_check check (original_stopped_at is null or original_stopped_at > original_started_at),
  constraint task_work_sessions_seconds_check check (worked_seconds >= 0),
  constraint task_work_sessions_task_fk foreign key (user_id, task_id)
    references public.tasks(user_id, id) on delete cascade,
  constraint task_work_sessions_space_fk foreign key (user_id, space_id)
    references public.spaces(user_id, id) on delete set null,
  constraint task_work_sessions_block_fk foreign key (user_id, block_id)
    references public.task_schedule_blocks(user_id, id) on delete set null
);

create unique index if not exists task_work_sessions_user_id_id_idx
  on public.task_work_sessions (user_id, id);

alter table public.task_schedule_blocks
  add column if not exists work_session_id uuid;

alter table public.task_schedule_blocks
  drop constraint if exists task_schedule_blocks_work_session_fk;

alter table public.task_schedule_blocks
  add constraint task_schedule_blocks_work_session_fk foreign key (user_id, work_session_id)
    references public.task_work_sessions(user_id, id) on delete set null;

create index if not exists task_schedule_blocks_work_session_idx
  on public.task_schedule_blocks (user_id, work_session_id)
  where work_session_id is not null;

create unique index if not exists task_work_sessions_one_running_idx
  on public.task_work_sessions (user_id)
  where state = 'running';

create index if not exists task_work_sessions_task_idx
  on public.task_work_sessions (user_id, task_id, started_at desc);

create index if not exists task_work_sessions_repair_idx
  on public.task_work_sessions (user_id, repair_needed, updated_at);

create table if not exists public.task_active_session_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id uuid not null unique references public.task_work_sessions(id) on delete cascade,
  task_id text not null,
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_active_session_owner_task_fk foreign key (user_id, task_id)
    references public.tasks(user_id, id) on delete cascade
);

create table if not exists public.task_work_session_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_id uuid not null references public.task_work_sessions(id) on delete cascade,
  old_started_at timestamptz not null,
  old_stopped_at timestamptz,
  new_started_at timestamptz not null,
  new_stopped_at timestamptz,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint task_work_session_revisions_user_fk foreign key (user_id) references auth.users(id) on delete cascade,
  constraint task_work_session_revisions_range_check check (new_stopped_at is null or new_stopped_at > new_started_at)
);

create index if not exists task_work_session_revisions_session_idx
  on public.task_work_session_revisions (user_id, session_id, created_at desc);

create table if not exists public.task_calendar_repairs (
  id bigint generated by default as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.task_work_sessions(id) on delete cascade,
  block_id text,
  calendar_id text not null,
  provider_event_id text,
  operation text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_calendar_repairs_operation_check check (operation in ('create', 'patch', 'delete', 'reconcile')),
  constraint task_calendar_repairs_status_check check (status in ('pending', 'repaired', 'error')),
  constraint task_calendar_repairs_attempts_check check (attempts between 0 and 20),
  constraint task_calendar_repairs_block_fk foreign key (user_id, block_id)
    references public.task_schedule_blocks(user_id, id) on delete set null
);

create index if not exists task_calendar_repairs_queue_idx
  on public.task_calendar_repairs (user_id, status, next_attempt_at);

alter table public.task_work_sessions enable row level security;
alter table public.task_active_session_owners enable row level security;
alter table public.task_work_session_revisions enable row level security;
alter table public.task_calendar_repairs enable row level security;

revoke all on public.task_work_sessions from anon, authenticated;
revoke all on public.task_active_session_owners from anon, authenticated;
revoke all on public.task_work_session_revisions from anon, authenticated;
revoke all on public.task_calendar_repairs from anon, authenticated;
grant select, insert, update, delete on public.task_work_sessions to service_role;
grant select, insert, update, delete on public.task_active_session_owners to service_role;
grant select, insert, update, delete on public.task_work_session_revisions to service_role;
grant select, insert, update, delete on public.task_calendar_repairs to service_role;
grant usage, select on sequence public.task_calendar_repairs_id_seq to service_role;

grant select, insert, update, delete on public.task_schedule_status to service_role;

-- Existing scheduler clients may still send the old field for a short period.
-- The product is now always-on, so this trigger keeps the durable flag true.
create or replace function public.keep_heavyuser_scheduling_on()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.enabled := true;
  return new;
end;
$$;

drop trigger if exists keep_heavyuser_scheduling_on_trigger on public.task_scheduling_preferences;
create trigger keep_heavyuser_scheduling_on_trigger
before insert or update of enabled on public.task_scheduling_preferences
for each row execute function public.keep_heavyuser_scheduling_on();

create or replace function public.keep_task_scheduling_on()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.auto_schedule := true;
  return new;
end;
$$;

drop trigger if exists keep_task_scheduling_on_trigger on public.tasks;
create trigger keep_task_scheduling_on_trigger
before insert or update of auto_schedule on public.tasks
for each row execute function public.keep_task_scheduling_on();

revoke all on function public.keep_heavyuser_scheduling_on() from public, anon, authenticated;
revoke all on function public.keep_task_scheduling_on() from public, anon, authenticated;
grant execute on function public.keep_heavyuser_scheduling_on() to service_role;
grant execute on function public.keep_task_scheduling_on() to service_role;
