
do $$
declare repaired integer;
begin
 -- Repair ONLY the single inconsistent unchecked Brush record.
 -- The delete trigger retains its previous value in the audit history.
 delete from public.habit_entries e
 where e.habit_id='d1fa8aae-544b-4a8f-b64b-3dc2fc0d0338'::uuid
   and e.local_date='2026-10-16'::date
   and e.completed is false and e.value=0 and e.explicit_status='completed'
   and exists(select 1 from public.habits h where h.id=e.habit_id and h.name='Brush' and h.kind='check');
 get diagnostics repaired=row_count;
 if repaired>1 then raise exception 'Unexpected repair scope';end if;
 raise notice 'Contradictory Brush rows corrected: %',repaired;
end $$;
alter table public.habit_entries
 add constraint habit_entries_no_conflicting_completion_status
 check (
   not (completed is false and explicit_status='completed')
   and not (completed is true and explicit_status in ('skipped','missed'))
 );
