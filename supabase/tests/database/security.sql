begin;

select plan(48);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.tasks'::regclass),
  'Task table has RLS enabled'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tasks'
      and roles = array['authenticated']::name[]
  ),
  4::bigint,
  'Tasks have four signed-in ownership policies'
);

select ok(
  not has_table_privilege('anon', 'public.tasks', 'SELECT')
    and not has_table_privilege('anon', 'public.tasks', 'INSERT')
    and not has_table_privilege('anon', 'public.tasks', 'UPDATE')
    and not has_table_privilege('anon', 'public.tasks', 'DELETE')
    and not has_table_privilege('anon', 'public.tasks', 'TRUNCATE')
    and not has_table_privilege('anon', 'public.tasks', 'REFERENCES')
    and not has_table_privilege('anon', 'public.tasks', 'TRIGGER'),
  'Signed-out users have no task table privileges'
);

select ok(
  has_table_privilege('authenticated', 'public.tasks', 'SELECT')
    and has_table_privilege('authenticated', 'public.tasks', 'INSERT')
    and has_table_privilege('authenticated', 'public.tasks', 'UPDATE')
    and has_table_privilege('authenticated', 'public.tasks', 'DELETE'),
  'Signed-in users retain task CRUD privileges'
);

select ok(
  not has_table_privilege('authenticated', 'public.tasks', 'TRUNCATE')
    and not has_table_privilege('authenticated', 'public.tasks', 'REFERENCES')
    and not has_table_privilege('authenticated', 'public.tasks', 'TRIGGER'),
  'Signed-in task access excludes elevated table privileges'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.task_list_versions'::regclass),
  'Task list versions have RLS enabled'
);
select ok(
  has_table_privilege('authenticated', 'public.task_list_versions', 'SELECT')
    and not has_table_privilege('anon', 'public.task_list_versions', 'SELECT'),
  'Task list versions are readable only by signed-in users'
);
select has_function('public', 'save_task_snapshot', array['uuid', 'jsonb', 'text[]', 'bigint', 'bigint', 'boolean']);
select ok(
  has_function_privilege('authenticated', 'public.save_task_snapshot(uuid,jsonb,text[],bigint,bigint,boolean)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.save_task_snapshot(uuid,jsonb,text[],bigint,bigint,boolean)', 'EXECUTE'),
  'Task snapshot RPC is limited to signed-in callers'
);
select has_function('public', 'start_task_timer', array['uuid', 'uuid', 'text', 'uuid', 'text', 'text', 'text', 'text', 'timestamp with time zone', 'timestamp with time zone', 'integer', 'integer', 'text']);
select has_function('public', 'set_task_timer_state', array['uuid', 'uuid', 'text', 'timestamp with time zone', 'bigint', 'text', 'text', 'boolean', 'text', 'timestamp with time zone', 'timestamp with time zone', 'text']);
select has_function('public', 'consume_user_operation', array['uuid', 'text', 'integer', 'integer']);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.user_operation_rate_limits'::regclass),
  'Operation rate limits have RLS enabled'
);

select ok(
  coalesce(
    (
      select not has_function_privilege('anon', p.oid, 'EXECUTE')
        and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'rls_auto_enable'
    ),
    true
  ),
  'RLS event-trigger helper is not exposed through the Data API'
);

