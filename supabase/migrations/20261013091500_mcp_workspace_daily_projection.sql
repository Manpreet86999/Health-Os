-- Read-only MCP workspace projection. Samples remain untouched in the sync store.
create or replace function public.health_os_mcp_workspace_page(
 p_from date,p_through date,p_time_zone text,p_types text[],p_after bigint default 0,p_page_size integer default 500
) returns setof public.body_os_records
language plpgsql security invoker set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_from is null or p_through is null or p_through<p_from or p_through-p_from>455
  or p_after is null or p_after<0 or p_page_size is null or p_page_size not between 1 and 500
  or p_types is null or not p_types <@ array['profile','workspaceState','week','session','readiness','measurement','trainingConfig','scheduledWorkout','healthReading','target','habit','habitLog','cardio','goalCheckIn','careSettings','careTask','careGoal','careEvent','careCheckIn','careReview','carePlanVersion','skinProduct']::text[]
  or p_time_zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_time_zone)
 then raise exception 'Invalid workspace window' using errcode='22023';end if;
 return query
 with windowed as materialized (
  select r.* from public.body_os_records r where r.user_id=auth.uid() and r.entity_type=any(p_types)
  and (r.entity_type<>all(array['session','readiness','measurement','healthReading','habitLog','cardio','goalCheckIn'])
   or (r.payload->>'date'>=p_from::text and r.payload->>'date'<=p_through::text))
 ),daily as (
  select distinct on (w.payload->>'kind',w.payload->>'source',((w.payload->>'startTime')::timestamptz at time zone p_time_zone)::date) w.*
  from windowed w where w.entity_type='healthReading' and w.deleted_at is null
  order by w.payload->>'kind',w.payload->>'source',((w.payload->>'startTime')::timestamptz at time zone p_time_zone)::date,
   (w.payload->>'startTime')::timestamptz desc,w.change_version asc
 ),projected as (
  select w.* from windowed w where w.entity_type<>'healthReading'
  union all select d.* from daily d
 )
 select p.* from projected p where p.change_version>p_after order by p.change_version limit p_page_size;
end;
$$;
revoke all on function public.health_os_mcp_workspace_page(date,date,text,text[],bigint,integer) from public,anon;
grant execute on function public.health_os_mcp_workspace_page(date,date,text,text[],bigint,integer) to authenticated;
