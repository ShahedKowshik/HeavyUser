
-- Stable ordering independent of transaction timestamps or random UUIDs.
alter table public.quantity_events add column if not exists event_order bigint;
with numbered as (
 select id,row_number() over(order by created_at,id) as rn from public.quantity_events
) update public.quantity_events e set event_order=n.rn
from numbered n where n.id=e.id and e.event_order is null;
create sequence if not exists public.quantity_event_order_seq as bigint;
select setval('public.quantity_event_order_seq',greatest(coalesce((select max(event_order) from public.quantity_events),0),1),
 exists(select 1 from public.quantity_events));
alter table public.quantity_events alter column event_order set default nextval('public.quantity_event_order_seq');
alter table public.quantity_events alter column event_order set not null;
create unique index if not exists quantity_events_event_order_key on public.quantity_events(event_order);

alter table public.entry_revisions add column if not exists revision_order bigint;
with numbered as (
 select id,row_number() over(order by changed_at,id) as rn from public.entry_revisions
) update public.entry_revisions e set revision_order=n.rn
from numbered n where n.id=e.id and e.revision_order is null;
create sequence if not exists public.entry_revision_order_seq as bigint;
select setval('public.entry_revision_order_seq',greatest(coalesce((select max(revision_order) from public.entry_revisions),0),1),
 exists(select 1 from public.entry_revisions));
alter table public.entry_revisions alter column revision_order set default nextval('public.entry_revision_order_seq');
alter table public.entry_revisions alter column revision_order set not null;
create unique index if not exists entry_revisions_order_key on public.entry_revisions(revision_order);

do $$
declare def text;
begin
 def:=pg_get_functiondef('public.undo_quantity_event(uuid,uuid)'::regprocedure);
 if position('order by created_at desc,id desc limit 1' in def)=0 then
  raise exception 'Unexpected undo quantity function, refusing blind replacement';
 end if;
 def:=replace(def,'order by created_at desc,id desc limit 1','order by event_order desc limit 1');
 execute def;
 def:=pg_get_functiondef('public.undo_entry_revision(uuid,uuid)'::regprocedure);
 if position('order by changed_at desc,id desc limit 1' in def)=0 then
  raise exception 'Unexpected undo entry function, refusing blind replacement';
 end if;
 def:=replace(def,'order by changed_at desc,id desc limit 1','order by revision_order desc limit 1');
 execute def;
end $$;
