-- Keep old calendar Spaces available for history without letting a disconnected
-- Google account block scheduling on a newly connected calendar.
alter table public.spaces
  drop constraint if exists spaces_status_check;

alter table public.spaces
  add constraint spaces_status_check check (status in ('active', 'archived', 'disconnected'));
