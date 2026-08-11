-- Keep the timer status endpoint independent from the size of the work-session
-- history. The snapshot only needs durable totals plus a small recent window.
create table if not exists public.task_work_totals (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null,
  worked_seconds bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, task_id),
  constraint task_work_totals_seconds_check check (worked_seconds >= 0)
);

alter table public.task_work_totals enable row level security;
revoke all on public.task_work_totals from anon, authenticated;

create or replace function public.refresh_task_work_total(p_user_id uuid, p_task_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.task_work_totals
  where user_id = p_user_id and task_id = p_task_id;

  insert into public.task_work_totals (user_id, task_id, worked_seconds, updated_at)
  select s.user_id, s.task_id, coalesce(sum(s.worked_seconds), 0), now()
  from public.task_work_sessions s
  where s.user_id = p_user_id
    and s.task_id = p_task_id
    and s.state in ('paused', 'stopped')
  group by s.user_id, s.task_id;
end;
$$;

create or replace function public.sync_task_work_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE'
    or (TG_OP = 'UPDATE'
      and (old.user_id is distinct from new.user_id or old.task_id is distinct from new.task_id)) then
    perform public.refresh_task_work_total(old.user_id, old.task_id);
  end if;

  if TG_OP <> 'DELETE' then
    perform public.refresh_task_work_total(new.user_id, new.task_id);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists task_work_sessions_sync_total on public.task_work_sessions;
create trigger task_work_sessions_sync_total
after insert or update or delete on public.task_work_sessions
for each row execute function public.sync_task_work_total();

insert into public.task_work_totals (user_id, task_id, worked_seconds, updated_at)
select user_id, task_id, sum(worked_seconds), now()
from public.task_work_sessions
where state in ('paused', 'stopped')
group by user_id, task_id
on conflict (user_id, task_id) do update set
  worked_seconds = excluded.worked_seconds,
  updated_at = excluded.updated_at;

create or replace function public.get_task_work_totals(p_user_id uuid)
returns table(task_id text, worked_seconds bigint)
language sql
stable
security definer
set search_path = public
as $$
  select task_id, worked_seconds
  from public.task_work_totals
  where user_id = p_user_id;
$$;

create or replace function public.get_recent_task_work_sessions(p_user_id uuid, p_limit integer default 8)
returns setof public.task_work_sessions
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select
      s.*,
      row_number() over (partition by s.task_id order by s.started_at desc, s.id desc) as row_number
    from public.task_work_sessions s
    where s.user_id = p_user_id
  )
  select
    id,
    user_id,
    task_id,
    space_id,
    calendar_id,
    block_id,
    provider_event_id,
    provider_event_key,
    source,
    state,
    started_at,
    stopped_at,
    original_started_at,
    original_stopped_at,
    planned_start_at,
    planned_end_at,
    worked_seconds,
    estimated_minutes_at_start,
    calendar_sync_state,
    repair_needed,
    warning,
    created_at,
    updated_at
  from ranked
  where row_number <= greatest(1, least(coalesce(p_limit, 8), 50))
  order by started_at desc, id desc;
$$;

revoke all on function public.refresh_task_work_total(uuid, text) from public, anon, authenticated;
revoke all on function public.sync_task_work_total() from public, anon, authenticated;
revoke all on function public.get_task_work_totals(uuid) from public, anon, authenticated;
revoke all on function public.get_recent_task_work_sessions(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_task_work_totals(uuid) to service_role;
grant execute on function public.get_recent_task_work_sessions(uuid, integer) to service_role;
