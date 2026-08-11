-- The task snapshot RPC is called by the signed-in browser. Caller-scoped
-- RLS is sufficient, so do not expose a SECURITY DEFINER function to the
-- authenticated role.

alter function public.save_task_snapshot(uuid, jsonb, text[], bigint, bigint, boolean) security invoker;

drop policy if exists task_list_versions_select_own on public.task_list_versions;
drop policy if exists task_list_versions_insert_own on public.task_list_versions;
drop policy if exists task_list_versions_update_own on public.task_list_versions;

create policy task_list_versions_select_own
  on public.task_list_versions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy task_list_versions_insert_own
  on public.task_list_versions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy task_list_versions_update_own
  on public.task_list_versions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.task_list_versions to authenticated;
