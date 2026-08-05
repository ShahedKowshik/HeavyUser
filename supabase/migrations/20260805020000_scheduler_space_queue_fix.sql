-- Preserve the existing priority-replan behavior while also treating Space
-- and Sub-space changes as scheduling changes.
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

  if TG_OP = 'UPDATE'
    and old.user_id is not distinct from new.user_id
    and old.title is not distinct from new.title
    and old.duration is not distinct from new.duration
    and old.start_date is not distinct from new.start_date
    and old.deadline is not distinct from new.deadline
    and old.priority is not distinct from new.priority
    and old.status is not distinct from new.status
    and old.position is not distinct from new.position
    and old.auto_schedule is not distinct from new.auto_schedule
    and old.min_block_minutes is not distinct from new.min_block_minutes
    and old.max_block_minutes is not distinct from new.max_block_minutes
    and old.calendar_visibility is not distinct from new.calendar_visibility
    and old.calendar_transparency is not distinct from new.calendar_transparency
    and old.space_id is not distinct from new.space_id
    and old.sub_space_id is not distinct from new.sub_space_id
  then
    return new;
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

revoke all on function public.queue_task_scheduler() from public, anon, authenticated;
grant execute on function public.queue_task_scheduler() to service_role;
