
-- Event-based quantity recording with atomic totals and idempotent retries.
create table if not exists public.quantity_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null,
  local_date date not null,
  action text not null check (action in ('increment','decrement','set')),
  delta numeric(12,2),
  resulting_value numeric(12,2) not null check (resulting_value >= 0 and resulting_value <= 100000),
  created_at timestamptz not null default now(),
  foreign key (habit_id,user_id) references public.habits(id,user_id) on delete cascade
);
create index if not exists quantity_events_user_day on public.quantity_events(user_id,habit_id,local_date,created_at desc);
alter table public.quantity_events enable row level security;
create policy "User reads own quantity events" on public.quantity_events for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.quantity_events from anon;
revoke insert,update,delete on public.quantity_events from authenticated;
grant select on public.quantity_events to authenticated;

create or replace function public.record_quantity(
 p_habit_id uuid,
 p_action text,
 p_event_id uuid,
 p_date date default null,
 p_value numeric default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
 v_owner uuid := (select auth.uid());
 v_habit public.habits%rowtype;
 v_day date := coalesce(p_date,(now() at time zone 'Asia/Dhaka')::date);
 v_today date := (now() at time zone 'Asia/Dhaka')::date;
 v_old numeric(12,2);
 v_next numeric(12,2);
 v_prior public.quantity_events%rowtype;
begin
 if v_owner is null then raise exception 'Sign in required' using errcode='28000'; end if;
 if p_event_id is null or p_habit_id is null then raise exception 'Missing operation identifier' using errcode='22023'; end if;
 if p_action not in ('increment','decrement','set') or p_action is null then raise exception 'Invalid quantity action' using errcode='22023'; end if;
 select * into v_habit from public.habits
 where id=p_habit_id and user_id=v_owner and kind='quantity' and archived_at is null
 for update;
 if not found then raise exception 'Quantity habit not found' using errcode='P0002'; end if;
 if v_day < v_habit.start_date or v_day > v_today then
   raise exception 'Cannot record quantity for this date' using errcode='22023';
 end if;
 if p_action in ('increment','decrement') and v_day<>v_today then
   raise exception 'One-tap actions only apply to today' using errcode='22023';
 end if;
 select * into v_prior from public.quantity_events where id=p_event_id;
 if found then
   if v_prior.user_id<>v_owner or v_prior.habit_id<>p_habit_id or v_prior.local_date<>v_day or v_prior.action<>p_action then
     raise exception 'Operation identifier already used' using errcode='23505';
   end if;
   select coalesce(value,0) into v_next from public.habit_entries where habit_id=p_habit_id and local_date=v_day and user_id=v_owner;
   return jsonb_build_object('habit_id',p_habit_id,'date',v_day,'value',coalesce(v_next,0),'event_id',p_event_id,'confirmed',true,'duplicate',true);
 end if;
 select value into v_old from public.habit_entries where habit_id=p_habit_id and local_date=v_day and user_id=v_owner for update;
 v_old := coalesce(v_old,0);
 if p_action='increment' then
   v_next := v_old+1;
 elsif p_action='decrement' then
   v_next := v_old-1;
 else
   if p_value is null or p_value<>round(p_value,2) then raise exception 'Enter a valid value with at most two decimal places' using errcode='22023'; end if;
   v_next := p_value;
 end if;
 if v_next<0 or v_next>100000 then raise exception 'Quantity must remain between 0 and 100000' using errcode='22023'; end if;
 insert into public.habit_entries (habit_id,user_id,local_date,value,confirmed,target_snapshot,direction_snapshot)
 values (p_habit_id,v_owner,v_day,v_next,true,v_habit.target,v_habit.direction)
 on conflict (habit_id,local_date) do update
 set value=excluded.value,confirmed=true,updated_at=now();
 insert into public.quantity_events(id,user_id,habit_id,local_date,action,delta,resulting_value)
 values (p_event_id,v_owner,p_habit_id,v_day,p_action,
   case when p_action='set' then null when p_action='increment' then 1 else -1 end,v_next);
 return jsonb_build_object('habit_id',p_habit_id,'date',v_day,'value',v_next,'event_id',p_event_id,'confirmed',true,'duplicate',false);
end;
$$;
revoke all on function public.record_quantity(uuid,text,uuid,date,numeric) from public,anon;
grant execute on function public.record_quantity(uuid,text,uuid,date,numeric) to authenticated;
