-- The same task/time range can have only one live HeavyUser block. Replaced
-- history stays available for repair/audit without participating in this
-- invariant.
create unique index if not exists task_schedule_blocks_active_range_idx
  on public.task_schedule_blocks (user_id, task_id, start_at, end_at)
  where state in ('flexible', 'locked');

-- Browser task persistence uses upsert, which can issue an UPDATE even when
-- none of the scheduling fields changed. Do not turn those no-op writes into
-- a new scheduler run.
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

-- Priority changes are the only task update that requires unlocking future
-- blocks for a full rebuild. Keep that signal while ignoring no-op updates.
create or replace function public.queue_preferences_scheduler()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE'
    and old.enabled is not distinct from new.enabled
    and old.timezone is not distinct from new.timezone
    and old.work_windows is not distinct from new.work_windows
    and old.default_min_block_minutes is not distinct from new.default_min_block_minutes
    and old.default_max_block_minutes is not distinct from new.default_max_block_minutes
    and old.default_calendar_visibility is not distinct from new.default_calendar_visibility
    and old.default_calendar_transparency is not distinct from new.default_calendar_transparency
  then
    return new;
  end if;

  insert into public.scheduler_queue (user_id, reason, requested_at, run_after, attempts, locked_at, last_error, force_replan, updated_at)
  values (new.user_id, 'settings', now(), now(), 0, null, null, true, now())
  on conflict (user_id) do update set
    reason = excluded.reason,
    requested_at = excluded.requested_at,
    run_after = least(public.scheduler_queue.run_after, excluded.run_after),
    attempts = 0,
    locked_at = null,
    last_error = null,
    force_replan = true,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

revoke all on function public.queue_task_scheduler() from public, anon, authenticated;
revoke all on function public.queue_preferences_scheduler() from public, anon, authenticated;
grant execute on function public.queue_task_scheduler() to service_role;
grant execute on function public.queue_preferences_scheduler() to service_role;
