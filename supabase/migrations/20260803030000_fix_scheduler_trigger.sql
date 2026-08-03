create or replace function public.queue_task_scheduler()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  if TG_OP = 'DELETE' then
    owner_id := old.user_id;
  else
    owner_id := new.user_id;
  end if;

  insert into public.scheduler_queue (user_id, reason, requested_at, run_after, attempts, locked_at, last_error, updated_at)
  values (owner_id, TG_OP || '_task', now(), now(), 0, null, null, now())
  on conflict (user_id) do update set
    reason = excluded.reason,
    requested_at = excluded.requested_at,
    run_after = least(public.scheduler_queue.run_after, excluded.run_after),
    attempts = 0,
    locked_at = null,
    last_error = null,
    updated_at = excluded.updated_at;

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
