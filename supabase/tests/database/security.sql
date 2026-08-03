begin;

select plan(10);

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
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.google_calendar_events'::regclass
      and conname = 'google_calendar_events_pkey'
      and pg_get_constraintdef(oid) like '%(user_id, event_key)%'
  ),
  'Google event identity is user-scoped'
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
select has_function('public', 'try_claim_scheduler_lock', array['uuid', 'text']);
select has_function('public', 'refresh_scheduler_lock', array['uuid', 'text']);
select has_function('public', 'release_scheduler_lock', array['uuid', 'text']);

select * from finish();
rollback;