select is(
  (
    select count(*)
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'google_calendar_events_space_idx',
        'task_active_session_owners_task_idx',
        'task_calendar_repairs_block_idx',
        'task_calendar_repairs_session_idx',
        'task_schedule_blocks_space_idx',
        'task_work_session_revisions_session_fk_idx',
        'task_work_sessions_block_idx',
        'task_work_sessions_space_idx',
        'tasks_space_subspace_idx'
      )
  ),
  9::bigint,
  'Application foreign keys have covering indexes'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.google_calendar_connections'::regclass),
  'Google connection table has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.google_calendar_events'::regclass),
  'Google event cache has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.task_schedule_blocks'::regclass),
  'Schedule block table has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.scheduler_queue'::regclass),
  'Scheduler queue has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.spaces'::regclass),
  'Space table has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.sub_spaces'::regclass),
  'Sub-space table has RLS enabled'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.google_calendar_events'::regclass
      and conname = 'google_calendar_events_pkey'
      and pg_get_constraintdef(oid) like '%(user_id, calendar_id, event_key)%'
  ),
  'Google event identity is user-and-calendar scoped'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.google_calendar_event_deletions'::regclass
      and conname = 'google_calendar_event_deletions_pkey'
      and pg_get_constraintdef(oid) like '%(user_id, calendar_id, event_key)%'
  ),
  'Google deletion identity is user-and-calendar scoped'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.google_calendar_sync_states'::regclass
      and conname = 'google_calendar_sync_states_pkey'
      and pg_get_constraintdef(oid) like '%(user_id, calendar_id)%'
  ),
  'Google sync state is user-and-calendar scoped'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.task_schedule_blocks'::regclass
      and conname = 'task_schedule_blocks_pkey'
      and pg_get_constraintdef(oid) like '%(user_id, id)%'
  ),
  'Schedule block identity is user-scoped'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'google_calendar_sync_states'
      and column_name = 'channel_token_hash'
  ),
  'Webhook token hashes are stored, never raw tokens'
);
select ok(
  (select count(*) from information_schema.columns
   where table_schema = 'public'
     and table_name = 'tasks'
     and column_name in ('space_id', 'sub_space_id')) = 2,
  'Tasks store Space and Sub-space ownership'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.spaces'::regclass
      and tgname = 'spaces_archive_open_tasks'
      and not tgisinternal
  ),
  'Spaces cannot be archived with open tasks'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.sub_spaces'::regclass
      and tgname = 'sub_spaces_archive_open_tasks'
      and not tgisinternal
  ),
  'Sub-spaces cannot be archived with open tasks'
);
select has_function('public', 'try_claim_scheduler_lock', array['uuid', 'text']);
select has_function('public', 'refresh_scheduler_lock', array['uuid', 'text']);
select has_function('public', 'release_scheduler_lock', array['uuid', 'text']);
select has_function('public', 'get_task_work_totals', array['uuid']);
select has_function('public', 'get_recent_task_work_sessions', array['uuid', 'integer']);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.task_work_sessions'::regclass),
  'Work session table has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.task_active_session_owners'::regclass),
  'Active session ownership has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.task_work_session_revisions'::regclass),
  'Work session audit table has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.task_calendar_repairs'::regclass),
  'Calendar repair table has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.task_timer_operation_receipts'::regclass),
  'Timer retry receipts have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.task_work_totals'::regclass),
  'Timer work totals have RLS enabled'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'task_timer_operation_receipts'
      and indexname = 'task_timer_operation_receipts_user_key_idx'
  ),
  'Timer retry keys are unique per account'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.tasks'::regclass
      and tgname = 'tasks_reject_running_timer_delete'
      and not tgisinternal
  ),
  'Task deletion is guarded while a timer is running'
);
select ok(
  not exists (
    select 1 from pg_constraint
    where conrelid = 'public.task_work_sessions'::regclass
      and conname = 'task_work_sessions_task_fk'
  ),
  'Work history is retained when its task is deleted'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.task_work_sessions'::regclass
      and conname = 'task_work_sessions_block_fk'
      and pg_get_constraintdef(oid) like '%SET NULL (block_id)%'
  ),
  'Deleting a schedule block clears only the work-history block link'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'task_work_sessions'
      and indexname = 'task_work_sessions_one_running_idx'
  ),
  'Only one running session is allowed per account'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'task_schedule_status'
      and column_name = 'worked_minutes'
  ),
  'Schedule status stores actual worked minutes'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.task_schedule_blocks'::regclass
      and conname = 'task_schedule_blocks_state_check'
      and pg_get_constraintdef(oid) like '%missed%'
  ),
  'Schedule blocks support missed work'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'task_schedule_blocks'
      and indexname = 'task_schedule_blocks_work_session_idx'
  ),
  'Split work blocks retain session ownership'
);

select * from finish();
rollback;
