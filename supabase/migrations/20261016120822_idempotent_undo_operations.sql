
create table if not exists public.entry_undo_operations (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 revision_id uuid not null references public.entry_revisions(id) on delete cascade,
 created_at timestamptz not null default now(),
 unique(user_id,revision_id)
);
alter table public.entry_undo_operations enable row level security;
create policy "Read own entry undos" on public.entry_undo_operations for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.entry_undo_operations from anon;
grant select on public.entry_undo_operations to authenticated;
do $$
declare def text;
begin
 def:=pg_get_functiondef('public.undo_entry_revision(uuid,uuid)'::regprocedure);
 if position('select * into rev from public.entry_revisions' in def)=0 then raise exception 'Undo body changed unexpectedly';end if;
 def:=replace(def,
 'if v_user is null then raise exception ''Sign in required'' using errcode=''28000''; end if;',
 'if v_user is null then raise exception ''Sign in required'' using errcode=''28000''; end if; if p_undo_id is null then raise exception ''Undo ID required'' using errcode=''22023''; end if; if exists(select 1 from public.entry_undo_operations where id=p_undo_id and user_id=v_user and revision_id=p_revision_id) then return jsonb_build_object(''restored'',true,''duplicate'',true); end if;');
 def:=replace(def,
 'return jsonb_build_object(''habit_id'',rev.habit_id,''date'',rev.local_date,''restored'',true);',
 'insert into public.entry_undo_operations(id,user_id,revision_id) values(p_undo_id,v_user,p_revision_id); return jsonb_build_object(''habit_id'',rev.habit_id,''date'',rev.local_date,''restored'',true,''duplicate'',false);');
 execute def;
end $$;
