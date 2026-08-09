begin;

select plan(30);

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
