
create or replace function public.capture_entry_revision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  insert into public.entry_revisions(user_id,habit_id,local_date,operation,before_data,after_data)
  values(new.user_id,new.habit_id,new.local_date,'insert',null,to_jsonb(new));
  return new;
 elsif tg_op='DELETE' then
  -- A cascading delete has already removed the parent habit. Do not write
  -- a new revision pointing to a permanently deleted habit.
  if exists(select 1 from public.habits where id=old.habit_id and user_id=old.user_id) then
   insert into public.entry_revisions(user_id,habit_id,local_date,operation,before_data,after_data)
   values(old.user_id,old.habit_id,old.local_date,'delete',to_jsonb(old),null);
  end if;
  return old;
 else
  if to_jsonb(new) is distinct from to_jsonb(old) then
   insert into public.entry_revisions(user_id,habit_id,local_date,operation,before_data,after_data)
   values(new.user_id,new.habit_id,new.local_date,'update',to_jsonb(old),to_jsonb(new));
  end if;
  return new;
 end if;
end;$$;
revoke all on function public.capture_entry_revision() from public,anon,authenticated;
