do $$
declare def text;
begin
 def:=pg_get_functiondef('public.undo_entry_revision(uuid,uuid)'::regprocedure);
 if position('old_data:=rev.before_data;' in def)=0 then
   raise exception 'Unknown undo revision function version';
 end if;
 def:=replace(def,
  'old_data:=rev.before_data;',
  'old_data:=rev.before_data;
   if old_data->>''completed''=''false'' and old_data->>''explicit_status''=''completed'' then
     raise exception ''This old unchecked record is already corrected. It cannot be restored as completed.''
       using errcode=''22023'';
   end if;');
 execute def;
end $$;
