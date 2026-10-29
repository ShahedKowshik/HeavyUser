
do $$
declare def text;
begin
 def:=pg_get_functiondef('public.record_quantity(uuid,text,uuid,date,numeric)'::regprocedure);
 if position('set value=excluded.value,confirmed=true,updated_at=now();' in def)=0 then raise exception 'Unexpected recording function; stopping';end if;
 def:=replace(def,'set value=excluded.value,confirmed=true,updated_at=now();','set value=excluded.value,confirmed=true,explicit_status=null,updated_at=now();');
 execute def;
end $$;
