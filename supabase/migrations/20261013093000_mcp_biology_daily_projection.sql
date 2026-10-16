-- Read-only summary projection of canonical daily vital candidates.
create or replace function public.health_os_mcp_biology_page(
 p_from timestamptz,p_until timestamptz,p_time_zone text,p_types text[],p_after text default '',p_page_size integer default 500
) returns setof public.health_os_biological_records
language plpgsql security invoker set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_from is null or p_until is null or p_until<=p_from or p_until-p_from>interval '460 days'
  or p_after is null or length(p_after)>200 or p_page_size is null or p_page_size not between 1 and 500
  or p_types is null or not p_types <@ array['vital','sleep','checkIn','meal','water','nutritionTarget','sleepPreference','bodyMeasurement','recoveryNote','goal','goalCheckIn','nutritionDay','routine','food','recipe','mealPlan']::text[]
  or p_time_zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_time_zone)
 then raise exception 'Invalid biology window' using errcode='22023';end if;
 return query
 with windowed as materialized (
  select r.* from public.health_os_biological_records r where r.user_id=auth.uid() and r.payload->>'type'=any(p_types)
  and (r.payload->>'type'=any(array['nutritionTarget','sleepPreference','goal','routine','food','recipe','mealPlan'])
   or ((r.payload->>'timestamp')::timestamptz>=p_from and (r.payload->>'timestamp')::timestamptz<p_until))
 ),daily as (
  select distinct on (w.payload->'metadata'->>'metric',w.payload->>'source',((w.payload->>'timestamp')::timestamptz at time zone p_time_zone)::date) w.*
  from windowed w where w.payload->>'type'='vital' and w.payload->>'deletedAt' is null and w.payload->>'value' is not null
  and not exists(select 1 from windowed c where c.payload->>'type'='vital' and c.payload->>'deletedAt' is null and c.payload->'metadata'->>'correctionOf'=w.record_id)
  order by w.payload->'metadata'->>'metric',w.payload->>'source',((w.payload->>'timestamp')::timestamptz at time zone p_time_zone)::date,
   (w.payload->>'timestamp')::timestamptz desc,w.record_id asc
 ),projected as (
  select w.* from windowed w where w.payload->>'type'<>'vital'
  union all select d.* from daily d
 )
 select p.* from projected p where p.record_id>p_after order by p.record_id limit p_page_size;
end;
$$;
revoke all on function public.health_os_mcp_biology_page(timestamptz,timestamptz,text,text[],text,integer) from public,anon;
grant execute on function public.health_os_mcp_biology_page(timestamptz,timestamptz,text,text[],text,integer) to authenticated;
