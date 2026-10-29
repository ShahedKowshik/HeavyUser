
do $$
declare definition text;
begin
 definition := pg_get_functiondef('public.record_quantity(uuid,text,uuid,date,numeric)'::regprocedure);
 if position('insert into public.quantity_events(id,user_id,habit_id,local_date,action,delta,resulting_value)' in definition)=0 then
   raise exception 'Unexpected quantity function body: upgrade stopped';
 end if;
 definition:=replace(definition,
  'insert into public.quantity_events(id,user_id,habit_id,local_date,action,delta,resulting_value)',
  'insert into public.quantity_events(id,user_id,habit_id,local_date,action,delta,resulting_value,value_before)');
 definition:=replace(definition,
  'case when p_action=''set'' then null when p_action=''increment'' then 1 else -1 end,v_next);',
  'case when p_action=''set'' then null when p_action=''increment'' then 1 else -1 end,v_next,v_old);');
 execute definition;
end $$;

create or replace function public.undo_quantity_event(p_event_id uuid,p_undo_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=(select auth.uid()); v_target public.quantity_events%rowtype;
 v_latest uuid; v_value numeric; v_prior numeric;
begin
 if v_user is null then raise exception 'Sign in required' using errcode='28000'; end if;
 if p_event_id is null or p_undo_id is null or p_event_id=p_undo_id then raise exception 'Invalid operation' using errcode='22023'; end if;
 select * into v_target from public.quantity_events where id=p_event_id and user_id=v_user;
 if not found or v_target.action='undo' then raise exception 'Event unavailable' using errcode='P0002'; end if;
 perform 1 from public.habits where id=v_target.habit_id and user_id=v_user and kind='quantity' and archived_at is null for update;
 if not found then raise exception 'Habit unavailable' using errcode='P0002'; end if;
 -- Repeated requests for one undo are safe.
 if exists(select 1 from public.quantity_events where id=p_undo_id and undo_of=p_event_id and user_id=v_user) then
   select value into v_value from public.habit_entries where habit_id=v_target.habit_id and local_date=v_target.local_date;
   return jsonb_build_object('habit_id',v_target.habit_id,'date',v_target.local_date,'value',coalesce(v_value,0),'duplicate',true);
 end if;
 if exists(select 1 from public.quantity_events where undo_of=p_event_id) then raise exception 'Already undone' using errcode='22023'; end if;
 select id into v_latest from public.quantity_events
 where user_id=v_user and habit_id=v_target.habit_id and local_date=v_target.local_date
 order by created_at desc,id desc limit 1;
 if v_latest is distinct from p_event_id then raise exception 'Only the latest entry can be undone; use Edit total for older entries' using errcode='22023'; end if;
 if v_target.value_before is null then raise exception 'Older entries must be corrected with Edit total' using errcode='22023'; end if;
 select value into v_value from public.habit_entries where habit_id=v_target.habit_id and local_date=v_target.local_date for update;
 if v_value is distinct from v_target.resulting_value then raise exception 'Count changed; reload before undoing' using errcode='22023'; end if;
 v_prior:=v_target.value_before;
 update public.habit_entries set value=v_prior,updated_at=now() where habit_id=v_target.habit_id and local_date=v_target.local_date and user_id=v_user;
 insert into public.quantity_events(id,user_id,habit_id,local_date,action,delta,resulting_value,value_before,undo_of)
 values(p_undo_id,v_user,v_target.habit_id,v_target.local_date,'undo',v_prior-v_value,v_prior,v_value,p_event_id);
 return jsonb_build_object('habit_id',v_target.habit_id,'date',v_target.local_date,'value',v_prior,'duplicate',false);
end $$;
revoke all on function public.undo_quantity_event(uuid,uuid) from public,anon;
grant execute on function public.undo_quantity_event(uuid,uuid) to authenticated;

create or replace function public.undo_entry_revision(p_revision_id uuid,p_undo_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); rev public.entry_revisions%rowtype;
 latest uuid; current_data jsonb; old_data jsonb; h_kind text;
begin
 if v_user is null then raise exception 'Sign in required' using errcode='28000'; end if;
 select * into rev from public.entry_revisions where id=p_revision_id and user_id=v_user;
 if not found then raise exception 'Revision unavailable' using errcode='P0002'; end if;
 select kind into h_kind from public.habits where id=rev.habit_id and user_id=v_user and archived_at is null for update;
 if h_kind is null or h_kind='quantity' then raise exception 'This entry cannot be undone here' using errcode='22023'; end if;
 select id into latest from public.entry_revisions
 where user_id=v_user and habit_id=rev.habit_id and local_date=rev.local_date
 order by changed_at desc,id desc limit 1;
 if latest<>p_revision_id then raise exception 'Newer changes exist; refresh history before undo' using errcode='22023'; end if;
 select to_jsonb(e) into current_data from public.habit_entries e where habit_id=rev.habit_id and local_date=rev.local_date and user_id=v_user for update;
 if current_data is distinct from rev.after_data then raise exception 'Entry has changed; reload before undo' using errcode='22023'; end if;
 old_data:=rev.before_data;
 if old_data is null then
   delete from public.habit_entries where habit_id=rev.habit_id and local_date=rev.local_date and user_id=v_user;
 else
   insert into public.habit_entries (habit_id,user_id,local_date,value,completed,confirmed,bed_at,asleep_at,awake_at,out_of_bed_at,target_snapshot,direction_snapshot,explicit_status,updated_at)
   values(rev.habit_id,v_user,rev.local_date,(old_data->>'value')::numeric,(old_data->>'completed')::boolean,coalesce((old_data->>'confirmed')::boolean,true),
     (old_data->>'bed_at')::timestamptz,(old_data->>'asleep_at')::timestamptz,(old_data->>'awake_at')::timestamptz,
     (old_data->>'out_of_bed_at')::timestamptz,(old_data->>'target_snapshot')::numeric,old_data->>'direction_snapshot',old_data->>'explicit_status',now())
   on conflict(habit_id,local_date) do update set value=excluded.value,completed=excluded.completed,
   confirmed=excluded.confirmed,bed_at=excluded.bed_at,asleep_at=excluded.asleep_at,
   awake_at=excluded.awake_at,out_of_bed_at=excluded.out_of_bed_at,
   target_snapshot=excluded.target_snapshot,direction_snapshot=excluded.direction_snapshot,
   explicit_status=excluded.explicit_status,updated_at=excluded.updated_at;
 end if;
 return jsonb_build_object('habit_id',rev.habit_id,'date',rev.local_date,'restored',true);
end $$;
revoke all on function public.undo_entry_revision(uuid,uuid) from public,anon;
grant execute on function public.undo_entry_revision(uuid,uuid) to authenticated;

create table if not exists public.habit_schedule_versions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 habit_id uuid not null,
 effective_date date not null,
 frequency_mode text not null,
 frequency_count smallint not null,
 interval_days smallint not null,
 schedule_days smallint[] not null,
 target numeric(12,2) not null,
 direction text not null,
 recorded_at timestamptz not null default now(),
 foreign key(habit_id,user_id) references public.habits(id,user_id) on delete cascade,
 unique(habit_id,effective_date)
);
create index if not exists habit_versions_owner_date on public.habit_schedule_versions(user_id,habit_id,effective_date desc);
alter table public.habit_schedule_versions enable row level security;
create policy "Read own historical schedules" on public.habit_schedule_versions for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.habit_schedule_versions from anon;
grant select on public.habit_schedule_versions to authenticated;

