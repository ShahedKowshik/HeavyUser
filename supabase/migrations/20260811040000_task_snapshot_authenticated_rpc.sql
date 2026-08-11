-- The browser owns the task-sync request, but it must only be able to save
-- the signed-in user's own snapshot. The function remains security-definer so
-- the whole delete/upsert/version update is one transaction.

drop policy if exists task_list_versions_select_own on public.task_list_versions;
create policy task_list_versions_select_own
  on public.task_list_versions
  for select
  to authenticated
  using (auth.uid() = user_id);

grant select on public.task_list_versions to authenticated;

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
  if auth.uid() is not null and auth.uid() is distinct from p_user_id then
    raise exception using errcode = '42501', message = 'The task account does not match the signed-in account.';
  end if;

  if p_tasks is null or jsonb_typeof(p_tasks) <> 'array' then
    raise exception using errcode = '22023', message = 'Task snapshot must be an array.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 44721));
  insert into public.task_list_versions (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select v.version, v.order_version into current_version, current_order_version
  from public.task_list_versions v where v.user_id = p_user_id for update;

  if current_version is distinct from coalesce(p_base_version, 0)
     or (p_order_changed and current_order_version is distinct from coalesce(p_base_order_version, 0)) then
    raise exception using
      errcode = '40001',
      message = 'The task list changed on another device.',
      detail = json_build_object('version', current_version, 'order_version', current_order_version)::text;
  end if;

  if coalesce(array_length(p_deleted_task_ids, 1), 0) > 0 then
    delete from public.tasks where user_id = p_user_id and id = any(p_deleted_task_ids);
  end if;

  insert into public.tasks as existing (
    id, user_id, title, space_id, sub_space_id, duration, start_date, deadline,
    priority, status, auto_schedule, min_block_minutes, max_block_minutes,
    calendar_visibility, calendar_transparency, position, updated_at
  )
  select incoming.id, p_user_id, incoming.title, incoming.space_id, incoming.sub_space_id,
    incoming.duration, incoming.start_date, incoming.deadline, incoming.priority, incoming.status,
    coalesce(incoming.auto_schedule, true), incoming.min_block_minutes, incoming.max_block_minutes,
    incoming.calendar_visibility, incoming.calendar_transparency, incoming.position, now()
  from jsonb_to_recordset(p_tasks) as incoming(
    id text, title text, space_id uuid, sub_space_id uuid, duration integer, start_date date,
    deadline date, priority text, status text, auto_schedule boolean, min_block_minutes integer,
    max_block_minutes integer, calendar_visibility text, calendar_transparency text, position integer
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
    position = case when p_order_changed then excluded.position else existing.position end,
    updated_at = now();

  next_version := current_version + 1;
  next_order_version := current_order_version + case when p_order_changed then 1 else 0 end;
  update public.task_list_versions set version = next_version, order_version = next_order_version, updated_at = now()
  where user_id = p_user_id;
  return query select next_version, next_order_version;
end;
$$;

revoke execute on function public.save_task_snapshot(uuid, jsonb, text[], bigint, bigint, boolean) from anon;
grant execute on function public.save_task_snapshot(uuid, jsonb, text[], bigint, bigint, boolean) to authenticated, service_role;
