
alter table public.habits add column if not exists frequency_mode text not null default 'selected_days';
alter table public.habits add column if not exists frequency_count smallint not null default 1;
alter table public.habits add column if not exists interval_days smallint not null default 2;
alter table public.habits add column if not exists sort_order integer not null default 0;
alter table public.habits add constraint habits_frequency_mode_check check (frequency_mode in ('selected_days','weekly','monthly','interval'));
alter table public.habits add constraint habits_frequency_count_check check (frequency_count between 1 and 31);
alter table public.habits add constraint habits_interval_days_check check (interval_days between 2 and 30);
alter table public.habits add constraint habits_frequency_limits_check check ((frequency_mode <> 'weekly' or frequency_count <= 7) and (direction <> 'at_most' or frequency_mode = 'selected_days'));
create index if not exists habits_order_for_user on public.habits(user_id,sort_order,created_at);
alter table public.habit_entries add column if not exists explicit_status text;
alter table public.habit_entries add constraint habit_entries_explicit_status_check check (explicit_status is null or explicit_status in ('completed','skipped','missed'));
create table if not exists public.user_preferences(
 user_id uuid primary key references auth.users(id) on delete cascade,
 week_starts_on smallint not null default 1 check (week_starts_on in (0,1)),
 updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
create policy "Read own preferences" on public.user_preferences for select to authenticated using ((select auth.uid())=user_id);
create policy "Create own preferences" on public.user_preferences for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Update own preferences" on public.user_preferences for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.user_preferences from anon;
grant select,insert,update on public.user_preferences to authenticated;

create table if not exists public.entry_revisions(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 habit_id uuid not null,
 local_date date not null,
 operation text not null check(operation in ('insert','update','delete')),
 before_data jsonb,
 after_data jsonb,
 changed_at timestamptz not null default now(),
 foreign key(habit_id,user_id) references public.habits(id,user_id) on delete cascade
);
create index if not exists entry_revisions_lookup on public.entry_revisions(user_id,habit_id,local_date,changed_at desc,id desc);
alter table public.entry_revisions enable row level security;
create policy "Read own entry revisions" on public.entry_revisions for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.entry_revisions from anon;
grant select on public.entry_revisions to authenticated;

create or replace function public.capture_entry_revision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  insert into public.entry_revisions(user_id,habit_id,local_date,operation,before_data,after_data)
  values(new.user_id,new.habit_id,new.local_date,'insert',null,to_jsonb(new));
  return new;
 elsif tg_op='DELETE' then
  insert into public.entry_revisions(user_id,habit_id,local_date,operation,before_data,after_data)
  values(old.user_id,old.habit_id,old.local_date,'delete',to_jsonb(old),null);
  return old;
 else
  if to_jsonb(new) is distinct from to_jsonb(old) then
   insert into public.entry_revisions(user_id,habit_id,local_date,operation,before_data,after_data)
   values(new.user_id,new.habit_id,new.local_date,'update',to_jsonb(old),to_jsonb(new));
  end if;
  return new;
 end if;
end;
$$;
revoke all on function public.capture_entry_revision() from public,anon,authenticated;
drop trigger if exists habit_entries_capture_revision on public.habit_entries;
create trigger habit_entries_capture_revision after insert or update or delete on public.habit_entries
for each row execute function public.capture_entry_revision();

alter table public.quantity_events add column if not exists value_before numeric(12,2);
alter table public.quantity_events add column if not exists undo_of uuid references public.quantity_events(id);
alter table public.quantity_events drop constraint if exists quantity_events_action_check;
alter table public.quantity_events add constraint quantity_events_action_check check(action in ('increment','decrement','set','undo'));
create unique index if not exists quantity_one_undo_per_event on public.quantity_events(undo_of) where undo_of is not null;

create or replace function public.reorder_habits(p_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=(select auth.uid());
 v_count integer;
begin
 if v_user is null then raise exception 'Sign in required' using errcode='28000'; end if;
 if p_ids is null or array_length(p_ids,1) is null then raise exception 'Empty order' using errcode='22023'; end if;
 select count(*) into v_count from public.habits where user_id=v_user and archived_at is null;
 if v_count<>array_length(p_ids,1) or v_count<>(select count(distinct x) from unnest(p_ids) as x) or
    exists(select 1 from unnest(p_ids) x left join public.habits h on h.id=x and h.user_id=v_user and h.archived_at is null where h.id is null)
 then raise exception 'Order must contain every active habit exactly once' using errcode='22023'; end if;
 update public.habits as h set sort_order=items.ordinality::integer,updated_at=now()
 from unnest(p_ids) with ordinality as items(id,ordinality)
 where h.user_id=v_user and h.id=items.id;
end;
$$;
revoke all on function public.reorder_habits(uuid[]) from public,anon;
grant execute on function public.reorder_habits(uuid[]) to authenticated;
