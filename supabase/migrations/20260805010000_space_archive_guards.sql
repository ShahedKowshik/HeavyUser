-- Keep archive rules true even when two browser tabs update a Space at once.
create or replace function public.prevent_archiving_space_with_open_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'archived'
    and old.status is distinct from 'archived'
    and exists (
      select 1
      from public.tasks t
      where t.user_id = new.user_id
        and t.space_id = new.id
        and t.status <> 'done'
    ) then
    raise exception using
      errcode = '23514',
      message = 'Complete or move open tasks before archiving this Space.';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_archiving_sub_space_with_open_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'archived'
    and old.status is distinct from 'archived'
    and exists (
      select 1
      from public.tasks t
      where t.user_id = new.user_id
        and t.sub_space_id = new.id
        and t.status <> 'done'
    ) then
    raise exception using
      errcode = '23514',
      message = 'Complete or move open tasks before archiving this Sub-space.';
  end if;
  return new;
end;
$$;

drop trigger if exists spaces_archive_open_tasks on public.spaces;
create trigger spaces_archive_open_tasks
before update of status on public.spaces
for each row execute function public.prevent_archiving_space_with_open_tasks();

drop trigger if exists sub_spaces_archive_open_tasks on public.sub_spaces;
create trigger sub_spaces_archive_open_tasks
before update of status on public.sub_spaces
for each row execute function public.prevent_archiving_sub_space_with_open_tasks();

revoke all on function public.prevent_archiving_space_with_open_tasks() from public, anon, authenticated;
revoke all on function public.prevent_archiving_sub_space_with_open_tasks() from public, anon, authenticated;
grant execute on function public.prevent_archiving_space_with_open_tasks() to service_role;
grant execute on function public.prevent_archiving_sub_space_with_open_tasks() to service_role;
