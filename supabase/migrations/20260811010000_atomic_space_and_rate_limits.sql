-- Keep position assignment and per-user throttles safe when two tabs or two
-- calendar workers act at the same time.

create table if not exists public.user_operation_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  primary key (user_id, operation),
  constraint user_operation_rate_limits_operation_check check (length(operation) between 1 and 80),
  constraint user_operation_rate_limits_count_check check (request_count >= 0)
);

alter table public.user_operation_rate_limits enable row level security;
revoke all on public.user_operation_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.user_operation_rate_limits to service_role;

create or replace function public.consume_user_operation(
  p_user_id uuid,
  p_operation text,
  p_limit integer,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_window public.user_operation_rate_limits;
  now_value timestamptz := now();
begin
  if p_user_id is null or p_operation is null or length(p_operation) = 0 or p_limit < 1 or p_window_seconds < 1 then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_operation)::bigint);
  select * into current_window
  from public.user_operation_rate_limits
  where user_id = p_user_id and operation = p_operation
  for update;

  if not found or now_value >= current_window.window_started_at + make_interval(secs => p_window_seconds) then
    insert into public.user_operation_rate_limits (user_id, operation, window_started_at, request_count)
    values (p_user_id, p_operation, now_value, 1)
    on conflict (user_id, operation) do update set
      window_started_at = excluded.window_started_at,
      request_count = 1;
    return true;
  end if;

  if current_window.request_count >= p_limit then
    return false;
  end if;

  update public.user_operation_rate_limits
  set request_count = request_count + 1
  where user_id = p_user_id and operation = p_operation;
  return true;
end;
$$;

revoke all on function public.consume_user_operation(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_user_operation(uuid, text, integer, integer) to service_role;

create or replace function public.create_space_for_user(
  p_user_id uuid,
  p_calendar_id text,
  p_name text,
  p_calendar_name text,
  p_time_zone text
)
returns public.spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_space public.spaces;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':spaces')::bigint);
  insert into public.spaces (user_id, calendar_id, name, calendar_name, time_zone, position, status, archived_at)
  values (
    p_user_id,
    p_calendar_id,
    left(btrim(p_name), 120),
    left(btrim(p_calendar_name), 120),
    coalesce(nullif(btrim(p_time_zone), ''), 'UTC'),
    coalesce((select max(position) + 1 from public.spaces where user_id = p_user_id), 0),
    'active',
    null
  )
  on conflict (user_id, calendar_id) do update set updated_at = public.spaces.updated_at
  returning * into saved_space;
  return saved_space;
end;
$$;

revoke all on function public.create_space_for_user(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_space_for_user(uuid, text, text, text, text) to service_role;

create or replace function public.create_sub_space_for_user(
  p_user_id uuid,
  p_space_id uuid,
  p_name text
)
returns public.sub_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_sub_space public.sub_spaces;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_space_id::text || ':subspaces')::bigint);
  insert into public.sub_spaces (user_id, space_id, name, position, status, archived_at)
  values (
    p_user_id,
    p_space_id,
    left(btrim(p_name), 120),
    coalesce((select max(position) + 1 from public.sub_spaces where user_id = p_user_id and space_id = p_space_id), 0),
    'active',
    null
  )
  returning * into saved_sub_space;
  return saved_sub_space;
end;
$$;

revoke all on function public.create_sub_space_for_user(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_sub_space_for_user(uuid, uuid, text) to service_role;

-- Old rows are only useful for a short retry window. Keep this table bounded.
create or replace function public.purge_user_operation_rate_limits(p_age interval default interval '2 hours')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.user_operation_rate_limits where window_started_at < now() - p_age;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_user_operation_rate_limits(interval) from public, anon, authenticated;
grant execute on function public.purge_user_operation_rate_limits(interval) to service_role;
