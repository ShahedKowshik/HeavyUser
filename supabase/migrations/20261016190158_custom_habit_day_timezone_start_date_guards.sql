
alter table public.user_preferences
  add column if not exists day_start_minutes smallint not null default 0,
  add column if not exists time_zone text not null default 'Asia/Dhaka';
alter table public.user_preferences drop constraint if exists user_preferences_day_start_minutes_range;
alter table public.user_preferences add constraint user_preferences_day_start_minutes_range
  check(day_start_minutes between 0 and 720);
create or replace function public.validate_habit_time_zone()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.time_zone is null or not exists(
  select 1 from pg_catalog.pg_timezone_names where name=new.time_zone
 ) then
  raise exception 'Choose a valid time zone' using errcode='22023';
 end if;
 return new;
end $$;
drop trigger if exists user_preferences_validate_time_zone on public.user_preferences;
create trigger user_preferences_validate_time_zone
 before insert or update of time_zone on public.user_preferences
 for each row execute function public.validate_habit_time_zone();

create or replace function public.protect_habit_start_date()
returns trigger language plpgsql set search_path='' as $$
declare v_zone text;v_cutoff integer;v_first date;
begin
 if new.start_date is null then raise exception 'A start date is required' using errcode='22023';end if;
 if new.start_date is not distinct from old.start_date then return new;end if;
 -- Never hide preexisting records by moving the start date beyond them.
 if exists(select 1 from public.habit_entries e where e.habit_id=new.id and e.local_date<new.start_date)
    or exists(select 1 from public.quantity_events q where q.habit_id=new.id and q.local_date<new.start_date)
    or exists(select 1 from public.entry_revisions r where r.habit_id=new.id and r.local_date<new.start_date)
 then
  raise exception 'This habit has history before that date. Choose an earlier start date to preserve it.' using errcode='22023';
 end if;
 select time_zone,day_start_minutes into v_zone,v_cutoff
   from public.user_preferences where user_id=new.user_id;
 v_zone:=coalesce(v_zone,'Asia/Dhaka');v_cutoff:=coalesce(v_cutoff,0);
 if exists(
   select 1 from public.work_sessions s where s.habit_id=new.id
   and ((s.started_at at time zone v_zone)-(v_cutoff*interval '1 minute'))::date<new.start_date
 ) then
   raise exception 'This habit has timer sessions before that date. Choose an earlier start date.' using errcode='22023';
 end if;
 return new;
end $$;
drop trigger if exists habits_protect_start_date on public.habits;
create trigger habits_protect_start_date
 before update of start_date on public.habits
 for each row execute function public.protect_habit_start_date();

do $outer$
declare body text;
begin
 body:=pg_get_functiondef('public.record_quantity(uuid,text,uuid,date,numeric)'::regprocedure);
 if position('v_day date:=coalesce(p_date,(now() at time zone ''Asia/Dhaka'')::date);' in body)=0
    or position('v_today date:=(now() at time zone ''Asia/Dhaka'')::date;' in body)=0
    or position('begin'||chr(10)||' if v_owner is null then' in body)=0 then
    raise exception 'Quantity RPC version does not match reviewed SQL; migration cancelled';
 end if;
 body:=replace(body,
  'v_day date:=coalesce(p_date,(now() at time zone ''Asia/Dhaka'')::date);',
  'v_day date;v_zone text;v_cutoff integer;');
 body:=replace(body,
  'v_today date:=(now() at time zone ''Asia/Dhaka'')::date;',
  'v_today date;');
 body:=replace(body,
  'begin'||chr(10)||' if v_owner is null then',
  'begin'||chr(10)||
  ' select time_zone,day_start_minutes into v_zone,v_cutoff from public.user_preferences where user_id=v_owner;'||chr(10)||
  ' v_zone:=coalesce(v_zone,''Asia/Dhaka'');v_cutoff:=coalesce(v_cutoff,0);'||chr(10)||
  ' v_today:=((now() at time zone v_zone)-(v_cutoff*interval ''1 minute''))::date;'||chr(10)||
  ' v_day:=coalesce(p_date,v_today);'||chr(10)||
  ' if v_owner is null then');
 execute body;
end $outer$;
