create table if not exists public.scheduler_user_locks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  locked_at timestamptz not null default now()
);

alter table public.scheduler_user_locks enable row level security;
revoke all on public.scheduler_user_locks from authenticated;

create or replace function public.try_claim_scheduler_lock(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
  claimed_user uuid;
begin
  insert into public.scheduler_user_locks (user_id, locked_at)
  values (p_user_id, now())
  on conflict (user_id) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 1 then
    return true;
  end if;

  update public.scheduler_user_locks
  set locked_at = now()
  where user_id = p_user_id
    and locked_at < now() - interval '10 minutes'
  returning user_id into claimed_user;

  return claimed_user is not null;
end;
$$;

create or replace function public.release_scheduler_lock(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.scheduler_user_locks where user_id = p_user_id;
$$;

revoke all on function public.try_claim_scheduler_lock(uuid) from public, authenticated;
revoke all on function public.release_scheduler_lock(uuid) from public, authenticated;
grant execute on function public.try_claim_scheduler_lock(uuid) to service_role;
grant execute on function public.release_scheduler_lock(uuid) to service_role;
