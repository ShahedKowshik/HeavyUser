-- A Space is one writable Google Calendar. Sub-spaces are labels that share
-- their parent Space calendar.
create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_id text not null,
  name text not null,
  calendar_name text not null,
  time_zone text not null default 'UTC',
  status text not null default 'active' check (status in ('active', 'archived')),
  position integer not null default 0 check (position >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, calendar_id),
  constraint spaces_name_check check (length(btrim(name)) between 1 and 120),
  constraint spaces_archive_date_check check ((status = 'archived') = (archived_at is not null))
);

create index if not exists spaces_user_position_idx on public.spaces (user_id, position);

create table if not exists public.sub_spaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  position integer not null default 0 check (position >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, space_id, id),
  constraint sub_spaces_name_check check (length(btrim(name)) between 1 and 120),
  constraint sub_spaces_archive_date_check check ((status = 'archived') = (archived_at is not null)),
  constraint sub_spaces_space_fk foreign key (user_id, space_id)
    references public.spaces(user_id, id) on delete cascade
);

create unique index if not exists sub_spaces_name_idx
  on public.sub_spaces (user_id, space_id, lower(name));

alter table public.tasks
  add column if not exists space_id uuid,
  add column if not exists sub_space_id uuid;

alter table public.tasks
  drop constraint if exists tasks_space_fk,
  drop constraint if exists tasks_sub_space_fk,
  drop constraint if exists tasks_sub_space_requires_space;

alter table public.tasks
  add constraint tasks_space_fk foreign key (user_id, space_id)
    references public.spaces(user_id, id) on delete restrict,
  add constraint tasks_sub_space_fk foreign key (user_id, space_id, sub_space_id)
    references public.sub_spaces(user_id, space_id, id) on delete restrict,
  add constraint tasks_sub_space_requires_space check (sub_space_id is null or space_id is not null);

-- Existing tasks are assigned to the user's current calendar when one exists.
-- Tasks in an account that has never connected a calendar remain null and are
-- assigned safely when that account adds its first Space.
insert into public.spaces (user_id, calendar_id, name, calendar_name, time_zone, position)
select
  c.user_id,
  c.selected_calendar_id,
  left(coalesce(nullif(btrim(c.selected_calendar_name), ''), c.selected_calendar_id), 120),
  left(coalesce(nullif(btrim(c.selected_calendar_name), ''), c.selected_calendar_id), 120),
  coalesce(nullif(c.selected_calendar_timezone, ''), 'UTC'),
  0
from public.google_calendar_connections c
where c.selected_calendar_id is not null
on conflict (user_id, calendar_id) do nothing;

update public.tasks t
set space_id = s.id
from public.spaces s
join public.google_calendar_connections c
  on c.user_id = s.user_id and c.selected_calendar_id = s.calendar_id
where t.user_id = s.user_id and t.space_id is null;

alter table public.task_schedule_blocks
  add column if not exists space_id uuid;

update public.task_schedule_blocks b
set space_id = t.space_id
from public.tasks t
where t.user_id = b.user_id and t.id = b.task_id and b.space_id is null;

alter table public.task_schedule_blocks
  drop constraint if exists task_schedule_blocks_space_fk;

alter table public.task_schedule_blocks
  add constraint task_schedule_blocks_space_fk foreign key (user_id, space_id)
    references public.spaces(user_id, id) on delete set null;

alter table public.google_calendar_events
  add column if not exists calendar_id text not null default '',
  add column if not exists space_id uuid;

update public.google_calendar_events e
set calendar_id = coalesce(c.selected_calendar_id, '')
from public.google_calendar_connections c
where c.user_id = e.user_id and e.calendar_id = '';

update public.google_calendar_events e
set space_id = s.id
from public.spaces s
where s.user_id = e.user_id and s.calendar_id = e.calendar_id and e.space_id is null;

alter table public.google_calendar_events
  drop constraint if exists google_calendar_events_pkey;

alter table public.google_calendar_events
  add constraint google_calendar_events_pkey primary key (user_id, calendar_id, event_key),
  drop constraint if exists google_calendar_events_space_fk;

alter table public.google_calendar_events
  add constraint google_calendar_events_space_fk foreign key (user_id, space_id)
    references public.spaces(user_id, id) on delete set null;

alter table public.google_calendar_event_deletions
  add column if not exists calendar_id text not null default '';

update public.google_calendar_event_deletions d
set calendar_id = coalesce(c.selected_calendar_id, '')
from public.google_calendar_connections c
where c.user_id = d.user_id and d.calendar_id = '';

alter table public.google_calendar_event_deletions
  drop constraint if exists google_calendar_event_deletions_pkey;

alter table public.google_calendar_event_deletions
  add constraint google_calendar_event_deletions_pkey primary key (user_id, calendar_id, event_key);

alter table public.google_calendar_sync_states
  add column if not exists calendar_id text not null default '';

update public.google_calendar_sync_states s
set calendar_id = coalesce(c.selected_calendar_id, '')
from public.google_calendar_connections c
where c.user_id = s.user_id and s.calendar_id = '';

alter table public.google_calendar_sync_states
  drop constraint if exists google_calendar_sync_states_pkey;

alter table public.google_calendar_sync_states
  add constraint google_calendar_sync_states_pkey primary key (user_id, calendar_id);

alter table public.tasks
  drop constraint if exists tasks_space_subspace_update_check;

-- Space changes and calendar changes are scheduling changes too.
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
    force_replan = public.scheduler_queue.force_replan,
    updated_at = excluded.updated_at;
  return coalesce(new, old);
end;
$$;

drop trigger if exists tasks_queue_scheduler on public.tasks;
create trigger tasks_queue_scheduler
after insert or update of title, duration, start_date, deadline, priority, status, position,
  auto_schedule, min_block_minutes, max_block_minutes, calendar_visibility,
  calendar_transparency, space_id, sub_space_id or delete
on public.tasks
for each row execute function public.queue_task_scheduler();

alter table public.spaces enable row level security;
alter table public.sub_spaces enable row level security;

grant select, insert, update, delete on public.spaces to authenticated;
grant select, insert, update, delete on public.sub_spaces to authenticated;

drop policy if exists "Users can manage their own spaces" on public.spaces;
create policy "Users can manage their own spaces"
on public.spaces for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own sub-spaces" on public.sub_spaces;
create policy "Users can manage their own sub-spaces"
on public.sub_spaces for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on public.spaces from anon;
revoke all on public.sub_spaces from anon;
grant select, insert, update, delete on public.spaces to service_role;
grant select, insert, update, delete on public.sub_spaces to service_role;
