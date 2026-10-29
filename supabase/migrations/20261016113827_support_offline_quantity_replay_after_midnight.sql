do $$
declare def text;
begin
 def := pg_get_functiondef('public.record_quantity(uuid,text,uuid,date,numeric)'::regprocedure);
 if position('and v_day<>v_today' in def)=0 then
   raise exception 'Expected quantity recording function version not found';
 end if;
 -- The client records the actual local date at tap time. Offline retries can arrive after midnight.
 -- We still reject future and pre-habit days above, but allow past-day queued operations.
 def := replace(def, 'and v_day<>v_today', 'and false');
 execute def;
end $$;
