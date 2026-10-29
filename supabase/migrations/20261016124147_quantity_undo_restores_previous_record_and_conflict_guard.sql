
alter table public.quantity_events add column if not exists entry_before jsonb;
alter table public.quantity_events add column if not exists entry_after jsonb;
alter table public.quantity_events add column if not exists has_before boolean;
alter table public.quantity_events add column if not exists requested_value numeric(12,2);

create or replace function public.record_quantity(
 p_habit_id uuid,p_action text,p_event_id uuid,p_date date default null,p_value numeric default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_owner uuid := (select auth.uid());
 v_habit public.habits%rowtype;
 v_day date:=coalesce(p_date,(now() at time zone 'Asia/Dhaka')::date);
 v_today date:=(now() at time zone 'Asia/Dhaka')::date;
 v_before jsonb;v_after jsonb;v_old numeric(12,2);v_new numeric(12,2);
 v_prior public.quantity_events%rowtype;
begin
 if v_owner is null then raise exception 'Sign in required' using errcode='28000';end if;
 if p_habit_id is null or p_event_id is null or p_action not in ('increment','decrement','set') or p_action is null then
  raise exception 'Invalid quantity operation' using errcode='22023';
 end if;
 if p_action='set' and (p_value is null or p_value<>round(p_value,2) or p_value<0 or p_value>100000) then
  raise exception 'Enter a quantity between 0 and 100000, at most two decimals' using errcode='22023';
 end if;
 select * into v_habit from public.habits
  where id=p_habit_id and user_id=v_owner and kind='quantity' and archived_at is null for update;
 if not found then raise exception 'Quantity habit unavailable' using errcode='P0002';end if;
 if v_day<v_habit.start_date or v_day>v_today then raise exception 'Date not allowed' using errcode='22023';end if;
 select * into v_prior from public.quantity_events where id=p_event_id;
 if found then
   if v_prior.user_id<>v_owner or v_prior.habit_id<>p_habit_id or v_prior.local_date<>v_day
      or v_prior.action<>p_action or (p_action='set' and v_prior.requested_value is distinct from p_value) then
     raise exception 'Operation ID reused with different contents' using errcode='23505';
   end if;
   select e.value into v_new from public.habit_entries e where e.habit_id=p_habit_id and e.local_date=v_day and e.user_id=v_owner;
   return jsonb_build_object('habit_id',p_habit_id,'date',v_day,'value',coalesce(v_new,0),
                             'event_id',p_event_id,'confirmed',true,'duplicate',true);
 end if;
 select to_jsonb(e) into v_before from public.habit_entries e
  where e.habit_id=p_habit_id and e.local_date=v_day and e.user_id=v_owner for update;
 v_old:=coalesce((v_before->>'value')::numeric,0);
 if p_action='increment' then v_new:=v_old+1;
 elsif p_action='decrement' then v_new:=v_old-1;
 else v_new:=p_value;
 end if;
 if v_new<0 or v_new>100000 then raise exception 'Quantity outside 0–100000' using errcode='22023';end if;
 insert into public.habit_entries(habit_id,user_id,local_date,value,confirmed,target_snapshot,direction_snapshot,explicit_status)
 values(p_habit_id,v_owner,v_day,v_new,true,v_habit.target,v_habit.direction,null)
 on conflict(habit_id,local_date) do update
  set value=excluded.value,confirmed=true,explicit_status=null,updated_at=now();
 select to_jsonb(e) into v_after from public.habit_entries e
  where e.habit_id=p_habit_id and e.local_date=v_day and e.user_id=v_owner;
 insert into public.quantity_events(id,user_id,habit_id,local_date,action,delta,
      resulting_value,value_before,has_before,entry_before,entry_after,requested_value)
 values(p_event_id,v_owner,p_habit_id,v_day,p_action,
        case when p_action='increment' then 1 when p_action='decrement' then -1 else null end,
        v_new,v_old,v_before is not null,v_before,v_after,case when p_action='set' then p_value else null end);
 return jsonb_build_object('habit_id',p_habit_id,'date',v_day,'value',v_new,
                           'event_id',p_event_id,'confirmed',true,'duplicate',false);
end $$;
revoke all on function public.record_quantity(uuid,text,uuid,date,numeric) from public,anon;
grant execute on function public.record_quantity(uuid,text,uuid,date,numeric) to authenticated;

create or replace function public.undo_quantity_event(p_event_id uuid,p_undo_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=(select auth.uid());v_target public.quantity_events%rowtype;
 v_latest uuid;v_row jsonb;v_restored jsonb;v_old numeric;v_new numeric;
begin
 if v_user is null then raise exception 'Sign in required' using errcode='28000';end if;
 if p_event_id is null or p_undo_id is null or p_event_id=p_undo_id then
  raise exception 'Invalid undo operation' using errcode='22023';end if;
 select * into v_target from public.quantity_events where id=p_event_id and user_id=v_user;
 if not found or v_target.action='undo' then raise exception 'Event unavailable' using errcode='P0002';end if;
 perform 1 from public.habits where id=v_target.habit_id and user_id=v_user and kind='quantity' and archived_at is null for update;
 if not found then raise exception 'Habit unavailable' using errcode='P0002';end if;
 if exists(select 1 from public.quantity_events where id=p_undo_id and undo_of=p_event_id and user_id=v_user) then
  select to_jsonb(e) into v_row from public.habit_entries e
   where e.habit_id=v_target.habit_id and e.user_id=v_user and e.local_date=v_target.local_date;
  return jsonb_build_object('habit_id',v_target.habit_id,'date',v_target.local_date,
    'value',coalesce((v_row->>'value')::numeric,0),'recorded',v_row is not null,'duplicate',true);
 end if;
 if exists(select 1 from public.quantity_events where undo_of=p_event_id) then
  raise exception 'Already undone' using errcode='22023';end if;
 select id into v_latest from public.quantity_events
  where habit_id=v_target.habit_id and user_id=v_user and local_date=v_target.local_date
  order by created_at desc,id desc limit 1;
 if v_latest is distinct from p_event_id then
  raise exception 'A newer count exists. Reload and try again' using errcode='22023';end if;
 select to_jsonb(e) into v_row from public.habit_entries e
  where e.habit_id=v_target.habit_id and e.user_id=v_user and e.local_date=v_target.local_date for update;
 if v_row is null or (v_row->>'value')::numeric is distinct from v_target.resulting_value then
  raise exception 'Count changed. Reload and try again' using errcode='22023';end if;
 if v_target.entry_after is not null and v_row is distinct from v_target.entry_after then
  raise exception 'Another edit changed this day. Reload and try again' using errcode='22023';end if;
 if v_target.has_before is false then
  delete from public.habit_entries where habit_id=v_target.habit_id and user_id=v_user and local_date=v_target.local_date;
 elsif v_target.has_before is true and v_target.entry_before is not null then
  update public.habit_entries e set
   value=(v_target.entry_before->>'value')::numeric,
   completed=(v_target.entry_before->>'completed')::boolean,
   confirmed=coalesce((v_target.entry_before->>'confirmed')::boolean,true),
   bed_at=(v_target.entry_before->>'bed_at')::timestamptz,
   asleep_at=(v_target.entry_before->>'asleep_at')::timestamptz,
   awake_at=(v_target.entry_before->>'awake_at')::timestamptz,
   out_of_bed_at=(v_target.entry_before->>'out_of_bed_at')::timestamptz,
   target_snapshot=(v_target.entry_before->>'target_snapshot')::numeric,
   direction_snapshot=v_target.entry_before->>'direction_snapshot',
   explicit_status=v_target.entry_before->>'explicit_status',
   updated_at=now()
   where e.habit_id=v_target.habit_id and e.user_id=v_user and e.local_date=v_target.local_date;
 else
  -- Historical events predate entry snapshots. Restore their known numeric value,
  -- but do not claim to reconstruct unknown historical status fields.
  update public.habit_entries set value=v_target.value_before,updated_at=now()
   where habit_id=v_target.habit_id and user_id=v_user and local_date=v_target.local_date;
 end if;
 select to_jsonb(e) into v_restored from public.habit_entries e
  where e.habit_id=v_target.habit_id and e.user_id=v_user and e.local_date=v_target.local_date;
 v_old:=(v_row->>'value')::numeric;v_new:=coalesce((v_restored->>'value')::numeric,0);
 insert into public.quantity_events(id,user_id,habit_id,local_date,action,delta,resulting_value,
           value_before,undo_of,has_before,entry_before,entry_after)
 values(p_undo_id,v_user,v_target.habit_id,v_target.local_date,'undo',v_new-v_old,
        v_new,v_old,p_event_id,v_row is not null,v_row,v_restored);
 return jsonb_build_object('habit_id',v_target.habit_id,'date',v_target.local_date,
   'value',v_new,'recorded',v_restored is not null,'duplicate',false);
end $$;
revoke all on function public.undo_quantity_event(uuid,uuid) from public,anon;
grant execute on function public.undo_quantity_event(uuid,uuid) to authenticated;
