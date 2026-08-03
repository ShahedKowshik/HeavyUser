alter table public.scheduler_queue
  add column if not exists force_replan boolean not null default false;

create or replace function public.queue_task_scheduler()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  priority_changed boolean := false;
begin
  if TG_OP = 'DELETE' then
    owner_id := old.user_id;
  else
    owner_id := new.user_id;
  end if;

  if TG_OP = 'UPDATE' then
    priority_changed := old.priority is distinct from new.priority;
  end if;

  insert into public.scheduler_queue (
    user_id,
    reason,
    requested_at,
    run_after,
    attempts,
    locked_at,
    last_error,
    force_replan,
    updated_at
  )
  values (owner_id, TG_OP || '_task', now(), now(), 0, null, null, priority_changed, now())
  on conflict (user_id) do update set
    reason = excluded.reason,
    requested_at = excluded.requested_at,
    run_after = least(public.scheduler_queue.run_after, excluded.run_after),
    attempts = 0,
    locked_at = null,
    last_error = null,
    force_replan = public.scheduler_queue.force_replan or excluded.force_replan,
    updated_at = excluded.updated_at;

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