insert into public.habit_schedule_versions(user_id,habit_id,effective_date,frequency_mode,frequency_count,interval_days,schedule_days,target,direction)
select user_id,id,start_date,frequency_mode,frequency_count,interval_days,schedule_days,target,direction from public.habits
on conflict(habit_id,effective_date) do nothing;

create or replace function public.capture_habit_schedule() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if row(new.frequency_mode,new.frequency_count,new.interval_days,new.schedule_days,new.target,new.direction) is distinct from
    row(old.frequency_mode,old.frequency_count,old.interval_days,old.schedule_days,old.target,old.direction) then
   insert into public.habit_schedule_versions(user_id,habit_id,effective_date,frequency_mode,frequency_count,interval_days,schedule_days,target,direction)
   values(new.user_id,new.id,(now() at time zone 'Asia/Dhaka')::date,new.frequency_mode,new.frequency_count,new.interval_days,new.schedule_days,new.target,new.direction)
   on conflict (habit_id,effective_date) do update
   set frequency_mode=excluded.frequency_mode,frequency_count=excluded.frequency_count,interval_days=excluded.interval_days,
       schedule_days=excluded.schedule_days,target=excluded.target,direction=excluded.direction,recorded_at=now();
 end if;
 return new;
end $$;
revoke all on function public.capture_habit_schedule() from public,anon,authenticated;
drop trigger if exists habits_capture_schedule on public.habits;
create trigger habits_capture_schedule after update on public.habits for each row execute function public.capture_habit_schedule();
